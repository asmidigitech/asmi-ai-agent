const url = require("url");
const { textToPcm8k, chunkPcm } = require("./elevenlabs");
const { transcribePcmBuffer } = require("./transcribe");
const { generateReply } = require("./aiReply");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playText(ws, streamSid, text) {
  const pcmBuffer = await textToPcm8k(text);
  const chunks = chunkPcm(pcmBuffer, 3200);

  // clear any queued audio before speaking
  ws.send(
    JSON.stringify({
      event: "clear",
      stream_sid: streamSid
    })
  );

  await sleep(100);

  for (const chunk of chunks) {
    ws.send(
      JSON.stringify({
        event: "media",
        stream_sid: streamSid,
        media: {
          payload: chunk.toString("base64")
        }
      })
    );

    await sleep(100);
  }

  ws.send(
    JSON.stringify({
      event: "mark",
      stream_sid: streamSid,
      mark: { name: "audio_sent" }
    })
  );
}

async function sendGreeting(ws, streamSid) {
  const greeting =
    "Hello Anand. Main Asmi Digitech se bol rahi hoon. Aapka business assessment receive hua hai. Kya abhi 30 seconds ke liye baat kar sakte hain?";

  await playText(ws, streamSid, greeting);
}

function attachVoicebotWebSocket(wss) {
  wss.on("connection", (ws, req) => {
    const parsed = url.parse(req.url, true);
    const query = parsed.query || {};

    console.log("🔌 Exotel Voicebot WebSocket connected");
    console.log("Query params:", query);

    let streamSid = null;
    let greetingStarted = false;
    let greetingDone = false;

    let audioBuffer = [];
    let silenceTimer = null;
    let processingUserSpeech = false;

    async function flushUserSpeech() {
      if (audioBuffer.length === 0) return;
      if (processingUserSpeech) return;
      if (!streamSid) return;

      processingUserSpeech = true;

      try {
        const fullBuffer = Buffer.concat(audioBuffer);
        audioBuffer = [];

        console.log("🧠 User finished speaking. Buffer size:", fullBuffer.length);

        let transcript = "";
        try {
          const result = await transcribePcmBuffer(fullBuffer);
          transcript = result.text || "";
        } catch (err) {
          console.error("❌ Transcription failed:", err.message);
        }

        console.log("📝 Transcript:", transcript);

        let replyText = "Sure. Aapka business service based hai ya product based?";

        if (transcript.trim()) {
          try {
            replyText = await generateReply(transcript);
          } catch (err) {
            console.error("❌ AI reply failed:", err.message);
          }
        }

        console.log("🤖 AI Reply:", replyText);

        try {
          await playText(ws, streamSid, replyText);
          console.log("✅ AI reply audio sent");
        } catch (err) {
          console.error("❌ AI playback failed:", err.message);
        }
      } catch (err) {
        console.error("❌ flushUserSpeech failed:", err.message);
      } finally {
        processingUserSpeech = false;
      }
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.event !== "media") {
          console.log("📡 WS event:", msg.event);
        }

        if (msg.event === "connected") return;

        if (msg.event === "start") {
          streamSid = msg.stream_sid || msg.streamSid;

          console.log("▶️ Stream started:", {
            streamSid,
            callSid: msg.start?.call_sid || msg.start?.callSid,
            from: msg.start?.from,
            to: msg.start?.to
          });

          return;
        }

        if (msg.event === "media") {
          const payload = msg.media?.payload;

          if (streamSid && !greetingStarted) {
            greetingStarted = true;

            try {
              await sendGreeting(ws, streamSid);
              greetingDone = true;
              console.log("✅ Greeting audio sent");
            } catch (err) {
              console.error("❌ Greeting send failed:", err.message);
            }

            return;
          }

          if (greetingDone && payload) {
            const chunk = Buffer.from(payload, "base64");
            audioBuffer.push(chunk);

            if (silenceTimer) clearTimeout(silenceTimer);

            silenceTimer = setTimeout(async () => {
              await flushUserSpeech();
            }, 900);
          }

          return;
        }

        if (msg.event === "mark") {
          console.log("✅ Mark received:", msg.mark);
          return;
        }

        if (msg.event === "stop") {
          console.log("⏹ Stream stopped:", msg.stop);

          if (silenceTimer) clearTimeout(silenceTimer);
          await flushUserSpeech();
          return;
        }
      } catch (err) {
        console.error("❌ WS parse error:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("🔌 Exotel Voicebot WebSocket closed");
    });

    ws.on("error", (err) => {
      console.error("❌ Voicebot WS error:", err.message);
    });
  });
}

module.exports = {
  attachVoicebotWebSocket
};
