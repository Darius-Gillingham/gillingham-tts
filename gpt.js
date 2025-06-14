const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = 'gpt-3.5-turbo'; // Or 'gpt-4' if needed

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is missing from environment variables.');
}

async function getGPTReply(userMessage, history = []) {
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful and concise AI receptionist.' },
      ...history,
      { role: 'user', content: userMessage }
    ];

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: MODEL,
        messages,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content?.trim();
    return reply || '[No response generated]';
  } catch (err) {
    console.error('[GPT ERROR]', err.response?.data || err.message);
    return '[Error generating response]';
  }
}

module.exports = getGPTReply;
