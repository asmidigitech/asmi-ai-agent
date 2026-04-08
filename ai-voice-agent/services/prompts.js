// prompts.js

function fill(text, vars = {}) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
}

const PROMPTS = {
  opening(ctx) {
    return fill(
      "Hi {{name}}, main Riya bol rahi hoon from DigiTL Elev8, Asmi Digitech se. Aapne recently business assessment fill kiya tha, right?",
      { name: ctx.name || "sir" }
    );
  },

  permission() {
    return "Main bas 30 seconds loongi. Ek-do short questions poochke aapko ₹499 strategy call ka link WhatsApp par share kar dungi. Theek hai?";
  },

  q1BusinessType() {
    return "Aapka business mainly service based hai, product based hai, ya mixed?";
  },

  q1Retry() {
    return "Short mein batayiye please — service, product, ya mixed?";
  },

  q2Niche() {
    return "Aap mostly kis type ke clients ko serve karte ho? Agency, real estate, coaches, local business, ecommerce, ya kuch aur?";
  },

  q2Retry() {
    return "Short mein batayiye please — agency, real estate, coaches, local business, ya kuch aur?";
  },

  q3Challenge() {
    return "Abhi sabse bada challenge kya hai — leads, conversion, ya system aur process?";
  },

  q3Retry() {
    return "Short mein batayiye — leads, conversion, ya system/process?";
  },

  q4Readiness() {
    return "Agar Anand sir exact next step bata dein, toh kya aap implementation seriously explore karna chahenge?";
  },

  q4Retry() {
    return "Simple yes ya no mein batayiye — seriously explore karna chahenge?";
  },

  busySoft() {
    return "Koi issue nahi. Main link WhatsApp par share kar deti hoon.";
  },

  whoAreYou() {
    return "Main Riya bol rahi hoon from DigiTL Elev8, Asmi Digitech se. Aapne business assessment fill kiya tha.";
  },

  reminder() {
    return "Aapne business assessment fill kiya tha aur strategy call mein interest show kiya tha.";
  },

  microPitch(problemType) {
    const map = {
      lead_generation:
        "Got it. Yahan sahi lead flow aur conversion clarity dono important hain.",
      low_conversion:
        "Samajh gaya. Issue lead ka nahi, conversion aur follow-up system ka lag raha hai.",
      operations_system:
        "Understood. Yahan growth ke liye strong process aur execution structure zaroori hai.",
      unclear:
        "Samajh gaya. Isi liye short strategy call useful rahegi.",
    };

    return `${map[problemType] || map.unclear} Isi liye ₹499 strategy call useful rahegi, kyunki Anand sir aapke current gap aur practical next step clear karenge.`;
  },

  sendLink() {
    return "Main abhi aapko ₹499 strategy call ka link WhatsApp par share kar rahi hoon.";
  },

  commitmentCheck() {
    return "Aap isse aaj complete karoge ya kal?";
  },

  closePositive() {
    return "Perfect. Anand sir se baat karke aapko clear direction mil jayegi. Thank you.";
  },

  closeSoft() {
    return "No worries. Main link share kar deti hoon, aap convenience se review kar lena.";
  },

  closeBusy() {
    return "Koi issue nahi. Main link abhi share kar deti hoon. Jab convenient ho tab book kar lena.";
  },

  alreadySentLink() {
    return "Perfect, maine link share kar diya hai.";
  },

  silenceFallback() {
    return "Lagta hai audio clear nahi aaya. Main link WhatsApp par share kar deti hoon.";
  },
};

module.exports = { PROMPTS, fill };
