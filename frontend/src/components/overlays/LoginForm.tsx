import { useEffect, useState } from "react";
import { Clock3, Target } from "lucide-react";
import { getSetupRequired, login, register, setupAdmin } from "../../lib/auth.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onSuccess: (user: import("../../lib/auth.ts").CurrentUser) => void;
}

type AuthErrorTarget =
  | "credentials"
  | "username"
  | "password"
  | "confirm"
  | "form";

function BrandLockup({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-7 flex flex-col items-center text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-2xl border border-hair bg-surface text-accent">
        <Target className="size-6" />
      </div>
      <h1 className="m-0 font-mono text-lg font-bold uppercase tracking-5 text-ink">
        Mission Control
      </h1>
      <div className="mt-1 text-xs tracking-3 text-ink-soft">{subtitle}</div>
    </div>
  );
}

export function SessionLoadingScreen() {
  return (
    <div className="auth-screen grid min-h-screen min-h-dvh w-full place-items-center bg-page px-4">
      <div className="w-[min(390px,100%)] rounded-card border border-hair bg-raise p-7 max-mob:p-6">
        <BrandLockup subtitle="braidner · self-hosted · LAN-only" />
        <div
          className="flex items-center justify-center gap-2.5 text-body text-ink-soft"
          role="status"
          aria-live="polite"
        >
          <span className="size-2 animate-pulse rounded-full bg-accent shadow-[var(--accent-glow-sm)] motion-reduce:animate-none" />
          Проверяем сессию…
        </div>
      </div>
    </div>
  );
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
  const [errorTarget, setErrorTarget] = useState<AuthErrorTarget | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameInvalid = errorTarget === "credentials" || errorTarget === "username";
  const passwordInvalid = errorTarget === "credentials" || errorTarget === "password";
  const confirmInvalid = errorTarget === "confirm";
  const loadingLabel = setupMode
    ? "Создаём администратора…"
    : registerMode
      ? "Отправляем регистрацию…"
      : "Входим…";

  useEffect(() => {
    getSetupRequired().then(setSetupMode);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorTarget(null);
    if ((setupMode || registerMode) && password !== confirm) {
      setError("Пароли не совпадают");
      setErrorTarget("confirm");
      return;
    }
    setLoading(true);
    if (setupMode) {
      const user = await setupAdmin({ username, password, displayName });
      setLoading(false);
      if (user) onSuccess(user);
      else {
        setError("Не удалось создать администратора");
        setErrorTarget("form");
      }
      return;
    }
    if (registerMode) {
      const result = await register({ username, password, displayName });
      setLoading(false);
      if (result.ok) {
        setRegistrationPending(true);
      } else {
        setErrorTarget(
          result.error === "username already exists"
            ? "username"
            : result.error === "password must be at least 6 chars"
              ? "password"
              : "form",
        );
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
      setErrorTarget(result.error === "invalid_credentials" ? "credentials" : "form");
    }
  }

  const clearError = () => {
    setError("");
    setErrorTarget(null);
  };

  const switchMode = (nextRegisterMode: boolean) => {
    setRegisterMode(nextRegisterMode);
    setRegistrationPending(false);
    clearError();
    setPassword("");
    setConfirm("");
  };

  return (
    <div className="auth-screen grid min-h-screen min-h-dvh w-full place-items-center bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_32%),var(--page)] px-4">
      <div className="w-[min(390px,100%)] rounded-card border border-hair bg-raise p-7 max-mob:p-6">
        <BrandLockup
          subtitle={
            setupMode
              ? "создание администратора"
              : registerMode
                ? "новая учётная запись"
                : "braidner · self-hosted · LAN-only"
          }
        />

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
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearError();
              }}
              placeholder="username"
              aria-invalid={usernameInvalid}
              aria-describedby={usernameInvalid ? "auth-error" : undefined}
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
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  clearError();
                }}
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
              required
              minLength={6}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              placeholder="••••••••"
              aria-invalid={passwordInvalid}
              aria-describedby={passwordInvalid ? "auth-error" : undefined}
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
                required
                minLength={6}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  clearError();
                }}
                placeholder="••••••••"
                aria-invalid={confirmInvalid}
                aria-describedby={confirmInvalid ? "auth-error" : undefined}
              />
            </div>
          )}

          {error && (
            <div
              id="auth-error"
              className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-center text-body text-ink"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="mt-1 w-full"
            loading={loading}
            loadingLabel={loadingLabel}
            disabled={
              loading ||
              !username ||
              password.length < 6 ||
              ((setupMode || registerMode) && !confirm)
            }
          >
            {setupMode
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
