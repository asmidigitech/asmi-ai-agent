const axios = require("axios");
const FormData = require("form-data");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function pcmToWavBuffer(pcmBuffer, sampleRate = 8000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  pcmBuffer.copy(buffer, 44);

  return buffer;
}

async function transcribePcmBuffer(pcmBuffer) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const wavBuffer = pcmToWavBuffer(pcmBuffer, 8000, 1, 16);

  const form = new FormData();
  form.append("model", "gpt-4o-transcribe");
  form.append("file", wavBuffer, {
    filename: "caller_audio.wav",
    contentType: "audio/wav",
  });

  const response = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    form,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...form.getHeaders(),
      },
      timeout: 60000,
    }
  );

  return response.data;
}

module.exports = {
  transcribePcmBuffer,
  pcmToWavBuffer,
};
