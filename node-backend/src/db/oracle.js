// node-backend/src/db/oracle.js
import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

// DB 설정 객체 (default export로 사용)
const dbConfig = {
  user: process.env.ORACLE_USER || process.env.DB_USER,
  password: process.env.ORACLE_PASSWORD || process.env.DB_PASSWORD,
  connectString: process.env.ORACLE_CONNECT_STRING || process.env.DB_DSN,
};

let pool;

export async function initPool() {
  if (pool) return pool;

  console.log('🔧 Oracle 연결 설정:', {
    user: dbConfig.user,
    connectString: dbConfig.connectString,
  });

  pool = await oracledb.createPool({
    ...dbConfig,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 2,
    poolTimeout: 60,
  });

  console.log('✅ Oracle connection pool created');
  return pool;
}

export async function getConnection() {
  if (!pool) {
    await initPool();
  }
  return pool.getConnection();
}

/**
 * ✅ 안전한 DB 실행 래퍼 (Connection Leak 방지)
 * @param {Function} callback - (conn) => Promise<any>
 */
export async function withConnection(callback) {
  let conn;
  try {
    conn = await getConnection();
    return await callback(conn);
  } catch (err) {
    throw err;
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (closeErr) {
        console.error('⚠️ DB Connection close error:', closeErr);
      }
    }
  }
}

export async function closePool() {
  if (pool) {
    await pool.close(0);
    console.log('Oracle connection pool closed');
  }
}

export function getPool() {
  if (!pool) {
    throw new Error('Pool not initialized. Call initPool() first.');
  }
  return pool;
}

// ✅ default export 추가
export default dbConfig;