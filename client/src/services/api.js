import axios from 'axios';
import authService from './auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(
  (config) => {
    const token = authService.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authService.logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const formApi = {
  getAllForms: () => api.get('/forms'),
  getFormById: (id) => api.get(`/forms/${id}`),
  createForm: (data) => api.post('/forms', data),
  updateForm: (id, data) => api.put(`/forms/${id}`, data),
  deleteForm: (id) => api.delete(`/forms/${id}`),
  async publishForm(formId) {
    try {
      const response = await api.post(`/forms/${formId}/publish`);
      return response.data;
    } catch (error) {
      console.error('Error publishing form:', error);
      throw error;
    }
  }
};

export const responseApi = {
  getResponses: (formId) => api.get(`/responses/form/${formId}`),
  getResponseById: (responseId) => api.get(`/responses/${responseId}`),
  submitResponse: (data) => api.post(`/responses`, data),
  deleteResponse: (responseId) => api.delete(`/responses/${responseId}`),
  exportResponses: (formId) => api.get(`/responses/form/${formId}/export`, { responseType: 'blob' })
};

export default api; 