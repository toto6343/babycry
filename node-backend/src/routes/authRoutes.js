import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import oracledb from 'oracledb';
import dbConfig from '../db/oracle.js';

const router = express.Router();

// 회원가입
router.post('/register', async (req, res) => {
  const { name, email, password, phone } = req.body;

  console.log('📝 회원가입 요청:', { name, email, phone });

  // 입력 검증
  if (!name || !email || !password) {
    console.log('❌ 필수 정보 누락');
    return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  }

  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);

    // 이메일 중복 체크
    const checkResult = await connection.execute(
      `SELECT guardian_id FROM guardian WHERE email = :email`,
      { email }
    );

    if (checkResult.rows.length > 0) {
      console.log('❌ 이메일 중복:', email);
      return res.status(400).json({ error: '이미 존재하는 이메일입니다.' });
    }

    // 비밀번호 해싱 (중요!)
    console.log('🔐 비밀번호 해싱 시작...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    console.log('✅ 비밀번호 해싱 완료:', passwordHash.substring(0, 20) + '...');

    // 보호자 등록
    const result = await connection.execute(
      `INSERT INTO guardian (name, email, password_hash, phone, status, created_at)
       VALUES (:name, :email, :password_hash, :phone, 'active', SYSTIMESTAMP)
       RETURNING guardian_id INTO :id`,
      {
        name,
        email,
        password_hash: passwordHash,  // ← 여기가 중요!
        phone: phone || null,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      },
      { autoCommit: true }
    );

    const guardianId = result.outBinds.id[0];

    console.log('✅ 회원가입 성공:', guardianId);

    res.status(201).json({
      message: '회원가입이 완료되었습니다.',
      guardianId: guardianId
    });

  } catch (error) {
    console.error('💥 회원가입 에러:', error);
    res.status(500).json({ 
      error: '회원가입 중 오류가 발생했습니다.',
      details: error.message 
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Close connection error:', err);
      }
    }
  }
});

// 로그인
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('🔐 로그인 시도:', email);

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT guardian_id, name, email, password_hash, phone 
       FROM guardian 
       WHERE email = :email AND status = 'active'`,
      { email }
    );

    console.log('📊 DB 조회 결과:', result.rows.length, '건');

    if (result.rows.length === 0) {
      console.log('❌ 사용자 없음:', email);
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const [guardianId, name, userEmail, passwordHash, phone] = result.rows[0];

    // password_hash가 NULL인지 확인
    if (!passwordHash) {
      console.log('❌ 비밀번호가 설정되지 않음');
      return res.status(401).json({ 
        message: '비밀번호가 설정되지 않은 계정입니다.' 
      });
    }

    console.log('🔑 비밀번호 검증 시작');
    console.log('  - DB 해시:', passwordHash.substring(0, 20) + '...');

    // 비밀번호 확인
    const isValid = await bcrypt.compare(password, passwordHash);
    
    console.log('✅ 비밀번호 검증 결과:', isValid);

    if (!isValid) {
      console.log('❌ 비밀번호 불일치');
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { guardianId, email: userEmail },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // 마지막 로그인 시간 업데이트
    await connection.execute(
      `UPDATE guardian SET last_login_at = SYSTIMESTAMP WHERE guardian_id = :id`,
      { id: guardianId },
      { autoCommit: true }
    );

    console.log('✅ 로그인 성공:', guardianId);

    res.json({
      token,
      guardian: {
        guardianId,
        name,
        email: userEmail,
        phone
      }
    });

  } catch (error) {
    console.error('💥 로그인 에러:', error);
    res.status(500).json({ 
      error: '로그인 중 오류가 발생했습니다.',
      details: error.message 
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Close connection error:', err);
      }
    }
  }
});

export default router;