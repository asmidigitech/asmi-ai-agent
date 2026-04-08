// linkSender.js

const axios = require("axios");
const crypto = require("crypto");
const { APP } = require("./config");

function normalizePhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 12) return `91${digits.slice(-10)}`;

  return digits;
}

function buildRequestId(leadId) {
  return `${APP.GALLABOX_REQUEST_ID_PREFIX || "asmi-wa"}-${leadId || "na"}-${Date.now()}-${crypto
    .randomBytes(3)
    .toString("hex")}`;
}

async function sendViaWebhook(payload) {
  const response = await axios.post(APP.WHATSAPP_WEBHOOK_URL, payload, {
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  return {
    ok: true,
    mode: "webhook",
    status: response.status,
    data: response.data,
  };
}

async function sendViaGallaboxDirect(lead) {
  const phone = normalizePhone(lead.phone);
  const requestId = buildRequestId(lead.lead_id);

  const payload = {
    channelId: APP.GALLABOX_CHANNEL_ID,
    channelType: "whatsapp",
    recipient: {
      name: lead.name || "Customer",
      phone,
    },
    whatsapp: {
      type: "template",
      template: {
        templateName: APP.GALLABOX_TEMPLATE_NAME_PAYMENT || "wa499",
        languageCode: APP.GALLABOX_TEMPLATE_LANGUAGE || "en",
        bodyValues: [
          lead.name || "Customer",
          APP.PAYMENT_LINK,
          String(lead.score || ""),
        ],
      },
    },
    metadata: {
      lead_id: lead.lead_id || null,
      session_id: lead.session_id || null,
      stage: lead.stage || "",
      heat: lead.heat || "",
      niche: lead.nicheBucket || lead.niche || "",
      business_type: lead.businessType || "",
      problem_type: lead.problemType || "",
      readiness: lead.readiness || "",
      commitment: lead.commitment || "",
      template_key: "wa499",
    },
  };

  const response = await axios.post(APP.GALLABOX_API_URL, payload, {
    timeout: 15000,
    headers: {
      apiKey: APP.GALLABOX_API_KEY,
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });

  return {
    ok: true,
    mode: "gallabox_direct",
    status: response.status,
    data: response.data,
  };
}

async function sendWhatsAppPaymentLink(lead) {
  const payload = {
    template_key: "wa499", // tells Make to send second WhatsApp/payment template
    payment_link: APP.PAYMENT_LINK,
    lead_id: lead.lead_id || null,
    session_id: lead.session_id || null,
    name: lead.name || "Customer",
    phone: normalizePhone(lead.phone),
    score: lead.score || 0,
    stage: lead.stage || "",
    heat: lead.heat || "",
    niche: lead.nicheBucket || lead.niche || "",
    business_type: lead.businessType || "",
    problem_type: lead.problemType || "",
    readiness: lead.readiness || "",
    commitment: lead.commitment || "",
  };

  try {
    // PRIMARY: existing live Make.com flow
    if (APP.WHATSAPP_WEBHOOK_URL) {
      return await sendViaWebhook(payload);
    }

    // FALLBACK ONLY: direct Gallabox
    return await sendViaGallaboxDirect(lead);
  } catch (error) {
    return {
      ok: false,
      mode: APP.WHATSAPP_WEBHOOK_URL ? "webhook" : "gallabox_direct",
      error: error.response?.data || error.message || "Unknown WhatsApp error",
    };
  }
}

module.exports = {
  sendWhatsAppPaymentLink,
  normalizePhone,
};
