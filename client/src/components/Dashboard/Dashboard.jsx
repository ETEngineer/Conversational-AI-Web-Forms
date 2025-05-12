import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formApi } from '../../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({open: false, message: '', severity: 'success'});

  const fetchForms = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedForms = await formApi.getAllForms();
      const formsData = Array.isArray(fetchedForms?.data.data) ? fetchedForms.data.data : [];
      setForms(formsData);
    } catch (err) {
      console.error('Error fetching forms:', err);
      setError('Failed to load forms. Please try again.');
      setNotification({open: true, message: 'Error loading forms.', severity: 'error'});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const handleCopyLink = (formId) => {
    const link = `${window.location.origin}/forms/${formId}/chat`;
    navigator.clipboard.writeText(link)
      .then(() => {
        setNotification({
          open: true,
          message: 'Link copied to clipboard!',
          severity: 'success'
        });
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
        setNotification({
          open: true,
          message: 'Failed to copy link.',
          severity: 'error'
        });
      });
  };

  const handleEditForm = (formId) => {
    navigate(`/forms/${formId}/edit`);
  };

  const handleCloseNotification = () => {
    setNotification({...notification, open: false });
  };

  return (
    <div className="container">
      <div className="header">
        <h1>My Forms</h1>
        <button className="create-button" onClick={() => navigate('/forms/new')}>
          Create New Form
        </button>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : forms.length === 0 ? (
        <p className="no-forms">You haven't created any forms yet.</p>
      ) : (
        <div className="forms-list">
          {forms.map((form, index) => (
            <div key={form._id} className="form-item">
              <div className="form-details">
                <h3>{form.title}</h3>
                <p>{form.description || 'No description'}</p>
              </div>
              <div className="form-actions">
                <div className="link-container">
                  <input type="text" value={`${window.location.origin}/forms/${form._id}/chat`} readOnly className="link-input" />
                  <button className="icon-button" onClick={() => handleCopyLink(form._id)} title="Copy link">
                    Link
                  </button>
                </div>
                <button className="edit-button" onClick={() => handleEditForm(form._id)} >
                  Edit
                </button>
              </div>
              {index < forms.length - 1 && <hr className="divider" />}
            </div>
          ))}
        </div>
      )}

      {notification.open && (
        <div className={`notification ${notification.severity}`}>
          <span>{notification.message}</span>
          <button className="close-notification" onClick={handleCloseNotification}>
            x
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;