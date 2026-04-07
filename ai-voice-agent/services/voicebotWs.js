const url = require("url");

function attachVoicebotWebSocket(wss) {
  wss.on("connection", (ws, req) => {
    const parsed = url.parse(req.url, true);
    const query = parsed.query || {};

    console.log("🔌 Exotel Voicebot WebSocket connected");
    console.log("Query params:", query);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log("📡 WS event:", msg.event);

        if (msg.event === "connected") return;

        if (msg.event === "start") {
          console.log("▶️ Stream started:", {
            streamSid: msg.stream_sid || msg.streamSid,
            callSid: msg.start?.call_sid || msg.start?.callSid,
            from: msg.start?.from,
            to: msg.start?.to,
            customParameters: msg.start?.custom_parameters || msg.start?.customParameters,
            mediaFormat: msg.start?.media_format || msg.start?.mediaFormat,
          });

          ws.send(
            JSON.stringify({
              event: "mark",
              stream_sid: msg.stream_sid || msg.streamSid,
              mark: { name: "bridge_connected" },
            })
          );
          return;
        }

        if (msg.event === "media") return;
        if (msg.event === "dtmf") return;
        if (msg.event === "mark") return;

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
