// routes/call.js

const express = require("express");
const axios = require("axios");
const router = express.Router();

const { registerPendingSession, normalizePhone } = require("../services/sessionStore");

const {
  registerPendingSession,
  normalizePhone,
} = require("../services/sessionStore");

router.post("/trigger-live-call", async (req, res) => {
  try {
    const body = req.body || {};

const lead = {
  lead_id: body.lead_id || body.id || null,
  session_id:
    body.session_id ||
    `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  phone: normalizePhone(body.phone || ""),
  name: body.name || "sir",
  score: Number(body.score || 0),
  stage: body.stage || "",
  heat: body.heat || "",
  niche: body.niche || "",
};

// Register BEFORE calling Exotel
const stored = registerPendingSession(lead.session_id, lead);

console.log("📞 Triggering live Exotel call:", stored);
    

    console.log("📞 Triggering live Exotel call:", lead);

    // IMPORTANT: register session before connecting call
    const stored = registerPendingSession(lead.session_id, lead);

    const accountSid = process.env.EXOTEL_ACCOUNT_SID;
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const subdomain = process.env.EXOTEL_SUBDOMAIN || "api.exotel.com";
    const callerId = process.env.EXOTEL_CALLER_ID;
    const flowUrl = process.env.EXOTEL_FLOW_URL;
    const appBaseUrl = process.env.APP_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "";

    const connectUrl = `https://${apiKey}:${apiToken}@${subdomain}/v1/Accounts/${accountSid}/Calls/connect`;

  const statusCallback =
  `${appBaseUrl}/api/exotel/status` +
  `?lead_id=${encodeURIComponent(stored.lead_id || "")}` +
  `&session_id=${encodeURIComponent(stored.session_id)}`;



    
    console.log("📤 Exotel connect request:", {
      connectUrl,
      From: stored.phone,
      CallerId: callerId,
      Url: flowUrl,
      StatusCallback: statusCallback,
    });

    const payload = new URLSearchParams({
      From: stored.phone
      To: stored.phone,
      CallerId: callerId,
      Url: flowUrl,
      StatusCallback: statusCallback,
      StatusCallbackContentType: "application/json",
    });

    const exotelResp = await axios.post(connectUrl, payload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    });

    return res.json({
      success: true,
      message: "Live call triggered",
      session_id: stored.session_id,
      lead: stored,
      exotel: exotelResp.data,
    });
  } catch (err) {
    console.error("❌ trigger-live-call failed:", err.response?.data || err.message || err);
    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message || "Unknown call trigger error",
    });
  }
});

module.exports = router;
