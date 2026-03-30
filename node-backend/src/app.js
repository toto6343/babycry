// src/app.js (Express app만 export)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import logger from './utils/logger.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import infantRoutes from './routes/infantRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import actionRoutes from './routes/actionRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import videoCallRoutes from './routes/videoCallRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import visionRoutes from './routes/visionRoutes.js';
import badgeRoutes from './routes/badgeRoutes.js';
import communityRoutes from './routes/communityRoutes.js';

dotenv.config();

const app = express();

// middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// ✅ Morgan HTTP 요청 로깅 설정 (Winston과 연동)
const stream = {
  write: (message) => logger.info(message.trim())
};
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream }));

logger.info('🔧 ===== 라우터 등록 시작 =====');

app.use('/api/analysis', analysisRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/infants', infantRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/videocall', videoCallRoutes);
app.use('/api/health', healthRoutes); // ✅ 성장/건강 관리 라우터 추가
app.use('/api/vision', visionRoutes); // ✅ 비전 API 추가
app.use('/api/badges', badgeRoutes); // ✅ 뱃지 API 추가
app.use('/api/community', communityRoutes); // ✅ 커뮤니티 API 추가

logger.info('🏁 ===== 라우터 등록 완료 =====');

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((req, res, next) => {
  res.status(404).json({ success: false, error: 'Not Found' });
});

app.use((err, req, res, next) => {
  logger.error(`❌ 서버 오류: ${err.message}`);
  logger.error(err.stack);
  res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
});

export default app;
