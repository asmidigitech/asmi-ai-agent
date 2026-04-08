const url = require("url");
const { textToPcm8k, chunkPcm } = require("./elevenlabs");
const { transcribePcmBuffer } = require("./transcribe");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendGreeting(ws, streamSid) {
  const greeting =
    "Hello Anand. Main Asmi Digitech se bol rahi hoon. Aapka business assessment receive hua hai. Kya abhi 30 seconds ke liye baat kar sakte hain?";

  const pcmBuffer = await textToPcm8k(greeting);
  const chunks = chunkPcm(pcmBuffer, 3200); // 3200 bytes = 100 ms at 8kHz PCM16 mono

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
      mark: {
        name: "greeting_sent",
      },
    })
  );
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
    let transcribing = false;

    async function flushUserSpeech() {
      if (audioBuffer.length === 0) return;
      if (transcribing) return;

      transcribing = true;

      try {
        const fullBuffer = Buffer.concat(audioBuffer);
        audioBuffer = [];

        console.log("🧠 User finished speaking. Buffer size:", fullBuffer.length);

        const result = await transcribePcmBuffer(fullBuffer);
        const transcript = result.text || "";

        console.log("📝 Transcript:", transcript);
      } catch (err) {
        console.error("❌ Transcription failed:", err.message);
      } finally {
        transcribing = false;
      }
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.event !== "media") {
          console.log("📡 WS event:", msg.event);
        }

        if (msg.event === "connected") {
          return;
        }

        if (msg.event === "start") {
          streamSid = msg.stream_sid || msg.streamSid;

          console.log("▶️ Stream started:", {
            streamSid,
            callSid: msg.start?.call_sid || msg.start?.callSid,
            from: msg.start?.from,
            to: msg.start?.to,
            customParameters:
              msg.start?.custom_parameters || msg.start?.customParameters,
            mediaFormat: msg.start?.media_format || msg.start?.mediaFormat,
          });

          return;
        }

        if (msg.event === "media") {
          const payload = msg.media?.payload;

          // Start greeting only once, after first media arrives
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

          // After greeting is done, capture caller audio
          if (greetingDone && payload) {
            const chunk = Buffer.from(payload, "base64");
            audioBuffer.push(chunk);

            if (silenceTimer) clearTimeout(silenceTimer);

            silenceTimer = setTimeout(async () => {
              await flushUserSpeech();
            }, 1500);
          }

          return;
        }

        if (msg.event === "dtmf") {
          console.log("☎️ DTMF:", msg.dtmf);
          return;
        }

        if (msg.event === "mark") {
          console.log("✅ Mark received:", msg.mark);
          return;
        }

        if (msg.event === "stop") {
          console.log("⏹ Stream stopped:", msg.stop);

          if (silenceTimer) {
            clearTimeout(silenceTimer);
          }

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
  attachVoicebotWebSocket,
};
