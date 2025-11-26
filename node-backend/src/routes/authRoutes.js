import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getConnection } from '../db/oracle.js';
import oracledb from 'oracledb';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = '7d'; // 토큰 유효기간

// 회원가입
router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password || !phone) {
    return res.status(400).json({ message: 'name, email, phone, password는 필수입니다.' });
  }

  const conn = await getConnection();
  try {
    // 1) 이미 같은 이메일이 있는지 확인
    const check = await conn.execute(
      `SELECT guardian_id FROM guardian WHERE email = :email`,
      { email }
    );

    if (check.rows && check.rows.length > 0) {
      return res.status(409).json({ message: '이미 가입된 이메일입니다.' });
    }

    // 2) 비밀번호 해시 생성
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    // 4) guardian 테이블에 insert
    const result = await conn.execute(
      `
      INSERT INTO guardian (
        name,
        phone,
        email,
        notification_pref,
        password_hash
      ) VALUES (
        :name,
        :phone,
        :email,
        'both',
        :password_hash
      )
      RETURNING guardian_id INTO :guardianId
      `,
      {
        name,
        phone,
        email,
        password_hash: hash,
        guardianId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );
    
    const guardianId = result.outBinds.guardianId[0];
    
    // 5) JWT 발급
    const token = jwt.sign(
      { guardianId, email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      guardian: {
        guardianId,
        name,
        email,
        phone: phone || null,
      },
    });
  } catch (err) {
    console.error('회원가입 에러:', err);
    res.status(500).json({ message: '회원가입 중 오류가 발생했습니다.' });
  } finally {
    await conn.close();
  }
});

// 로그인
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email, password는 필수입니다.' });
  }

  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `
      SELECT guardian_id, name, email, phone, password_hash
      FROM guardian
      WHERE email = :email
      `,
      { email },
      { outFormat: conn.oracleDb?.OUT_FORMAT_OBJECT || undefined }
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const row = result.rows[0];
    const hash = row.PASSWORD_HASH;

    if (!hash) {
      return res.status(401).json({ message: '비밀번호가 설정되지 않은 계정입니다.' });
    }

    const match = await bcrypt.compare(password, hash);
    if (!match) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const guardianId = row.GUARDIAN_ID;

    const token = jwt.sign(
      { guardianId, email: row.EMAIL },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      guardian: {
        guardianId,
        name: row.NAME,
        email: row.EMAIL,
        phone: row.PHONE,
      },
    });
  } catch (err) {
    console.error('로그인 에러:', err);
    res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
  } finally {
    await conn.close();
  }
});

export default router;
