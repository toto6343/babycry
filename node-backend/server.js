import oracledb from 'oracledb';
import dotenv from 'dotenv';
import { initPool } from './src/db/oracle.js';  // ✅ initPool 추가

dotenv.config();

async function initialize() {
  try {
    // 1. Oracle 연결 (pool 먼저 초기화)
    await initPool();  // ✅ pool 초기화
    
    // 2. Express app 동적 import (라우터 로드 완료 후)
    const appModule = await import('./src/app.js');
    const app = appModule.default;
    
    // 3. 서버 시작
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`✅ Node.js server running on port ${PORT}`);
      console.log(`Node server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ 서버 초기화 실패:', err);
    process.exit(1);
  }
}

await initialize();