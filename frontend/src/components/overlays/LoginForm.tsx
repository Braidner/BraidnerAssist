import { useEffect, useState } from "react";
import { Clock3, Target } from "lucide-react";
import { getSetupRequired, login, register, setupAdmin } from "../../lib/auth.ts";
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
  const [registerMode, setRegisterMode] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSetupRequired().then(setSetupMode);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if ((setupMode || registerMode) && password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setLoading(true);
    if (setupMode) {
      const user = await setupAdmin({ username, password, displayName });
      setLoading(false);
      if (user) onSuccess(user);
      else setError("Не удалось создать администратора");
      return;
    }
    if (registerMode) {
      const result = await register({ username, password, displayName });
      setLoading(false);
      if (result.ok) {
        setRegistrationPending(true);
      } else {
        setError(
          result.error === "username already exists"
            ? "Такой логин уже занят"
            : result.error === "password must be at least 6 chars"
              ? "Пароль должен содержать минимум 6 символов"
              : "Не удалось зарегистрироваться",
        );
      }
      return;
    }

    const result = await login(username, password);
    setLoading(false);
    if (result.user) {
      onSuccess(result.user);
    } else {
      const messages = {
        approval_pending: "Регистрация ожидает подтверждения администратора",
        user_disabled: "Учётная запись отключена администратором",
        invalid_credentials: "Неверный логин или пароль",
        unknown: "Не удалось войти. Проверьте подключение к серверу",
      };
      setError(messages[result.error ?? "unknown"]);
    }
  }

  const switchMode = (nextRegisterMode: boolean) => {
    setRegisterMode(nextRegisterMode);
    setRegistrationPending(false);
    setError("");
    setPassword("");
    setConfirm("");
  };

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
            {setupMode
              ? "создание администратора"
              : registerMode
                ? "новая учётная запись"
                : "braidner · self-hosted · LAN-only"}
          </div>
        </div>

        {registrationPending ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="grid size-12 place-items-center rounded-full border border-warn/30 bg-warn/10 text-warn">
              <Clock3 className="size-5" />
            </div>
            <div>
              <h1 className="text-title font-semibold text-ink">Регистрация отправлена</h1>
              <p className="mt-2 text-body text-ink-soft">
                Администратор должен подтвердить учётную запись и назначить роль. После этого
                можно будет войти.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => switchMode(false)}
            >
              Вернуться ко входу
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-username" className="text-data uppercase tracking-4 text-muted">
              Логин
            </Label>
            <Input
              id="auth-username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          </div>

          {(setupMode || registerMode) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-display-name" className="text-data uppercase tracking-4 text-muted">
                Имя
              </Label>
              <Input
                id="auth-display-name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Admin"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-password" className="text-data uppercase tracking-4 text-muted">
              Пароль
            </Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={setupMode || registerMode ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {(setupMode || registerMode) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-password-confirm" className="text-data uppercase tracking-4 text-muted">
                Повтор пароля
              </Label>
              <Input
                id="auth-password-confirm"
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
              ((setupMode || registerMode) && !confirm)
            }
          >
            {loading
              ? "Секунду…"
              : setupMode
                ? "Создать администратора"
                : registerMode
                  ? "Зарегистрироваться"
                  : "Войти"}
          </Button>

          {!setupMode && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => switchMode(!registerMode)}
            >
              {registerMode ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
            </Button>
          )}
        </form>
        )}
      </div>
    </div>
  );
}
