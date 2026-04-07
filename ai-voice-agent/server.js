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

app.get("/", (req, res) => {
  res.status(200).send("AI Voice Agent Running 🚀");
});

app.use("/api/call", callRoutes);
app.use("/api/exotel", exotelRoutes);

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws/exotel",
});

attachVoicebotWebSocket(wss);

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
