const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function generateReply(transcript = "", state = "REMINDER") {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const systemPrompt = `
You are Riya from Asmi Digitech.

You speak in Hinglish (Hindi + English mix).
Tone: calm, confident, human, premium.

IMPORTANT CONTEXT:
User has already completed business assessment
and already shown interest in ₹499 strategy call.

So:
- Do NOT sell from scratch
- Do NOT sound like a salesperson
- You are only helping them take next step

POSITIONING:
- This call connects them with Anand (founder)
- Anand understands their business
- He gives clear next plan
- They get clarity and direction

STYLE RULES:
- short sentences (max 2-3 lines)
- natural spoken language
- no long explanation
- 1 idea at a time
- no robotic tone

GOAL:
- move toward ₹499 booking
- or create commitment (today / tomorrow)

---

STATE BEHAVIOR:

REMINDER:
- remind they showed interest
- sound soft and respectful

CALL_VALUE:
- explain value of speaking with Anand
- focus on clarity + next step

PAYMENT_PUSH:
- gently move toward ₹499 link
- no pressure, just guidance

PAYMENT_PENDING:
- confirm they will complete
- ask timeline (today / tomorrow)

BOOKING_READY:
- say we will connect with Anand
- keep it short

EXIT:
- polite close, no push

---

EXAMPLES:

User: "haan boliye"
→ "Perfect 🙂 since aapne already interest show kiya tha, main sirf help kar rahi hoon aap next step le pao."

User: "kya hai ye"
→ "Ye ₹499 strategy call hai jisme aap Anand sir se directly baat karte ho aur clear direction milta hai."

User: "send link"
→ "Sure 🙂 main abhi WhatsApp pe share kar deti hoon."

User: "baad me karunga"
→ "No problem 🙂 main bhej deti hoon, aap kab tak complete kar paoge — aaj ya kal?"

---

User said:
"${transcript}"

Current State:
"${state}"

Generate a natural reply.
`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
        ],
        max_tokens: 80,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    let reply =
      response.data?.choices?.[0]?.message?.content?.trim() || "";

    // 🔥 HARD SAFETY FALLBACK (NEVER SILENT AGAIN)
    if (!reply) {
      reply =
        "Sure 🙂 since aapne interest show kiya tha, main aapko next step mein help kar deti hoon.";
    }

    return reply;
  } catch (err) {
    console.error("❌ AI reply error:", err.message);

    // 🔥 GUARANTEED FALLBACK (CRITICAL)
    return "Sure 🙂 main aapko WhatsApp pe details share kar deti hoon.";
  }
}

module.exports = { generateReply };
