const express = require('express');
const axios = require('axios');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const stream = require('stream');
const { promisify } = require('util');
require('dotenv').config();

const router = express.Router();
const pipeline = promisify(stream.pipeline);

router.post('/generate-intro', async (req, res) => {
  const text = req.body.text;

  if (!text) {
    return res.status(400).send('Missing text input');
  }

  try {
    const openaiStream = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      {
        model: 'tts-1',
        voice: 'onyx',
        input: text.trim(),
      },
      {
        responseType: 'stream',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Set response headers
    res.set({
      'Content-Type': 'audio/wav',
      'Transfer-Encoding': 'chunked',
    });

    // Pipe OpenAI MP3 through ffmpeg to convert to Twilio-safe WAV
    ffmpeg(openaiStream.data)
      .setFfmpegPath(ffmpegPath)
      .audioChannels(1)
      .audioFrequency(8000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', (err) => {
        console.error('[FFMPEG ERROR]', err.message);
        res.status(500).send('FFmpeg conversion error');
      })
      .pipe(res, { end: true });

  } catch (err) {
    console.error('[TTS ERROR]', err.message);
    res.status(500).send('Failed to generate speech');
  }
});

module.exports = router;
