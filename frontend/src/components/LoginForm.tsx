import { useState } from "react";
import { login } from "../lib/auth.ts";

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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--surface)",
      }}
    >
      <div
        className="neu"
        style={{
          width: 360,
          borderRadius: "var(--radius)",
          padding: "40px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center" }}>
          <div
            className="brand-mark neu-sm"
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="21" />
              <line x1="3" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.5px" }}>
            Mission Control
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            braidner · self-hosted · LAN-only
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
              Логин
            </label>
            <input
              className="note-input"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ fontSize: 14, padding: "10px 14px" }}
              placeholder="username"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
              Пароль
            </label>
            <input
              className="note-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ fontSize: 14, padding: "10px 14px" }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "var(--bad)", textAlign: "center" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              marginTop: 4,
              padding: "11px 0",
              borderRadius: "calc(var(--radius) * 0.65)",
              background: "var(--accent)",
              color: "var(--accent-ink)",
              fontFamily: "var(--font-ui)",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: loading ? "wait" : "pointer",
              opacity: !username || !password ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
