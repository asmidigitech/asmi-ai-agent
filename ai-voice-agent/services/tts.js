// services/tts.js

const axios = require("axios");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendWsJson(ws, payload) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return resolve();

    ws.send(JSON.stringify(payload), (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function generateUlawAudioBuffer(text) {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = requireEnv("ELEVENLABS_VOICE_ID");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await axios.post(
    url,
    {
      text,
      model_id: getEnv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"),
      voice_settings: {
        stability: Number(getEnv("ELEVENLABS_STABILITY", "0.45")),
        similarity_boost: Number(getEnv("ELEVENLABS_SIMILARITY_BOOST", "0.75")),
        style: Number(getEnv("ELEVENLABS_STYLE", "0.2")),
        use_speaker_boost:
          String(getEnv("ELEVENLABS_SPEAKER_BOOST", "true")) === "true",
      },
    },
    {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/basic",
      },
      params: {
        output_format: "ulaw_8000",
      },
    }
  );

  return Buffer.from(response.data);
}

function stripTelephonyHeaders(buffer) {
  if (!buffer || !buffer.length) return buffer;

  // AU header: ".snd"
  if (
    buffer.length > 24 &&
    buffer[0] === 0x2e &&
    buffer[1] === 0x73 &&
    buffer[2] === 0x6e &&
    buffer[3] === 0x64
  ) {
    const headerOffset = buffer.readUInt32BE(4);
    if (headerOffset > 0 && headerOffset < buffer.length) {
      console.log(`✂️ Stripping AU header: ${headerOffset} bytes`);
      return buffer.subarray(headerOffset);
    }
  }

  // WAV header: "RIFF....WAVE"
  if (
    buffer.length > 44 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    let offset = 12;

    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString("ascii", offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === "data") {
        const dataStart = offset + 8;
        if (dataStart < buffer.length) {
          console.log(`✂️ Stripping WAV header: ${dataStart} bytes`);
          return buffer.subarray(dataStart);
        }
      }

      offset += 8 + chunkSize + (chunkSize % 2);
    }

    // safe fallback if "data" chunk not parsed
    console.log("✂️ Stripping WAV default header: 44 bytes");
    return buffer.subarray(44);
  }

  return buffer;
}

async function sendAudioBufferAsMedia(ws, audioBuffer) {
  if (!audioBuffer || !audioBuffer.length) return;

  // 20ms @ 8kHz μ-law mono = 160 bytes
  const FRAME_SIZE = 160;

  for (let i = 0; i < audioBuffer.length; i += FRAME_SIZE) {
    const frame = audioBuffer.subarray(i, i + FRAME_SIZE);

    const payload = {
      event: "media",
      media: {
        payload: frame.toString("base64"),
      },
    };

    if (ws.streamSid) {
      payload.streamSid = ws.streamSid;
    }

    await sendWsJson(ws, payload);
    await sleep(20);
  }
}

async function sendMark(ws, label = "tts_complete") {
  const payload = {
    event: "mark",
    mark: {
      name: label,
    },
  };

  if (ws.streamSid) {
    payload.streamSid = ws.streamSid;
  }

  await sendWsJson(ws, payload);
}

async function speakAndMark(ws, text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;
  if (!ws || ws.readyState !== 1) return;

  try {
    console.log("🔊 Generating TTS:", cleanText);

    let audioBuffer = await generateUlawAudioBuffer(cleanText);
    console.log("📦 TTS bytes before strip:", audioBuffer.length);

    audioBuffer = stripTelephonyHeaders(audioBuffer);
    console.log("📦 TTS bytes after strip:", audioBuffer.length);

    await sendAudioBufferAsMedia(ws, audioBuffer);
    await sendMark(ws);

    console.log("✅ Audio streamed successfully");
  } catch (err) {
    console.error("❌ TTS failed:", err.response?.data || err.message || err);
    throw err;
  }
}

module.exports = {
  speakAndMark,
};
