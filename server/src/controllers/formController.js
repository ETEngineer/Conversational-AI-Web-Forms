const Form = require('../models/Form');

const formController = {
  async createForm(req, res) {
    try {
      const formData = req.body;
      formData.creator = req.user.id;
      
      function convertToConversationalDialogues(questions) {
        return questions.map(question => {
          console.log(question);
          // Idea is too minimise api cost/llm cost 
          switch (question.type) {
            case 'text':
              return `Could you please tell me your ${question.question.toLowerCase()}?`;
            case 'number':
              return `What is your ${question.question.toLowerCase()}?`;
            case 'date':
              return `When is your ${question.question.toLowerCase()}?`;
            default:
              return question.question;
          }
        });
      }

      const conversationalDialogues = convertToConversationalDialogues(req.body.questions);
      const form = new Form({
        ...req.body,
        conversationalDialogues
      });
      await form.save();
      
      return res.status(201).json({success: true, data: form});
    } catch (error) {
      console.error('Create form error:', error);
      return res.status(500).json({success: false, message: 'Error creating form'});
    }
  },

  async getForms(req, res) {
    try {
      const forms = await Form.findByCreator(req.user.id);
      return res.json({success: true, data: forms});
    } catch (error) {
      console.error('Get forms error:', error);
      return res.status(500).json({success: false, message: 'Error retrieving forms'});
    }
  },

  async getForm(req, res) {
    try {
      const form = await Form.findById(req.params.formId);
      
      if (!form) {
        return res.status(404).json({success: false, message: 'Form not found'});
      }

      console.log('Form settings:', {
        id: form._id,
        status: form.status,
        settings: form.settings,
        creator: form.creator,
        user: req.user ? req.user.id : 'no user'
      });
      
      if (form.status === 'published') {
        return res.json({success: true, data: form});
      }
      
      if (form.settings && form.settings.allowAnonymous) {
        return res.json({success: true, data: form});
      }
      
      if (!req.user) {
        return res.status(403).json({success: false, message: 'Authentication required to view this form'});
      }

      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to view this form'});
      }
      
      return res.json({success: true, data: form});
    } catch (error) {
      console.error('Get form error:', error);
      return res.status(500).json({success: false, message: 'Error retrieving form'});
    }
  },

  async updateForm(req, res) {
    try {
      const form = await Form.findById(req.params.formId);
      
      if (!form) {
        return res.status(404).json({success: false, message: 'Form not found'});
      }

      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to update this form'});
      }

      Object.keys(req.body).forEach(key => {
        form[key] = req.body[key];
      });
      
      await form.save();
      
      return res.json({success: true, data: form});
    }catch (error) {
      console.error('Update form error:', error);
      return res.status(500).json({success: false, message: 'Error updating form'});
    }
  },

  async deleteForm(req, res) {
    try {
      const form = await Form.findById(req.params.formId);
      
      if (!form) {
        return res.status(404).json({success: false, message: 'Form not found'});
      }
      
      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to delete this form'});
      }
      
      await form.remove();
      
      return res.json({success: true, message: 'Form deleted successfully'});
    } catch (error) {
      console.error('Delete form error:', error);
      return res.status(500).json({success: false, message: 'Error deleting form'});
    }
  },

  async publishForm(req, res) {
    try {
      const form = await Form.findById(req.params.formId);
      
      if (!form) {
        return res.status(404).json({success: false, message: 'Form not found'});
      }
      
      if (form.creator.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({success: false, message: 'You do not have permission to publish this form'});
      }
      
      form.status = 'published';
      form.publishedAt = new Date();
      
      await form.save();
      
      return res.json({success: true, data: form});
    } catch (error) {
      console.error('Publish form error:', error);
      return res.status(500).json({success: false, message: 'Error publishing form'});
    }
  }
};

module.exports = formController; 