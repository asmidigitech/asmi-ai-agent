const express = require("express");
const router = express.Router();

const {
  updateLead,
  createAttachmentFromBuffer,
} = require("../services/odooClient");

const { triggerExotelCall } = require("../services/exotelClient");

const BRIDGE_BASE_URL = process.env.BRIDGE_BASE_URL;

// ========================================
// DYNAMIC VOICEBOT URL RESOLVER
// Exotel Voicebot can call this https endpoint,
// and expects a wss:// URL in response.
// ========================================
router.post("/voicebot-url", async (req, res) => {
  try {
    if (!BRIDGE_BASE_URL) {
      throw new Error("Missing BRIDGE_BASE_URL");
    }

    const leadId =
      req.body.lead_id ||
      req.query.lead_id ||
      req.body.leadId ||
      req.query.leadId ||
      "";

    const sessionId =
      req.body.session_id ||
      req.query.session_id ||
      req.body.sessionId ||
      req.query.sessionId ||
      "";

    const wsBase = BRIDGE_BASE_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

    const wsUrl =
      `${wsBase}/ws/exotel` +
      `?lead_id=${encodeURIComponent(leadId)}` +
      `&session_id=${encodeURIComponent(sessionId)}`;

    console.log("🎯 Voicebot URL resolver hit:", {
      body: req.body,
      query: req.query,
      wsUrl,
    });

    // Exotel expects the https endpoint to return a wss URL.
    return res.status(200).send(wsUrl);
  } catch (error) {
    console.error("❌ /api/exotel/voicebot-url error:", error.message);

    return res.status(500).send("");
  }
});

// ========================================
// TRIGGER LIVE EXOTEL CALL
// Make.com should hit this route, not Exotel directly.
// ========================================
router.post("/trigger-call", async (req, res) => {
  try {
    const {
      lead_id,
      session_id,
      phone,
      name,
      score,
      stage,
      heat,
      niche,
    } = req.body || {};

    if (!lead_id || !session_id || !phone) {
      return res.status(400).json({
        success: false,
        error: "lead_id, session_id and phone are required",
      });
    }

    console.log("📞 Triggering live Exotel call:", {
      lead_id,
      session_id,
      phone,
      name,
      score,
      stage,
      heat,
      niche,
    });

    const customField = JSON.stringify({
      lead_id,
      session_id,
      name: name || "",
      score: score || "",
      stage: stage || "",
      heat: heat || "",
      niche: niche || "",
    });

    const exotelResponse = await triggerExotelCall({
      leadId: lead_id,
      sessionId: session_id,
      customerPhone: phone,
      customField,
    });

    let externalCallId = "";
    try {
      externalCallId =
        exotelResponse?.Call?.Sid ||
        exotelResponse?.Call?.sid ||
        "";
    } catch (_) {}

    await updateLead(Number(lead_id), {
      x_ai_call_status: "initiated",
      x_external_call_id: externalCallId,
      x_ai_call_summary: `Exotel call trigger accepted for session ${session_id}`,
    });

    return res.json({
      success: true,
      message: "Exotel call trigger accepted",
      lead_id,
      session_id,
      exotel: exotelResponse,
    });
  } catch (error) {
    console.error("❌ /api/exotel/trigger-call error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// EXOTEL STATUS CALLBACK
// ========================================
router.post("/status", async (req, res) => {
  try {
    const leadId = req.body.lead_id || req.query.lead_id;
    const sessionId = req.body.session_id || req.query.session_id;

    const status =
      req.body.Status ||
      req.body.CallStatus ||
      req.body.status ||
      req.query.Status ||
      req.query.CallStatus ||
      "unknown";

    const callSid =
      req.body.CallSid ||
      req.body.CallUUID ||
      req.body.call_sid ||
      req.query.CallSid ||
      req.query.CallUUID ||
      "";

    const recordingUrl =
      req.body.RecordingUrl ||
      req.query.RecordingUrl ||
      "";

    console.log("📡 Exotel status hit:", {
      leadId,
      sessionId,
      status,
      callSid,
      recordingUrl,
      body: req.body,
      query: req.query,
    });

    if (leadId) {
      await updateLead(Number(leadId), {
        x_ai_call_status: String(status).toLowerCase(),
        x_external_call_id: callSid,
        x_ai_call_summary: `Exotel status callback received: ${status}`,
      });
    }

    return res.json({
      success: true,
      message: "Status callback processed",
    });
  } catch (error) {
    console.error("❌ /api/exotel/status error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// MANUAL ODOO WRITEBACK TEST
// ========================================
router.post("/writeback", async (req, res) => {
  try {
    const { lead_id, status, summary, transcript, external_call_id } = req.body;

    if (!lead_id) {
      return res.status(400).json({
        success: false,
        error: "lead_id is required",
      });
    }

    const values = {};
    if (status !== undefined) values.x_ai_call_status = status;
    if (summary !== undefined) values.x_ai_call_summary = summary;
    if (transcript !== undefined) values.x_ai_call_transcript = transcript;
    if (external_call_id !== undefined) values.x_external_call_id = external_call_id;

    await updateLead(Number(lead_id), values);

    return res.json({
      success: true,
      message: "Lead updated in Odoo",
      lead_id,
      values,
    });
  } catch (error) {
    console.error("❌ /api/exotel/writeback error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ========================================
// MANUAL ATTACHMENT TEST
// ========================================
router.post("/attach-text", async (req, res) => {
  try {
    const { lead_id, filename, content } = req.body;

    if (!lead_id || !filename || !content) {
      return res.status(400).json({
        success: false,
        error: "lead_id, filename, content are required",
      });
    }

    const buffer = Buffer.from(content, "utf-8");

    const attachmentId = await createAttachmentFromBuffer({
      leadId: Number(lead_id),
      name: filename,
      buffer,
      mimetype: "text/plain",
    });

    return res.json({
      success: true,
      message: "Attachment created",
      attachment_id: attachmentId,
    });
  } catch (error) {
    console.error("❌ /api/exotel/attach-text error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;