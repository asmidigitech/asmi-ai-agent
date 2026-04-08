// prompts.js

const prompts = {
  START: ({ name }) =>
    `Hi ${name || "ji"}, main Riya bol rahi hoon from DigiTL Elev8, Asmi Digitech se. Aapne recently business assessment fill kiya tha, right?`,

  START_RETRY: () =>
    `Bas confirm karna tha, aapne recently business assessment fill kiya tha na?`,

  PERMISSION: () =>
    `Main bas 30 seconds loongi. Ek-do short questions poochke aapko ₹499 strategy call ka link WhatsApp par share kar dungi. Theek hai?`,

  PERMISSION_BUSY: () =>
    `Koi issue nahi. Main aapko WhatsApp par ₹499 strategy call ka link share kar deti hoon.`,

  Q1_BUSINESS_TYPE: () =>
    `Aapka business mainly service based hai, product based hai, ya mixed?`,

  Q1_BUSINESS_TYPE_RETRY: () =>
    `Short mein batayiye please — service, product, ya mixed?`,

  Q2_NICHE: () =>
    `Aap mostly kis type ke clients ko serve karte ho? Agency, real estate, coaches, local business, ya kuch aur?`,

  Q2_NICHE_RETRY: () =>
    `Short mein batayiye — agency, real estate, coach, local business, ya other?`,

  Q3_CHALLENGE: () =>
    `Abhi sabse bada challenge kya hai — leads, conversion, ya system/process?`,

  Q3_CHALLENGE_RETRY: () =>
    `Ek option choose kijiye please — leads, conversion, ya system?`,

  Q4_READINESS: () =>
    `Agar Anand sir exact next step bata dein, toh kya aap implementation seriously explore karna chahenge?`,

  Q4_READINESS_RETRY: () =>
    `Simple yes ya maybe mein batayiye please.`,

  MICRO_PITCH: ({ challenge }) => {
    switch (challenge) {
      case "lead_generation":
        return `Got it. Yahan sahi lead flow aur conversion clarity dono important hain. Isi liye short strategy call useful rahegi.`;
      case "low_conversion":
        return `Samajh gaya. Issue lead ka nahi, conversion aur follow-up system ka lag raha hai. Isi liye short strategy call useful rahegi.`;
      case "operations_system":
        return `Understood. Yahan growth ke liye strong process aur execution structure zaroori hai. Isi liye short strategy call useful rahegi.`;
      default:
        return `Samajh gaya. Isi liye ye short strategy call useful rahegi.`;
    }
  },

  ASK_LINK_CONFIRM: () =>
    `Main abhi aapko ₹499 strategy call ka link WhatsApp par share kar rahi hoon.`,

  COMMITMENT_CHECK: () =>
    `Aap isse aaj complete karoge ya kal?`,

  COMMITMENT_SOFT: () =>
    `Aap convenient time par check kar loge na?`,

  CLOSE_POSITIVE: () =>
    `Perfect. Anand sir se baat karke aapko clear direction mil jayegi. Thank you.`,

  CLOSE_SOFT: () =>
    `No worries. Main link share kar deti hoon, aap convenience se review kar lena.`,

  CLOSE_BUSY: () =>
    `Koi issue nahi. Main link abhi share kar deti hoon. Jab convenient ho tab book kar lena.`,

  CLOSE_NOT_INTERESTED: () =>
    `Theek hai, koi pressure nahi. Main link share kar deti hoon, agar later useful lage toh use kar lena.`,

  WHO_ARE_YOU: () =>
    `Main Riya bol rahi hoon from DigiTL Elev8, Asmi Digitech se. Aapne business assessment fill kiya tha, usi ke regarding call hai.`,

  ASK_LINK_DIRECT: () =>
    `Bilkul. Main abhi WhatsApp par link share kar deti hoon.`,

  FALLBACK: () =>
    `Sorry, short mein batayiye please.`,

  SILENCE_FALLBACK: () =>
    `Hello, meri awaaz aa rahi hai? Short mein batayiye please.`,

  GOODBYE: () =>
    `Thank you. Have a great day.`
};

module.exports = prompts;
