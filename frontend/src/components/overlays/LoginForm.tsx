import { useState } from "react";
import { Target } from "lucide-react";
import { login } from "../../lib/auth.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
            <Target className="size-6" />
          </div>
          <div className="font-mono text-lg font-bold uppercase tracking-5 text-ink">
            Mission Control
          </div>
          <div className="mt-1 text-xs tracking-3 text-muted">
            braidner · self-hosted · LAN-only
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-data uppercase tracking-4 text-muted">
              Логин
            </Label>
            <Input
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-data uppercase tracking-4 text-muted">
              Пароль
            </Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <div className="text-center text-xs text-bad">{error}</div>}

          <Button
            type="submit"
            className="mt-1 w-full"
            disabled={loading || !username || !password}
          >
            {loading ? "Вход…" : "Войти"}
          </Button>
        </form>
      </div>
    </div>
  );
}
