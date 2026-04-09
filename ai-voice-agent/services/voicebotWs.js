// services/voicebotWs.js

const { ConversationStateEngine } = require("./stateEngine");
const { detectIntent } = require("./intent");
const { PROMPTS } = require("./prompts");
const { APP, STATES } = require("./config");
const { sendWhatsAppPaymentLink } = require("./linkSender");
const { transcribeAudioBuffer } = require("./stt");
const { speakAndMark } = require("./tts");
const {
  consumeSession,
  findByPhone,
  consumeLatestPendingSession,
  normalizePhone,
} = require("./sessionStore");

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

function clearUserSpeechTimer(ws) {
  if (ws._userSpeechTimer) {
    clearTimeout(ws._userSpeechTimer);
    ws._userSpeechTimer = null;
  }
}

function clearNoResponseTimer(ws) {
  if (ws._noResponseTimer) {
    clearTimeout(ws._noResponseTimer);
    ws._noResponseTimer = null;
  }
}

function clearAllTimers(ws) {
  clearUserSpeechTimer(ws);
  clearNoResponseTimer(ws);
}

function buildEngineFromLead(lead = {}) {
  return new ConversationStateEngine({
    lead_id: lead.lead_id || null,
    session_id: lead.session_id || null,
    name: lead.name || "sir",
    phone: lead.phone || "",
    score: Number(lead.score || 0),
    stage: lead.stage || "",
    heat: lead.heat || "",
    niche: lead.niche || "",
  });
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

async function sayCurrentState(ws, engine) {
  clearAllTimers(ws);

  const text = engine.getCurrentQuestion();
  engine.lastBotMessage = text;
  engine.log({ type: "bot", text });

  debug(`🤖 State ${engine.state}: ${text}`);

  ws._isBotSpeaking = true;
  ws._awaitingUserSpeech = false;
  ws._hasUserMediaSincePrompt = false;

  await speakAndMark(ws, text);

  if (engine.state === STATES.SEND_LINK) {
    await sendLinkOnce(engine);
  }

  const current = engine.state;
  engine.nextAfterBotUtterance();

  debug(`📍 Next state after bot utterance: ${engine.state} (from ${current})`);

  // IMPORTANT:
  // do NOT start no-response timer here.
  // Start it only when Exotel sends MARK, meaning playback truly ended.

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
  clearAllTimers(ws);

  const detected = detectIntent(transcript);

  debug("📝 Transcript:", transcript);
  debug("🧠 Intent:", detected.intent, "| Current State:", engine.state);

  const result = engine.processUserIntent(detected);

  if (result.immediateReply) {
    ws._isBotSpeaking = true;
    ws._awaitingUserSpeech = false;
    ws._hasUserMediaSincePrompt = false;

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

function scheduleUserSpeechProcessing(ws, engine, audioCollector) {
  clearUserSpeechTimer(ws);

  ws._userSpeechTimer = setTimeout(async () => {
    try {
      if (ws._isBotSpeaking || !ws._awaitingUserSpeech) {
        return;
      }

      const size = audioCollector.size();
      if (!size || size < 4000) {
        debug("🔇 User speech buffer too small, treating as silence");
        audioCollector.clear();
        await handleIntentFlow(ws, engine, "");
        return;
      }

      const audioBuffer = audioCollector.consume();
      debug("🧠 Processing user speech bytes:", audioBuffer.length);

      ws._awaitingUserSpeech = false;

      const transcript = await transcribeAudioBuffer(audioBuffer);
      await handleIntentFlow(ws, engine, transcript || "");
    } catch (err) {
      console.error("❌ user speech processing failed:", err);

      try {
        ws._isBotSpeaking = true;
        ws._awaitingUserSpeech = false;
        ws._hasUserMediaSincePrompt = false;

        await speakAndMark(ws, PROMPTS.silenceFallback());
      } catch (e) {
        console.error("❌ fallback TTS failed:", e.message);
      }
    }
  }, Number(process.env.USER_SPEECH_SILENCE_MS || 1200));
}

function scheduleNoResponseTimer(ws, engine) {
  clearNoResponseTimer(ws);

  ws._noResponseTimer = setTimeout(async () => {
    try {
      if (ws._isBotSpeaking || !ws._awaitingUserSpeech) return;
      if (ws._hasUserMediaSincePrompt) return;

      ws._noResponseCount = (ws._noResponseCount || 0) + 1;

      debug(`⏳ No caller response detected. Count=${ws._noResponseCount}`);

      if (ws._noResponseCount === 1) {
        ws._isBotSpeaking = true;
        ws._awaitingUserSpeech = false;
        ws._hasUserMediaSincePrompt = false;

        await speakAndMark(
          ws,
          "Hello, aap meri awaaz sun pa rahe ho? Bas short mein haan ya na bol dijiye."
        );
        return;
      }

      if (!engine.ctx.linkSent) {
        engine.setState(STATES.SEND_LINK);
        await sayCurrentState(ws, engine);
        return;
      }

      engine.setState(STATES.CLOSE);
      await sayCurrentState(ws, engine);
    } catch (err) {
      console.error("❌ no-response handler failed:", err);
    }
  }, Number(process.env.USER_RESPONSE_TIMEOUT_MS || 6000));
}

async function handleVoicebotWs(ws, req, lead = {}) {
  let engine = buildEngineFromLead(lead);
  const audioCollector = createAudioCollector();

  ws._botStarted = false;
  ws._isBotSpeaking = false;
  ws._awaitingUserSpeech = false;
  ws._hasUserMediaSincePrompt = false;
  ws._userSpeechTimer = null;
  ws._noResponseTimer = null;
  ws._noResponseCount = 0;

  debug("🔌 WebSocket connected");
  debug("📞 Lead context:", engine.ctx);

  ws.on("message", async (raw) => {
    const msg = safeJsonParse(raw);
    if (!msg) return;

    try {
      switch (msg.event) {
        case "connected":
          debug("📡 Event: connected");
          break;

        case "start": {
          debug("📡 Event: start");

          ws.streamSid =
            msg.start?.streamSid ||
            msg.streamSid ||
            msg.start?.callSid ||
            null;

          debug("▶️ Call started:", ws.streamSid || "");

          const startPayload = msg.start || {};
          const custom = startPayload.customParameters || {};
          const sessionId =
            custom.session_id ||
            startPayload.session_id ||
            null;

          const phoneFromStart = normalizePhone(
            startPayload.from ||
              startPayload.From ||
              custom.phone ||
              ""
          );

          const recovered =
            consumeSession(sessionId) ||
            findByPhone(phoneFromStart) ||
            consumeLatestPendingSession();

          if (recovered) {
            engine = buildEngineFromLead(recovered);
            debug("✅ Recovered lead context for websocket:", engine.ctx);
          } else {
            debug("⚠️ No session recovered; using fallback lead context");
          }

          if (!ws._botStarted) {
            ws._botStarted = true;
            await sayCurrentState(ws, engine);
          }
          break;
        }

        case "media":
          if (msg.media?.payload && !ws._isBotSpeaking && ws._awaitingUserSpeech) {
            ws._hasUserMediaSincePrompt = true;
            ws._noResponseCount = 0;
            audioCollector.push(msg.media.payload);
            scheduleUserSpeechProcessing(ws, engine, audioCollector);
          }
          break;

        case "mark":
          debug("📡 Event: mark");

          // Playback actually finished here
          ws._isBotSpeaking = false;
          ws._awaitingUserSpeech = true;

          // Start waiting window only NOW
          scheduleNoResponseTimer(ws, engine);
          break;

        case "stop":
          debug("📡 Event: stop");
          debug("⏹ Call stopped");

          clearAllTimers(ws);

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
        ws._isBotSpeaking = true;
        ws._awaitingUserSpeech = false;
        ws._hasUserMediaSincePrompt = false;

        await speakAndMark(ws, PROMPTS.silenceFallback());
      } catch (e) {
        console.error("❌ fallback TTS failed:", e.message);
      }
    }
  });

  ws.on("close", async () => {
    debug("🔌 WebSocket closed");
    clearAllTimers(ws);

    if (APP.AUTO_SEND_LINK_ON_EXIT && !engine.ctx.linkSent) {
      await sendLinkOnce(engine);
    }
  });

  ws.on("error", async (err) => {
    console.error("❌ WebSocket error:", err);
    clearAllTimers(ws);

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
