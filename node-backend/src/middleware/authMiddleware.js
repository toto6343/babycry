import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function authRequired(req, res, next) {
  // ✅ 디버그 로그 추가
  console.log('🔐 authRequired 미들웨어 실행');
  console.log('📋 요청 URL:', req.method, req.originalUrl);
  console.log('📋 Authorization 헤더:', req.headers.authorization);

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.log('❌ Authorization 헤더 없음');
    return res.status(401).json({ message: 'Authorization 헤더가 없습니다.' });
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    console.log('❌ 토큰 형식 오류:', { type, hasToken: !!token });
    return res.status(401).json({ message: '토큰 형식이 올바르지 않습니다.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    
    // req.user에 guardianId 등 저장
    req.user = {
      guardianId: payload.guardianId,
      email: payload.email,
    };
    
    console.log('✅ 인증 성공:', { 
      guardianId: payload.guardianId, 
      email: payload.email 
    });
    
    next();
  } catch (err) {
    console.error('❌ JWT verify error:', err.message);
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
}
