// config.js

module.exports = {
  APP: {
    PAYMENT_LINK: process.env.PAYMENT_LINK || "https://rzp.io/rzp/s5izYcy",
    WHATSAPP_WEBHOOK_URL: process.env.WHATSAPP_WEBHOOK_URL || "", // preferred: your existing working webhook / Make / Odoo / custom bridge
    GALLABOX_API_URL:
      process.env.GALLABOX_API_URL ||
      "https://server.gallabox.com/devapi/messages/whatsapp",
    GALLABOX_API_KEY: process.env.GALLABOX_API_KEY || "",
    GALLABOX_CHANNEL_ID: process.env.GALLABOX_CHANNEL_ID || "",
    GALLABOX_TEMPLATE_NAME_PAYMENT:
      process.env.GALLABOX_TEMPLATE_NAME_PAYMENT || "wa499",
    GALLABOX_TEMPLATE_LANGUAGE:
      process.env.GALLABOX_TEMPLATE_LANGUAGE || "en",
    GALLABOX_REQUEST_ID_PREFIX:
      process.env.GALLABOX_REQUEST_ID_PREFIX || "asmi-wa",
    MAX_RETRIES_PER_STATE: Number(process.env.MAX_RETRIES_PER_STATE || 1),
    MAX_UNKNOWN_STREAK: Number(process.env.MAX_UNKNOWN_STREAK || 2),
    MAX_CALL_STEPS: Number(process.env.MAX_CALL_STEPS || 12),
    AUTO_SEND_LINK_ON_EXIT:
      String(process.env.AUTO_SEND_LINK_ON_EXIT || "true") === "true",
    DEBUG: String(process.env.DEBUG || "true") === "true",
  },

  STATES: {
    START: "START",
    PERMISSION: "PERMISSION",
    Q1_BUSINESS_TYPE: "Q1_BUSINESS_TYPE",
    Q2_NICHE: "Q2_NICHE",
    Q3_CHALLENGE: "Q3_CHALLENGE",
    Q4_READINESS: "Q4_READINESS",
    MICRO_PITCH: "MICRO_PITCH",
    SEND_LINK: "SEND_LINK",
    COMMITMENT_CHECK: "COMMITMENT_CHECK",
    CLOSE: "CLOSE",
    ENDED: "ENDED",
  },

  INTENTS: {
    AFFIRMATIVE: "AFFIRMATIVE",
    NEGATIVE: "NEGATIVE",
    BUSY: "BUSY",
    ASK_WHO_ARE_YOU: "ASK_WHO_ARE_YOU",
    ASK_LINK: "ASK_LINK",
    TODAY: "TODAY",
    TOMORROW: "TOMORROW",
    LATER: "LATER",

    SERVICE: "SERVICE",
    PRODUCT: "PRODUCT",
    MIXED: "MIXED",

    AGENCY: "AGENCY",
    REAL_ESTATE: "REAL_ESTATE",
    COACH: "COACH",
    LOCAL_BUSINESS: "LOCAL_BUSINESS",
    ECOMMERCE: "ECOMMERCE",
    OTHER_NICHE: "OTHER_NICHE",

    LEAD_PROBLEM: "LEAD_PROBLEM",
    CONVERSION_PROBLEM: "CONVERSION_PROBLEM",
    SYSTEM_PROBLEM: "SYSTEM_PROBLEM",

    READY: "READY",
    NOT_READY: "NOT_READY",

    SILENCE: "SILENCE",
    UNKNOWN: "UNKNOWN",
  },
};
