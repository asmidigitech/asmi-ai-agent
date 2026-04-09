// services/stt.js

async function transcribeAudioBuffer(audioBuffer) {
  // Temporary safe fallback:
  // keeps build/server alive without OpenAI package/runtime dependency.
  // Returns empty transcript so the app does not crash.
  return "";
}

module.exports = {
  transcribeAudioBuffer,
};
