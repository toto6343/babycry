import oracledb from 'oracledb';
import dotenv from 'dotenv';
dotenv.config();

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

export async function getConnection() {
  return await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
  });
}
