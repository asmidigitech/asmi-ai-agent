const url = require("url");
const { textToPcm8k, chunkPcm } = require("./elevenlabs");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendGreeting(ws, streamSid) {
  const greeting =
    "Hello Anand. Main Asmi Digitech se bol rahi hoon. Aapka business assessment receive hua hai. Kya abhi 30 seconds ke liye baat kar sakte hain?";

  const pcmBuffer = await textToPcm8k(greeting);

  // 3200 bytes = 100 ms at 8kHz, 16-bit mono PCM
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

    // IMPORTANT: 3200-byte chunks must be paced at 100ms
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
          // Start greeting only after media begins flowing from Exotel.
          if (streamSid && !greetingStarted) {
            greetingStarted = true;

            try {
              await sendGreeting(ws, streamSid);
              console.log("✅ Greeting audio sent");
            } catch (err) {
              console.error("❌ Greeting send failed:", err.message);
            }
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
