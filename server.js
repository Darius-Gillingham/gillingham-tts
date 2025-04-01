const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VOICE = 'onyx';

app.get('/tts', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Missing text parameter.');

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
    console.error('TTS error:', err.response?.data || err.message);
    res.status(500).send('TTS failed.');
  }
});

app.listen(PORT, () => {
  console.log(`✅ TTS server running on port ${PORT}`);
});
