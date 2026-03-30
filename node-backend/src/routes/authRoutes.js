// node-backend/src/routes/authRoutes.js - 역할(ROLE) 시스템 지원
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import oracledb from 'oracledb';
import { withConnection } from '../db/oracle.js';

const router = express.Router();

// ========================================
// 회원가입 (역할 선택 가능)
// ========================================
router.post('/register', async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  console.log('📝 회원가입 요청:', { name, email, phone, role: role || 'patient' });

  // 입력 검증
  if (!name || !email || !password) {
    console.log('❌ 필수 정보 누락');
    return res.status(400).json({ error: '이름, 이메일, 비밀번호는 필수입니다.' });
  }

  // ✅ 역할 검증 (patient, doctor, admin만 허용)
  const userRole = role || 'patient';
  if (!['patient', 'doctor', 'admin'].includes(userRole)) {
    console.log('❌ 잘못된 역할:', userRole);
    return res.status(400).json({ error: '올바른 역할을 선택해주세요.' });
  }

  try {
    const result = await withConnection(async (connection) => {
      console.log('🔌 DB 연결 시작...');
      const startTime = Date.now();
      console.log(`✅ DB 연결 완료`);

      // 이메일 중복 체크
      console.log('🔍 이메일 중복 체크...');
      const checkResult = await connection.execute(
        `SELECT guardian_id FROM guardian WHERE email = :email`,
        { email }
      );

      if (checkResult.rows.length > 0) {
        console.log('❌ 이메일 중복:', email);
        throw new Error('ALREADY_EXISTS');
      }

      // 비밀번호 해싱
      console.log('🔐 비밀번호 해싱 시작...');
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      console.log(`✅ 비밀번호 해싱 완료`);

      // ✅ 보호자 등록 (ROLE 포함)
      console.log(`💾 DB INSERT 시작 (ROLE: ${userRole})...`);
      const insertResult = await connection.execute(
        `INSERT INTO guardian (name, email, password_hash, phone, role, status, created_at)
         VALUES (:name, :email, :password_hash, :phone, :role, 'active', SYSTIMESTAMP)
         RETURNING guardian_id INTO :id`,
        {
          name,
          email,
          password_hash: passwordHash,
          phone: phone || null,
          role: userRole, // ✅ 역할 저장
          id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        },
        { autoCommit: true }
      );

      const guardianId = insertResult.outBinds.id[0];
      const totalTime = Date.now() - startTime;
      return { guardianId, totalTime };
    });

    console.log(`✅ 회원가입 성공 (총 소요시간: ${result.totalTime}ms):`, result.guardianId);
    console.log(`   역할: ${userRole}`);

    res.status(201).json({
      message: '회원가입이 완료되었습니다.',
      guardianId: result.guardianId,
      role: userRole
    });

  } catch (error) {
    if (error.message === 'ALREADY_EXISTS') {
      return res.status(400).json({ error: '이미 존재하는 이메일입니다.' });
    }
    console.error('💥 회원가입 에러:', error);
    res.status(500).json({ 
      error: '회원가입 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// ========================================
// 로그인 (역할 정보 포함)
// ========================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('🔐 로그인 시도:', email);

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const loginResult = await withConnection(async (connection) => {
      console.log('🔌 DB 연결 시작...');
      const startTime = Date.now();
      console.log(`✅ DB 연결 완료`);

      // ✅ ROLE 정보도 함께 조회
      const result = await connection.execute(
        `SELECT guardian_id, name, email, password_hash, phone, role 
         FROM guardian 
         WHERE email = :email AND status = 'active'`,
        { email },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      console.log('📊 DB 조회 결과:', result.rows.length, '건');

      if (result.rows.length === 0) {
        console.log('❌ 사용자 없음:', email);
        throw new Error('INVALID_CREDENTIALS');
      }

      const user = result.rows[0];
      const { GUARDIAN_ID, NAME, EMAIL, PASSWORD_HASH, PHONE, ROLE } = user;

      // 비밀번호 검증
      if (!PASSWORD_HASH) {
        console.log('❌ 비밀번호가 설정되지 않음');
        throw new Error('PASSWORD_NOT_SET');
      }

      console.log('🔑 비밀번호 검증 시작');
      const isValid = await bcrypt.compare(password, PASSWORD_HASH);
      console.log(`✅ 비밀번호 검증 완료:`, isValid);

      if (!isValid) {
        console.log('❌ 비밀번호 불일치');
        throw new Error('INVALID_CREDENTIALS');
      }

      // ✅ JWT 토큰 생성 (역할 포함)
      const token = jwt.sign(
        { 
          guardianId: GUARDIAN_ID, 
          email: EMAIL,
          role: ROLE  // ✅ 역할 정보 포함
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );

      // 마지막 로그인 시간 업데이트
      await connection.execute(
        `UPDATE guardian SET last_login_at = SYSTIMESTAMP WHERE guardian_id = :id`,
        { id: GUARDIAN_ID },
        { autoCommit: true }
      );

      // ✅ 의사인 경우 DOCTORS 테이블 정보도 조회
      let doctorInfo = null;
      if (ROLE === 'doctor') {
        console.log('👨‍⚕️ 의사 정보 조회 중...');
        const doctorResult = await connection.execute(
          `SELECT 
            DOCTOR_ID, 
            DOCTOR_NAME, 
            SPECIALTY, 
            EXPERIENCE_YEARS, 
            RATING,
            IS_AVAILABLE
           FROM DOCTORS 
           WHERE GUARDIAN_ID = :guardianId`,
          { guardianId: GUARDIAN_ID },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (doctorResult.rows.length > 0) {
          doctorInfo = doctorResult.rows[0];
          console.log(`✅ 의사 정보 조회 완료: ${doctorInfo.DOCTOR_NAME} (${doctorInfo.SPECIALTY})`);
        }
      }

      return {
        token,
        guardian: {
          guardianId: GUARDIAN_ID,
          name: NAME,
          email: EMAIL,
          phone: PHONE,
          role: ROLE
        },
        doctorInfo,
        totalTime: Date.now() - startTime
      };
    });

    console.log(`✅ 로그인 성공 (총 소요시간: ${loginResult.totalTime}ms)`);
    res.json({
      token: loginResult.token,
      guardian: loginResult.guardian,
      doctorInfo: loginResult.doctorInfo
    });

  } catch (error) {
    if (error.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    if (error.message === 'PASSWORD_NOT_SET') {
      return res.status(401).json({ error: '비밀번호가 설정되지 않은 계정입니다.' });
    }
    console.error('💥 로그인 에러:', error);
    res.status(500).json({ 
      error: '로그인 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// ========================================
// 내 정보 조회 (토큰 기반)
// ========================================
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: '토큰이 필요합니다.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const userInfo = await withConnection(async (connection) => {
      const result = await connection.execute(
        `SELECT guardian_id, name, email, phone, role, status, created_at
         FROM guardian 
         WHERE guardian_id = :id AND status = 'active'`,
        { id: decoded.guardianId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (result.rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
      }

      const user = result.rows[0];

      // 의사인 경우 추가 정보 조회
      let doctorInfo = null;
      if (user.ROLE === 'doctor') {
        const doctorResult = await connection.execute(
          `SELECT * FROM DOCTORS WHERE GUARDIAN_ID = :guardianId`,
          { guardianId: user.GUARDIAN_ID },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (doctorResult.rows.length > 0) {
          doctorInfo = doctorResult.rows[0];
        }
      }

      return {
        guardian: {
          guardianId: user.GUARDIAN_ID,
          name: user.NAME,
          email: user.EMAIL,
          phone: user.PHONE,
          role: user.ROLE,
          createdAt: user.CREATED_AT
        },
        doctorInfo
      };
    });

    res.json(userInfo);

  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }
    console.error('토큰 검증 실패:', error);
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
});

export default router;