const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function generateReply(userText) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Riya from Asmi Digitech.

Speak in Hinglish, confident, natural, short.

Goal:
- qualify founder
- ask only 1 question at a time
- push toward the 499 rupee strategy call

Do NOT:
- give long answers
- talk technical
- sound robotic

Be human-like.
          `.trim(),
        },
        {
          role: "user",
          content: userText,
        },
      ],
      max_tokens: 60,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  return response.data.choices[0].message.content;
}

module.exports = { generateReply };
