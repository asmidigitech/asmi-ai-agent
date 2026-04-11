// services/voicebotWs.js

const { VoiceSession } = require("./voiceSession");
const { transcribeAudioBuffer } = require("./stt");
const { speakAndMark } = require("./tts");
const { sendWhatsAppPaymentLink } = require("./linkSender");
const { PROMPTS } = require("./prompts");
const { STATES, APP } = require("./config");
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

async function sendLinkOnce(session) {
  if (session.engine.ctx.linkSent) {
    return { ok: true, skipped: true };
  }

  const result = await sendWhatsAppPaymentLink(session.engine.ctx);

  if (result.ok) {
    session.engine.markLinkSent();
    debug("✅ WhatsApp payment link sent:", result.mode, result.status || "");
  } else {
    debug("❌ WhatsApp payment link failed:", result.error);
  }

  return result;
}

async function playText(ws, session, text) {
  if (!text || !String(text).trim()) return;

  session.engine.lastBotMessage = text;
  session.engine.log({ type: "bot", text });

  session.isBotSpeaking = true;
  session.awaitingUserSpeech = false;
  session.hasUserMediaSincePrompt = false;

  debug(`🤖 State ${session.engine.state}: ${text}`);
  await speakAndMark(ws, text);
}

async function playCurrentState(ws, session) {
  const text = session.engine.getCurrentQuestion();
  await playText(ws, session, text);

  if (session.engine.state === STATES.SEND_LINK) {
    await sendLinkOnce(session);
  }

  const prev = session.engine.state;
  session.engine.nextAfterBotUtterance();
  debug(`📍 Next state after bot utterance: ${session.engine.state} (from ${prev})`);
}

async function processTranscript(ws, session, transcript) {
  const { detectIntent } = require("./intent");

  debug("📝 Transcript:", transcript);
  const detected = detectIntent(transcript);
  debug("🧠 Intent:", detected.intent, "| Current State:", session.engine.state);

  const result = session.engine.processUserIntent(detected);

  if (result.immediateReply) {
    await playText(ws, session, result.immediateReply);
    return;
  }

  await playCurrentState(ws, session);
}

async function processQueue(ws, session) {
  if (session.processing) return;
  if (session.queue.size() === 0) return;

  session.processing = true;

  try {
    const job = session.queue.shift();
    if (!job) return;

    const transcript = await transcribeAudioBuffer(job.audioBuffer);
    await processTranscript(ws, session, transcript || "");
  } catch (err) {
    console.error("❌ queue processing failed:", err);

    try {
      await playText(ws, session, PROMPTS.silenceFallback());
    } catch (e) {
      console.error("❌ fallback speech failed:", e.message);
    }
  } finally {
    session.processing = false;

    if (session.queue.size() > 0) {
      setImmediate(() => {
        processQueue(ws, session).catch((err) => {
          console.error("❌ deferred queue processing failed:", err);
        });
      });
    }
  }
}

function scheduleUtteranceFinalize(ws, session) {
  session.clearTimer("utteranceTimer");

  session.utteranceTimer = setTimeout(() => {
    try {
      if (session.isBotSpeaking || !session.awaitingUserSpeech) return;
      if (session.audioBytes < 4000) {
        session.clearAudio();
        return;
      }

      const audioBuffer = session.consumeAudio();
      debug("🧠 Finalized utterance bytes:", audioBuffer.length);

      session.awaitingUserSpeech = false;
      session.queue.push({ audioBuffer, ts: Date.now() });
      processQueue(ws, session).catch((err) => {
        console.error("❌ processQueue failed:", err);
      });
    } catch (err) {
      console.error("❌ utterance finalize failed:", err);
    }
  }, Number(process.env.USER_SPEECH_SILENCE_MS || 1200));
}

function scheduleNoResponse(ws, session) {
  session.clearTimer("noResponseTimer");

  session.noResponseTimer = setTimeout(async () => {
    try {
      if (session.isBotSpeaking || !session.awaitingUserSpeech) return;
      if (session.hasUserMediaSincePrompt) return;

      session._noResponseCount = (session._noResponseCount || 0) + 1;
      debug(`⏳ No response count=${session._noResponseCount}`);

      if (session._noResponseCount === 1) {
        await playText(
          ws,
          session,
          "Hello, aap meri awaaz sun pa rahe ho? Bas haan ya na bol dijiye."
        );
        return;
      }

      if (!session.engine.ctx.linkSent) {
        session.engine.setState(STATES.SEND_LINK);
        await playCurrentState(ws, session);
        return;
      }

      session.engine.setState(STATES.CLOSE);
      await playCurrentState(ws, session);
    } catch (err) {
      console.error("❌ no response handler failed:", err);
    }
  }, Number(process.env.USER_RESPONSE_TIMEOUT_MS || 8000));
}

function scheduleKeepAlive(session) {
  session.clearTimer("keepAliveTimer");

  session.keepAliveTimer = setInterval(() => {
    debug("🟢 keepalive");
  }, Number(process.env.WS_KEEPALIVE_MS || 5000));
}

function recoverLead(msg, fallbackLead = {}) {
  const startPayload = msg.start || {};
  
  
  const custom =
  startPayload.custom_parameters ||
  startPayload.customParameters ||
  {};
  
  const sessionId = custom.session_id || startPayload.session_id || null;

  const phone = normalizePhone(
    startPayload.from || startPayload.From || custom.phone || ""
  );

  const recovered =
    consumeSession(sessionId) ||
    findByPhone(phone) ||
    consumeLatestPendingSession();

  return recovered || fallbackLead;
}

async function handleVoicebotWs(ws, req, lead = {}) {
  let session = new VoiceSession(lead);

  debug("🔌 WebSocket connected");
  debug("📞 Lead context:", session.engine.ctx);

  scheduleKeepAlive(session);

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
          debug("🧪 start payload:", JSON.stringify(msg.start || {}, null, 2));
          const recoveredLead = recoverLead(msg, lead);
          session = new VoiceSession(recoveredLead);

          session.streamSid =
            msg.start?.streamSid ||
            msg.streamSid ||
            msg.start?.callSid ||
            null;

          scheduleKeepAlive(session);

          debug("▶️ Call started:", session.streamSid || "");
          debug("✅ Active session lead:", session.engine.ctx);

          if (!session.started) {
            session.started = true;
            await playCurrentState(ws, session);
          }
          break;
        }

        case "media": {
          if (msg.media?.payload && !session.isBotSpeaking && session.awaitingUserSpeech) {
            const buf = Buffer.from(msg.media.payload, "base64");
            session.pushAudioChunk(buf);
            scheduleUtteranceFinalize(ws, session);
          }
          break;
        }

        case "mark":
          debug("📡 Event: mark");
          session.isBotSpeaking = false;
          session.awaitingUserSpeech = true;
          scheduleNoResponse(ws, session);
          break;

        case "stop":
          debug("📡 Event: stop");
          debug("⏹ Call stopped");
          session.clearAllTimers();

          if (APP.AUTO_SEND_LINK_ON_EXIT && !session.engine.ctx.linkSent) {
            await sendLinkOnce(session);
          }
          break;

        default:
          debug("ℹ️ Unhandled event:", msg.event);
          break;
      }
    } catch (err) {
      console.error("❌ voicebotWs error:", err);

      try {
        await playText(ws, session, PROMPTS.silenceFallback());
      } catch (e) {
        console.error("❌ fallback TTS failed:", e.message);
      }
    }
  });

  ws.on("close", async () => {
    debug("🔌 WebSocket closed");
    session.clearAllTimers();

    if (APP.AUTO_SEND_LINK_ON_EXIT && !session.engine.ctx.linkSent) {
      await sendLinkOnce(session);
    }
  });

  ws.on("error", async (err) => {
    console.error("❌ WebSocket error:", err);
    session.clearAllTimers();

    if (APP.AUTO_SEND_LINK_ON_EXIT && !session.engine.ctx.linkSent) {
      await sendLinkOnce(session);
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
