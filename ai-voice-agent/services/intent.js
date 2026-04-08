// intent.js

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, arr) {
  return arr.some((term) => text.includes(term));
}

function classifyIntent(rawText = "", currentState = "") {
  const text = normalizeText(rawText);

  if (!text) return { intent: "silence", value: null, text };

  // direct link ask
  if (
    includesAny(text, [
      "send link",
      "link bhejo",
      "link bhejiye",
      "link bhej do",
      "payment link",
      "whatsapp kar do",
      "share the link",
      "पहले लिंक",
      "लिंक भेजिए",
      "लिंक भेज दो",
      "लिंक भेजो"
    ])
  ) {
    return { intent: "ask_link", value: "ask_link", text };
  }

  // busy
  if (
    includesAny(text, [
      "busy",
      "call later",
      "later call",
      "abhi busy",
      "baad mein",
      "not now",
      "abhi nahi",
      "me busy hu",
      "i am busy",
      "talk later",
      "later",
      "थोड़ी देर बाद",
      "अभी व्यस्त",
      "अभी नहीं"
    ])
  ) {
    return { intent: "busy", value: "busy", text };
  }

  // who are you
  if (
    includesAny(text, [
      "who are you",
      "kaun",
      "kon bol rahe",
      "kon बोल रहे",
      "aap kaun",
      "who is this",
      "कौन",
      "कौन बोल रहे",
      "आप कौन"
    ])
  ) {
    return { intent: "ask_who_are_you", value: "who", text };
  }

  // negative
  if (
    includesAny(text, [
      "no",
      "nahi",
      "nahin",
      "not interested",
      "mat bhejo",
      "don t want",
      "do not want",
      "nahi chahiye",
      "skip",
      "stop"
    ])
  ) {
    return { intent: "negative", value: "negative", text };
  }

  // positive / okay
  if (
    includesAny(text, [
      "yes",
      "haan",
      "ha",
      "ok",
      "okay",
      "theek",
      "thik",
      "sure",
      "right",
      "correct",
      "hmm",
      "hmmm",
      "yes please",
      "ठीक है",
      "हाँ"
    ])
  ) {
    return { intent: "affirmative", value: "affirmative", text };
  }

  // commitment timing
  if (includesAny(text, ["aaj", "today", "aj"])) {
    return { intent: "timeline", value: "today", text };
  }

  if (includesAny(text, ["kal", "tomorrow"])) {
    return { intent: "timeline", value: "tomorrow", text };
  }

  if (
    includesAny(text, [
      "later",
      "baad mein",
      "sometime",
      "dekhte hain",
      "dekhenge",
      "after",
      "phir",
      "baadme"
    ])
  ) {
    return { intent: "timeline", value: "later", text };
  }

  // business type
  if (
    includesAny(text, [
      "service",
      "services",
      "consulting",
      "agency",
      "coach",
      "freelance",
      "professional services"
    ])
  ) {
    return { intent: "business_type", value: "service", text };
  }

  if (
    includesAny(text, [
      "product",
      "products",
      "ecommerce",
      "e commerce",
      "manufacturing",
      "physical product",
      "retail product"
    ])
  ) {
    return { intent: "business_type", value: "product", text };
  }

  if (includesAny(text, ["mixed", "both", "dono"])) {
    return { intent: "business_type", value: "mixed", text };
  }

  // niche
  if (includesAny(text, ["agency", "marketing agency", "digital agency"])) {
    return { intent: "niche", value: "agency", text };
  }

  if (
    includesAny(text, [
      "real estate",
      "realtor",
      "property",
      "broker",
      "builder",
      "realty"
    ])
  ) {
    return { intent: "niche", value: "real_estate", text };
  }

  if (
    includesAny(text, [
      "coach",
      "consultant",
      "trainer",
      "mentor",
      "educator"
    ])
  ) {
    return { intent: "niche", value: "coach_consultant", text };
  }

  if (
    includesAny(text, [
      "local business",
      "clinic",
      "doctor",
      "salon",
      "restaurant",
      "shop",
      "gym"
    ])
  ) {
    return { intent: "niche", value: "local_business", text };
  }

  if (includesAny(text, ["ecommerce", "e commerce", "amazon", "shopify"])) {
    return { intent: "niche", value: "ecommerce", text };
  }

  // challenge
  if (
    includesAny(text, [
      "lead",
      "leads",
      "enquiry nahi",
      "inquiries nahi",
      "new clients nahi",
      "not getting leads",
      "lead generation",
      "traffic"
    ])
  ) {
    return { intent: "challenge", value: "lead_generation", text };
  }

  if (
    includesAny(text, [
      "conversion",
      "convert nahi",
      "closing issue",
      "follow up",
      "sales close",
      "leads aa rahe but convert nahi",
      "closing"
    ])
  ) {
    return { intent: "challenge", value: "low_conversion", text };
  }

  if (
    includesAny(text, [
      "system",
      "process",
      "operations",
      "team issue",
      "execution",
      "automation",
      "management",
      "backend"
    ])
  ) {
    return { intent: "challenge", value: "operations_system", text };
  }

  // readiness
  if (
    currentState === "Q4_READINESS" &&
    includesAny(text, [
      "yes",
      "haan",
      "sure",
      "karenge",
      "explore",
      "interested",
      "ready"
    ])
  ) {
    return { intent: "readiness", value: "yes_ready", text };
  }

  if (
    currentState === "Q4_READINESS" &&
    includesAny(text, [
      "maybe",
      "may be",
      "dekhenge",
      "sochenge",
      "later",
      "not sure"
    ])
  ) {
    return { intent: "readiness", value: "maybe", text };
  }

  if (
    currentState === "Q4_READINESS" &&
    includesAny(text, ["no", "nahi", "not now", "abhi nahi"])
  ) {
    return { intent: "readiness", value: "not_now", text };
  }

  return { intent: "unknown", value: null, text };
}

module.exports = {
  classifyIntent,
  normalizeText
};
