import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formApi, responseApi } from '../../services/api';
import './FormView.css';

const FormView = () => {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [notification, setNotification] = useState({ visible: false, message: '', type: 'success' });
  const notificationRef = useRef(null);

  useEffect(() => {
    if (notification.visible && notificationRef.current) {
      notificationRef.current.focus();
    }
  }, [notification.visible]);

  useEffect(() => {
    const fetchForm = async () => {
      try {
        setLoading(true);
        const formData = await formApi.getFormById(formId);
        setForm(formData.data.data);
      } catch (error) {
        console.error('Error fetching form:', error);
        setNotification({
          visible: true,
          message: 'Error loading form. Please try again.',
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };
    fetchForm();
  }, [formId]);

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prevAnswers => ({
      ...prevAnswers,
      [questionId]: value
    }));

    if (errors[questionId]) {
      setErrors(prevErrors => ({
        ...prevErrors,
        [questionId]: null
      }));
    }
  };

  const validateForm = () => {
    if (!form || !form.questions) return false;

    const newErrors = {};
    let isValid = true;
    form.questions.forEach(question => {
      const questionId = question._id;
      if (question.required) {
        const answer = answers[questionId];
        let isEmpty = false;
        if (Array.isArray(answer)) {
          isEmpty = answer.length === 0;
        } else {
          isEmpty = !answer || String(answer).trim() === '';
        }

        if (isEmpty) {
          newErrors[questionId] = 'This field is required';
          isValid = false;
        }
      }
    });
    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      const firstErrorField = document.querySelector('[aria-invalid="true"]');
      if (firstErrorField) {
        firstErrorField.focus();
      }
      return;
    }

    try {
      setSubmitting(true);
      const responseData = {
        formId: formId,
        answers: Object.entries(answers).map(([questionId, answer]) => ({
          questionId: questionId,
          answer
        }))
      };

      await responseApi.submitResponse(responseData);
      setNotification({
        visible: true,
        message: 'Form submitted successfully!',
        type: 'success'
      });
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (error) {
      console.error('Error submitting form:', error);
      setNotification({
        visible: true,
        message: 'Error submitting form. Please try again.',
        type: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, visible: false });
  };

  const renderQuestion = (question) => {
    const questionId = question._id;
    const questionText = question.question;
    const isRequired = question.required;
    const errorText = errors[questionId];
    const inputId = `question-${questionId}`;
    const errorId = `error-${questionId}`;

    const commonInputProps = {
      id: inputId,
      required: isRequired,
      'aria-required': isRequired,
      'aria-invalid': !!errorText,
      'aria-describedby': errorText ? errorId : undefined,
    };

    switch (question.type) {
      case 'text':
        return (
          <div className="form-group" key={questionId}>
            <label htmlFor={inputId} className="form-label">
              {questionText} {isRequired && <span aria-hidden="true" className="required-asterisk">*</span>}
            </label>
            <input
              type="text"
              {...commonInputProps}
              value={answers[questionId] || ''}
              onChange={(e) => handleAnswerChange(questionId, e.target.value)}
              className={`form-input ${errorText ? 'input-error' : ''}`}
            />
            {errorText && <p id={errorId} className="error-message" role="alert">{errorText}</p>}
          </div>
        );

      default:
        return <p key={questionId}>Unsupported question type: {question.type}</p>;
    }
  };

  if (loading) {
    return (
      <main className="form-view-container">
        <div className="loading-indicator" role="status" aria-live="polite">
          Loading form...
        </div>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="form-view-container">
        <p>Form could not be loaded.</p>
         {notification.visible && (
          <div
            ref={notificationRef}
            className={`notification notification-${notification.type}`}
            role="alert"
            tabIndex="-1"
            aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
          >
            <p>{notification.message}</p>
            <button onClick={handleCloseNotification} className="close-button" aria-label="Close notification">
              &times;
            </button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="form-view-container">
      <header className="form-header">
        <h1>{form.title}</h1>
        {form.description && <p>{form.description}</p>}
      </header>

      {notification.visible && (
        <div
          ref={notificationRef}
          className={`notification notification-${notification.type}`}
          role="alert" 
          tabIndex="-1"
          aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
        >
          <p>{notification.message}</p>
          <button onClick={handleCloseNotification} className="close-button" aria-label="Close notification">
            &times;
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-body" noValidate>
        {form.questions.map((question) => renderQuestion(question))}

        <hr className="form-divider" />

        <div className="form-actions">
          <button
            type="submit"
            className="button button-primary"
            disabled={submitting}
            aria-disabled={submitting}
          >
            {submitting ? (
              <span className="submitting-indicator" aria-hidden="true">Submitting...</span>
            ) : (
              'Submit Form'
            )}
            {submitting && <span className="visually-hidden">Submitting form, please wait.</span>}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => navigate('/')}
            disabled={submitting}
            aria-disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
};

export default FormView; 