// tts.js

const axios = require("axios");

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function chunkBase64String(base64, chunkSize = 3200) {
  const chunks = [];
  for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.slice(i, i + chunkSize));
  }
  return chunks;
}

async function generateUlawAudioBase64(text) {
  const apiKey = getRequiredEnv("ELEVENLABS_API_KEY");
  const voiceId = getRequiredEnv("ELEVENLABS_VOICE_ID");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`;

  const response = await axios.post(
    url,
    {
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
      voice_settings: {
        stability: Number(process.env.ELEVENLABS_STABILITY || 0.45),
        similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || 0.75),
        style: Number(process.env.ELEVENLABS_STYLE || 0.2),
        use_speaker_boost:
          String(process.env.ELEVENLABS_SPEAKER_BOOST || "true") === "true",
      },
    },
    {
      responseType: "arraybuffer",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/basic",
      },
      timeout: 30000,
    }
  );

  return Buffer.from(response.data).toString("base64");
}

function sendWsJson(ws, payload) {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify(payload), (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function sendAudioChunks(ws, base64Audio) {
  const chunks = chunkBase64String(base64Audio, 3200);

  for (const chunk of chunks) {
    const mediaEvent = {
      event: "media",
      media: {
        payload: chunk,
      },
    };

    if (ws.streamSid) {
      mediaEvent.streamSid = ws.streamSid;
    }

    await sendWsJson(ws, mediaEvent);

    // tiny pacing gap helps telephony stream stability
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function sendMark(ws, label = "tts_complete") {
  const markEvent = {
    event: "mark",
    mark: {
      name: label,
    },
  };

  if (ws.streamSid) {
    markEvent.streamSid = ws.streamSid;
  }

  await sendWsJson(ws, markEvent);
}

async function speakAndMark(ws, text) {
  try {
    if (!ws || ws.readyState !== 1) {
      return;
    }

    const cleanText = String(text || "").trim();
    if (!cleanText) {
      return;
    }

    console.log("🔊 Generating TTS:", cleanText);

    const base64Audio = await generateUlawAudioBase64(cleanText);

    await sendAudioChunks(ws, base64Audio);
    await sendMark(ws);

    console.log("✅ Audio streamed successfully");
  } catch (err) {
    console.error(
      "❌ TTS failed:",
      err.response?.data || err.message || err
    );
    throw err;
  }
}

module.exports = {
  speakAndMark,
};
