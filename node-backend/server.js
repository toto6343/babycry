import dotenv from 'dotenv';
dotenv.config();

import app from './src/app.js';
import { initPool, closePool } from './src/db/oracle.js';

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await initPool();

    app.listen(PORT, () => {
      console.log(`Node server running at http://localhost:${PORT}`);
      console.log(`- Auto report: GET /api/reports/auto?infantId=1&startDate=2025-11-01&endDate=2025-11-07`);
      console.log(`- Analysis callback: POST /api/analysis/result`);
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
