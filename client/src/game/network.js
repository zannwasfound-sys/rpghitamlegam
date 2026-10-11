import { Client } from "colyseus.js";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `ws://${window.location.hostname}:2567`;

// Join room "world" dan tunggu config dari server (kecepatan, ukuran peta, dll).
export async function joinWorld(name, cls) {
  const client = new Client(SERVER_URL);
  const room = await client.joinOrCreate("world", { name, cls });

  const config = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Server tidak mengirim config")), 5000);
    room.onMessage("config", (cfg) => {
      clearTimeout(t);
      resolve(cfg);
    });
    room.send("getConfig");
  });

  return { room, config };
}
