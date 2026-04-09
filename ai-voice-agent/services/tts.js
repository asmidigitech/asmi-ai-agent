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

async function generatePcm16kBuffer(text) {
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
        Accept: "audio/pcm",
      },
      params: {
        output_format: "pcm_16000",
      },
    }
  );

  return Buffer.from(response.data);
}

// Downsample signed 16-bit little-endian PCM from 16kHz to 8kHz
function downsample16kTo8k(pcm16kBuffer) {
  if (!pcm16kBuffer || pcm16kBuffer.length < 4) {
    return Buffer.alloc(0);
  }

  // 16-bit PCM => 2 bytes per sample
  const inputSamples = Math.floor(pcm16kBuffer.length / 2);
  const outputSamples = Math.floor(inputSamples / 2);
  const out = Buffer.alloc(outputSamples * 2);

  let outOffset = 0;

  for (let i = 0; i + 3 < pcm16kBuffer.length; i += 4) {
    // take every other 16-bit sample
    out[outOffset] = pcm16kBuffer[i];
    out[outOffset + 1] = pcm16kBuffer[i + 1];
    outOffset += 2;
  }

  return out.subarray(0, outOffset);
}

async function sendPcm8kToExotel(ws, pcm8kBuffer) {
  if (!pcm8kBuffer || !pcm8kBuffer.length) return;

  // Exotel docs: multiples of 320 bytes; minimum chunk size 3.2k recommended
  const CHUNK_SIZE = 3200;

  for (let i = 0; i < pcm8kBuffer.length; i += CHUNK_SIZE) {
    const chunk = pcm8kBuffer.subarray(i, i + CHUNK_SIZE);

    const payload = {
      event: "media",
      media: {
        payload: chunk.toString("base64"),
      },
    };

    if (ws.streamSid) {
      payload.streamSid = ws.streamSid;
    }

    await sendWsJson(ws, payload);

    // 3200 bytes of 8kHz 16-bit mono PCM = 200ms audio
    await sleep(200);
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

    const pcm16k = await generatePcm16kBuffer(cleanText);
    console.log("📦 PCM 16k bytes:", pcm16k.length);

    const pcm8k = downsample16kTo8k(pcm16k);
    console.log("📦 PCM 8k bytes:", pcm8k.length);

    await sendPcm8kToExotel(ws, pcm8k);
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
