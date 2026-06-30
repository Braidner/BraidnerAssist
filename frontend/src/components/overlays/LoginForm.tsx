import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { getSetupRequired, login, setupAdmin } from "../../lib/auth.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onSuccess: (user: import("../../lib/auth.ts").CurrentUser) => void;
}

export function LoginForm({ onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSetupRequired().then(setSetupMode);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (setupMode && password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setLoading(true);
    const user = setupMode
      ? await setupAdmin({ username, password, displayName })
      : await login(username, password);
    setLoading(false);
    if (user) {
      onSuccess(user);
    } else {
      setError(setupMode ? "Не удалось создать администратора" : "Неверный логин или пароль");
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
            {setupMode ? "создание администратора" : "braidner · self-hosted · LAN-only"}
          </div>
        </div>

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

          {setupMode && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-data uppercase tracking-4 text-muted">
                Имя
              </Label>
              <Input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Admin"
              />
            </div>
          )}

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

          {setupMode && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-data uppercase tracking-4 text-muted">
                Повтор пароля
              </Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}

          {error && <div className="text-center text-xs text-bad">{error}</div>}

          <Button
            type="submit"
            className="mt-1 w-full"
            disabled={
              loading ||
              !username ||
              password.length < 6 ||
              (setupMode && !confirm)
            }
          >
            {loading ? "Секунду…" : setupMode ? "Создать администратора" : "Войти"}
          </Button>
        </form>
      </div>
    </div>
  );
}
