const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("colyseus");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { WorldRoom } = require("./WorldRoom");

const port = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Satu dunia bersama; semua pemain join ke room "world".
gameServer.define("world", WorldRoom).filterBy([]);

gameServer.listen(port).then(() => {
  console.log(`Colyseus server berjalan di ws://localhost:${port}`);
});
