// src/config/openai.js
import OpenAI from 'openai';

let openaiInstance = null;

export function getOpenAI() {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}
