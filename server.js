const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initPool, closePool } = require('./src/db/oracle');
const reportRoutes = require('./src/routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

// 미들웨어
app.use(cors());
app.use(express.json());

// API 라우트
app.use('/api/reports', reportRoutes);

// 서버 시작
async function startServer() {
  try {
    await initPool();

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`GET http://localhost:${PORT}/api/reports/auto?infantId=1&startDate=2025-11-01&endDate=2025-11-07`);
    });

    process.on('SIGINT', async () => {
      console.log('\nGracefully shutting down...');
      await closePool();
      process.exit(0);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
