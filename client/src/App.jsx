import { useState } from "react";
import LoginScreen from "./components/LoginScreen.jsx";
import GameCanvas from "./components/GameCanvas.jsx";
import { joinWorld } from "./game/network.js";

export default function App() {
  const [session, setSession] = useState(null); // { room, config, name }
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async (name, cls) => {
    setConnecting(true);
    setError("");
    try {
      const { room, config } = await joinWorld(name, cls);
      setSession({ room, config, name });
    } catch (e) {
      console.error(e);
      setError("Gagal terhubung ke server. Pastikan server Colyseus sudah berjalan.");
    } finally {
      setConnecting(false);
    }
  };

  const handleLeave = () => {
    if (session) {
      try {
        session.room.leave();
      } catch {}
    }
    setSession(null);
  };

  if (!session) return <LoginScreen onJoin={handleJoin} connecting={connecting} error={error} />;
  return <GameCanvas {...session} onLeave={handleLeave} />;
}
