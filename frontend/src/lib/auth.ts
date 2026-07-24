const TOKEN_KEY = "mc-auth-token";

export type UserRole = "admin" | "media";

export interface CurrentUser {
  id: string;
  username: string;
  displayName?: string | null;
  role: UserRole;
}

export type LoginError = "invalid_credentials" | "approval_pending" | "user_disabled" | "unknown";

export interface LoginResult {
  user: CurrentUser | null;
  error?: LoginError;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function getSetupRequired(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/setup-status");
    if (!res.ok) return false;
    const data = (await res.json()) as { setupRequired?: boolean };
    return Boolean(data.setupRequired);
  } catch {
    return false;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      const error: LoginError =
        body.code === "APPROVAL_PENDING"
          ? "approval_pending"
          : body.code === "USER_DISABLED"
            ? "user_disabled"
            : res.status === 401
              ? "invalid_credentials"
              : "unknown";
      return { user: null, error };
    }
    const { token, user } = (await res.json()) as {
      token: string;
      user: CurrentUser;
    };
    setToken(token);
    return { user };
  } catch {
    return { user: null, error: "unknown" };
  }
}

export async function register(input: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network error" };
  }
}

export async function setupAdmin(input: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<CurrentUser | null> {
  try {
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const { token, user } = (await res.json()) as {
      token: string;
      user: CurrentUser;
    };
    setToken(token);
    return user;
  } catch {
    return null;
  }
}
