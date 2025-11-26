import express from 'express';
import { getConnection } from '../db/oracle.js';
import { authRequired } from '../middleware/authMiddleware.js';
import oracledb from 'oracledb';

const router = express.Router();

// ✅ 로그인 된 보호자의 아기 목록 조회
router.get('/', authRequired, async (req, res) => {
  const guardianId = req.user.guardianId;

  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `
      SELECT infant_id, name, birth_date, gender
      FROM infant
      WHERE guardian_id = :guardianId
      ORDER BY infant_id
      `,
      { guardianId },
      { outFormat: conn.oracleDb?.OUT_FORMAT_OBJECT || undefined }
    );

    const infants =
      result.rows?.map((row) => ({
        infantId: row.INFANT_ID,
        name: row.NAME,
        birthDate: row.BIRTH_DATE,
        gender: row.GENDER,
      })) || [];

    res.json({ success: true, infants });
  } catch (err) {
    console.error('아기 목록 조회 에러:', err);
    res.status(500).json({ message: '아기 목록 조회 중 오류가 발생했습니다.' });
  } finally {
    await conn.close();
  }
});

// ✅ 아기 등록
router.post('/', authRequired, async (req, res) => {
  const guardianId = req.user.guardianId;
  const { name, birthDate, gender } = req.body;

  if (!name) {
    return res.status(400).json({ message: '이름은 필수입니다.' });
  }

  const conn = await getConnection();
  try {
    
    const parsedBirth = birthDate ? new Date(birthDate) : null;

    const result = await conn.execute(
      `
      INSERT INTO infant (
        guardian_id,
        name,
        birth_date,
        gender
      ) VALUES (
        :guardian_id,
        :name,
        :birth_date,
        :gender
      )
      RETURNING infant_id INTO :infantId
      `,
      {
        guardian_id: guardianId,
        name,
        birth_date: parsedBirth, // 'YYYY-MM-DD' 문자열로 받는다고 가정
        gender: gender || 'other',
        infantId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const infantId = result.outBinds.infantId[0];

    res.json({
      success: true,
      infant: {
        infantId,
        guardianId,
        name,
        birthDate,
        gender: gender || 'other',
      },
    });
  } catch (err) {
    console.error('아기 등록 에러:', err);
    res.status(500).json({ message: '아기 등록 중 오류가 발생했습니다.' });
  } finally {
    await conn.close();
  }
});

export default router;
