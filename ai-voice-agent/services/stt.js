// services/stt.js

async function transcribeAudioBuffer(audioBuffer) {
  // Temporary safe fallback:
  // keeps build/server alive even if STT package is not installed.
  // Returns empty transcript so flow can continue without crashing.
  return "";
}

module.exports = {
  transcribeAudioBuffer,
};
