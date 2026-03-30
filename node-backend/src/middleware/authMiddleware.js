// src/middleware/authMiddleware.js - ROLE 지원 추가
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!JWT_SECRET) {
  if (IS_PROD) {
    console.error('❌ CRITICAL ERROR: JWT_SECRET environment variable is not defined in production!');
    process.exit(1);
  } else {
    console.warn('⚠️ WARNING: JWT_SECRET is not defined. Using a default development secret. This is not secure!');
  }
}

const SECRET = JWT_SECRET || 'dev-secret-change-me';

export function authRequired(req, res, next) {
  // ✅ 디버그 로그 추가 (운영 환경에서는 로거로 대체 가능)
  if (!IS_PROD) {
    console.log('🔐 authRequired 미들웨어 실행');
    console.log('📋 요청 URL:', req.method, req.originalUrl);
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Authorization 헤더가 없습니다.' });
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: '토큰 형식이 올바르지 않습니다.' });
  }

  try {
    const payload = jwt.verify(token, SECRET);
    
    // ✅ req.user에 guardianId, email, role 저장
    req.user = {
      guardianId: payload.guardianId,
      email: payload.email,
      role: payload.role || 'patient'
    };
    
    next();
  } catch (err) {
    console.error('❌ JWT verify error:', err.message);
    return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
  }
}

// ✅ 의사 권한 전용 미들웨어 추가
export function doctorOnly(req, res, next) {
  if (req.user.role !== 'doctor') {
    console.log('❌ 의사 권한 필요:', req.user);
    return res.status(403).json({ 
      success: false,
      message: '의사 권한이 필요합니다.' 
    });
  }
  console.log('✅ 의사 권한 확인');
  next();
}

// ✅ 환자 권한 전용 미들웨어 추가
export function patientOnly(req, res, next) {
  if (req.user.role !== 'patient') {
    console.log('❌ 환자 권한 필요:', req.user);
    return res.status(403).json({ 
      success: false,
      message: '환자 권한이 필요합니다.' 
    });
  }
  console.log('✅ 환자 권한 확인');
  next();
}

// ✅ 관리자 권한 전용 미들웨어 추가
export function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    console.log('❌ 관리자 권한 필요:', req.user);
    return res.status(403).json({ 
      success: false,
      message: '관리자 권한이 필요합니다.' 
    });
  }
  console.log('✅ 관리자 권한 확인');
  next();
}