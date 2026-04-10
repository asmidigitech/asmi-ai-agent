// services/voiceSession.js

const { AudioJobQueue } = require("./audioQueue");
const { ConversationStateEngine } = require("./stateEngine");

class VoiceSession {
  constructor(lead = {}) {
    this.engine = new ConversationStateEngine({
      lead_id: lead.lead_id || null,
      session_id: lead.session_id || null,
      name: lead.name || "sir",
      phone: lead.phone || "",
      score: Number(lead.score || 0),
      stage: lead.stage || "",
      heat: lead.heat || "",
      niche: lead.niche || "",
    });

    this.audioChunks = [];
    this.audioBytes = 0;
    this.lastAudioAt = 0;

    this.isBotSpeaking = false;
    this.awaitingUserSpeech = false;
    this.hasUserMediaSincePrompt = false;

    this.utteranceTimer = null;
    this.noResponseTimer = null;
    this.keepAliveTimer = null;

    this.queue = new AudioJobQueue();
    this.processing = false;

    this.streamSid = null;
    this.started = false;
  }

  pushAudioChunk(buf) {
    if (!buf || !buf.length) return;
    this.audioChunks.push(buf);
    this.audioBytes += buf.length;
    this.lastAudioAt = Date.now();
    this.hasUserMediaSincePrompt = true;
  }

  consumeAudio() {
    const out = Buffer.concat(this.audioChunks);
    this.audioChunks = [];
    this.audioBytes = 0;
    return out;
  }

  clearAudio() {
    this.audioChunks = [];
    this.audioBytes = 0;
  }

  clearTimer(name) {
    if (this[name]) {
      clearTimeout(this[name]);
      clearInterval(this[name]);
      this[name] = null;
    }
  }

  clearAllTimers() {
    this.clearTimer("utteranceTimer");
    this.clearTimer("noResponseTimer");
    this.clearTimer("keepAliveTimer");
  }
}

module.exports = {
  VoiceSession,
};
