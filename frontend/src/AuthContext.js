// src/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [selectedInfant, setSelectedInfant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 앱 로드 시 저장된 인증 정보 복원
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedInfant = localStorage.getItem('selectedInfant');

    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    if (savedInfant) {
      setSelectedInfant(JSON.parse(savedInfant));
    }
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('selectedInfant');
    setUser(null);
    setSelectedInfant(null);
  };

  const selectInfant = (infant) => {
    localStorage.setItem('selectedInfant', JSON.stringify(infant));
    setSelectedInfant(infant);
  };

  const value = {
    user,
    selectedInfant,
    loading,
    login,
    logout,
    selectInfant,
    isAuthenticated: !!user,
    hasSelectedInfant: !!selectedInfant,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};