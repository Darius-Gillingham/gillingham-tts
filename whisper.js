require('dotenv').config();
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { v4: uuidv4 } = require('uuid');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = 8081;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/transcribe', upload.single('file'), async (req, res) => {
  console.log('📩 /transcribe endpoint hit');

  try {
    if (!req.file) {
      console.error('Whisper API error: req.file is missing');
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const tempInputPath = `./temp/${uuidv4()}.webm`;
    const tempOutputPath = `./temp_audio/${uuidv4()}.wav`;

    console.log('📁 Saving incoming audio to temp file:', tempInputPath);
    fs.writeFileSync(tempInputPath, req.file.buffer);

    ffmpeg(tempInputPath)
      .toFormat('wav')
      .on('error', (err) => {
        console.error('❌ Error in media pipeline:', err.message);
        fs.existsSync(tempInputPath) && fs.unlinkSync(tempInputPath);
        return res.status(500).json({ error: 'Invalid media format' });
      })
      .on('end', async () => {
        console.log('✅ Audio converted to WAV at:', tempOutputPath);

        try {
          const form = new FormData();
          form.append('file', fs.createReadStream(tempOutputPath));
          form.append('model', 'whisper-1');
          form.append('language', 'en');
          form.append('response_format', 'json');

          console.log('📡 Sending audio to OpenAI Whisper API...');
          const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            form,
            {
              headers: {
                ...form.getHeaders(),
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
              }
            }
          );

          console.log('📝 Transcription result:', response.data.text);
          res.json({ transcript: response.data.text });
        } catch (error) {
          console.error('❌ Whisper API error:', error.response?.data || error.message);
          res.status(500).json({ error: 'Transcription failed' });
        } finally {
          fs.existsSync(tempInputPath) && fs.unlinkSync(tempInputPath);
          fs.existsSync(tempOutputPath) && fs.unlinkSync(tempOutputPath);
        }
      })
      .save(tempOutputPath);
  } catch (error) {
    console.error('❌ Whisper API outer error:', error.message);
    res.status(500).json({ error: 'Unhandled error in transcription endpoint' });
  }
});

app.listen(port, () => {
  console.log(`🎤 Whisper transcription API running at http://localhost:${port}/transcribe`);
});
