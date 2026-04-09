// services/sessionStore.js

const sessions = new Map();
let latestSessionId = null;

function normalizePhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 12) return `91${digits.slice(-10)}`;
  return digits;
}

function registerPendingSession(sessionId, lead = {}) {
  const safeSessionId =
    sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    lead_id: lead.lead_id || null,
    session_id: safeSessionId,
    name: lead.name || "sir",
    phone: normalizePhone(lead.phone || ""),
    score: Number(lead.score || 0),
    stage: lead.stage || "",
    heat: lead.heat || "",
    niche: lead.niche || "",
    createdAt: Date.now(),
    consumed: false,
  };

  sessions.set(safeSessionId, payload);
  latestSessionId = safeSessionId;

  cleanupOldSessions();

  return payload;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function consumeSession(sessionId) {
  if (!sessionId) return null;
  const entry = sessions.get(sessionId);
  if (!entry) return null;

  entry.consumed = true;
  return entry;
}

function findByPhone(phone = "") {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  for (const [, session] of sessions.entries()) {
    if (normalizePhone(session.phone) === normalized) {
      return session;
    }
  }
  return null;
}

function consumeLatestPendingSession() {
  if (!latestSessionId) return null;

  const entry = sessions.get(latestSessionId);
  if (!entry) return null;

  entry.consumed = true;
  return entry;
}

function cleanupOldSessions(maxAgeMs = 30 * 60 * 1000) {
  const now = Date.now();

  for (const [key, value] of sessions.entries()) {
    if (!value || now - value.createdAt > maxAgeMs) {
      sessions.delete(key);
    }
  }

  if (latestSessionId && !sessions.has(latestSessionId)) {
    latestSessionId = null;
  }
}

module.exports = {
  registerPendingSession,
  getSession,
  consumeSession,
  findByPhone,
  consumeLatestPendingSession,
  normalizePhone,
};
