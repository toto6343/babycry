// src/db/oracle.js (ESM 버전)
import oracledb from 'oracledb';
import dotenv from 'dotenv';

dotenv.config();

let pool;

export async function initPool() {
  if (pool) return pool;

  pool = await oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
  });

  console.log('Oracle connection pool created');
  return pool;
}

export async function getConnection() {
  if (!pool) {
    await initPool();
  }
  return pool.getConnection();
}

export async function closePool() {
  if (pool) {
    await pool.close(0);
    console.log('Oracle connection pool closed');
  }
}
