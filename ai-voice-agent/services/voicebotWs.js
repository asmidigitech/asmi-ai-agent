// services/voicebotWs.js

const { ConversationStateEngine } = require("./stateEngine");
const { detectIntent } = require("./intent");
const { PROMPTS } = require("./prompts");
const { APP, STATES } = require("./config");
const { sendWhatsAppPaymentLink } = require("./linkSender");
const { transcribeAudioBuffer } = require("./stt");
const { speakAndMark } = require("./tts");

function debug(...args) {
  if (APP.DEBUG) console.log(...args);
}

function safeJsonParse(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function sendLinkOnce(engine) {
  if (engine.ctx.linkSent) {
    return { ok: true, skipped: true };
  }

  const result = await sendWhatsAppPaymentLink(engine.ctx);

  if (result.ok) {
    engine.markLinkSent();
    debug("✅ WhatsApp payment link sent:", result.mode, result.status || "");
  } else {
    debug("❌ WhatsApp payment link failed:", result.error);
  }

  return result;
}

async function sayCurrentState(ws, engine) {
  const text = engine.getCurrentQuestion();
  engine.lastBotMessage = text;
  engine.log({ type: "bot", text });

  debug(`🤖 State ${engine.state}: ${text}`);

  await speakAndMark(ws, text);

  if (engine.state === STATES.SEND_LINK) {
    await sendLinkOnce(engine);
  }

  const current = engine.state;
  engine.nextAfterBotUtterance();

  debug(`📍 Next state after bot utterance: ${engine.state} (from ${current})`);

  if (
    [STATES.PERMISSION, STATES.COMMITMENT_CHECK, STATES.CLOSE].includes(
      engine.state
    ) &&
    current !== STATES.START
  ) {
    return;
  }

  if (current === STATES.START && engine.state === STATES.PERMISSION) {
    await sayCurrentState(ws, engine);
    return;
  }

  if (current === STATES.MICRO_PITCH && engine.state === STATES.SEND_LINK) {
    await sayCurrentState(ws, engine);
    return;
  }
}

async function handleIntentFlow(ws, engine, transcript) {
  const detected = detectIntent(transcript);

  debug("📝 Transcript:", transcript);
  debug("🧠 Intent:", detected.intent, "| Current State:", engine.state);

  const result = engine.processUserIntent(detected);

  if (result.immediateReply) {
    await speakAndMark(ws, result.immediateReply);
    return;
  }

  if (engine.state === STATES.SEND_LINK) {
    await sayCurrentState(ws, engine);
    return;
  }

  if (engine.state === STATES.CLOSE) {
    if (APP.AUTO_SEND_LINK_ON_EXIT && !engine.ctx.linkSent) {
      engine.setState(STATES.SEND_LINK);
      await sayCurrentState(ws, engine);
      return;
    }

    await sayCurrentState(ws, engine);
    return;
  }

  if (result.retry) {
    await sayCurrentState(ws, engine);
    return;
  }

  if (engine.state === STATES.MICRO_PITCH) {
    await sayCurrentState(ws, engine);
    return;
  }

  await sayCurrentState(ws, engine);
}

function createAudioCollector() {
  let chunks = [];
  let totalBytes = 0;

  return {
    push(base64Audio) {
      if (!base64Audio) return;
      const buf = Buffer.from(base64Audio, "base64");
      chunks.push(buf);
      totalBytes += buf.length;
    },

    size() {
      return totalBytes;
    },

    consume() {
      const out = Buffer.concat(chunks);
      chunks = [];
      totalBytes = 0;
      return out;
    },

    clear() {
      chunks = [];
      totalBytes = 0;
    },
  };
}

async function handleVoicebotWs(ws, req, lead = {}) {
  const engine = new ConversationStateEngine({
    lead_id: lead.lead_id || null,
    session_id: lead.session_id || null,
    name: lead.name || "sir",
    phone: lead.phone || "",
    score: lead.score || 0,
    stage: lead.stage || "",
    heat: lead.heat || "",
    niche: lead.niche || "",
  });

  const audioCollector = createAudioCollector();

  debug("🔌 WebSocket connected");
  debug("📞 Lead context:", engine.ctx);

  ws._botStarted = false;

  ws.on("message", async (raw) => {
    const msg = safeJsonParse(raw);
    if (!msg) return;

    try {
      switch (msg.event) {
        case "connected":
          debug("📡 Event: connected");
          break;

        case "start":
          debug("📡 Event: start");

          ws.streamSid =
            msg.start?.streamSid ||
            msg.streamSid ||
            msg.start?.callSid ||
            null;

          debug("▶️ Call started:", ws.streamSid || "");

          if (!ws._botStarted) {
            ws._botStarted = true;
            await sayCurrentState(ws, engine);
          }
          break;

        case "media":
          if (msg.media?.payload) {
            audioCollector.push(msg.media.payload);
          }
          break;

        case "mark": {
          debug("📡 Event: mark");

          const size = audioCollector.size();
          if (!size || size < 4000) {
            debug("🔇 Not enough audio, treating as silence");
            await handleIntentFlow(ws, engine, "");
            audioCollector.clear();
            break;
          }

          const audioBuffer = audioCollector.consume();
          debug("🧠 Processing speech bytes:", audioBuffer.length);

          const transcript = await transcribeAudioBuffer(audioBuffer);
          await handleIntentFlow(ws, engine, transcript || "");
          break;
        }

        case "stop":
          debug("📡 Event: stop");
          debug("⏹ Call stopped");

          if (APP.AUTO_SEND_LINK_ON_EXIT && !engine.ctx.linkSent) {
            await sendLinkOnce(engine);
          }

          ws.close();
          break;

        default:
          debug("ℹ️ Unhandled event:", msg.event);
          break;
      }
    } catch (err) {
      console.error("❌ voicebotWs error:", err);

      if (APP.AUTO_SEND_LINK_ON_EXIT && !engine.ctx.linkSent) {
        await sendLinkOnce(engine);
      }

      try {
        await speakAndMark(ws, PROMPTS.silenceFallback());
      } catch (e) {
        console.error("❌ fallback TTS failed:", e.message);
      }
    }
  });

  ws.on("close", async () => {
    debug("🔌 WebSocket closed");

    if (APP.AUTO_SEND_LINK_ON_EXIT && !engine.ctx.linkSent) {
      await sendLinkOnce(engine);
    }
  });

  ws.on("error", async (err) => {
    console.error("❌ WebSocket error:", err);

    if (APP.AUTO_SEND_LINK_ON_EXIT && !engine.ctx.linkSent) {
      await sendLinkOnce(engine);
    }
  });
}

function attachVoicebotWebSocket(wss) {
  wss.on("connection", async (ws, req) => {
    try {
      await handleVoicebotWs(ws, req, {});
    } catch (err) {
      console.error("❌ attachVoicebotWebSocket error:", err);
      try {
        ws.close();
      } catch (_) {}
    }
  });
}

module.exports = {
  attachVoicebotWebSocket,
  handleVoicebotWs,
};
