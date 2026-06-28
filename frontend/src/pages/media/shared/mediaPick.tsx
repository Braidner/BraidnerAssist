// Media v2 — пофайловый выбор серий из торрента (карточки фильма/сериала):
// поиск раздач (Prowlarr) → предпросмотр файлов (TorrServer, без скачивания) →
// чекбоксы на серии → качаем только выбранное (qB filePrio) + привязка к контенту.
// ContentTorrents — секция «уже качается из этого торрента»: прогресс по файлам +
// докачать ещё серии через ТОТ ЖЕ торрент.

import { useEffect, useState } from "react";
import {
  searchReleases,
  previewTorrentFiles,
  grabSelectedFiles,
  getContentTorrents,
  pickMoreFiles,
  organizeTorrent,
  type SearchResult,
  type PickFile,
  type TorrentPreview,
  type ContentTorrent,
} from "../../../lib/api.ts";
import { fmtSize, ProgressBar } from "./mediaShared.tsx";
import { useToast } from "../../../components/ui/Toast.tsx";
import { cn } from "../../../lib/cn.ts";
import { media } from "./mediaStyles.ts";

type Key = {
  contentType: "movie" | "series";
  tmdbId?: number | null;
  tvdbId?: number | null;
  title: string;
};

// Сгруппировать видеофайлы по сезонам (сериал) или плоско (фильм).
function groupBySeason(
  files: PickFile[],
): { key: number; label: string; files: PickFile[] }[] {
  const map = new Map<number, PickFile[]>();
  for (const f of files) {
    const sn = f.season ?? -1;
    if (!map.has(sn)) map.set(sn, []);
    map.get(sn)!.push(f);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sn, fs]) => ({
      key: sn,
      label:
        sn === -1 ? "Без сезона" : sn === 0 ? "Спецвыпуски" : `Сезон ${sn}`,
      files: fs.sort((a, b) => (a.episodes[0] ?? 0) - (b.episodes[0] ?? 0)),
    }));
}

const epLabel = (f: PickFile): string => {
  if (f.season != null && f.episodes.length > 0) {
    const e = f.episodes;
    const range = e.length > 1 ? `-E${e[e.length - 1]}` : "";
    return `S${f.season}E${e[0]}${range}`;
  }
  return f.path.split("/").pop() ?? f.path;
};

export function TorrentFilePicker({
  contentType,
  tmdbId,
  tvdbId,
  title,
  onGrabbed,
}: Key & { onGrabbed?: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState(title);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{
    source: string;
    title: string;
  } | null>(null);
  const [preview, setPreview] = useState<TorrentPreview | null | "loading">(
    null,
  );
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [grabbing, setGrabbing] = useState(false);

  const onSearch = async () => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setSearchError(null);
    const res = await searchReleases(term);
    setResults(res.items);
    setSearchError(res.error);
    setSearching(false);
  };

  const openTorrent = async (r: SearchResult) => {
    if (!r.url) return;
    setPicked({ source: r.url, title: r.title });
    setPreview("loading");
    setChecked(new Set());
    const pv = await previewTorrentFiles(r.url);
    setPreview(pv);
    if (pv) {
      // дефолт: фильм → крупнейший видеофайл; сериал → все распознанные серии (или все видео).
      const vids = pv.files.filter((f) => f.isVideo);
      if (contentType === "movie") {
        const best = vids.slice().sort((a, b) => b.length - a.length)[0];
        setChecked(new Set(best ? [best.fileIndex] : []));
      } else {
        const withEp = vids.filter((f) => f.episodes.length > 0);
        setChecked(
          new Set((withEp.length ? withEp : vids).map((f) => f.fileIndex)),
        );
      }
    } else {
      toast.error("Не удалось получить список файлов (TorrServer)");
    }
  };

  const toggle = (idx: number) =>
    setChecked((p) => {
      const n = new Set(p);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });

  const onGrab = async () => {
    if (!picked || !preview || preview === "loading" || checked.size === 0)
      return;
    setGrabbing(true);
    const ok = await grabSelectedFiles({
      contentType,
      tmdbId,
      tvdbId,
      title,
      source: picked.source,
      infohash: preview.infohash,
      files: preview.files,
      wantedIndexes: [...checked],
    });
    setGrabbing(false);
    if (ok) {
      toast.success(`Качаем выбранные файлы: ${checked.size}`);
      setPicked(null);
      setPreview(null);
      setChecked(new Set());
      onGrabbed?.();
    } else {
      toast.error(
        "Не удалось поставить на закачку (см. метаданные/qBittorrent)",
      );
    }
  };

  return (
    <div>
      <div className={cn(media.field, "mt-1")}>
        <input
          className={media.input}
          placeholder="Поиск раздачи…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
        />
        <button
          className={media.button.accentIcon}
          disabled={!q.trim() || searching}
          onClick={onSearch}
        >
          {searching ? "…" : "🔍"}
        </button>
      </div>

      {/* список раздач */}
      {searchError && !picked && (
        <div className={cn(media.empty, "mt-2.5 text-bad")}>{searchError}</div>
      )}

      {results &&
        !searchError &&
        !picked &&
        (results.length === 0 ? (
          <div className={cn(media.empty, "mt-2.5")}>Раздачи не найдены.</div>
        ) : (
          <div className={media.list}>
            {results.map((r) => (
              <div key={r.guid} className={media.row}>
                <span className={media.rowTitle} title={r.title}>
                  {r.title}
                </span>
                <div className={media.rowFoot}>
                  <span className={media.rowMeta}>
                    {fmtSize(r.size)} ·{" "}
                    <span className={media.okText}>{r.seeders} seed</span> ·{" "}
                    {r.indexer}
                    {r.query ? ` · q: ${r.query}` : ""}
                  </span>
                  <button
                    className={media.button.accentSm}
                    disabled={!r.url}
                    onClick={() => openTorrent(r)}
                  >
                    📂 Файлы
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* предпросмотр файлов выбранной раздачи */}
      {picked && (
        <div className="mt-3">
          <div className={cn(media.field, "mb-2 items-center")}>
            <span className={cn(media.rowTitle, "flex-1")} title={picked.title}>
              {picked.title}
            </span>
            <button
              className={media.button.sm}
              onClick={() => {
                setPicked(null);
                setPreview(null);
              }}
            >
              ← К списку
            </button>
          </div>

          {preview === "loading" ? (
            <div className={media.empty}>Читаем файлы торрента…</div>
          ) : !preview ? (
            <div className={media.empty}>Не удалось получить файлы.</div>
          ) : (
            <>
              {groupBySeason(preview.files.filter((f) => f.isVideo)).map(
                (g) => (
                  <div key={g.key} className="mt-2.5 rounded-xl bg-surface">
                    <div className="flex items-center gap-2 px-2.5 py-2 max-narrow:flex-wrap">
                      <span className="flex flex-1 cursor-default items-center justify-between gap-2 px-0.5 py-1 text-body font-medium text-ink">
                        {g.label}
                      </span>
                      <span className="font-mono text-data text-muted">
                        {g.files.length} файл.
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 px-2.5 pb-2.5 pt-1">
                      {g.files.map((f) => (
                        <label
                          key={f.fileIndex}
                          className="flex cursor-pointer items-center gap-[9px] rounded-lg px-2 py-1.5 transition-colors hover:bg-hair"
                        >
                          <input
                            type="checkbox"
                            className={media.checkbox}
                            checked={checked.has(f.fileIndex)}
                            onChange={() => toggle(f.fileIndex)}
                          />
                          <span className="w-[26px] flex-none text-center font-mono text-data text-muted">
                            {epLabel(f)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            <span className="font-mono text-2xs text-muted">
                              {fmtSize(f.length)}
                            </span>
                            <span
                              className="min-w-20 flex-1 truncate whitespace-nowrap font-mono text-2xs text-muted"
                              title={f.path}
                            >
                              {f.path.split("/").pop()}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ),
              )}
              {preview.files.filter((f) => f.isVideo).length === 0 && (
                <div className={media.empty}>
                  Видеофайлы не найдены в торренте.
                </div>
              )}
              <button
                className={cn(media.button.accent, "mt-3.5 w-full")}
                disabled={grabbing || checked.size === 0}
                onClick={onGrab}
              >
                {grabbing
                  ? "Ставим на закачку…"
                  : `⬇ Скачать выбранное (${checked.size})`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ContentTorrents({
  contentType,
  tmdbId,
  tvdbId,
  reloadKey,
}: {
  contentType: "movie" | "series";
  tmdbId?: number | null;
  tvdbId?: number | null;
  reloadKey?: number;
}) {
  const toast = useToast();
  const [torrents, setTorrents] = useState<ContentTorrent[]>([]);
  const [addSel, setAddSel] = useState<Record<string, Set<number>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    getContentTorrents({ type: contentType, tmdbId, tvdbId }).then(setTorrents);
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [contentType, tmdbId, tvdbId, reloadKey]);

  const toggleAdd = (hash: string, idx: number) =>
    setAddSel((p) => {
      const n = new Set(p[hash] ?? []);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return { ...p, [hash]: n };
    });

  const onMore = async (hash: string) => {
    const idxs = [...(addSel[hash] ?? [])];
    if (!idxs.length) return;
    setBusy(hash);
    const ok = await pickMoreFiles(hash, idxs);
    setBusy(null);
    if (ok) {
      toast.success(`Докачиваем ещё файлов: ${idxs.length}`);
      setAddSel((p) => ({ ...p, [hash]: new Set() }));
      load();
    } else toast.error("Не удалось докачать");
  };

  const onOrganize = async (hash: string) => {
    setBusy("org" + hash);
    const r = await organizeTorrent(hash);
    setBusy(null);
    if (r)
      toast.success(
        `Разложено в библиотеку: ${r.organized}${r.skipped ? ` (пропущено ${r.skipped})` : ""}`,
      );
    else
      toast.error(
        "Не удалось разложить (нужен файл-браузер/MEDIA_ROOT и скачанные файлы)",
      );
  };

  if (torrents.length === 0) return null;

  return (
    <>
      {torrents.map((t) => {
        const sel = addSel[t.infohash] ?? new Set<number>();
        return (
          <div key={t.infohash} style={{ marginBottom: 14 }}>
            <div className={cn(media.field, "mb-1.5 items-center")}>
              <span
                className="flex-1 font-mono text-pill text-muted"
                title={t.title}
              >
                📦 {t.title}
              </span>
              <button
                className={media.button.sm}
                disabled={busy === "org" + t.infohash}
                title="Разложить скачанное в библиотеку (hardlink + Jellyfin scan)"
                onClick={() => onOrganize(t.infohash)}
              >
                {busy === "org" + t.infohash ? "…" : "🗂 Разложить"}
              </button>
            </div>
            {groupBySeasonFiles(t.files).map((g) => (
              <div key={g.key} className="mt-2.5 rounded-xl bg-surface">
                <div className="flex items-center gap-2 px-2.5 py-2 max-narrow:flex-wrap">
                  <span className="flex flex-1 cursor-default items-center justify-between gap-2 px-0.5 py-1 text-body font-medium text-ink">
                    {g.label}
                  </span>
                </div>
                <div className="flex flex-col gap-1 px-2.5 pb-2.5 pt-1">
                  {g.files.map((f) => {
                    const label =
                      f.seasonNumber != null && f.episodeNumber != null
                        ? `S${f.seasonNumber}E${f.episodeNumber}`
                        : (f.path.split("/").pop() ?? f.path);
                    const pct = Math.round((f.progress ?? 0) * 100);
                    return (
                      <div
                        key={f.fileIndex}
                        className="flex items-center gap-[9px] rounded-lg px-2 py-1.5"
                      >
                        {f.wanted ? (
                          <span
                            className={cn(
                              media.checkbox,
                              "inline-flex items-center justify-center",
                            )}
                            title="Качается"
                          >
                            {pct >= 100 ? "✓" : "↓"}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            className={media.checkbox}
                            checked={sel.has(f.fileIndex)}
                            onChange={() => toggleAdd(t.infohash, f.fileIndex)}
                            title="Докачать"
                          />
                        )}
                        <span className="w-[26px] flex-none text-center font-mono text-data text-muted">
                          {label}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <span className="font-mono text-2xs text-muted">
                            {fmtSize(f.length)}
                          </span>
                          {f.wanted ? (
                            <span className="flex min-w-[90px] flex-1 items-center gap-1.5">
                              <ProgressBar pct={pct} />
                              <span className="font-mono text-2xs text-muted">
                                {pct}%
                              </span>
                            </span>
                          ) : (
                            <span className="min-w-20 flex-1 truncate whitespace-nowrap font-mono text-2xs text-muted">
                              не качается
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {sel.size > 0 && (
              <button
                className={cn(media.button.accentSm, "mt-2")}
                disabled={busy === t.infohash}
                onClick={() => onMore(t.infohash)}
              >
                {busy === t.infohash
                  ? "…"
                  : `⬇ Докачать выбранное (${sel.size})`}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

// Группировка ContentTorrentFile по сезонам (для секции «уже качается»).
function groupBySeasonFiles(files: ContentTorrent["files"]) {
  const map = new Map<number, ContentTorrent["files"]>();
  for (const f of files) {
    const sn = f.seasonNumber ?? -1;
    if (!map.has(sn)) map.set(sn, []);
    map.get(sn)!.push(f);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([sn, fs]) => ({
      key: sn,
      label: sn === -1 ? "Файлы" : sn === 0 ? "Спецвыпуски" : `Сезон ${sn}`,
      files: fs.sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)),
    }));
}
