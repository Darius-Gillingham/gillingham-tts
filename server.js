const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VOICE = 'onyx';

let lastRequestTime = 0;
const COOLDOWN_MS = 30 * 1000; // 30 seconds

app.get('/tts', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Missing text parameter.');

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < COOLDOWN_MS) {
    const waitTime = Math.ceil((COOLDOWN_MS - timeSinceLastRequest) / 1000);
    return res.status(429).send(`TTS rate limit: please wait ${waitTime}s before trying again.`);
  }

  lastRequestTime = now;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      {
        model: 'tts-1',
        voice: VOICE,
        input: text,
      },
      {
        responseType: 'stream',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'inline; filename="speech.mp3"',
      'Accept-Ranges': 'bytes',
    });

    response.data.pipe(res);
  } catch (err) {
    console.error('❌ TTS Error:');
    if (err.response) {
      console.error('🔻 Status:', err.response.status);
      try {
        console.error('🔻 Data:', JSON.stringify(err.response.data, null, 2));
      } catch (e) {
        console.error('🔻 Data (raw):', err.response.data);
      }
    } else {
      console.error('🔻 Message:', err.message);
    }
    res.status(500).send('TTS failed.');
  }
});

app.listen(PORT, () => {
  console.log(`✅ TTS server running on port ${PORT}`);
});
