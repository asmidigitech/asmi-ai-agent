import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ENV VARIABLES
const GALLABOX_API_KEY = process.env.GALLABOX_API_KEY;
const GALLABOX_API_SECRET = process.env.GALLABOX_API_SECRET;
const CHANNEL_ID = process.env.GALLABOX_CHANNEL_ID;

// Normalize phone
function normalizePhone(phone) {
  if (!phone) return null;

  const digits = String(phone).replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return "91" + digits.slice(1);
  }

  if (digits.length === 10) {
    return "91" + digits;
  }

  if (digits.length > 10) {
    return "91" + digits.slice(-10);
  }

  return null;
}

// Send WhatsApp
async function sendWhatsApp(templateName, phone, bodyValues) {
  const payload = {
    channelId: CHANNEL_ID,
    channelType: "whatsapp",
    recipient: {
      name: bodyValues.name,
      phone: phone,
      rawPhone: phone,
    },
    whatsapp: {
      type: "template",
      template: {
        templateName,
        bodyValues,
      },
    },
  };

  console.log(`Sending ${templateName} to ${phone}`, payload);

  const response = await axios.post(
    "https://server.gallabox.com/devapi/messages/whatsapp",
    payload,
    {
      headers: {
        apikey: GALLABOX_API_KEY,
        apiSecret: GALLABOX_API_SECRET,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  console.log(`Gallabox response for ${templateName}:`, response.data);
  return response.data;
}

// MAIN WEBHOOK
app.post("/lead", async (req, res) => {
  try {
    const lead = req.body;
    console.log("Incoming Lead:", lead);

    const phone = normalizePhone(lead.phone_sanitized || lead.phone);

    if (!phone) {
      return res.status(400).json({ error: "Invalid phone" });
    }

    const name = lead.name || "Founder";
    const score = lead.x_lg_score || "0";
    const heat = String(lead.x_lg_heat || "").toLowerCase();
    const reportId = `BSA-2026-${lead.id}`;

    // WA1
    await sendWhatsApp("wa1", phone, {
      name,
      score: String(score),
      report_id: reportId,
    });

    // WAIT 20 sec
    await new Promise((r) => setTimeout(r, 20000));

    // WA499 only for HOT/WARM
    if (heat === "hot" || heat === "warm") {
      await sendWhatsApp("wa499", phone, {
        name,
        payment_link: "https://rzp.io/rzp/s5izYcy",
        report_id: reportId,
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message || err);
    return res.status(500).json({
      error: err.response?.data || err.message || "Unknown error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
