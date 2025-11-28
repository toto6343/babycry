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

// routes
app.use('/api/analysis', analysisRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/infants', infantRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/events', eventRoutes); 

// health
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Node.js server running on port ${PORT}`);
});

export default app;