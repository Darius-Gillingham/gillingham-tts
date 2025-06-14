require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const FormData = require('form-data');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

const synthesizeSpeech = require('./tts');
const getGPTReply = require('./gpt');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const calls = {};
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/audio', express.static(path.join(__dirname, 'audio')));

app.post('/incoming', async (req, res) => {
  const callSid = req.body.CallSid;
  console.log('📞 Incoming Twilio webhook:');
  console.log(JSON.stringify(req.body, null, 2));

  calls[callSid] = { history: [] };

  const twiml = new twilio.twiml.VoiceResponse();

  try {
    const gptGreeting = await getGPTReply('Greet the caller warmly and professionally and please mention that you are the Gillingham Software AI Answering Machine.');
    const greetingBuffer = await synthesizeSpeech(gptGreeting);

    const audioDir = path.join(__dirname, 'audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const audioFilename = `${uuidv4()}.mp3`;
    const audioPath = path.join(audioDir, audioFilename);
    fs.writeFileSync(audioPath, greetingBuffer);
    const publicAudioUrl = `https://${req.headers.host}/audio/${audioFilename}`;

    twiml.play(publicAudioUrl);
    twiml.pause({ length: 1 });
    twiml.redirect(`/stream?sid=${callSid}`);

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    console.error('❌ Error preparing greeting:', err.message);
    twiml.say('Hello. Welcome to Gillingham Software.');
    twiml.redirect(`/stream?sid=${callSid}`);
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

app.post('/keepalive', (req, res) => {
  const sid = req.query.sid || req.body.CallSid;
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.connect().stream({
    url: `wss://${process.env.PUBLIC_HOST}/audio`,
    parameters: [
      { name: 'codec', value: 'audio/L16;rate=16000' }
    ]
  });
  twiml.pause({ length: 599 });
  twiml.redirect(`https://${process.env.PUBLIC_HOST}/keepalive?sid=${sid}`);
  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/reply', (req, res) => {
  const sid = req.query.sid;
  const file = req.query.file;
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.play(`https://${req.headers.host}/audio/${file}`);
  twiml.pause({ length: 1 });
  twiml.redirect(`https://${req.headers.host}/keepalive?sid=${sid}`);
  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/stream', (req, res) => {
  const sid = req.query.sid || req.body.CallSid;
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.connect().stream({
    url: `wss://${process.env.PUBLIC_HOST}/audio`,
    parameters: [
      { name: 'codec', value: 'audio/L16;rate=16000' }
    ]
  });
  twiml.pause({ length: 599 });
  twiml.redirect(`https://${process.env.PUBLIC_HOST}/keepalive?sid=${sid}`);
  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/', (req, res) => {
  let html = `<h1>📞 Call Debugger</h1>`;
  const keys = Object.keys(calls);
  if (keys.length === 0) {
    html += `<p>No calls yet.</p>`;
  } else {
    keys.reverse().forEach((sid, index) => {
      html += `<div style="margin-bottom:1em;padding:1em;border:1px solid #ccc">
        <b>#${index + 1}</b><br>
        <b>SID:</b> ${sid}<br>
        <pre>${JSON.stringify(calls[sid], null, 2)}</pre>
      </div>`;
    });
  }
  res.send(html);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/audio' });

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket connected');

  const FLUSH_BYTES = 30000;
  let accumulated = [];
  let accumulatedLength = 0;
  let paused = false;
  let callSid = null;

  ws.on('message', async (msg) => {
    const message = JSON.parse(msg);

    if (message.event === 'start') {
      console.log('🎙 Call started');
      console.log('🔍 Twilio codec:', message.start.mediaFormat);
      accumulated = [];
      accumulatedLength = 0;
      paused = false;
      callSid = message.start.callSid;
    }

    if (message.event === 'media') {
      if (paused) return;

      const buffer = Buffer.from(message.media.payload, 'base64');
      if (buffer.length < 160) return;

      accumulated.push(buffer);
      accumulatedLength += buffer.length;

      if (accumulatedLength >= FLUSH_BYTES) {
        paused = true;
        const combinedBuffer = Buffer.concat(accumulated);
        accumulated = [];
        accumulatedLength = 0;

        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const rawPath = path.join(tempDir, `${uuidv4()}.raw`);
        const wavPath = path.join(tempDir, `${uuidv4()}.wav`);
        fs.writeFileSync(rawPath, combinedBuffer);

        ffmpeg()
          .input(rawPath)
          .inputOptions([
            '-f', 'mulaw',
            '-ar', '8000',
            '-ac', '1'
          ])
          .outputOptions([
            '-ar', '16000',
            '-ac', '1'
          ])
          .toFormat('wav')
          .on('error', (err) => {
            console.error('❌ ffmpeg error:', err.message);
            if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
            paused = false;
          })
          .on('end', async () => {
            try {
              const form = new FormData();
              form.append('file', fs.createReadStream(wavPath));
              form.append('model', 'whisper-1');
              form.append('language', 'en');
              form.append('response_format', 'json');

              const whisperRes = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
                headers: {
                  ...form.getHeaders(),
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
                }
              });

              const transcript = whisperRes.data.text || '';
              console.log('📝 Transcript:', transcript);

              const reply = await getGPTReply(transcript);
              console.log('🤖 GPT Reply:', reply);

              const replyBuffer = await synthesizeSpeech(reply);
              const audioFilename = `${uuidv4()}.mp3`;
              const audioPath = path.join(__dirname, 'audio', audioFilename);
              fs.writeFileSync(audioPath, replyBuffer);

              console.log(`🔁 Redirecting to /reply for ${audioFilename}`);
              await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls/${callSid}.json`, 
                new URLSearchParams({ Twiml: `<Response><Play>https://${process.env.PUBLIC_HOST}/audio/${audioFilename}</Play><Pause length="1"/><Redirect>https://${process.env.PUBLIC_HOST}/keepalive?sid=${callSid}</Redirect></Response>` }), {
                  auth: {
                    username: process.env.TWILIO_ACCOUNT_SID,
                    password: process.env.TWILIO_AUTH_TOKEN
                  },
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
              });
            } catch (err) {
              console.error('❌ Error in STT/TTS or Twilio update:', err.response?.data || err.message);
            } finally {
              if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
              if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
              paused = false;
            }
          })
          .save(wavPath);
      }
    }

    if (message.event === 'stop') {
      console.log('⛔️ Call ended');
      accumulated = [];
      accumulatedLength = 0;
    }
  });

  ws.on('close', () => {
    console.log('❌ WebSocket disconnected');
  });
});

server.listen(8080, () => {
  console.log(`🌐 Server running at http://localhost:8080`);
});
