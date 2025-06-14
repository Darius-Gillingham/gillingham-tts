const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');

const pipeline = promisify(stream.pipeline);

// This version skips ffmpeg and uses OpenAI's MP3 output directly
async function synthesizeSpeech(text) {
  try {
    // 🔊 Request MP3 from OpenAI
    const response = await axios.post('https://api.openai.com/v1/audio/speech', {
      model: 'tts-1',
      voice: 'onyx',
      input: text.trim()
    }, {
      responseType: 'stream',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // 🧠 Collect MP3 stream directly
    const chunks = [];
    for await (const chunk of response.data) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (err) {
    console.error('[TTS ERROR]', err.message);
    return null;
  }
}

module.exports = synthesizeSpeech;
