import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Authorization 헤더가 없습니다.' });
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ message: '토큰 형식이 올바르지 않습니다.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // req.user에 guardianId 등 저장
    req.user = {
      guardianId: payload.guardianId,
      email: payload.email,
    };
    next();
  } catch (err) {
    console.error('JWT verify error:', err);
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
}
