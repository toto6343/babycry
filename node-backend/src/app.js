// src/app.js (수정)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import infantRoutes from './routes/infantRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import actionRoutes from './routes/actionRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';
import eventRoutes from './routes/eventRoutes.js';

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// ✅ 모든 요청 로깅 (디버깅용) - 라우터보다 먼저!
app.use((req, res, next) => {
  console.log(`📍 요청: ${req.method} ${req.originalUrl}`);
  next();
});

console.log('🔧 ===== 라우터 등록 시작 =====');

// routes (순서 중요!)
app.use('/api/analysis', analysisRoutes);
console.log('✅ /api/analysis 라우터 등록됨');

app.use('/api/reports', reportRoutes);
console.log('✅ /api/reports 라우터 등록됨');

app.use('/api/actions', actionRoutes);
console.log('✅ /api/actions 라우터 등록됨');

app.use('/api/auth', authRoutes);
console.log('✅ /api/auth 라우터 등록됨');

app.use('/api/infants', infantRoutes);
console.log('✅ /api/infants 라우터 등록됨');

app.use('/api/chatbot', chatbotRoutes);
console.log('✅ /api/chatbot 라우터 등록됨');

app.use('/api/events', eventRoutes);
console.log('✅ /api/events 라우터 등록됨');

console.log('🏁 ===== 라우터 등록 완료 =====');

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 핸들러 (맨 마지막!)
app.use((req, res, next) => {
  console.log(`❌ 404 - 매칭되지 않은 요청: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    method: req.method,
    url: req.originalUrl,
    message: '해당 엔드포인트를 찾을 수 없습니다.'
  });
});

export default app;
