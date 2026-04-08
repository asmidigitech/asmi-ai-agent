function detectIntent(text = "") {
  const t = String(text).toLowerCase().trim();

  if (!t) return "unknown";

  // Busy / postpone
  if (
    t.includes("busy") ||
    t.includes("later") ||
    t.includes("baad") ||
    t.includes("abhi nahi") ||
    t.includes("kal") ||
    t.includes("tomorrow") ||
    t.includes("free hoke") ||
    t.includes("abhi time nahi")
  ) {
    return "busy";
  }

  // Positive / open to continue
  if (
    t.includes("haan") ||
    t.includes("ha") ||
    t.includes("yes") ||
    t.includes("bolo") ||
    t.includes("boliye") ||
    t.includes("suniye") ||
    t.includes("speak") ||
    t.includes("batayiye")
  ) {
    return "positive";
  }

  // Asking what this is
  if (
    t.includes("kya hai") ||
    t.includes("what is this") ||
    t.includes("kis bare me") ||
    t.includes("about kya") ||
    t.includes("ye kya") ||
    t.includes("kaunsa call")
  ) {
    return "clarify";
  }

  // Pricing / fee objection
  if (
    t.includes("kitna") ||
    t.includes("price") ||
    t.includes("fees") ||
    t.includes("charge") ||
    t.includes("cost")
  ) {
    return "pricing";
  }

  // Wants link now
  if (
    t.includes("send link") ||
    t.includes("link bhejo") ||
    t.includes("link bhejiye") ||
    t.includes("whatsapp karo") ||
    t.includes("send me the link") ||
    t.includes("bhej do")
  ) {
    return "send_link";
  }

  // Will pay later / defer payment
  if (
    t.includes("pay later") ||
    t.includes("later pay") ||
    t.includes("baad me pay") ||
    t.includes("baad me karta hu") ||
    t.includes("baad me karunga") ||
    t.includes("later karunga") ||
    t.includes("aaj nahi") ||
    t.includes("kal karunga")
  ) {
    return "payment_later";
  }

  // Payment done
  if (
    t.includes("paid") ||
    t.includes("payment done") ||
    t.includes("done") ||
    t.includes("ho gaya") ||
    t.includes("kar diya") ||
    t.includes("complete kiya")
  ) {
    return "payment_done";
  }

  // Wants details first
  if (
    t.includes("details") ||
    t.includes("detail bhejo") ||
    t.includes("pehle details") ||
    t.includes("zyada batao") ||
    t.includes("more info")
  ) {
    return "details";
  }

  // Negative / not interested
  if (
    t.includes("not interested") ||
    t.includes("interest nahi") ||
    t.includes("no need") ||
    t.includes("zarurat nahi") ||
    t.includes("nahi chahiye") ||
    t.includes("no")
  ) {
    return "negative";
  }

  return "unknown";
}

module.exports = { detectIntent };
