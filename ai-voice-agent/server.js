require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const { WebSocketServer } = require("ws");

const callRoutes = require("./routes/call");
const exotelRoutes = require("./routes/exotel");
const { attachVoicebotWebSocket } = require("./services/voicebotWs");

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/api/call", callRoutes);
app.use("/api/exotel", exotelRoutes);

app.get('/api/exotel/voicebot-url', (req, res) => {
  const { lead_id, session_id } = req.query;

  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN;

  const wsUrl = `wss://${baseUrl}/ws/exotel?lead_id=${lead_id}&session_id=${session_id}`;

  console.log("Voicebot URL requested:", wsUrl);

  res.send(wsUrl);
});




  
});


  
});

const server = http.createServer(app);

// WebSocket server for Exotel Voicebot
const wss = new WebSocketServer({ server, path: "/ws/exotel" });
attachVoicebotWebSocket(wss);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
