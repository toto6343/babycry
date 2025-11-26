import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import infantRoutes from './routes/infantRoutes.js';

dotenv.config();

import analysisRoutes from './routes/analysisRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import actionRoutes from './routes/actionRoutes.js';

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// routes
app.use('/api/analysis', analysisRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/infants', infantRoutes);

// health
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
