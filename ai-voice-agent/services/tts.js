// tts.js
// Replace this with your existing working TTS + mark sender logic if already present.

async function speakAndMark(ws, text) {
  // IMPORTANT:
  // Plug your existing ElevenLabs / audio streaming / Exotel media send logic here.
  // This function must:
  // 1. Convert text to speech
  // 2. Send audio frames to websocket
  // 3. Optionally send a mark event after playback

  console.log("TTS:", text);
}

module.exports = {
  speakAndMark,
};
