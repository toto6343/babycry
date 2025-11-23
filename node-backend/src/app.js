import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import analysisRoutes from './routes/analysisRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// routes
app.use('/api/analysis', analysisRoutes);
app.use('/api/reports', reportRoutes);

// health
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
