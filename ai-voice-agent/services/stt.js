// stt.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function transcribeAudioBuffer(audioBuffer) {
  try {
    if (!audioBuffer || !audioBuffer.length) {
      return "";
    }

    const tmpFile = path.join(
      os.tmpdir(),
      `exotel-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
    );

    fs.writeFileSync(tmpFile, audioBuffer);

    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model: "gpt-4o-mini-transcribe",
      language: "hi",
    });

    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {}

    return (result.text || "").trim();
  } catch (err) {
    console.error("❌ STT transcription failed:", err.response?.data || err.message || err);
    return "";
  }
}

module.exports = {
  transcribeAudioBuffer,
};
