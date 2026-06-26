import { useState } from "react";
import { login } from "../../lib/auth.ts";
import { ui } from "../../lib/ui.ts";

interface Props {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) {
      onSuccess();
    } else {
      setError("Неверный логин или пароль");
    }
  }

  return (
    <div className="grid min-h-screen w-full place-items-center bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_32%),var(--page)] px-4">
      <div className="w-[min(390px,100%)] rounded-card border border-hair bg-raise p-7">
        {/* Logo */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 grid size-14 place-items-center rounded-2xl border border-hair bg-surface text-accent">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="21" />
              <line x1="3" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <div className="font-mono text-lg font-bold uppercase tracking-[0.16em] text-ink">
            Mission Control
          </div>
          <div className="mt-1 text-xs tracking-[0.08em] text-muted">
            braidner · self-hosted · LAN-only
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-[0.12em] text-muted">
              Логин
            </label>
            <input
              className={ui.input}
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-[0.12em] text-muted">
              Пароль
            </label>
            <input
              className={ui.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="text-center text-xs text-bad">{error}</div>}

          <button
            type="submit"
            className={`${ui.button.base} ${ui.button.accent} mt-1 w-full`}
            disabled={loading || !username || !password}
            style={{ opacity: !username || !password ? 0.5 : 1 }}
          >
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
