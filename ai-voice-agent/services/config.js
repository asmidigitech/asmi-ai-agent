// config.js
module.exports = {
  CALL_FLOW: {
    MAX_RETRIES_PER_STATE: 1,
    MAX_UNKNOWN_STREAK: 2,
    MAX_SILENCE_STREAK: 2,
    MAX_TOTAL_TURNS: 12,
    AUTO_SEND_LINK_ON_EXIT: true,
    CLOSE_AFTER_LINK_SENT: false, // keep false so we can ask "aaj ya kal?"
  },

  PAYMENT: {
    LINK_URL: process.env.PAYMENT_LINK_URL || "https://rzp.io/rzp/s5izYcy",
    LINK_LABEL: "₹499 strategy call"
  },

  GALLABOX: {
    BASE_URL: process.env.GALLABOX_BASE_URL || "",
    API_KEY: process.env.GALLABOX_API_KEY || "",
    CHANNEL_ID: process.env.GALLABOX_CHANNEL_ID || "",
    TEMPLATE_NAME: process.env.GALLABOX_TEMPLATE_NAME || "wa499",
    TEMPLATE_LANGUAGE: process.env.GALLABOX_TEMPLATE_LANGUAGE || "en",
    SOURCE_NUMBER: process.env.GALLABOX_SOURCE_NUMBER || "",
    ENABLED: String(process.env.GALLABOX_ENABLED || "true") === "true"
  },

  BOT: {
    NAME: "Riya",
    COMPANY: "DigiTL Elev8, Asmi Digitech",
    FOUNDER_NAME: "Anand sir"
  }
};
