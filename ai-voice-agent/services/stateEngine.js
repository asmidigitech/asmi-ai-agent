// stateEngine.js

const { APP, STATES, INTENTS } = require("./config");
const { PROMPTS } = require("./prompts");

class ConversationStateEngine {
  constructor(ctx = {}) {
    this.ctx = {
      lead_id: ctx.lead_id || null,
      session_id: ctx.session_id || null,
      name: ctx.name || "sir",
      phone: ctx.phone || "",
      score: ctx.score || 0,
      stage: ctx.stage || "",
      heat: ctx.heat || "",
      niche: ctx.niche || "",
      businessType: null,
      nicheBucket: null,
      problemType: null,
      readiness: null,
      commitment: null,
      linkSent: false,
      linkSentAt: null,
      closedReason: null,
      startedAt: Date.now(),
    };

    this.state = STATES.START;
    this.stepCount = 0;
    this.unknownStreak = 0;
    this.retryByState = {};
    this.lastBotMessage = "";
    this.history = [];
  }

  log(entry) {
    this.history.push({
      ts: new Date().toISOString(),
      state: this.state,
      ...entry,
    });
  }

  canContinue() {
    return this.stepCount < APP.MAX_CALL_STEPS && this.state !== STATES.ENDED;
  }

  getRetryCount(state) {
    return this.retryByState[state] || 0;
  }

  bumpRetry(state) {
    this.retryByState[state] = this.getRetryCount(state) + 1;
  }

  setState(nextState) {
    this.state = nextState;
  }

  getCurrentQuestion() {
    switch (this.state) {
      case STATES.START:
        return PROMPTS.opening(this.ctx);

      case STATES.PERMISSION:
        return PROMPTS.permission();

      case STATES.Q1_BUSINESS_TYPE:
        return this.getRetryCount(STATES.Q1_BUSINESS_TYPE) > 0
          ? PROMPTS.q1Retry()
          : PROMPTS.q1BusinessType();

      case STATES.Q2_NICHE:
        return this.getRetryCount(STATES.Q2_NICHE) > 0
          ? PROMPTS.q2Retry()
          : PROMPTS.q2Niche();

      case STATES.Q3_CHALLENGE:
        return this.getRetryCount(STATES.Q3_CHALLENGE) > 0
          ? PROMPTS.q3Retry()
          : PROMPTS.q3Challenge();

      case STATES.Q4_READINESS:
        return this.getRetryCount(STATES.Q4_READINESS) > 0
          ? PROMPTS.q4Retry()
          : PROMPTS.q4Readiness();

      case STATES.MICRO_PITCH:
        return PROMPTS.microPitch(this.ctx.problemType || "unclear");

      case STATES.SEND_LINK:
        return this.ctx.linkSent
          ? PROMPTS.alreadySentLink()
          : PROMPTS.sendLink();

      case STATES.COMMITMENT_CHECK:
        return PROMPTS.commitmentCheck();

      case STATES.CLOSE:
        if (this.ctx.closedReason === "busy") return PROMPTS.closeBusy();
        if (this.ctx.closedReason === "positive") return PROMPTS.closePositive();
        return PROMPTS.closeSoft();

      default:
        return PROMPTS.closeSoft();
    }
  }

  nextAfterBotUtterance() {
    switch (this.state) {
      case STATES.START:
        this.state = STATES.PERMISSION;
        break;
      case STATES.MICRO_PITCH:
        this.state = STATES.SEND_LINK;
        break;
      case STATES.SEND_LINK:
        this.state = STATES.COMMITMENT_CHECK;
        break;
      case STATES.CLOSE:
        this.state = STATES.ENDED;
        break;
      default:
        break;
    }
  }

  markLinkSent() {
    if (!this.ctx.linkSent) {
      this.ctx.linkSent = true;
      this.ctx.linkSentAt = new Date().toISOString();
    }
  }

  forceSendLinkAndClose(reason = "soft") {
    this.ctx.closedReason = reason;
    if (!this.ctx.linkSent && APP.AUTO_SEND_LINK_ON_EXIT) {
      this.state = STATES.SEND_LINK;
      return { action: "SEND_LINK_FIRST" };
    }
    this.state = STATES.CLOSE;
    return { action: "CLOSE_NOW" };
  }

  processUserIntent(result = { intent: INTENTS.UNKNOWN, raw: "" }) {
    const { intent, raw } = result;
    this.stepCount += 1;
    this.log({ type: "user", intent, raw });

    if (!this.canContinue()) {
      this.ctx.closedReason = "soft";
      this.state = STATES.CLOSE;
      return { nextState: this.state };
    }

    if (intent === INTENTS.ASK_WHO_ARE_YOU) {
      return { immediateReply: PROMPTS.whoAreYou() };
    }

    if (intent === INTENTS.ASK_LINK) {
      this.state = STATES.SEND_LINK;
      return { nextState: this.state };
    }

    if (intent === INTENTS.BUSY) {
      this.ctx.closedReason = "busy";
      this.state = STATES.SEND_LINK;
      return { nextState: this.state };
    }

    if (intent === INTENTS.SILENCE || intent === INTENTS.UNKNOWN) {
      this.unknownStreak += 1;

      if (
        [STATES.Q1_BUSINESS_TYPE, STATES.Q2_NICHE, STATES.Q3_CHALLENGE, STATES.Q4_READINESS].includes(this.state) &&
        this.getRetryCount(this.state) < APP.MAX_RETRIES_PER_STATE
      ) {
        this.bumpRetry(this.state);
        return { nextState: this.state, retry: true };
      }

      if (this.unknownStreak >= APP.MAX_UNKNOWN_STREAK) {
        this.ctx.closedReason = "soft";
        this.state = STATES.SEND_LINK;
        return { nextState: this.state };
      }

      return { nextState: this.state };
    }

    this.unknownStreak = 0;

    switch (this.state) {
      case STATES.PERMISSION:
        if (intent === INTENTS.AFFIRMATIVE) {
          this.state = STATES.Q1_BUSINESS_TYPE;
        } else if (intent === INTENTS.NEGATIVE) {
          this.ctx.closedReason = "soft";
          this.state = STATES.SEND_LINK;
        } else {
          this.state = STATES.Q1_BUSINESS_TYPE;
        }
        return { nextState: this.state };

      case STATES.Q1_BUSINESS_TYPE:
        if (intent === INTENTS.SERVICE) {
          this.ctx.businessType = "service";
          this.state = STATES.Q2_NICHE;
        } else if (intent === INTENTS.PRODUCT) {
          this.ctx.businessType = "product";
          this.state = STATES.Q2_NICHE;
        } else if (intent === INTENTS.MIXED) {
          this.ctx.businessType = "mixed";
          this.state = STATES.Q2_NICHE;
        } else {
          this.ctx.businessType = "unknown";
          this.state = STATES.Q2_NICHE;
        }
        return { nextState: this.state };

      case STATES.Q2_NICHE:
        if (intent === INTENTS.AGENCY) this.ctx.nicheBucket = "agency";
        else if (intent === INTENTS.REAL_ESTATE)
          this.ctx.nicheBucket = "real_estate";
        else if (intent === INTENTS.COACH)
          this.ctx.nicheBucket = "coach_consultant";
        else if (intent === INTENTS.LOCAL_BUSINESS)
          this.ctx.nicheBucket = "local_business";
        else if (intent === INTENTS.ECOMMERCE)
          this.ctx.nicheBucket = "ecommerce";
        else this.ctx.nicheBucket = "other";

        this.state = STATES.Q3_CHALLENGE;
        return { nextState: this.state };

      case STATES.Q3_CHALLENGE:
        if (intent === INTENTS.LEAD_PROBLEM)
          this.ctx.problemType = "lead_generation";
        else if (intent === INTENTS.CONVERSION_PROBLEM)
          this.ctx.problemType = "low_conversion";
        else if (intent === INTENTS.SYSTEM_PROBLEM)
          this.ctx.problemType = "operations_system";
        else this.ctx.problemType = "unclear";

        this.state = STATES.Q4_READINESS;
        return { nextState: this.state };

      case STATES.Q4_READINESS:
        if (intent === INTENTS.READY || intent === INTENTS.AFFIRMATIVE) {
          this.ctx.readiness = "ready";
          this.state = STATES.MICRO_PITCH;
        } else if (
          intent === INTENTS.NOT_READY ||
          intent === INTENTS.NEGATIVE
        ) {
          this.ctx.readiness = "not_ready";
          this.ctx.closedReason = "soft";
          this.state = STATES.SEND_LINK;
        } else {
          this.ctx.readiness = "unknown";
          this.state = STATES.MICRO_PITCH;
        }
        return { nextState: this.state };

      case STATES.COMMITMENT_CHECK:
        if (intent === INTENTS.TODAY) {
          this.ctx.commitment = "today";
          this.ctx.closedReason = "positive";
        } else if (intent === INTENTS.TOMORROW) {
          this.ctx.commitment = "tomorrow";
          this.ctx.closedReason = "positive";
        } else if (intent === INTENTS.LATER) {
          this.ctx.commitment = "later";
          this.ctx.closedReason = "soft";
        } else if (intent === INTENTS.NEGATIVE) {
          this.ctx.commitment = "not_ready";
          this.ctx.closedReason = "soft";
        } else {
          this.ctx.commitment = "unknown";
          this.ctx.closedReason = "soft";
        }

        this.state = STATES.CLOSE;
        return { nextState: this.state };

      default:
        this.state = STATES.CLOSE;
        return { nextState: this.state };
    }
  }
}

module.exports = {
  ConversationStateEngine,
};
