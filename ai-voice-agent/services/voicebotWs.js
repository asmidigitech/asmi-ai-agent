const url = require("url");
const { textToPcm8k, chunkPcm } = require("./elevenlabs");
const { transcribePcmBuffer } = require("./transcribe");
const { generateReply } = require("./aiReply");
const { nextState } = require("./stateEngine");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 🔊 Detect speech energy
function getAverageAmplitude(buffer) {
  if (!buffer || buffer.length < 2) return 0;

  let sum = 0;
  let samples = 0;

  for (let i = 0; i < buffer.length - 1; i += 2) {
    const sample = buffer.readInt16LE(i);
    sum += Math.abs(sample);
    samples += 1;
  }

  return samples ? sum / samples : 0;
}

// 🔊 Play audio safely
async function playText(ws, streamSid, text) {
  try {
    const pcmBuffer = await textToPcm8k(text);
    const chunks = chunkPcm(pcmBuffer, 3200);

    // clear previous audio
    ws.send(
      JSON.stringify({
        event: "clear",
        stream_sid: streamSid,
      })
    );

    await sleep(100);

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
        mark: { name: "audio_sent" },
      })
    );
  } catch (err) {
    console.error("❌ playText error:", err.message);
  }
}

// 🎤 Greeting
async function sendGreeting(ws, streamSid) {
  const greeting =
    "Hi, Riya bol rahi hoon Asmi Digitech se. Aapne business assessment complete kiya tha aur ₹499 strategy call ke liye interest show kiya tha. Main bas aapko next step mein help kar rahi hoon.";

  await playText(ws, streamSid, greeting);
}

function attachVoicebotWebSocket(wss) {
  wss.on("connection", (ws, req) => {
    const parsed = url.parse(req.url, true);
    const query = parsed.query || {};

    console.log("🔌 WebSocket connected");
    console.log("Query:", query);

    let streamSid = null;
    let greetingStarted = false;
    let greetingDone = false;
    let processing = false;

    let audioBuffer = [];
    let speechStarted = false;
    let silenceFrames = 0;

    let currentState = "START";

    const SPEECH_THRESHOLD = 600;
    const SILENCE_LIMIT = 10;

    async function flushUserSpeech() {
      if (audioBuffer.length === 0) return;
      if (processing) return;
      if (!streamSid) return;

      processing = true;

      try {
        const fullBuffer = Buffer.concat(audioBuffer);
        audioBuffer = [];
        speechStarted = false;
        silenceFrames = 0;

        console.log("🧠 Processing speech:", fullBuffer.length);

        let transcript = "";

        try {
          const result = await transcribePcmBuffer(fullBuffer);
          transcript = result.text || "";
        } catch (err) {
          console.error("❌ Transcription error:", err.message);
        }

        console.log("📝 Transcript:", transcript);

        // 🔥 STATE TRANSITION
        currentState = nextState(currentState, transcript);
        console.log("📍 State:", currentState);

        let replyText = "";

        try {
          replyText = await generateReply(transcript, currentState);
        } catch (err) {
          console.error("❌ AI error:", err.message);
        }

        // 🔥 FINAL SAFETY (never silent)
        if (!replyText) {
          replyText =
            "Sure 🙂 main aapko WhatsApp pe details share kar deti hoon.";
        }

        console.log("🤖 Reply:", replyText);

        await playText(ws, streamSid, replyText);
      } catch (err) {
        console.error("❌ flush error:", err.message);
      } finally {
        processing = false;
      }
    }

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.event !== "media") {
          console.log("📡 Event:", msg.event);
        }

        if (msg.event === "start") {
          streamSid = msg.stream_sid || msg.streamSid;

          console.log("▶️ Call started:", streamSid);
          return;
        }

        if (msg.event === "media") {
          const payload = msg.media?.payload;
          if (!payload) return;

          // send greeting once
          if (!greetingStarted && streamSid) {
            greetingStarted = true;

            await sendGreeting(ws, streamSid);
            greetingDone = true;

            console.log("✅ Greeting sent");
            return;
          }

          if (!greetingDone) return;

          const chunk = Buffer.from(payload, "base64");
          const amplitude = getAverageAmplitude(chunk);

          if (amplitude > SPEECH_THRESHOLD) {
            speechStarted = true;
            silenceFrames = 0;
            audioBuffer.push(chunk);
          } else if (speechStarted) {
            silenceFrames++;
            audioBuffer.push(chunk);

            if (silenceFrames >= SILENCE_LIMIT) {
              await flushUserSpeech();
            }
          }

          return;
        }

        if (msg.event === "stop") {
          console.log("⏹ Call stopped");
          await flushUserSpeech();
        }
      } catch (err) {
        console.error("❌ WS error:", err.message);
      }
    });

    ws.on("close", () => {
      console.log("🔌 WebSocket closed");
    });

    ws.on("error", (err) => {
      console.error("❌ WS crash:", err.message);
    });
  });
}

module.exports = {
  attachVoicebotWebSocket,
};
