const WebSocket = require("ws");
const { buildSystemPrompt } = require("./openai");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";

function waitForEvent(ws, wantedTypes, timeoutMs = 15000) {
  const types = Array.isArray(wantedTypes) ? wantedTypes : [wantedTypes];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for event: ${types.join(", ")}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function onClose() {
      cleanup();
      reject(new Error("WebSocket closed before expected event arrived"));
    }

    function onMessage(raw) {
      try {
        const event = JSON.parse(raw.toString());
        console.log("⬅️ OpenAI event:", event.type);

        if (event.type === "error") {
          cleanup();
          reject(new Error(JSON.stringify(event.error || event)));
          return;
        }

        if (types.includes(event.type)) {
          cleanup();
          resolve(event);
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });
}

function appendDelta(event, currentText) {
  let text = currentText;

  // Current documented form
  if (event.type === "response.output_text.delta" && event.delta) {
    text += event.delta;
  }

  // Observed form in your local logs
  if (event.type === "response.text.delta" && event.delta) {
    text += event.delta;
  }

  // Final documented form
  if (event.type === "response.output_text.done" && event.text && !text) {
    text = event.text;
  }

  // Defensive fallback if a final text event arrives in another shape
  if (event.type === "response.text.done" && event.text && !text) {
    text = event.text;
  }

  return text;
}

async function createRealtimeReply(lead, userInput) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment");
  }

  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  await waitForEvent(ws, "session.created", 10000);

  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        instructions: buildSystemPrompt(lead),
        modalities: ["text"],
      },
    })
  );

  await waitForEvent(ws, "session.updated", 10000);

  ws.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: userInput,
          },
        ],
      },
    })
  );

  ws.send(
    JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["text"],
      },
    })
  );

  let finalText = "";

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for model response"));
    }, 20000);

    function cleanup() {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function onClose() {
      cleanup();
      resolve();
    }

    function onMessage(raw) {
      try {
        const event = JSON.parse(raw.toString());
        console.log("⬅️ OpenAI event:", event.type);

        if (event.type === "error") {
          cleanup();
          reject(new Error(JSON.stringify(event.error || event)));
          return;
        }

        finalText = appendDelta(event, finalText);

        if (event.type === "response.done") {
          cleanup();
          resolve();
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });

  try {
    ws.close();
  } catch (_) {}

  return {
    model: REALTIME_MODEL,
    reply: finalText.trim(),
  };
}

async function createRealtimeSession(lead) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment");
  }

  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  await waitForEvent(ws, "session.created", 10000);

  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        instructions: buildSystemPrompt(lead),
        modalities: ["text"],
      },
    })
  );

  await waitForEvent(ws, "session.updated", 10000);

  return ws;
}

async function sendMessage(ws, text) {
  return new Promise((resolve, reject) => {
    let finalText = "";

    function cleanup() {
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function onClose() {
      cleanup();
      resolve(finalText.trim());
    }

    function onMessage(raw) {
      try {
        const event = JSON.parse(raw.toString());

        if (event.type === "error") {
          cleanup();
          reject(new Error(JSON.stringify(event.error || event)));
          return;
        }

        finalText = appendDelta(event, finalText);

        if (event.type === "response.done") {
          cleanup();
          resolve(finalText.trim());
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);

    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text,
            },
          ],
        },
      })
    );

    ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["text"],
        },
      })
    );
  });
}

module.exports = {
  createRealtimeReply,
  createRealtimeSession,
  sendMessage,
};