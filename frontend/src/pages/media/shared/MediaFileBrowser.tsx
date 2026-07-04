// Flat media-library file manager for the Media/System tab.

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  File,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  Home,
  MoveRight,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  fsDelete,
  fsMkdir,
  fsMove,
  fsRename,
  listFiles,
  type FileEntry,
  type FileListing,
} from "@/lib/api.ts";
import { cn } from "@/lib/cn.ts";
import { useToast } from "@/components/ui/Toast.tsx";
import { Button } from "@/components/ui/button.tsx";
import { fmtSize } from "./mediaShared.tsx";

const videoExt = new Set(["mkv", "mp4", "avi", "m4v", "mov", "ts", "webm", "wmv"]);
const subtitleExt = new Set(["srt", "ass", "sub", "vtt"]);

function fmtDate(ms: number): string {
  return ms
    ? new Date(ms).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
    : "";
}

function entryIcon(entry: FileEntry) {
  if (entry.type === "dir") return Folder;
  if (videoExt.has(entry.ext)) return FileVideo;
  if (subtitleExt.has(entry.ext)) return FileText;
  return File;
}

function entryKind(entry: FileEntry): string {
  if (entry.type === "dir") return "папка";
  if (videoExt.has(entry.ext)) return "видео";
  if (subtitleExt.has(entry.ext)) return "субтитры";
  return entry.ext || "файл";
}

export function MediaFileBrowser() {
  const toast = useToast();
  const [cwd, setCwd] = useState("");
  const [data, setData] = useState<FileListing | null | "loading" | "off">("loading");
  const [busy, setBusy] = useState(false);

  const load = (path: string) => {
    setData("loading");
    listFiles(path).then((result) => setData(result ?? "off"));
  };

  useEffect(() => {
    load(cwd);
  }, [cwd]);

  const entries = data && data !== "loading" && data !== "off" ? data.entries : [];
  const totalFilesSize = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.type === "file" ? entry.size : 0), 0),
    [entries],
  );
  const crumbs = cwd ? cwd.split("/") : [];
  const reload = () => load(cwd);
  const go = (index: number) => setCwd(crumbs.slice(0, index + 1).join("/"));

  const run = async (fn: () => Promise<boolean>, okMsg: string) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) {
      toast.success(okMsg);
      reload();
    } else {
      toast.error("Операция не удалась");
    }
  };

  const onMkdir = () => {
    const name = window.prompt("Имя новой папки:");
    if (name?.trim()) void run(() => fsMkdir(cwd, name.trim()), "Папка создана");
  };
  const onRename = (entry: FileEntry) => {
    const name = window.prompt("Новое имя:", entry.name);
    if (name?.trim() && name !== entry.name) {
      void run(() => fsRename(entry.path, name.trim()), "Переименовано");
    }
  };
  const onMove = (entry: FileEntry) => {
    const dest = window.prompt("Переместить в папку (путь от корня медиатеки):", cwd);
    if (dest != null) void run(() => fsMove(entry.path, dest.trim()), "Перемещено");
  };
  const onDelete = (entry: FileEntry) => {
    if (!window.confirm(`Удалить «${entry.name}»${entry.type === "dir" ? " и всё внутри" : ""}? Действие необратимо.`)) {
      return;
    }
    void run(() => fsDelete(entry.path), "Удалено");
  };

  if (data === "off") return null;

  return (
    <section className="overflow-hidden rounded-[14px] border border-white/[0.07] bg-white/[0.025]">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-4 max-mob:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-5 text-muted">
            <Folder className="size-4 text-accent" strokeWidth={1.8} />
            Файлы медиатеки
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-2xs text-muted">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-[7px] px-1.5 py-1 text-ink-soft transition-colors hover:bg-white/[0.06] hover:text-ink disabled:pointer-events-none disabled:text-muted"
              disabled={!cwd}
              onClick={() => setCwd("")}
            >
              <Home className="size-3.5" />
              корень
            </button>
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className="inline-flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3 text-white/24" />
                <button
                  type="button"
                  className="max-w-36 truncate rounded-[7px] px-1.5 py-1 text-ink-soft transition-colors hover:bg-white/[0.06] hover:text-ink disabled:pointer-events-none disabled:text-muted"
                  disabled={index === crumbs.length - 1}
                  title={crumb}
                  onClick={() => go(index)}
                >
                  {crumb}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && data !== "loading" ? (
            <span className="whitespace-nowrap rounded-full bg-white/[0.045] px-2.5 py-1 font-mono text-2xs text-muted">
              {entries.length} · {fmtSize(totalFilesSize)}
            </span>
          ) : null}
          <Button className="rounded-[7px] border-white/12 bg-white/[0.04]" size="sm" disabled={busy} onClick={onMkdir}>
            <FolderPlus className="size-3.5" />
            Папка
          </Button>
          <Button className="rounded-[7px] border-white/12 bg-white/[0.04]" size="icon-sm" disabled={busy} title="Обновить" onClick={reload}>
            <RefreshCw className={cn("size-3.5", data === "loading" && "animate-spin")} />
          </Button>
        </div>
      </div>

      {data === "loading" ? (
        <div className="px-5 py-5 font-mono text-xs text-muted">Загружаем...</div>
      ) : !data ? (
        <div className="px-5 py-5 font-mono text-xs text-bad">Не удалось прочитать папку.</div>
      ) : data.entries.length === 0 ? (
        <div className="px-5 py-5 font-mono text-xs text-muted">Папка пуста.</div>
      ) : (
        <div className="divide-y divide-white/[0.055]">
          {data.entries.map((entry) => {
            const Icon = entryIcon(entry);
            const canOpen = entry.type === "dir";
            return (
              <div
                key={entry.path}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.035] max-mob:grid-cols-[minmax(0,1fr)_auto] max-mob:px-4"
              >
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
                  disabled={!canOpen}
                  title={entry.name}
                  onClick={() => canOpen && setCwd(entry.path)}
                >
                  <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-white/[0.045] text-ink-soft">
                    <Icon className="size-4" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{entry.name}</span>
                    <span className="mt-1 block truncate font-mono text-2xs text-muted">
                      {entryKind(entry)} · {entry.type === "file" ? fmtSize(entry.size) : "размер считается по файлам внутри"} · {fmtDate(entry.mtime)}
                    </span>
                  </span>
                </button>
                <span className="whitespace-nowrap rounded-full bg-black/20 px-2.5 py-1 font-mono text-2xs text-ink-soft max-mob:hidden">
                  {entry.type === "file" ? fmtSize(entry.size) : "папка"}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" title="Переименовать" disabled={busy} onClick={() => onRename(entry)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="Переместить" disabled={busy} onClick={() => onMove(entry)}>
                    <MoveRight className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="Удалить" disabled={busy} onClick={() => onDelete(entry)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
