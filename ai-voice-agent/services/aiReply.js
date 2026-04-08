const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function generateReply(userText) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const prompt = `
You are Riya from Asmi Digitech.

Reply in short Hinglish.
Max 1 short sentence.
Sound natural, confident, human.

Goal:
- continue conversation
- ask only one thing at a time
- move toward the 499 strategy call

If user says "haan boliye", respond with something like:
"Sure. Aapka business service based hai ya product based?"

If user says busy:
"Understood. Main short me bolti hoon, aapka assessment mila hai."

Do not give long answers.
`.trim();

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userText }
      ],
      max_tokens: 40,
      temperature: 0.4
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 12000
    }
  );

  return response.data.choices?.[0]?.message?.content?.trim() || "Sure. Aapka business service based hai ya product based?";
}

module.exports = { generateReply };
