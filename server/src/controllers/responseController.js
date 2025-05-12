const Response = require('../models/Response');
const Form = require('../models/Form');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');

const responseController = {
  async getResponses(req, res) {
    try {
      const { formId } = req.params;

      const form = await Form.findById(formId);
      if (!form) {
        return res.status(404).json({ success: false, message: 'Form not found'});
      }
      
      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to view responses for this form'});
      }
      
      const responses = await Response.findByForm(formId);
      
      return res.json({success: true,data: responses});
    } catch (error) {
      console.error('Get responses error:', error);
      return res.status(500).json({success: false, message: 'Error retrieving responses'});
    }
  },

  async getResponse(req, res) {
    try {
      const { responseId } = req.params;
      
      const response = await Response.findById(responseId).populate('form');
      
      if (!response) {
        return res.status(404).json({success: false, message: 'Response not found'});
      }

      const form = response.form;
      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to view this response'});
      }
      
      return res.json({success: true, data: response});
    } catch (error) {
      console.error('Get response error:', error);
      return res.status(500).json({success: false,message: 'Error retrieving response'});
    }
  },

  async deleteResponse(req, res) {
    try {
      const { responseId } = req.params;
      const response = await Response.findById(responseId).populate('form');
      
      if (!response) {
        return res.status(404).json({success: false, message: 'Response not found'});
      }

      const form = response.form;
      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to delete this response'});
      }
      
      await response.remove();
      
      return res.json({success: true, message: 'Response deleted successfully'});
    } catch (error) {
      console.error('Delete response error:', error);
      return res.status(500).json({success: false, message: 'Error deleting response'});
    }
  },

  async exportResponses(req, res) {
    try {
      const { formId } = req.params;

      const form = await Form.findById(formId);
      if (!form) {
        return res.status(404).json({success: false, message: 'Form not found'});
      }
      
      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to export responses for this form'});
      }
      
      const responses = await Response.findByForm(formId);

      const exportDir = path.join(__dirname, '../../exports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir);
      }

      const fileName = `form_${formId}_responses_${Date.now()}.csv`;
      const filePath = path.join(exportDir, fileName);
  
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: [
          { id: 'submittedBy', title: 'Submitted By' },
          { id: 'submittedAt', title: 'Submission Date' },
          { id: 'status', title: 'Status' },
          ...form.questions.map(q => ({
            id: q._id.toString(),
            title: q.text
          }))
        ]
      });
      
      const records = responses.map(response => {
        const record = {
          submittedBy: response.submittedBy.name,
          submittedAt: response.submittedAt.toISOString(),
          status: response.status
        };

        response.answers.forEach(answer => {
          record[answer.questionId] = Array.isArray(answer.answer) 
            ? answer.answer.join(', ')
            : answer.answer;
        });
        
        return record;
      });
      
      await csvWriter.writeRecords(records);

      res.download(filePath, fileName, (err) => {
        if (err) {
          res.status(500).json({ message: 'Error downloading file', error: err.message });
        }
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    } catch (error) {
      res.status(500).json({ message: 'Error exporting responses', error: error.message });
    }
  },

  async submitResponse(req, res) {
    try {
      const { formId, answers } = req.body;

      if (!formId || !answers || !Array.isArray(answers)) {
        return res.status(400).json({success: false, message: 'Form ID and answers array are required.'});
      }

      const form = await Form.findById(formId);
      if (!form) {
        return res.status(404).json({success: false, message: 'Form not found'});
      }

      const newResponse = new Response({
        formId: formId,
        answers: answers, 
        submittedBy: req.user ? req.user.id : null,
        status: 'submitted'
      });

      await newResponse.save();

      return res.status(201).json({success: true, message: 'Response submitted successfully', data: newResponse});

    } catch (error) {
      console.error('Submit response error:', error);
      return res.status(500).json({success: false, message: 'Error submitting response'});
    }
  },

  async handleNlpCallback(req, res) {
    try {
      const { formId, responses } = req.body;

      if (!formId || !responses || typeof responses !== 'object') {
        return res.status(400).json({success: false, message: 'Form ID and responses object are required.'});
      }

      const form = await Form.findById(formId);
      if (!form) {
        console.error(`Callback received for non-existent formId: ${formId}`);
        return res.status(200).json({ success: true, message: 'Callback acknowledged, but form not found.' });
      }

      const mappedAnswers = [];
      for (const [label, answer] of Object.entries(responses)) {
        const question = form.questions.find(q => q.question === label);
        console.log(form);
        if (question) {
          mappedAnswers.push({
            questionId: question._id,
            answer: answer
          });
        } else {
          console.warn(`Callback for form ${formId}: No question found matching label "${label}"`);
        }
      }

      const newResponse = new Response({
        formId: formId,
        answers: mappedAnswers,
        submittedBy: null, //need to send who submitted this response
        status: 'completed'
      });

      await newResponse.save();

      console.log(`NLP Callback processed successfully for form ${formId}`);
      return res.status(201).json({success: true, message: 'Callback processed and response created successfully.', data: { responseId: newResponse._id }});

    } catch (error) {
      console.error('NLP Callback handling error:', error);
      return res.status(500).json({success: false, message: 'Error processing NLP callback'});
    }
  }
};

module.exports = responseController; 