const express = require("express");
const router = express.Router();

const {
  createRealtimeReply,
  createRealtimeSession,
  sendMessage,
} = require("../services/realtime");
const { textToSpeech } = require("../services/voice");

// In-memory active session store
// Good for local testing for now.
// Later we can move this to Redis / DB if needed.
const activeSessions = {};

// ========================================
// BASIC START ROUTE
// ========================================
router.post("/start", async (req, res) => {
  try {
    const lead = req.body || {};

    console.log("📞 Incoming Call Request:", lead);

    return res.json({
      success: true,
      message: "AI Voice Agent is ready",
      lead,
    });
  } catch (error) {
    console.error("❌ /start error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// SINGLE TURN REALTIME TEST (TEXT ONLY)
// ========================================
router.post("/test-realtime", async (req, res) => {
  try {
    const lead = req.body || {};

    console.log("🧠 Testing Realtime AI with:", lead);

    const userInput =
      lead.user_input || "What exactly happens in the 499 call?";

    const result = await createRealtimeReply(lead, userInput);

    return res.json({
      success: true,
      message: "Realtime reply generated",
      result,
    });
  } catch (error) {
    console.error("❌ /test-realtime error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// SINGLE TURN VOICE TEST
// ========================================
router.post("/test-voice", async (req, res) => {
  try {
    const lead = req.body || {};

    console.log("🔊 Testing Voice AI with:", lead);

    const userInput =
      lead.user_input ||
      "Explain what happens in the 499 rupee business diagnosis call";

    const ai = await createRealtimeReply(lead, userInput);

    console.log("🧠 AI Reply:", ai.reply);

    const audio = await textToSpeech(ai.reply);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": "attachment; filename=voice.mp3",
    });

    return res.send(audio);
  } catch (error) {
    console.error("❌ /test-voice error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// MULTI-TURN SESSION START
// ========================================
router.post("/start-call", async (req, res) => {
  try {
    const lead = req.body || {};

    console.log("📞 Starting multi-turn AI session for:", lead.name || "Unknown");

    const ws = await createRealtimeSession(lead);

    const sessionId = `sess_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    activeSessions[sessionId] = {
      ws,
      lead,
      createdAt: new Date().toISOString(),
      turns: 0,
    };

    return res.json({
      success: true,
      message: "Multi-turn session started",
      sessionId,
      lead: {
        name: lead.name || "",
        phone: lead.phone || "",
        score: lead.score || "",
        stage: lead.stage || "",
        heat: lead.heat || "",
        niche: lead.niche || "",
      },
    });
  } catch (error) {
    console.error("❌ /start-call error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// MULTI-TURN TALK (TEXT RESPONSE)
// ========================================
router.post("/talk-text", async (req, res) => {
  try {
    const { sessionId, message } = req.body || {};

    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: "sessionId and message are required",
      });
    }

    const session = activeSessions[sessionId];

    if (!session || !session.ws) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired session",
      });
    }

    console.log(`🗣️ [${sessionId}] User:`, message);

    const reply = await sendMessage(session.ws, message);

    session.turns += 1;

    console.log(`🤖 [${sessionId}] AI:`, reply);

    return res.json({
      success: true,
      sessionId,
      turns: session.turns,
      reply,
    });
  } catch (error) {
    console.error("❌ /talk-text error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// MULTI-TURN TALK (VOICE RESPONSE)
// ========================================
router.post("/talk-voice", async (req, res) => {
  try {
    const { sessionId, message } = req.body || {};

    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: "sessionId and message are required",
      });
    }

    const session = activeSessions[sessionId];

    if (!session || !session.ws) {
      return res.status(404).json({
        success: false,
        error: "Invalid or expired session",
      });
    }

    console.log(`🗣️ [${sessionId}] User:`, message);

    const reply = await sendMessage(session.ws, message);

    session.turns += 1;

    console.log(`🤖 [${sessionId}] AI:`, reply);

    const audio = await textToSpeech(reply);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename=${sessionId}_reply.mp3`,
      "X-AI-Reply-Text": encodeURIComponent(reply),
    });

    return res.send(audio);
  } catch (error) {
    console.error("❌ /talk-voice error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// SESSION STATUS
// ========================================
router.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions[sessionId];

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    return res.json({
      success: true,
      sessionId,
      createdAt: session.createdAt,
      turns: session.turns,
      lead: session.lead,
    });
  } catch (error) {
    console.error("❌ /session/:sessionId error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// END SESSION
// ========================================
router.post("/end-call", async (req, res) => {
  try {
    const { sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required",
      });
    }

    const session = activeSessions[sessionId];

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    try {
      if (session.ws) {
        session.ws.close();
      }
    } catch (_) {}

    delete activeSessions[sessionId];

    return res.json({
      success: true,
      message: "Session ended",
      sessionId,
    });
  } catch (error) {
    console.error("❌ /end-call error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;