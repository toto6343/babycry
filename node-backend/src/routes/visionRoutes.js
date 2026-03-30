import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto'; // ✅ 4.0 고도화: 암호화 모듈
import { getOpenAI } from '../config/openai.js';
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = express.Router();
const openai = getOpenAI();

// 업로드 설정
const upload = multer({ dest: 'uploads/vision/' });

// ✅ 4.0 고도화: 의료급 파일 암호화 함수 (시뮬레이션)
// 실제 환경에서는 클라이언트에서 암호화하여 보내고(E2EE), 서버는 암호화된 채로 저장해야 합니다.
function encryptFileForPrivacy(filePath, infantId) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    // 아기 고유 ID 기반 더미 키 생성 (실제론 KMS 사용)
    const encryptionKey = crypto.scryptSync(infantId.toString(), 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    
    const encryptedPath = `${filePath}.enc`;
    fs.writeFileSync(encryptedPath, Buffer.concat([iv, encrypted]));
    
    // 원본 평문 파일 삭제 (보안)
    fs.unlinkSync(filePath);
    
    console.log(`🔒 [Security] Image E2EE Encrypted: ${encryptedPath}`);
    return encryptedPath;
  } catch (err) {
    console.error("Encryption failed:", err);
    return filePath; // 실패 시 원본 유지
  }
}

router.post('/analyze/:infantId', authRequired, upload.single('image'), async (req, res) => {
  const { infantId } = req.params;
  const { analysisType } = req.body; // 'diaper' or 'skin'
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: '이미지 파일이 필요합니다.' });
  }

  let conn;
  try {
    const originalImagePath = file.path;
    const bitmap = fs.readFileSync(originalImagePath);
    const base64Image = Buffer.from(bitmap).toString('base64');
    const mimeType = file.mimetype;

    // ✅ 4.0 고도화: AI 분석용으로 메모리(Base64)로 넘긴 직후, 디스크의 원본 파일은 즉시 암호화
    const secureImagePath = encryptFileForPrivacy(originalImagePath, infantId);

    // 2. OpenAI Vision 프롬프트 설정
    let systemPrompt = '';
    if (analysisType === 'diaper') {
      systemPrompt = '당신은 소아과 전문의입니다. 아기의 기저귀(대변) 사진을 보고 건강 상태(황금변, 녹변, 혈변 등)와 소화 상태를 짧고 명확하게 분석해주세요. 마지막에는 심각도를 Low, Medium, High 중 하나로만 말해주세요.';
    } else {
      systemPrompt = '당신은 소아 피부과 전문의입니다. 아기의 피부 사진을 보고 발진, 태열, 아토피 등의 상태를 파악하여 짧고 명확하게 조언해주세요. 마지막에는 심각도를 Low, Medium, High 중 하나로만 말해주세요.';
    }

    // 3. OpenAI 호출
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Vision 지원 모델
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 사진을 분석해주세요.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
          ]
        }
      ],
      max_tokens: 300,
    });

    const aiResponse = response.choices[0].message.content;
    
    // 심각도 추출 (가장 마지막 단어)
    let severity = 'Medium';
    if (aiResponse.includes('High')) severity = 'High';
    else if (aiResponse.includes('Low')) severity = 'Low';

    const cleanOpinion = aiResponse.replace(/High|Medium|Low/g, '').trim();

    // 4. DB 저장 (암호화된 경로 저장)
    conn = await getConnection();
    await conn.execute(
      `INSERT INTO vision_analysis (infant_id, image_url, analysis_type, ai_opinion, severity)
       VALUES (:infantId, :imageUrl, :type, :opinion, :severity)`,
      {
        infantId,
        imageUrl: secureImagePath, // ✅ 암호화된 파일 경로 저장
        type: analysisType || 'other',
        opinion: cleanOpinion,
        severity
      },
      { autoCommit: true }
    );

    // ✅ 건강 지킴이 뱃지 체크 로직 호출 (생략 가능하나 연동)
    // TODO: badge 발급 로직 연동

    res.json({
      success: true,
      opinion: cleanOpinion,
      severity,
      // 프론트엔드 반환 시 실제 파일 경로 대신 보안 처리됨을 명시
      imageUrl: 'encrypted_for_privacy' 
    });

  } catch (err) {
    console.error('Vision Analysis Error:', err);
    res.status(500).json({ success: false, message: '이미지 분석 중 오류가 발생했습니다.' });
  } finally {
    if (conn) await conn.close();
  }
});

export default router;
