import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock3,
  KeyRound,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  approveUser,
  createUser,
  deleteUser,
  getServicesConfig,
  getUsers,
  getJellyfinUsers,
  getEnvSettings,
  putServicesConfig,
  putEnvSettings,
  resetUserDownloadLimit,
  updateUser,
  updateUserDownloadLimits,
  type AppUser,
  type EnvField,
  type EnvSettings,
  type EnvUpdateResult,
  type JellyfinUserRef,
  type ServiceConfig,
} from "@/lib/api";
import type { UserRole } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { ui } from "@/lib/ui";
import { UserActivityTab } from "./UserActivityTab";

const roleLabel: Record<UserRole, string> = {
  admin: "Админ",
  media: "Медиа",
};

export function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-6 max-mob:px-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-label uppercase tracking-5 text-muted">
            Pultra
          </div>
          <h1 className="mt-1 text-[28px] font-bold leading-tight text-ink">
            Настройки
          </h1>
        </div>
      </header>

      <Tabs defaultValue="users" className="gap-5">
        <TabsList
          variant="line"
          className="w-full justify-start gap-7 overflow-x-auto border-b border-hair pb-0"
        >
          <TabsTrigger value="users" className="h-9 px-1">
            Пользователи
          </TabsTrigger>
          <TabsTrigger value="services" className="h-9 px-1">
            Сервисы
          </TabsTrigger>
          <TabsTrigger value="env" className="h-9 px-1">
            Env
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="services">
          <ServicesTab />
        </TabsContent>
        <TabsContent value="env">
          <EnvTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function EnvTab() {
  const [settings, setSettings] = useState<EnvSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnvUpdateResult | null>(null);

  const load = async () => {
    const next = await getEnvSettings();
    setSettings(next);
    setDraft(
      Object.fromEntries(
        next.groups.flatMap((group) =>
          group.fields.map((field) => [field.key, field.type === "secret" ? "" : field.value]),
        ),
      ),
    );
    setDirty(new Set());
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"));
  }, []);

  const mark = (key: string, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty((current) => new Set(current).add(key));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const payload = Object.fromEntries([...dirty].map((key) => [key, draft[key] ?? ""]));
      const saved = await putEnvSettings(payload);
      setResult(saved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <section className={ui.panel}>Загружаю env…</section>;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className={cn(ui.panel, "flex flex-wrap items-center justify-between gap-3 py-4")}>
        <div className="min-w-0">
          <div className={ui.panelTitle}>
            <KeyRound className="size-4" />
            Runtime env
          </div>
          <div className="mt-1 truncate font-mono text-label text-muted" title={settings.envFilePath}>
            {settings.envFilePath}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!settings.writable && (
            <Badge variant="bad">
              <AlertTriangle className="size-3" />
              Нет записи
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => load()} disabled={saving}>
            <RotateCcw />
            Обновить
          </Button>
          <Button onClick={save} disabled={saving || dirty.size === 0 || !settings.writable}>
            <Save />
            {saving ? "Сохраняю" : `Сохранить${dirty.size ? ` (${dirty.size})` : ""}`}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-body text-bad">{error}</div>}
      {result?.warnings.length ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-body text-warn">
          {result.warnings.join(" ")}
        </div>
      ) : result?.applied ? (
        <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-body text-ok">
          Runtime-настройки применены.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {settings.groups.map((group) => (
          <div key={group.id} className={ui.panel}>
            <div className={ui.panelHead}>
              <div className={ui.panelTitle}>{group.title}</div>
              <div className={ui.panelCount}>{group.fields.length}</div>
            </div>
            <div className="grid gap-3">
              {group.fields.map((field) => (
                <EnvFieldRow
                  key={field.key}
                  field={field}
                  value={draft[field.key] ?? ""}
                  dirty={dirty.has(field.key)}
                  onChange={(value) => mark(field.key, value)}
                  onClear={() => mark(field.key, "")}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvFieldRow({
  field,
  value,
  dirty,
  onChange,
  onClear,
}: {
  field: EnvField;
  value: string;
  dirty: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const restart = field.requiresRestart || field.serviceRecreate;
  return (
    <label className="grid gap-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-mono text-label uppercase tracking-3 text-muted">
          {field.label}
        </span>
        <span className="flex items-center gap-1.5">
          {dirty && <Badge variant="accent">changed</Badge>}
          {restart && <Badge variant="warn">{field.serviceRecreate ? "recreate" : "restart"}</Badge>}
          {field.runtime && <Badge variant="outline">runtime</Badge>}
        </span>
      </div>
      <div className="flex gap-2">
        <Input
          className="font-mono text-xs"
          type={field.type === "number" ? "number" : field.type === "secret" ? "password" : "text"}
          value={value}
          placeholder={field.type === "secret" ? field.maskedValue || "не задано" : field.value || "не задано"}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.type === "secret" && field.hasValue && (
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Очистить
          </Button>
        )}
      </div>
      <div className="font-mono text-[10px] tracking-1 text-muted">{field.key}</div>
    </label>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [jellyfinUsers, setJellyfinUsers] = useState<JellyfinUserRef[]>([]);
  const [draft, setDraft] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "media" as UserRole,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityRefresh, setActivityRefresh] = useState(0);

  const reload = () => Promise.all([getUsers(), getJellyfinUsers()]).then(([nextUsers, nextJellyfinUsers]) => {
    setUsers(nextUsers);
    setJellyfinUsers(nextJellyfinUsers);
  });

  useEffect(() => {
    reload();
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await reload();
      setActivityRefresh((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(null);
    }
  };

  const addUser = () =>
    run("create", async () => {
      await createUser(draft);
      setDraft({ username: "", displayName: "", password: "", role: "media" });
    });

  const pendingUsers = users.filter((user) => user.approvalStatus === "pending");
  const approvedUsers = users.filter((user) => user.approvalStatus === "approved");

  return (
    <section className="flex flex-col gap-5">
      <PendingUsersPanel
        users={pendingUsers}
        busy={busy}
        onApprove={(id, role) =>
          run(`approve-${id}`, () => approveUser(id, role).then(() => undefined))
        }
        onDelete={(id) => run(`delete-${id}`, () => deleteUser(id))}
      />

      {error && (
        <div className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-body text-bad">
          {error}
        </div>
      )}

      <UserActivityTab
        admin={{
          users: approvedUsers,
          jellyfinUsers,
          busy,
          refreshKey: activityRefresh,
          onUpdate: (id, input) =>
            run(`update-${id}`, () => updateUser(id, input).then(() => undefined)),
          onDelete: (id) => run(`delete-${id}`, () => deleteUser(id)),
          onLimits: (id, limits) =>
            run(`limits-${id}`, () =>
              updateUserDownloadLimits(id, limits).then(() => undefined),
            ),
          onReset: (id, period) =>
            run(`reset-${id}-${period}`, () =>
              resetUserDownloadLimit(id, period).then(() => undefined),
            ),
        }}
      />

      <aside className={ui.panel}>
          <div className={ui.panelHead}>
            <div className={ui.panelTitle}>
              <UserRound className="size-4" />
              Новый пользователь
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Логин">
              <Input
                autoComplete="off"
                value={draft.username}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              />
            </Field>
            <Field label="Имя">
              <Input
                value={draft.displayName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, displayName: e.target.value }))
                }
              />
            </Field>
            <Field label="Пароль">
              <Input
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
              />
            </Field>
            <Field label="Роль">
              <RoleSelect
                value={draft.role}
                onChange={(role) => setDraft((d) => ({ ...d, role }))}
              />
            </Field>
            <div className="rounded-[10px] border border-hair bg-groove px-3 py-2 text-cell text-ink-soft sm:col-span-2 lg:col-span-3">
              Jellyfin-профиль будет создан или привязан автоматически по логину.
            </div>
            <Button
              className="self-end"
              onClick={addUser}
              disabled={busy === "create" || !draft.username || draft.password.length < 6}
            >
              <Plus />
              Создать
            </Button>
          </div>
      </aside>
    </section>
  );
}

function PendingUsersPanel({
  users,
  busy,
  onApprove,
  onDelete,
}: {
  users: AppUser[];
  busy: string | null;
  onApprove: (id: string, role: UserRole) => void;
  onDelete: (id: string) => void;
}) {
  if (users.length === 0) {
    return (
      <div className={cn(ui.panel, "flex flex-wrap items-center justify-between gap-3 py-3.5")}>
        <div className="flex items-center gap-2 text-body text-ink-soft">
          <Clock3 className="size-4 text-muted" />
          Новых заявок нет
        </div>
        <span className="text-cell text-muted">
          Регистрации появятся здесь автоматически
        </span>
      </div>
    );
  }

  return (
    <div className={cn(ui.panel, "p-0")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-4">
        <div className={ui.panelTitle}>
          <Clock3 className="size-4 text-warn" />
          Ожидают подтверждения
        </div>
        <Badge variant={users.length ? "warn" : "outline"}>{users.length}</Badge>
      </div>

      <div className="divide-y divide-hair">
        {users.map((user) => (
          <PendingUserRow
            key={user.id}
            user={user}
            busy={busy}
            onApprove={onApprove}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function PendingUserRow({
  user,
  busy,
  onApprove,
  onDelete,
}: {
  user: AppUser;
  busy: string | null;
  onApprove: (id: string, role: UserRole) => void;
  onDelete: (id: string) => void;
}) {
  const [role, setRole] = useState<UserRole>("media");
  const approving = busy === `approve-${user.id}`;
  const deleting = busy === `delete-${user.id}`;

  return (
    <div className="grid items-center gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_150px_auto]">
      <div className="min-w-0">
        <div className="truncate text-body font-semibold text-ink">
          {user.displayName || user.username}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-cell text-ink-soft">
          <span>@{user.username}</span>
          <span>
            Заявка {new Date(user.createdAt).toLocaleDateString("ru-RU")}
          </span>
        </div>
      </div>

      <Field label="Роль после подтверждения">
        <RoleSelect
          value={role}
          ariaLabel="Роль после подтверждения"
          onChange={setRole}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-2 md:self-end">
        <Button
          variant="destructive"
          size="sm"
          disabled={approving || deleting}
          onClick={() => onDelete(user.id)}
        >
          <Trash2 />
          Отклонить
        </Button>
        <Button
          size="sm"
          disabled={approving || deleting}
          onClick={() => onApprove(user.id, role)}
        >
          <Check />
          {approving ? "Подтверждаю…" : "Подтвердить"}
        </Button>
      </div>
    </div>
  );
}

function RoleSelect({
  value,
  ariaLabel,
  onChange,
}: {
  value: UserRole;
  ariaLabel?: string;
  onChange: (role: UserRole) => void;
}) {
  return (
    <Select value={value} onValueChange={(role) => onChange(role as UserRole)}>
      <SelectTrigger className="w-full bg-surface" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">{roleLabel.admin}</SelectItem>
        <SelectItem value="media">{roleLabel.media}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ServicesTab() {
  const [rows, setRows] = useState<ServiceConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getServicesConfig().then(setRows);
  }, []);

  const update = (i: number, field: keyof ServiceConfig, value: string) =>
    setRows((rs) =>
      rs.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await putServicesConfig(rows.filter((row) => row.name.trim() && row.url.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={ui.panel}>
      <div className={ui.panelHead}>
        <div className={ui.panelTitle}>Homelab Services</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((rs) => [...rs, { name: "", url: "" }])}
        >
          <Plus />
          Добавить
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 max-md:grid-cols-1">
            <Input
              placeholder="Имя"
              value={row.name}
              onChange={(e) => update(i, "name", e.target.value)}
            />
            <Input
              className="font-mono text-xs"
              placeholder="http://host:port"
              value={row.url}
              onChange={(e) => update(i, "url", e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted hover:text-bad"
              onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      {error && <div className="mt-3 text-cell text-bad">{error}</div>}

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save />
          {saving ? "Сохраняю" : "Сохранить"}
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label className="font-mono text-label uppercase tracking-3 text-muted">
        {label}
      </Label>
      {children}
    </label>
  );
}
