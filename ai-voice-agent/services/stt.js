// services/stt.js

async function transcribeAudioBuffer(audioBuffer) {
  try {
    if (!audioBuffer || !audioBuffer.length) {
      return "";
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("❌ Missing OPENAI_API_KEY for STT");
      return "";
    }

    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/wav" });

    form.append("file", blob, "caller.wav");
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    form.append("language", process.env.OPENAI_TRANSCRIBE_LANGUAGE || "hi");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ STT API failed:", response.status, errText);
      return "";
    }

    const data = await response.json();
    return String(data.text || "").trim();
  } catch (err) {
    console.error("❌ STT transcription failed:", err.message || err);
    return "";
  }
}

module.exports = {
  transcribeAudioBuffer,
};
