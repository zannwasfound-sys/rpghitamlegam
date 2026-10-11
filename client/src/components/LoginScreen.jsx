import { useEffect, useRef, useState } from "react";
import { CLASS_INFO, drawPreview } from "../game/art.js";
import { audio } from "../game/audio.js";

const ORDER = ["fighter", "mage", "marksman", "support"];

// Kartu class dengan preview karakter beranimasi (menyerang berkala)
function Preview({ cls }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext("2d");
    let raf;
    const loop = (t) => {
      drawPreview(ctx, c.width, c.height, cls, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cls]);
  return <canvas ref={ref} width={200} height={190} className="h-[150px] w-full" />;
}

function StatBars({ stats, accent }) {
  return (
    <div className="mt-2 space-y-1">
      {Object.entries(stats).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="w-16">{k}</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="h-1.5 w-4 rounded-sm" style={{ background: i <= v ? accent : "rgba(255,255,255,0.1)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LoginScreen({ onJoin, connecting, error }) {
  const [name, setName] = useState("");
  const [cls, setCls] = useState("fighter");

  const submit = (e) => {
    e.preventDefault();
    audio.unlock(); // butuh gesture user agar suara bisa dimainkan
    audio.play("click");
    if (!connecting) onJoin(name.trim() || "Hero", cls);
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur sm:p-8">
        <h1 className="text-center text-3xl font-extrabold tracking-tight text-amber-400">Dungeon RPG</h1>
        <p className="mt-1 text-center text-sm text-slate-400">Pilih class dan senjatamu</p>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ORDER.map((id) => {
            const info = CLASS_INFO[id];
            const active = cls === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  audio.unlock();
                  audio.play("click");
                  setCls(id);
                }}
                className="rounded-xl border p-3 text-left transition hover:bg-white/5"
                style={{ borderColor: active ? info.accent : "rgba(255,255,255,0.1)", background: active ? "rgba(255,255,255,0.06)" : "transparent", boxShadow: active ? `0 0 0 1px ${info.accent}` : "none" }}
              >
                <Preview cls={id} />
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold" style={{ color: info.accent }}>{info.name}</span>
                  <span className="text-[11px] text-slate-400">{info.role}</span>
                </div>
                <div className="mt-0.5 text-xs font-semibold text-slate-200">{info.weapon}</div>
                <p className="mt-1 text-[11px] leading-snug text-slate-400">{info.desc}</p>
                <StatBars stats={info.stats} accent={info.accent} />
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-6 max-w-sm">
          <label className="block text-sm font-medium text-slate-300" htmlFor="name">
            Nama karakter
          </label>
          <input
            id="name"
            autoFocus
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hero"
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none focus:border-amber-400"
          />

          {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={connecting}
            className="mt-5 w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {connecting ? "Menghubungkan..." : `Masuk sebagai ${CLASS_INFO[cls].name}`}
          </button>
        </div>
      </form>
    </div>
  );
}
