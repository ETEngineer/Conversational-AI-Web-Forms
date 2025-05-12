import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formApi } from '../../services/api';
import './FormBuilder.css';

const FormBuilder = () => {
  const navigate = useNavigate();
  const { formId } = useParams();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSettings, setPublishSettings] = useState({
    allowAnonymous: true,
    requireLogin: false,
    allowMultipleResponses: true
  });

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    questions: [],
    settings: {
      allowAnonymous: true,
      requireLogin: false,
      allowMultipleResponses: true
    },
    useNlpChat: false
  });

  const [currentQuestion, setCurrentQuestion] = useState({
    type: 'text',
    text: '',
    required: false
  });

  const [editingQuestionIndex, setEditingQuestionIndex] = useState(-1);

  const fetchForm = async () => {
    if (formId) {
      try {
        setLoading(true);
        const form = await formApi.getFormById(formId);
        setFormData({
          title: form.title,
          description: form.description,
          questions: form.questions.map(q => ({
            type: q.type,
            text: q.question,
            required: q.required
          })),
          settings: form.settings || {
            allowAnonymous: true,
            requireLogin: false,
            allowMultipleResponses: true
          },
          chatbotConfig: form.chatbotConfig || {
            enabled: true,
            personality: 'professional'
          },
          status: form.status,
          useNlpChat: form.useNlpChat || false
        });
        setPublishSettings(form.settings || {
          allowAnonymous: true,
          requireLogin: false,
          allowMultipleResponses: true
        });
      } catch (error) {
        console.error('Error fetching form:', error);
        setNotification({
          open: true,
          message: 'Error loading form. Please try again.',
          severity: 'error'
        });
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchForm();
  }, [formId]);

  const handleFormChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleQuestionTextChange = (e) => {
    setCurrentQuestion({
      ...currentQuestion,
      text: e.target.value
    });
  };

  const handleRequiredChange = (e) => {
    setCurrentQuestion({
      ...currentQuestion,
      required: e.target.checked
    });
  };

  const handleAddQuestion = () => {
    if (currentQuestion.text.trim() === '') return;

    const newQuestionData = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2),
      type: 'text',
      question: currentQuestion.text,
      required: currentQuestion.required
    };

    if (editingQuestionIndex >= 0) {
      const updatedQuestions = [...formData.questions];
      updatedQuestions[editingQuestionIndex] = {
        ...newQuestionData,
        id: formData.questions[editingQuestionIndex].id
      };
      setFormData({
        ...formData,
        questions: updatedQuestions
      });
      setEditingQuestionIndex(-1);
    } else {
      setFormData({
        ...formData,
        questions: [...formData.questions, newQuestionData]
      });
    }

    setCurrentQuestion({
      type: 'text',
      text: '',
      required: false
    });
  };

  const handleEditQuestion = (index) => {
    const questionToEdit = formData.questions[index];
    setCurrentQuestion({
      type: questionToEdit.type,
      text: questionToEdit.question,
      required: questionToEdit.required
    });
    setEditingQuestionIndex(index);
  };

  const handleDeleteQuestion = (index) => {
    const updatedQuestions = [...formData.questions];
    updatedQuestions.splice(index, 1);
    setFormData({
      ...formData,
      questions: updatedQuestions
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);

      const submissionData = {
        title: formData.title,
        description: formData.description,
        useNlpChat: formData.useNlpChat || false,
        questions: formData.questions.map(q => ({
          id: q.id || (Date.now().toString(36) + Math.random().toString(36).substring(2)),
          type: q.type,
          question: q.question,
          required: q.required
        })),
        settings: formData.settings,
      };

      if (formId) {
        await formApi.updateForm(formId, submissionData);
        setNotification({
          open: true,
          message: 'Form updated successfully!',
          severity: 'success'
        });
      } else {
        const response = await formApi.createForm(submissionData);
        setNotification({
          open: true,
          message: 'Form created successfully!',
          severity: 'success'
        });
        setTimeout(() => {
          navigate("/");
        }, 1500);
      }
    } catch (error) {
      console.error('Error saving form:', error);
      setNotification({
        open: true,
        message: 'Error saving form. Please try again.',
        severity: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const handlePublishSettingsChange = (e) => {
    const { name, checked } = e.target;
    setPublishSettings({
      ...publishSettings,
      [name]: checked
    });
  };

  const handlePublish = async () => {
    try {
      setPublishing(true);

      const updatedFormData = {
        ...formData,
        settings: {
          ...formData.settings,
          ...publishSettings
        },
        status: 'published',
        publishedAt: new Date()
      };

      await formApi.updateForm(formId, updatedFormData);
      await formApi.publishForm(formId);

      setNotification({
        open: true,
        message: 'Form published successfully!',
        severity: 'success'
      });

      setPublishDialogOpen(false);

      const form = await formApi.getFormById(formId);
      setFormData(form.data);
    } catch (error) {
      console.error('Error publishing form:', error);
      setNotification({
        open: true,
        message: 'Error publishing form. Please try again.',
        severity: 'error'
      });
    } finally {
      setPublishing(false);
    }
  };

  const renderQuestionPreview = (question, index) => {
    return (
      <div className="preview-card" key={index}>
        <div className="preview-content">
          <span className="drag-indicator">⠿</span>
          <h3>{question.question}</h3>
          {question.required && <span className="required">*Required</span>}
          <input
            type="text"
            placeholder="Text answer"
            disabled
            className="preview-input"
          />
        </div>
        <div className="preview-actions">
          <button
            className="action-button"
            onClick={() => handleEditQuestion(index)}
          >
            Edit
          </button>
          <button
            className="action-button delete"
            onClick={() => handleDeleteQuestion(index)}
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>{formId ? 'Edit Form' : 'Create New Form'}</h1>
        {formId && (
          <button
            className="publish-button"
            onClick={() => setPublishDialogOpen(true)}
            disabled={formData.status === 'published'}
          >
            {formData.status === 'published' ? 'Published' : 'Publish Form'}
          </button>
        )}
      </div>

      <div className="section">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Form Title</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleFormChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">Form Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleFormChange}
              rows="4"
            ></textarea>
          </div>
          <div className="form-group-checkbox">
            <label>
              <input
                type="checkbox"
                checked={formData.useNlpChat || false}
                onChange={(e) => setFormData({ ...formData, useNlpChat: e.target.checked })}
                name="useNlpChat"
              />
              Enable Conversational NLP Chat Mode
            </label>
          </div>
        </form>
      </div>

      <div className="section">
        <h2>Add Questions</h2>
        <div className="form-group">
          <label htmlFor="questionText">Question Text</label>
          <input
            type="text"
            id="questionText"
            value={currentQuestion.text}
            onChange={handleQuestionTextChange}
            required
          />
        </div>
        <div className="form-group-checkbox">
          <label>
            <input
              type="checkbox"
              checked={currentQuestion.required}
              onChange={handleRequiredChange}
            />
            Required
          </label>
        </div>
        <button
          className="add-button"
          onClick={handleAddQuestion}
          disabled={currentQuestion.text.trim() === ''}
        >
          {editingQuestionIndex >= 0 ? 'Update Question' : 'Add Question'}
        </button>
      </div>

      <div className="section">
        <h2>Form Preview</h2>
        {formData.questions.length === 0 ? (
          <p>No questions added yet. Add questions to see the preview.</p>
        ) : (
          formData.questions.map((question, index) => renderQuestionPreview(question, index))
        )}
      </div>

      <div className="form-actions">
        <button
          className="cancel-button"
          onClick={() => navigate('/')}
          disabled={saving || publishing}
        >
          Cancel
        </button>
        <button
          className="save-button"
          onClick={handleSubmit}
          disabled={formData.title.trim() === '' || formData.questions.length === 0 || saving || publishing}
        >
          {saving ? 'Saving...' : (formId ? 'Update Form' : 'Create Form')}
        </button>
      </div>

      {publishDialogOpen && (
        <div className="dialog">
          <div className="dialog-content">
            <h2>Publish Form</h2>
            <p>Configure how your form will be accessible to users.</p>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  name="allowAnonymous"
                  checked={publishSettings.allowAnonymous}
                  onChange={handlePublishSettingsChange}
                />
                Allow Anonymous Responses
              </label>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  name="requireLogin"
                  checked={publishSettings.requireLogin}
                  onChange={handlePublishSettingsChange}
                />
                Require Login
              </label>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  name="allowMultipleResponses"
                  checked={publishSettings.allowMultipleResponses}
                  onChange={handlePublishSettingsChange}
                />
                Allow Multiple Responses
              </label>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-button"
                onClick={() => setPublishDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="dialog-button primary"
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notification.open && (
        <div className={`notification ${notification.severity}`}>
          <span>{notification.message}</span>
          <button className="close-notification" onClick={handleCloseNotification}>
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default FormBuilder;