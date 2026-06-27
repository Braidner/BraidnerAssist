// Детальная страница сериала (/media/series/:id) — Sonarr-style: шапка с
// метаданными и monitor/поиском, полный список сезонов/эпизодов (скачано/нет,
// качество, дата, превью), прогресс по сезону, встроенный плеер, поиск раздач
// на сезон, bulk-поиск недостающих и ручной импорт застрявшей раздачи.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Player,
  ReleasePicker,
  ImportDrawer,
  ProgressBar,
  fmtSize,
} from "./shared/mediaShared.tsx";
import { TorrentFilePicker, ContentTorrents } from "./shared/mediaPick.tsx";
import { cn } from "../../lib/cn.ts";
import { media as ms } from "./shared/mediaStyles.ts";
import {
  getSeriesPageDetail,
  getSeriesDiscoverDetail,
  addTitle,
  getMediaPlayUrl,
  jellyfinPosterUrl,
  jellyfinBackdropUrl,
  posterUrl,
  seasonSearch,
  setMonitored,
  getMediaLibrary,
  type SeriesPageDetail,
  type DownloadItem,
  type MediaData,
  type LibraryItem,
} from "@/lib/api.ts";
import { useToast } from "../../components/ui/Toast.tsx";

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
const fmtAir = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ru-RU") : "";

// Относительная дата выхода: «сегодня/завтра/вчера/через N дн/дата».
function relAir(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((t - Date.now()) / 86_400_000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  if (diff > 1 && diff <= 21) return `через ${diff} дн`;
  return new Date(iso).toLocaleDateString("ru-RU");
}
const isAired = (iso: string | null) =>
  Boolean(iso && new Date(iso).getTime() < Date.now());

const ACCENT_COLORS = [
  "#cc3300",
  "#0077dd",
  "#00aaee",
  "#8833ff",
  "#ffaa00",
  "#00b8ae",
];
const titleAccent = (title: string) =>
  ACCENT_COLORS[title.charCodeAt(0) % ACCENT_COLORS.length];

export function MediaSeriesPage({
  media,
  onMediaUpdate,
  source = "library",
}: {
  media: MediaData;
  onMediaUpdate: () => void;
  source?: "library" | "discover";
}) {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<SeriesPageDetail | null | "loading">("loading");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [act, setAct] = useState<string | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [pickerSeason, setPickerSeason] = useState<number | null>(null);
  const [showAllPicker, setShowAllPicker] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [pickReload, setPickReload] = useState(0);
  const [importItem, setImportItem] = useState<DownloadItem | null>(null);

  // discover-карточка резолвится по tvdbId (id = tvdbId), library — по Jellyfin-id.
  const fetchDetail = () =>
    source === "discover"
      ? getSeriesDiscoverDetail(Number(id))
      : getSeriesPageDetail(id);

  useEffect(() => {
    setD("loading");
    fetchDetail().then((r) => setD(r));
    getMediaLibrary().then(setLibrary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source]);

  const play = async (jellyfinId: string, title: string) => {
    setBusy(jellyfinId);
    const url = await getMediaPlayUrl(jellyfinId);
    setBusy(null);
    if (url) setPlayer({ url, title });
  };

  if (d === "loading")
    return (
      <div className={ms.page}>
        <div className={cn(ms.empty, "mt-10")}>Загружаем…</div>
      </div>
    );
  if (!d)
    return (
      <div className={ms.page}>
        <div className={cn(ms.empty, "mt-10")}>
          Не удалось загрузить сериал.
        </div>
      </div>
    );

  const det = d;
  const tvdbId = det.tvdbId;

  const accent = titleAccent(det.title);
  const accentGradient = `radial-gradient(ellipse at 60% 40%, ${accent}88 0%, ${accent}22 50%, #050508 100%)`;

  const patchSeasonMon = (sn: number, val: boolean) =>
    setD((p) =>
      p && p !== "loading"
        ? {
            ...p,
            seasons: p.seasons.map((s) =>
              s.seasonNumber === sn ? { ...s, monitored: val } : s,
            ),
          }
        : p,
    );
  const patchSeriesMon = (val: boolean) =>
    setD((p) => (p && p !== "loading" ? { ...p, monitored: val } : p));

  const toggleMonitor = async (val: boolean, sn?: number) => {
    if (tvdbId == null) return;
    setAct(sn == null ? "mon" : "mon" + sn);
    const ok = await setMonitored("series", tvdbId, val, sn);
    setAct(null);
    if (ok) {
      sn == null ? patchSeriesMon(val) : patchSeasonMon(sn, val);
      toast.success(val ? "Мониторинг включён" : "Мониторинг выключен");
    } else toast.error("Не удалось изменить мониторинг");
  };

  const findSeason = async (sn?: number) => {
    if (tvdbId == null) return;
    setAct(sn == null ? "find" : "find" + sn);
    const ok = await seasonSearch("series", tvdbId, sn);
    setAct(null);
    if (ok)
      toast.success(
        sn == null
          ? "Поиск недостающих серий запущен"
          : `Поиск сезона ${sn} запущен`,
      );
    else toast.error("Не удалось запустить поиск");
  };

  const addToLib = async () => {
    if (tvdbId == null) return;
    setAct("add");
    const ok = await addTitle("series", tvdbId);
    setAct(null);
    if (ok) {
      toast.success(`«${det.title}» добавлен в библиотеку — ищем релиз`);
      onMediaUpdate();
      fetchDetail().then(setD);
    } else toast.error("Не удалось добавить в библиотеку");
  };

  // Один и тот же пак приходит несколькими queue-записями → дедуп по downloadId.
  const stuck = [
    ...new Map(
      media.downloads
        .filter(
          (x) =>
            x.importPending &&
            x.source === "sonarr" &&
            norm(x.title).includes(norm(det.title)),
        )
        .map((x) => [x.downloadId ?? x.hash, x]),
    ).values(),
  ];

  // Похожие — из библиотеки по жанрам
  const similarItems = library
    .filter((x) => x.id !== id && x.type === "Series")
    .slice(0, 8);

  const posterSrc = det.posterRemote
    ? posterUrl(det.posterRemote)
    : jellyfinPosterUrl(det.jellyfinId);

  return (
    <div className={ms.page}>
      {player && (
        <Player
          url={player.url}
          title={player.title}
          onClose={() => setPlayer(null)}
        />
      )}
      {importItem && (
        <ImportDrawer
          item={importItem}
          onClose={() => setImportItem(null)}
          onDone={() => {
            setImportItem(null);
            onMediaUpdate();
            fetchDetail().then(setD);
          }}
        />
      )}

      {/* topbar */}
      <div className="sticky top-0 z-10 flex items-center gap-3.5 px-8 py-3.5 bg-page/90 backdrop-blur-xl border-b border-white/[0.055] max-mob:px-4 max-mob:py-3" style={{animation: "detIn 0.3s 0s cubic-bezier(.22,.61,.36,1) both"}}>
        <button
          className="flex items-center gap-[7px] border-none bg-transparent cursor-pointer font-ui text-pill font-extrabold tracking-4 uppercase text-ink-soft p-0 flex-none transition-colors hover:text-accent"
          onClick={() => nav("/media")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M19 12H5M12 19l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>НАЗАД</span>
        </button>
        <span className="flex-1 text-center text-cell text-muted truncate lmono">{det.title}</span>
        <button
          className="flex items-center gap-[7px] flex-none border border-white/12 rounded-[7px] cursor-pointer bg-white/[0.04] font-ui text-pill font-bold tracking-1 text-white/60 px-3.5 py-[7px] transition-all hover:bg-white/[0.08] hover:text-ink"
          onClick={() => setShowAllPicker((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 3h14a1 1 0 011 1v17l-8-4-8 4V4a1 1 0 011-1z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          В очередь
        </button>
      </div>

      {/* hero */}
      <div className="relative h-[56vh] min-h-[360px] overflow-hidden max-mob:h-[50vh] max-mob:min-h-[300px]" style={{animation: "detIn 0.38s 0.06s cubic-bezier(.22,.61,.36,1) both"}}>
        <div className="absolute inset-0" style={{ background: accentGradient }}>
          <img
            src={jellyfinBackdropUrl(det.jellyfinId)}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 55% 40%, ${accent}50 0%, transparent 65%)`,
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23g)' opacity='0.1'/%3E%3C/svg%3E")`,
            backgroundSize: "180px",
            mixBlendMode: "overlay",
            opacity: 0.5,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(9,9,13,0.96) 0%, rgba(9,9,13,0.55) 50%, transparent 82%), linear-gradient(to top, rgba(9,9,13,0.99) 0%, rgba(9,9,13,0.2) 30%, transparent 55%)",
          }}
        />
        <div className="relative z-[1] h-full flex items-end px-[52px] pb-11 gap-9 max-mob:px-5 max-mob:pb-8 max-mob:gap-[18px]">
          <div className="flex-1 min-w-0">
            <div className="text-2xs tracking-6 uppercase text-white/[0.38] mb-2.5 lmono">СЕРИАЛ</div>
            <h1
              className="font-[Oswald,var(--font)] text-cinematic font-bold leading-[0.92] tracking-tight-hero text-white m-0 mb-4 max-mob:text-cinematic-mob"
            >{det.title}</h1>
            <div className="flex items-center gap-2 flex-wrap text-cell text-white/[0.48] mb-3.5 lmono">
              {det.year && <span>{det.year}</span>}
              {det.runtime && (
                <>
                  <span className="text-white/20">·</span>
                  <span>{det.runtime} мин / эп.</span>
                </>
              )}
              {det.rating && (
                <>
                  <span className="text-white/20">·</span>
                  <span>★ {det.rating.toFixed(1)}</span>
                </>
              )}
            </div>
            {det.genres?.length > 0 && (
              <div className="flex gap-[7px] flex-wrap">
                {det.genres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="font-ui text-label font-bold tracking-genre uppercase text-white/[0.45] px-2.5 py-[3px] rounded-[4px] border border-white/[0.13]"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex-none max-mob:hidden">
            <div className="w-[130px] aspect-[2/3] rounded-[11px] overflow-hidden relative">
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: accentGradient,
                }}
              />
              <img
                src={posterSrc}
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* body */}
      <div className="px-[52px] pt-[38px] pb-20 max-w-[860px] max-mob:px-5 max-mob:pt-7 max-mob:pb-[60px]" style={{animation: "detIn 0.38s 0.12s cubic-bezier(.22,.61,.36,1) both"}}>
        {det.overview && (
          <p className="font-ui text-lead leading-[1.75] text-white/[0.58] m-0 mb-[30px]">
            {det.overview}
          </p>
        )}

        {/* Status badges */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {det.status && <span className={ms.badge}>{det.status}</span>}
          {!det.inArr && (
            <span
              className={ms.reject}
              title="Нет в Sonarr — данные из Jellyfin"
            >
              только Jellyfin
            </span>
          )}
          {det.network && <span className={ms.lang}>{det.network}</span>}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-7">
          {!det.inArr && tvdbId != null && (
            <button
              className="flex items-center gap-2 px-[30px] py-[13px] rounded-lg border-none cursor-pointer font-ui text-lead-lg font-bold tracking-2 bg-[var(--bc,var(--accent))] text-white transition-all hover:brightness-[1.18] hover:-translate-y-0.5"
              style={{ "--bc": accent } as React.CSSProperties}
              disabled={act === "add"}
              onClick={addToLib}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="6,3 21,12 6,21" />
              </svg>
              {act === "add" ? "…" : "В библиотеку"}
            </button>
          )}
          {det.inArr && tvdbId != null && (
            <>
              <button
                className={cn(
                  ms.button.sm,
                  det.monitored && ms.button.accentSm,
                )}
                disabled={act === "mon"}
                title={
                  det.monitored
                    ? "Снять весь сериал с мониторинга"
                    : "Мониторить весь сериал"
                }
                onClick={() => toggleMonitor(!det.monitored)}
              >
                {act === "mon"
                  ? "…"
                  : det.monitored
                    ? "★ Мониторится"
                    : "☆ Мониторить"}
              </button>
              <button
                className={ms.button.sm}
                disabled={act === "find"}
                title="Найти все недостающие серии"
                onClick={() => findSeason()}
              >
                {act === "find" ? "…" : "⬇ Найти недостающие"}
              </button>
            </>
          )}
          {tvdbId != null && (
            <button
              className={ms.button.sm}
              title="Поиск всех раздач сериала (включая мультисезонные паки)"
              onClick={() => setShowAllPicker((v) => !v)}
            >
              {showAllPicker ? "Скрыть раздачи" : "🔍 Все раздачи"}
            </button>
          )}
          {stuck.map((s) => (
            <button
              key={s.downloadId ?? s.hash}
              className={cn(ms.button.sm, "self-start text-warn")}
              title={s.importMessage}
              onClick={() => setImportItem(s)}
            >
              ⚠ Импорт застрявшей раздачи
            </button>
          ))}
        </div>

        {/* Качается из торрента (Media v2) — прогресс по сериям + докачать ещё */}
        <ContentTorrents
          contentType="series"
          tvdbId={tvdbId}
          reloadKey={pickReload}
        />

        {/* Пофайловый выбор серий из торрента (Media v2) */}
        <div style={{ marginTop: 16 }}>
          <button
            className={cn(ms.button.sm, "mb-2")}
            onClick={() => setShowPick((v) => !v)}
          >
            {showPick
              ? "Скрыть серии из торрента"
              : "🔍 Скачать по сериям (торрент)"}
          </button>
          {showPick && (
            <TorrentFilePicker
              contentType="series"
              tvdbId={tvdbId}
              title={det.title}
              onGrabbed={() => setPickReload((n) => n + 1)}
            />
          )}
        </div>

        {showAllPicker && tvdbId != null && (
          <div style={{ marginTop: 16 }}>
            <div className="font-ui text-label font-extrabold tracking-section uppercase text-muted mb-4">ВСЕ РАЗДАЧИ</div>
            <div className="font-ui text-lead leading-[1.75] text-white/[0.58] m-0" style={{ marginBottom: 8 }}>
              Включая мультисезонные паки. После загрузки пака разложи серии
              кнопкой «Импорт» в Загрузках.
            </div>
            <ReleasePicker
              params={{ type: "series", id: tvdbId }}
              onGrabbed={onMediaUpdate}
            />
          </div>
        )}

        {/* Seasons accordion */}
        {det.seasons.length === 0 ? (
          <div className={cn(ms.empty, "mt-6")}>Эпизоды не найдены.</div>
        ) : (
          <div className="mb-10" style={{ marginTop: 24 }}>
            <div className="font-ui text-label font-extrabold tracking-section uppercase text-muted mb-4">СЕЗОНЫ</div>
            {det.seasons.map((s) => {
              const isOpen = openSeason === s.seasonNumber;
              const pickerOn = pickerSeason === s.seasonNumber;
              const label =
                s.seasonNumber === 0
                  ? "Спецвыпуски"
                  : `Сезон ${s.seasonNumber}`;
              const pct =
                s.totalCount > 0
                  ? Math.round((s.fileCount / s.totalCount) * 100)
                  : 0;
              return (
                <div key={s.seasonNumber} className="border border-white/[0.07] rounded-[11px] mb-2 overflow-hidden bg-white/[0.02]">
                  <button
                    className="w-full flex items-center gap-3 px-[18px] py-[15px] border-none cursor-pointer bg-transparent font-ui text-lead-lg font-bold text-ink text-left transition-colors hover:bg-white/[0.04]"
                    onClick={() =>
                      setOpenSeason(isOpen ? null : s.seasonNumber)
                    }
                  >
                    <span>{label}</span>
                    <span className="text-data text-muted lmono">
                      <ProgressBar pct={pct} />
                      <span style={{ marginLeft: 6 }}>
                        {s.fileCount}/{s.totalCount} эп.
                      </span>
                    </span>
                    {/* Season action buttons */}
                    {det.inArr && tvdbId != null && (
                      <>
                        <button
                          className={cn(
                            ms.button.iconSm,
                            s.monitored && ms.button.accentIconSm,
                          )}
                          disabled={act === "mon" + s.seasonNumber}
                          title={
                            s.monitored
                              ? "Снять сезон с мониторинга"
                              : "Мониторить сезон"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMonitor(!s.monitored, s.seasonNumber);
                          }}
                        >
                          {act === "mon" + s.seasonNumber
                            ? "…"
                            : s.monitored
                              ? "★"
                              : "☆"}
                        </button>
                        <button
                          className={ms.button.sm}
                          disabled={act === "find" + s.seasonNumber}
                          title="Найти весь сезон (force search)"
                          onClick={(e) => {
                            e.stopPropagation();
                            findSeason(s.seasonNumber);
                          }}
                        >
                          {act === "find" + s.seasonNumber ? "…" : "⬇ Сезон"}
                        </button>
                      </>
                    )}
                    <button
                      className={ms.button.sm}
                      disabled={tvdbId == null}
                      title={
                        tvdbId == null
                          ? "Нет tvdbId"
                          : "Выбрать раздачу для сезона"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setPickerSeason(pickerOn ? null : s.seasonNumber);
                      }}
                    >
                      🔍 Раздача
                    </button>
                    <span
                      className="ml-auto text-muted flex transition-transform duration-[220ms] [cubic-bezier(0.22,0.61,0.36,1)]"
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "none",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>

                  {pickerOn && tvdbId != null && (
                    <ReleasePicker
                      params={{
                        type: "series",
                        id: tvdbId,
                        seasonNumber: s.seasonNumber,
                      }}
                      onGrabbed={onMediaUpdate}
                    />
                  )}

                  <div
                    className={cn(
                      "overflow-hidden transition-[max-height] duration-300 [cubic-bezier(0.22,0.61,0.36,1)]",
                      isOpen ? "max-h-[800px]" : "max-h-0",
                    )}
                  >
                    <div className="border-t border-white/[0.05]">
                      {s.episodes.map((ep) => {
                        const missed = !ep.hasFile && isAired(ep.airDate);
                        return (
                          <div
                            key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                            className={cn(
                              "flex items-center gap-3.5 px-[18px] py-[13px] border-b border-white/[0.04] last:border-b-0 transition-colors hover:bg-white/[0.03]",
                              ep.played ? "media-ep-played" : "",
                            )}
                          >
                            {ep.jellyfinId ? (
                              <img
                                className="media-ep-thumb"
                                src={jellyfinPosterUrl(ep.jellyfinId)}
                                alt=""
                                loading="lazy"
                                onError={(e) => {
                                  (
                                    e.currentTarget as HTMLImageElement
                                  ).style.visibility = "hidden";
                                }}
                              />
                            ) : (
                              <span className="media-ep-thumb media-ep-thumb-ph" />
                            )}
                            <span className="text-data text-muted w-[22px] flex-none lmono">
                              {String(ep.episodeNumber ?? 0).padStart(2, "0")}
                            </span>
                            <span className="flex-1 text-row text-ink" title={ep.title}>
                              {ep.title}
                            </span>
                            {ep.hasFile ? (
                              <span className={ms.badge}>
                                {ep.quality ?? "есть"}
                                {ep.size ? ` · ${fmtSize(ep.size)}` : ""}
                              </span>
                            ) : missed ? (
                              <span className="whitespace-nowrap rounded-full bg-groove px-2 py-0.5 font-mono text-2xs text-[#e06666]">
                                пропущено
                              </span>
                            ) : (
                              <span className="whitespace-nowrap rounded-full bg-groove px-2 py-0.5 font-mono text-2xs text-muted">
                                нет файла
                              </span>
                            )}
                            <span
                              className="text-data text-muted flex-none lmono"
                              title={fmtAir(ep.airDate)}
                            >
                              {relAir(ep.airDate)}
                            </span>
                            <button
                              className="w-8 h-8 rounded-full flex-none grid place-items-center border border-white/[0.14] bg-white/[0.05] text-ink-soft cursor-pointer transition-all hover:bg-[var(--epa,var(--accent))] hover:text-white hover:border-transparent"
                              style={{ "--epa": accent } as React.CSSProperties}
                              title={
                                ep.jellyfinId
                                  ? "Воспроизвести"
                                  : "Файл недоступен"
                              }
                              disabled={
                                !ep.jellyfinId || busy === ep.jellyfinId
                              }
                              onClick={() =>
                                ep.jellyfinId &&
                                play(
                                  ep.jellyfinId,
                                  `${det.title} — S${ep.seasonNumber}E${ep.episodeNumber} ${ep.title}`,
                                )
                              }
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                              >
                                <polygon points="6,3 21,12 6,21" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ПОХОЖИЕ */}
        {similarItems.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="font-ui text-label font-extrabold tracking-section uppercase text-muted mb-4">ПОХОЖИЕ</div>
            <div className={cn(ms.hTrack, ms.posterRow)}>
              {similarItems.map((item) => {
                const a = titleAccent(item.name);
                const aGrad = `radial-gradient(ellipse at 60% 40%, ${a}88 0%, ${a}22 50%, #050508 100%)`;
                return (
                  <div
                    key={item.id}
                    className={ms.posterCard}
                    onClick={() =>
                      nav(
                        `/media/${item.type === "Series" ? "series" : "movie"}/${item.id}`,
                      )
                    }
                  >
                    <div
                      className={ms.posterArt}
                      style={{ "--pa": a } as React.CSSProperties}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: aGrad,
                          zIndex: 0,
                        }}
                      />
                      <img
                        src={jellyfinPosterUrl(item.id)}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          zIndex: 1,
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                      {item.childCount ? (
                        <span
                          className={ms.posterBadge}
                          style={{ position: "relative", zIndex: 2 }}
                        >
                          {item.childCount} сез.
                        </span>
                      ) : null}
                      <div
                        className={ms.posterOverlay}
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 3,
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "flex-end",
                          padding: 8,
                        }}
                      >
                        <div className={ms.roundPlay}>
                          <svg
                            width="17"
                            height="17"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <polygon points="6,3 21,12 6,21" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className={ms.posterInfo}>
                      <div className={ms.posterTitle}>{item.name}</div>
                      <div className={ms.posterSub}>
                        {item.type === "Series" ? "сериал" : "фильм"}
                        {item.year ? ` · ${item.year}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
