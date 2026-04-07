const axios = require("axios");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

async function textToPcm8k(text) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }
  if (!ELEVENLABS_VOICE_ID) {
    throw new Error("Missing ELEVENLABS_VOICE_ID");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=pcm_8000`;

  const response = await axios.post(
    url,
    {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
      },
    },
    {
      responseType: "arraybuffer",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/pcm",
      },
      timeout: 60000,
    }
  );

  return Buffer.from(response.data);
}

function chunkPcm(buffer, chunkSize = 3200) {
  const chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    let chunk = buffer.slice(i, i + chunkSize);

    if (chunk.length % 320 !== 0) {
      const pad = 320 - (chunk.length % 320);
      chunk = Buffer.concat([chunk, Buffer.alloc(pad, 0)]);
    }

    chunks.push(chunk);
  }
  return chunks;
}

module.exports = {
  textToPcm8k,
  chunkPcm,
};
