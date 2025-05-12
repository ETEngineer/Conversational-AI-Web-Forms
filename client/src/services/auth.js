import axios from 'axios';

const API_URL = axios.create({'baseURL' : 'http://localhost:5000/api'});

const authService = {
  login: async (email, password) => {
    const response = await API_URL.post("/auth/login", { email, password });
    if (response.data.token) {
      localStorage.setItem('user', JSON.stringify(response.data));
    }
    return response.data;
  },

  register: async (userData) => {
    const response = await API_URL.post("/auth/register", userData);
    if (response.data.token) {
      localStorage.setItem('user', JSON.stringify(response.data));
    }
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  getToken: () => {
    const user = authService.getCurrentUser();
    return user ? user.token : null;
  },

  isAuthenticated: () => {
    return !!authService.getToken();
  }
};

export default authService; 