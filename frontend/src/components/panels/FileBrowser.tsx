// Media v2 (Фаза 3) — файловый менеджер медиатеки (таб «Система»). Навигация по
// папкам, создание/переименование/перемещение/удаление. Все операции заперты в
// MEDIA_ROOT на бэкенде. Не настроен MEDIA_ROOT → секция не показывается.

import { useEffect, useState } from "react";
import { Card } from "../ui/Card.tsx";
import {
  listFiles,
  fsMkdir,
  fsRename,
  fsMove,
  fsDelete,
  type FileEntry,
  type FileListing,
} from "../../lib/api.ts";
import { fmtSize } from "../../pages/media/shared/mediaShared.tsx";
import { cn } from "../../lib/cn.ts";
import { ui } from "../../lib/ui.ts";
import { useToast } from "../ui/Toast.tsx";

const fmtDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : "";
const icon = (e: FileEntry) =>
  e.type === "dir"
    ? "📁"
    : /mkv|mp4|avi|m4v|mov|ts|webm|wmv/.test(e.ext)
      ? "🎬"
      : /srt|ass|sub|vtt/.test(e.ext)
        ? "💬"
        : "📄";

const emptyState = "py-3 font-mono text-xs text-muted";
const fileRow =
  "flex flex-row items-center gap-2.5 border-b border-hair py-2.5 last:border-b-0";
const fileTitle =
  "min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-body font-semibold text-ink disabled:cursor-default enabled:cursor-pointer";
const fileMeta = "whitespace-nowrap font-mono text-data text-muted";

export function FileBrowser() {
  const toast = useToast();
  const [cwd, setCwd] = useState("");
  const [data, setData] = useState<FileListing | null | "loading" | "off">(
    "loading",
  );
  const [busy, setBusy] = useState(false);

  const load = (p: string) => {
    setData("loading");
    listFiles(p).then((r) => setData(r ?? "off"));
  };
  useEffect(() => {
    load(cwd);
  }, [cwd]);

  const reload = () => load(cwd);

  if (data === "off") return null; // MEDIA_ROOT не настроен — не показываем

  const crumbs = cwd ? cwd.split("/") : [];
  const go = (i: number) => setCwd(crumbs.slice(0, i + 1).join("/"));

  const run = async (fn: () => Promise<boolean>, okMsg: string) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) {
      toast.success(okMsg);
      reload();
    } else toast.error("Операция не удалась");
  };

  const onMkdir = () => {
    const name = window.prompt("Имя новой папки:");
    if (name?.trim()) run(() => fsMkdir(cwd, name.trim()), "Папка создана");
  };
  const onRename = (e: FileEntry) => {
    const name = window.prompt("Новое имя:", e.name);
    if (name?.trim() && name !== e.name)
      run(() => fsRename(e.path, name.trim()), "Переименовано");
  };
  const onMove = (e: FileEntry) => {
    const dest = window.prompt(
      "Переместить в папку (путь от корня медиатеки):",
      cwd,
    );
    if (dest != null) run(() => fsMove(e.path, dest.trim()), "Перемещено");
  };
  const onDelete = (e: FileEntry) => {
    if (
      window.confirm(
        `Удалить «${e.name}»${e.type === "dir" ? " и всё внутри" : ""}? Действие необратимо.`,
      )
    ) {
      run(() => fsDelete(e.path), "Удалено");
    }
  };

  return (
    <Card
      icon="server"
      title="Файлы медиатеки"
      action={
        <div className="flex gap-2">
          <button className={ui.button.sm} disabled={busy} onClick={onMkdir}>
            + Папка
          </button>
          <button className={ui.button.sm} disabled={busy} onClick={reload}>
            ↻
          </button>
        </div>
      }
    >
      {/* breadcrumb */}
      <div className="mb-2.5 mt-0 flex flex-wrap gap-1.5">
        <button
          className={ui.button.sm}
          disabled={!cwd}
          onClick={() => setCwd("")}
        >
          🏠 корень
        </button>
        {crumbs.map((c, i) => (
          <button
            key={i}
            className={ui.button.sm}
            disabled={i === crumbs.length - 1}
            onClick={() => go(i)}
          >
            {c}
          </button>
        ))}
      </div>

      {data === "loading" ? (
        <div className={emptyState}>Загружаем…</div>
      ) : !data ? (
        <div className={emptyState}>Не удалось прочитать папку.</div>
      ) : data.entries.length === 0 ? (
        <div className={emptyState}>Папка пуста.</div>
      ) : (
        <div className="flex flex-col">
          {data.entries.map((e) => (
            <div key={e.path} className={fileRow}>
              <button
                className={fileTitle}
                title={e.name}
                disabled={e.type !== "dir"}
                onClick={() => e.type === "dir" && setCwd(e.path)}
              >
                {icon(e)} {e.name}
              </button>
              <span className={fileMeta}>
                {e.type === "file" ? fmtSize(e.size) : ""}
                {e.mtime ? ` · ${fmtDate(e.mtime)}` : ""}
              </span>
              <div className="flex gap-1.5">
                <button
                  className={cn(ui.button.iconSm, "text-body")}
                  title="Переименовать"
                  disabled={busy}
                  onClick={() => onRename(e)}
                >
                  ✏️
                </button>
                <button
                  className={cn(ui.button.iconSm, "text-body")}
                  title="Переместить"
                  disabled={busy}
                  onClick={() => onMove(e)}
                >
                  ➡️
                </button>
                <button
                  className={cn(ui.button.iconSm, "text-body")}
                  title="Удалить"
                  disabled={busy}
                  onClick={() => onDelete(e)}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
