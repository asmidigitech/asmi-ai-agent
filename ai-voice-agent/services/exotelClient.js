const axios = require("axios");

const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;
const EXOTEL_ACCOUNT_SID = process.env.EXOTEL_ACCOUNT_SID;
const EXOTEL_SUBDOMAIN = process.env.EXOTEL_SUBDOMAIN; // api.exotel.com OR api.in.exotel.com
const EXOTEL_CALLER_ID = process.env.EXOTEL_CALLER_ID; // ExoPhone
const EXOTEL_APP_URL = process.env.EXOTEL_APP_URL;     // http://my.exotel.com/{sid}/exoml/start_voice/{app_id}
const BRIDGE_BASE_URL = process.env.BRIDGE_BASE_URL;   // public URL of your Node bridge

function normalizeIndianPhone(phone) {
  if (!phone) return "";
  let p = String(phone)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\+/g, "")
    .replace(/-/g, "")
    .replace(/\./g, "");

  if (p.startsWith("91") && p.length === 12) return p;
  if (p.length === 10) return `91${p}`;
  return p;
}

async function triggerExotelCall({
  leadId,
  sessionId,
  customerPhone,
  customField = "",
}) {
  if (!EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_ACCOUNT_SID || !EXOTEL_SUBDOMAIN) {
    throw new Error("Missing Exotel environment variables");
  }

  if (!EXOTEL_CALLER_ID) {
    throw new Error("Missing EXOTEL_CALLER_ID");
  }

  if (!EXOTEL_APP_URL) {
    throw new Error("Missing EXOTEL_APP_URL");
  }

  if (!BRIDGE_BASE_URL) {
    throw new Error("Missing BRIDGE_BASE_URL");
  }

  const normalizedPhone = normalizeIndianPhone(customerPhone);

  const connectUrl =
    `https://${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}` +
    `@${EXOTEL_SUBDOMAIN}/v1/Accounts/${EXOTEL_ACCOUNT_SID}/Calls/connect`;

  const statusCallback =
    `${BRIDGE_BASE_URL}/api/exotel/status` +
    `?lead_id=${encodeURIComponent(leadId)}` +
    `&session_id=${encodeURIComponent(sessionId)}`;

  const form = new URLSearchParams();

  // Exotel connect-to-call-flow API:
  // From = number called first
  // CallerId = ExoPhone
  // Url = Exotel app URL
  form.append("From", normalizedPhone);
  form.append("CallerId", EXOTEL_CALLER_ID);
  form.append("Url", EXOTEL_APP_URL);
  form.append("StatusCallback", statusCallback);
  form.append("StatusCallbackMethod", "POST");
  form.append("TimeOut", "30");
  form.append("CallType", "trans");

  if (customField) {
    form.append("CustomField", customField);
  }

  console.log("📤 Exotel connect request:", {
    connectUrl,
    From: normalizedPhone,
    CallerId: EXOTEL_CALLER_ID,
    Url: EXOTEL_APP_URL,
    StatusCallback: statusCallback,
  });

  try {
    const response = await axios.post(connectUrl, form.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    });

    return response.data;
  } catch (error) {
    const exotelError = error.response?.data || error.response?.statusText || error.message;
    console.error("❌ Exotel API error:", exotelError);

    throw new Error(
      typeof exotelError === "string"
        ? exotelError
        : JSON.stringify(exotelError)
    );
  }
}

module.exports = {
  triggerExotelCall,
  normalizeIndianPhone,
};