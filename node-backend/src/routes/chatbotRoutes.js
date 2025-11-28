import express from 'express';
import { authRequired } from '../middleware/authMiddleware.js';
import OpenAI from 'openai';

const router = express.Router();

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ 챗봇 메시지 처리
router.post('/', authRequired, async (req, res) => {
  try {
    const { infantId, guardianId, message, history } = req.body;

    if (!message) {
      return res.status(400).json({ 
        message: '메시지를 입력해주세요.' 
      });
    }

    // 시스템 프롬프트 구성
    const systemPrompt = `당신은 전문 육아 상담사입니다. 
부모들의 육아 고민을 경청하고, 따뜻하면서도 전문적인 조언을 제공합니다.
답변은 간결하고 실용적이어야 하며, 필요시 의료 전문가 상담을 권장하세요.
항상 한국어로 답변하세요.`;

    // 대화 히스토리 구성
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    // OpenAI API 호출
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = completion.choices[0].message.content;

    res.json({
      success: true,
      reply: reply,
    });

  } catch (err) {
    console.error('챗봇 에러:', err);
    res.status(500).json({
      message: '챗봇 응답 생성 중 오류가 발생했습니다.',
      error: err.message
    });
  }
});

export default router;