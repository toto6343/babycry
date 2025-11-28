// src/api.js
import axios from 'axios';

const NODE_API = axios.create({
  baseURL: 'http://localhost:4000/api',
});

const PYTHON_API = axios.create({
  baseURL: 'http://localhost:8001',
});

// JWT 토큰 자동 추가 인터셉터
NODE_API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

PYTHON_API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ============================================
// 인증 API
// ============================================
export const authAPI = {
  register: (data) => NODE_API.post('/auth/register', data),
  login: (data) => NODE_API.post('/auth/login', data),
};

// ============================================
// 아기 관리 API
// ============================================
export const infantAPI = {
  getAll: () => NODE_API.get('/infants'),
  create: (data) => NODE_API.post('/infants', data),
  getById: (id) => NODE_API.get(`/infants/${id}`),
};

// ============================================
// 울음 분석 API
// ============================================
export const cryAPI = {
  upload: (formData, infantId, guardianId) => 
    PYTHON_API.post(`/api/upload?infant_id=${infantId}&guardian_id=${guardianId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ============================================
// 대시보드 API
// ============================================
export const dashboardAPI = {
  getEvents: (infantId) => NODE_API.get(`/actions/dashboard?infantId=${infantId}`),
};

// ============================================
// 조치 기록 API
// ============================================
export const actionAPI = {
  record: (data) => NODE_API.post('/actions/record', data),
  update: (actionId, data) => NODE_API.put(`/actions/${actionId}`, data),
  delete: (actionId) => NODE_API.delete(`/actions/${actionId}`),
};

// ============================================
// 챗봇 API
// ============================================
export const chatbotAPI = {
  sendMessage: (data) => NODE_API.post('/chatbot', data),
};

// ============================================
// 보고서 API (수정됨)
// ============================================
export const reportAPI = {
  // ✅ URL 패턴 변경: /reports/generate/:infantId
  generate: (infantId) => NODE_API.post(`/reports/generate/${infantId}`),
  
  // ✅ URL 패턴 변경: /reports/:infantId
  getAll: (infantId) => NODE_API.get(`/reports/${infantId}`),
};

export default {
  authAPI,
  infantAPI,
  cryAPI,
  dashboardAPI,
  actionAPI,
  chatbotAPI,
  reportAPI,
};