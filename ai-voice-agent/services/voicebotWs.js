const url = require("url");
const { textToPcm8k, chunkPcm } = require("./elevenlabs");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendGreeting(ws, streamSid) {
  const greeting =
    "Hello Anand. Main Asmi Digitech se bol rahi hoon. Aapka business assessment receive hua hai. Kya abhi 30 seconds ke liye baat kar sakte hain?";

  const pcmBuffer = await textToPcm8k(greeting);
  const chunks = chunkPcm(pcmBuffer, 3200);

  for (const chunk of chunks) {
    ws.send(
      JSON.stringify({
        event: "media",
        stream_sid: streamSid,
        media: {
          payload: chunk.toString("base64"),
        },
      })
    );

    await sleep(100);
  }

  ws.send(
    JSON.stringify({
      event: "mark",
      stream_sid: streamSid,
      mark: { name: "greeting_sent" },
    })
  );
}

function attachVoicebotWebSocket(wss) {
  wss.on("connection", (ws, req) => {
    const parsed = url.parse(req.url, true);
    const query = parsed.query || {};

    console.log("🔌 Exotel Voicebot WebSocket connected");

    let streamSid = null;
    let greetingStarted = false;

    // 🔥 NEW: audio buffer
    let audioBuffer = [];
    let silenceTimer = null;

    function handleSilence() {
      if (audioBuffer.length === 0) return;

      const fullBuffer = Buffer.concat(audioBuffer);
      console.log("🧠 User finished speaking. Buffer size:", fullBuffer.length);

      // 🔥 IMPORTANT: next step will use this buffer for transcription
      // For now just log
      audioBuffer = [];
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.event !== "media") {
          console.log("📡 WS event:", msg.event);
        }

        if (msg.event === "start") {
          streamSid = msg.stream_sid || msg.streamSid;
          return;
        }

        if (msg.event === "media") {
          const payload = msg.media?.payload;

          if (payload) {
            const chunk = Buffer.from(payload, "base64");

            // store chunk
            audioBuffer.push(chunk);

            // reset silence timer
            if (silenceTimer) clearTimeout(silenceTimer);

            silenceTimer = setTimeout(() => {
              handleSilence();
            }, 1500); // 1.5 sec silence detection
          }

          // trigger greeting only once
          if (streamSid && !greetingStarted) {
            greetingStarted = true;

            try {
              await sendGreeting(ws, streamSid);
              console.log("✅ Greeting audio sent");
            } catch (err) {
              console.error("❌ Greeting failed:", err.message);
            }
          }

          return;
        }

        if (msg.event === "stop") {
          console.log("⏹ Call ended");
          return;
        }
      } catch (err) {
        console.error("❌ WS error:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("🔌 WebSocket closed");
    });
  });
}

module.exports = {
  attachVoicebotWebSocket,
};
