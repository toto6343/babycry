import express from 'express';
import analysisCallbackRouter from './routes/analysisCallback.js';

const app = express();

app.use(express.json());

// 모델이 분석 결과를 알려줄 때 호출하는 엔드포인트
app.use('/api/analysis', analysisCallbackRouter);

export default app;
