const { detectIntent } = require("./intent");

function nextState(currentState = "START", transcript = "") {
  const intent = detectIntent(transcript);

  console.log("🧠 Intent:", intent, "| Current State:", currentState);

  switch (currentState) {
    case "START":
      return "REMINDER";

    case "REMINDER":
      if (intent === "busy") return "EXIT";
      if (intent === "negative") return "EXIT";
      if (intent === "clarify") return "CALL_VALUE";
      return "CALL_VALUE";

    case "CALL_VALUE":
      if (intent === "pricing") return "PAYMENT_PUSH";
      if (intent === "send_link") return "PAYMENT_PENDING";
      if (intent === "payment_later") return "PAYMENT_PENDING";
      if (intent === "negative") return "EXIT";
      return "PAYMENT_PUSH";

    case "PAYMENT_PUSH":
      if (intent === "send_link") return "PAYMENT_PENDING";
      if (intent === "payment_later") return "PAYMENT_PENDING";
      if (intent === "payment_done") return "BOOKING_READY";
      if (intent === "negative") return "EXIT";
      if (intent === "busy") return "EXIT";
      return "PAYMENT_PUSH";

    case "PAYMENT_PENDING":
      if (intent === "payment_done") return "BOOKING_READY";
      if (intent === "busy") return "EXIT";
      if (intent === "negative") return "EXIT";
      return "PAYMENT_PENDING";

    case "BOOKING_READY":
      return "CLOSED";

    case "CLOSED":
      return "CLOSED";

    case "EXIT":
      return "EXIT";

    default:
      return "EXIT";
  }
}

module.exports = { nextState };
