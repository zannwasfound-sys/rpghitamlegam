import { useState } from "react";
import { CLASS_INFO } from "../game/art.js";
import { audio } from "../game/audio.js";

function Bar({ label, value, max, from, to }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[11px] font-medium text-slate-300">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="mt-0.5 h-2.5 w-48 overflow-hidden rounded-full bg-black/50">
        <div className={`h-full rounded-full bg-gradient-to-r ${from} ${to} transition-all duration-150`} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

export default function Hud({ name, stats, ping, onLeave }) {
  const [muted, setMuted] = useState(!audio.enabled);
  const [vol, setVol] = useState(audio.volume);
  const info = CLASS_INFO[stats.cls] || CLASS_INFO.fighter;
  const pingColor = ping < 80 ? "text-emerald-400" : ping < 200 ? "text-amber-400" : "text-red-400";

  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/10 bg-slate-900/75 px-4 py-3 text-sm text-slate-200 backdrop-blur">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-amber-400">{name}</span>
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">Lv {stats.level}</span>
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: info.accent }}>
          {info.name} · {info.weapon}
        </div>
        <Bar label="HP" value={stats.hp} max={stats.maxHp} from="from-red-600" to="to-rose-400" />
        <Bar label="EXP" value={stats.exp} max={stats.expNext} from="from-violet-600" to="to-fuchsia-400" />
        <div className="mt-2 flex gap-4 text-xs text-slate-400">
          <span>
            Online: <span className="text-white">{stats.online}</span>
          </span>
          <span>
            Ping: <span className={pingColor}>{ping} ms</span>
          </span>
        </div>
      </div>

      <div className="absolute right-24 top-4 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/75 px-3 py-2 text-sm text-slate-300 backdrop-blur">
        <button
          type="button"
          title="Bisu/nyalakan suara (M)"
          onClick={() => {
            audio.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          {muted || vol === 0 ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={vol}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            audio.setVolume(v);
            setVol(v);
            if (muted && v > 0) {
              audio.setMuted(false);
              setMuted(false);
            }
          }}
          className="h-1 w-20 accent-amber-400"
        />
      </div>

      <button
        onClick={onLeave}
        className="absolute right-4 top-4 rounded-lg border border-white/10 bg-slate-900/75 px-3 py-2 text-sm text-slate-300 backdrop-blur transition hover:bg-slate-800"
      >
        Keluar
      </button>

      {stats.dead && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-red-950/50">
          <div className="text-4xl font-extrabold tracking-wide text-red-300">KAMU KALAH</div>
          <div className="mt-2 text-sm text-red-200/80">Respawn di kota...</div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-900/75 px-4 py-1.5 text-xs text-slate-400 backdrop-blur">
        Gerak: WASD / Panah · Bidik: mouse · Serang: klik / Spasi (tahan) · Suara: M · Kota (ruang kiri) aman dan memulihkan HP
      </div>
    </>
  );
}
