const oracledb = require('oracledb');
require('dotenv').config();

let pool;

async function initPool() {
  if (pool) return pool;

  pool = await oracledb.createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1
  });

  console.log('Oracle connection pool created');
  return pool;
}

async function getConnection() {
  if (!pool) {
    await initPool();
  }
  return pool.getConnection();
}

async function closePool() {
  if (pool) {
    await pool.close(0);
    console.log('Oracle connection pool closed');
  }
}

module.exports = {
  initPool,
  getConnection,
  closePool
};
