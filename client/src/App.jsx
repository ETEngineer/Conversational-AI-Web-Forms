import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Dashboard from './components/Dashboard/Dashboard.jsx';
import FormBuilder from './components/FormBuilder/FormBuilder.jsx';
import FormView from './components/FormView/FormView.jsx';
import Login from './components/Login/Login.jsx';
import Register from './components/Register/Register.jsx';
import NlpChatView from './components/NlpChatView/NlpChatView.jsx';
import Navbar from './components/Navbar/Navbar.jsx';
import Responses from './components/Responses/Responses.jsx';

const ProtectedRoute = ({}) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return null; // future : add a gif loading screen when planned to deploy in cloud when the latency between pages become significant
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <Outlet />;
};

// App Routes component
const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forms/:formId" element={<FormView />} />
      <Route path="/forms/:formId/chat" element={<NlpChatView />} />
      <Route path="*" element={<Navigate to="/login" />} />
      
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/forms/new" element={<FormBuilder />} />
        <Route path="/forms/:formId/edit" element={<FormBuilder />} />
        <Route path="/responses/:formId" element={<Responses />} />
      </Route>
    </Routes>
  );
};

const App = () => {
  return (
      <AuthProvider>
        <Navbar />
        <AppRoutes />
      </AuthProvider>
  );
};

export default App; 