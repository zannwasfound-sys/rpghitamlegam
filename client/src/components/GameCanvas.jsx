import { useEffect, useRef, useState } from "react";
import { GameEngine } from "../game/engine.js";
import Hud from "./Hud.jsx";

export default function GameCanvas({ room, config, name, onLeave }) {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState({ online: 1, hp: 100, maxHp: 100, level: 1, exp: 0, expNext: 50, dead: false, cls: "fighter" });
  const [ping, setPing] = useState(0);

  useEffect(() => {
    const engine = new GameEngine(canvasRef.current, room, config, setStats);
    engine.start();
    const t = setInterval(() => setPing(engine.ping), 1000);

    // Bila koneksi putus, kembali ke login
    room.onLeave(() => onLeave());

    return () => {
      clearInterval(t);
      engine.stop();
    };
  }, [room, config]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block cursor-crosshair" />
      <Hud name={name} stats={stats} ping={ping} onLeave={onLeave} />
    </div>
  );
}
