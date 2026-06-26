// Media v2 (Фаза 3) — файловый менеджер медиатеки (таб «Система»). Навигация по
// папкам, создание/переименование/перемещение/удаление. Все операции заперты в
// MEDIA_ROOT на бэкенде. Не настроен MEDIA_ROOT → секция не показывается.

import { useEffect, useState } from "react";
import { Card } from "../ui/Card.tsx";
import {
  listFiles, fsMkdir, fsRename, fsMove, fsDelete,
  type FileEntry, type FileListing,
} from "../../lib/api.ts";
import { fmtSize } from "../../pages/media/shared/mediaShared.tsx";
import { useToast } from "../ui/Toast.tsx";

const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "");
const icon = (e: FileEntry) =>
  e.type === "dir" ? "📁" : /mkv|mp4|avi|m4v|mov|ts|webm|wmv/.test(e.ext) ? "🎬" : /srt|ass|sub|vtt/.test(e.ext) ? "💬" : "📄";

export function FileBrowser() {
  const toast = useToast();
  const [cwd, setCwd] = useState("");
  const [data, setData] = useState<FileListing | null | "loading" | "off">("loading");
  const [busy, setBusy] = useState(false);

  const load = (p: string) => {
    setData("loading");
    listFiles(p).then((r) => setData(r ?? "off"));
  };
  useEffect(() => { load(cwd); }, [cwd]);

  const reload = () => load(cwd);

  if (data === "off") return null; // MEDIA_ROOT не настроен — не показываем

  const crumbs = cwd ? cwd.split("/") : [];
  const go = (i: number) => setCwd(crumbs.slice(0, i + 1).join("/"));

  const run = async (fn: () => Promise<boolean>, okMsg: string) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) { toast.success(okMsg); reload(); }
    else toast.error("Операция не удалась");
  };

  const onMkdir = () => {
    const name = window.prompt("Имя новой папки:");
    if (name?.trim()) run(() => fsMkdir(cwd, name.trim()), "Папка создана");
  };
  const onRename = (e: FileEntry) => {
    const name = window.prompt("Новое имя:", e.name);
    if (name?.trim() && name !== e.name) run(() => fsRename(e.path, name.trim()), "Переименовано");
  };
  const onMove = (e: FileEntry) => {
    const dest = window.prompt("Переместить в папку (путь от корня медиатеки):", cwd);
    if (dest != null) run(() => fsMove(e.path, dest.trim()), "Перемещено");
  };
  const onDelete = (e: FileEntry) => {
    if (window.confirm(`Удалить «${e.name}»${e.type === "dir" ? " и всё внутри" : ""}? Действие необратимо.`)) {
      run(() => fsDelete(e.path), "Удалено");
    }
  };

  return (
    <Card
      icon="server"
      title="Файлы медиатеки"
      action={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" disabled={busy} onClick={onMkdir}>+ Папка</button>
          <button className="btn btn-sm" disabled={busy} onClick={reload}>↻</button>
        </div>
      }
    >
      {/* breadcrumb */}
      <div className="add-field" style={{ flexWrap: "wrap", gap: 6, marginTop: 0, marginBottom: 10 }}>
        <button className="btn btn-sm" disabled={!cwd} onClick={() => setCwd("")}>🏠 корень</button>
        {crumbs.map((c, i) => (
          <button key={i} className="btn btn-sm" disabled={i === crumbs.length - 1} onClick={() => go(i)}>{c}</button>
        ))}
      </div>

      {data === "loading" ? (
        <div className="empty">Загружаем…</div>
      ) : !data ? (
        <div className="empty">Не удалось прочитать папку.</div>
      ) : data.entries.length === 0 ? (
        <div className="empty">Папка пуста.</div>
      ) : (
        <div className="dl-list">
          {data.entries.map((e) => (
            <div key={e.path} className="dl-row" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <button
                className="dl-title"
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: e.type === "dir" ? "pointer" : "default", color: "var(--ink)", padding: 0 }}
                title={e.name}
                disabled={e.type !== "dir"}
                onClick={() => e.type === "dir" && setCwd(e.path)}
              >
                {icon(e)} {e.name}
              </button>
              <span className="dl-meta mono" style={{ whiteSpace: "nowrap" }}>
                {e.type === "file" ? fmtSize(e.size) : ""}{e.mtime ? ` · ${fmtDate(e.mtime)}` : ""}
              </span>
              <div className="dl-actions">
                <button className="btn btn-icon btn-sm" title="Переименовать" disabled={busy} onClick={() => onRename(e)}>✏️</button>
                <button className="btn btn-icon btn-sm" title="Переместить" disabled={busy} onClick={() => onMove(e)}>➡️</button>
                <button className="btn btn-icon btn-sm" title="Удалить" disabled={busy} onClick={() => onDelete(e)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
