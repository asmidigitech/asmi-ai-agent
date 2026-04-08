// intent.js

const { INTENTS } = require("./config");

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s₹]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, patterns = []) {
  return patterns.some((p) => p.test(text));
}

function detectIntent(rawText = "") {
  const text = normalizeText(rawText);

  if (!text || text.length < 2) {
    return { intent: INTENTS.SILENCE, value: null, raw: rawText };
  }

  if (
    includesAny(text, [
      /\bwho are you\b/,
      /\bkaun\b/,
      /\bkon\b/,
      /\baap kaun\b/,
      /\bkaun bol rahe\b/,
      /\bwho is this\b/,
      /\bkoun\b/,
    ])
  ) {
    return { intent: INTENTS.ASK_WHO_ARE_YOU, value: null, raw: rawText };
  }

  if (
    includesAny(text, [
      /\blink bhej/i,
      /\bsend link\b/,
      /\blink send\b/,
      /\bwhatsapp kar/i,
      /\bpayment link\b/,
      /\bpahle link\b/,
      /\blink bhejiye\b/,
      /\blink bhejo\b/,
      /\bshare link\b/,
      /\bsend me the link\b/,
    ])
  ) {
    return { intent: INTENTS.ASK_LINK, value: null, raw: rawText };
  }

  if (
    includesAny(text, [
      /\bbusy\b/,
      /\bmeeting\b/,
      /\bbaad mein\b/,
      /\bcall later\b/,
      /\bnot free\b/,
      /\bthoda busy\b/,
      /\bcurrently busy\b/,
      /\bphone rakho\b/,
      /\bbaad me\b/,
    ])
  ) {
    return { intent: INTENTS.BUSY, value: null, raw: rawText };
  }

  if (
    includesAny(text, [
      /\byes\b/,
      /\bhaan\b/,
      /\bhan\b/,
      /\bok\b/,
      /\bokay\b/,
      /\btheek\b/,
      /\bthik\b/,
      /\bright\b/,
      /\bcorrect\b/,
      /\bsure\b/,
      /\byep\b/,
      /\bya\b/,
      /\byeah\b/,
      /\bkarenge\b/,
      /\bchalega\b/,
    ])
  ) {
    return { intent: INTENTS.AFFIRMATIVE, value: null, raw: rawText };
  }

  if (
    includesAny(text, [
      /\bno\b/,
      /\bnahi\b/,
      /\bnahin\b/,
      /\bnot interested\b/,
      /\bmat\b/,
      /\bband karo\b/,
      /\bdon t\b/,
      /\bnope\b/,
    ])
  ) {
    return { intent: INTENTS.NEGATIVE, value: null, raw: rawText };
  }

  if (
    includesAny(text, [
      /\baaj\b/,
      /\btoday\b/,
      /\baj\b/,
      /\babhi\b/,
      /\bnow\b/,
      /\btoday itself\b/,
    ])
  ) {
    return { intent: INTENTS.TODAY, value: "today", raw: rawText };
  }

  if (
    includesAny(text, [
      /\bkal\b/,
      /\btomorrow\b/,
      /\bnext day\b/,
      /\btmrw\b/,
    ])
  ) {
    return { intent: INTENTS.TOMORROW, value: "tomorrow", raw: rawText };
  }

  if (
    includesAny(text, [
      /\blater\b/,
      /\bbaad mein\b/,
      /\bdekhenge\b/,
      /\bsoch ke\b/,
      /\bphir\b/,
      /\bnext week\b/,
      /\bsometime\b/,
    ])
  ) {
    return { intent: INTENTS.LATER, value: "later", raw: rawText };
  }

  if (
    includesAny(text, [
      /\bservice\b/,
      /\bservices\b/,
      /\bconsulting\b/,
      /\bagency services\b/,
      /\bclient work\b/,
    ])
  ) {
    return { intent: INTENTS.SERVICE, value: "service", raw: rawText };
  }

  if (
    includesAny(text, [
      /\bproduct\b/,
      /\bproducts\b/,
      /\bmanufacturing\b/,
      /\bphysical product\b/,
      /\bselling products\b/,
    ])
  ) {
    return { intent: INTENTS.PRODUCT, value: "product", raw: rawText };
  }

  if (
    includesAny(text, [
      /\bmixed\b/,
      /\bboth\b/,
      /\bboth hai\b/,
      /\bdono\b/,
      /\bservice and product\b/,
      /\bproduct and service\b/,
    ])
  ) {
    return { intent: INTENTS.MIXED, value: "mixed", raw: rawText };
  }

  if (
    includesAny(text, [/\bagency\b/, /\bad agency\b/, /\bmarketing agency\b/])
  ) {
    return { intent: INTENTS.AGENCY, value: "agency", raw: rawText };
  }

  if (
    includesAny(text, [
      /\breal estate\b/,
      /\brealtor\b/,
      /\bproperty\b/,
      /\bbroker\b/,
      /\bconstruction\b/,
      /\bbuilder\b/,
    ])
  ) {
    return { intent: INTENTS.REAL_ESTATE, value: "real_estate", raw: rawText };
  }

  if (
    includesAny(text, [
      /\bcoach\b/,
      /\bconsultant\b/,
      /\btrainer\b/,
      /\bmentor\b/,
      /\bcoaching\b/,
    ])
  ) {
    return { intent: INTENTS.COACH, value: "coach_consultant", raw: rawText };
  }

  if (
    includesAny(text, [
      /\blocal business\b/,
      /\bshop\b/,
      /\bclinic\b/,
      /\brestaurant\b/,
      /\bsalon\b/,
      /\bgym\b/,
      /\bstore\b/,
    ])
  ) {
    return {
      intent: INTENTS.LOCAL_BUSINESS,
      value: "local_business",
      raw: rawText,
    };
  }

  if (
    includesAny(text, [
      /\becommerce\b/,
      /\bamazon\b/,
      /\bflipkart\b/,
      /\bonline store\b/,
      /\bd2c\b/,
    ])
  ) {
    return { intent: INTENTS.ECOMMERCE, value: "ecommerce", raw: rawText };
  }

  if (
    includesAny(text, [
      /\bleads\b/,
      /\blead generation\b/,
      /\bleads nahi\b/,
      /\binquiries\b/,
      /\bprospects\b/,
      /\btraffic\b/,
      /\bno leads\b/,
    ])
  ) {
    return {
      intent: INTENTS.LEAD_PROBLEM,
      value: "lead_generation",
      raw: rawText,
    };
  }

  if (
    includesAny(text, [
      /\bconversion\b/,
      /\bconvert\b/,
      /\bclosing\b/,
      /\bsales close\b/,
      /\bfollow up\b/,
      /\bleads aa rahe but\b/,
    ])
  ) {
    return {
      intent: INTENTS.CONVERSION_PROBLEM,
      value: "low_conversion",
      raw: rawText,
    };
  }

  if (
    includesAny(text, [
      /\bsystem\b/,
      /\bprocess\b/,
      /\boperations\b/,
      /\bteam issue\b/,
      /\bexecution\b/,
      /\bworkflow\b/,
      /\bmanagement\b/,
    ])
  ) {
    return {
      intent: INTENTS.SYSTEM_PROBLEM,
      value: "operations_system",
      raw: rawText,
    };
  }

  if (
    includesAny(text, [
      /\bseriously\b/,
      /\bready\b/,
      /\bkarna chahenge\b/,
      /\bexplore\b/,
      /\binterested\b/,
      /\bhaan karenge\b/,
    ])
  ) {
    return { intent: INTENTS.READY, value: "ready", raw: rawText };
  }

  if (
    includesAny(text, [
      /\bnot ready\b/,
      /\babhi nahi\b/,
      /\bnahi karna\b/,
      /\bnot now\b/,
      /\blater dekhenge\b/,
      /\bno interest\b/,
    ])
  ) {
    return { intent: INTENTS.NOT_READY, value: "not_ready", raw: rawText };
  }

  return { intent: INTENTS.UNKNOWN, value: null, raw: rawText };
}

module.exports = {
  detectIntent,
  normalizeText,
};
