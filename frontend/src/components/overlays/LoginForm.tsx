import { useState } from "react";
import { login } from "../../lib/auth.ts";

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
    <div className="login-wrap">
      <div className="login-card neu">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo-mark brand-mark neu-sm">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="21" />
              <line x1="3" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <div className="login-brand">Mission Control</div>
          <div className="login-sub">braidner · self-hosted · LAN-only</div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label className="login-label">Логин</label>
            <input
              className="note-input login-input-inner"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          </div>

          <div className="login-field">
            <label className="login-label">Пароль</label>
            <input
              className="note-input login-input-inner"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="login-err">{error}</div>}

          <button
            type="submit"
            className="login-btn"
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
