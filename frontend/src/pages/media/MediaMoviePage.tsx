// Детальная страница фильма (/media/movie/:id) — Radarr-style: шапка с
// метаданными, статус файла (качество/размер или «отсутствует»), встроенный
// плеер + игра на устройство, поиск раздач и ручной импорт застрявшей раздачи.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Player,
  ReleasePicker,
  ImportDrawer,
  fmtSize,
} from "./shared/mediaShared.tsx";
import { TorrentFilePicker, ContentTorrents } from "./shared/mediaPick.tsx";
import { cn } from "../../lib/cn.ts";
import { media as ms } from "./shared/mediaStyles.ts";
import {
  getMoviePageDetail,
  getMovieDiscoverDetail,
  addTitle,
  getMediaPlayUrl,
  getMediaDevices,
  playOnDevice,
  jellyfinPosterUrl,
  jellyfinBackdropUrl,
  posterUrl,
  seasonSearch,
  setMonitored,
  getMediaLibrary,
  type MoviePageDetail,
  type DownloadItem,
  type MediaData,
  type PlayDevice,
  type LibraryItem,
} from "../../lib/api.ts";
import { useToast } from "../../components/ui/Toast.tsx";

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");

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

export function MediaMoviePage({
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
  const [d, setD] = useState<MoviePageDetail | null | "loading">("loading");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [player, setPlayer] = useState<{ url: string; title: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [act, setAct] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [pickReload, setPickReload] = useState(0);
  const [importItem, setImportItem] = useState<DownloadItem | null>(null);
  const [devices, setDevices] = useState<PlayDevice[]>([]);
  const [castOpen, setCastOpen] = useState(false);

  // discover-карточка резолвится по tmdbId (id = tmdbId), library — по Jellyfin-id.
  const fetchDetail = () =>
    source === "discover"
      ? getMovieDiscoverDetail(Number(id))
      : getMoviePageDetail(id);

  useEffect(() => {
    setD("loading");
    fetchDetail().then((r) => setD(r));
    getMediaDevices().then(setDevices);
    getMediaLibrary().then(setLibrary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, source]);

  const play = async () => {
    setBusy(true);
    const url = await getMediaPlayUrl(id);
    setBusy(false);
    if (url && d && d !== "loading") setPlayer({ url, title: d.title });
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
        <div className={cn(ms.empty, "mt-10")}>Не удалось загрузить фильм.</div>
      </div>
    );

  const det = d;

  const accent = titleAccent(det.title);
  const accentGradient = `radial-gradient(ellipse at 60% 40%, ${accent}88 0%, ${accent}22 50%, #050508 100%)`;

  const toggleMonitor = async (val: boolean) => {
    if (det.tmdbId == null) return;
    setAct("mon");
    const ok = await setMonitored("movie", det.tmdbId, val);
    setAct(null);
    if (ok) {
      setD((p) => (p && p !== "loading" ? { ...p, monitored: val } : p));
      toast.success(val ? "Мониторинг включён" : "Мониторинг выключен");
    } else toast.error("Не удалось изменить мониторинг");
  };
  const findMovie = async () => {
    if (det.tmdbId == null) return;
    setAct("find");
    const ok = await seasonSearch("movie", det.tmdbId);
    setAct(null);
    if (ok) toast.success("Поиск фильма запущен");
    else toast.error("Не удалось запустить поиск");
  };
  const addToLib = async () => {
    if (det.tmdbId == null) return;
    setAct("add");
    const ok = await addTitle("movie", det.tmdbId);
    setAct(null);
    if (ok) {
      toast.success(`«${det.title}» добавлен в библиотеку — ищем релиз`);
      onMediaUpdate();
      fetchDetail().then(setD);
    } else toast.error("Не удалось добавить в библиотеку");
  };

  const posterSrc = det.posterRemote
    ? posterUrl(det.posterRemote)
    : jellyfinPosterUrl(det.jellyfinId);
  const stuck = [
    ...new Map(
      media.downloads
        .filter(
          (x) =>
            x.importPending &&
            x.source === "radarr" &&
            norm(x.title).includes(norm(det.title)),
        )
        .map((x) => [x.downloadId ?? x.hash, x]),
    ).values(),
  ];

  // Похожие — из библиотеки (фильмы)
  const similarItems = library
    .filter((x) => x.id !== id && x.type === "Movie")
    .slice(0, 8);

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
      <div className="sticky top-0 z-10 flex items-center gap-3.5 px-8 py-3.5 bg-page/90 backdrop-blur-xl border-b border-white/[0.055] max-mob:px-4 max-mob:py-3">
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
          onClick={() => setShowPicker((v) => !v)}
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
      <div className="relative h-[56vh] min-h-[360px] overflow-hidden max-mob:h-[50vh] max-mob:min-h-[300px]">
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
            <div className="text-2xs tracking-6 uppercase text-white/[0.38] mb-2.5 lmono">ФИЛЬМ</div>
            <h1
              className="font-[Oswald,var(--font)] text-cinematic font-bold leading-[0.92] tracking-tight-hero text-white m-0 mb-4 max-mob:text-cinematic-mob"
            >{det.title}</h1>
            <div className="flex items-center gap-2 flex-wrap text-cell text-white/[0.48] mb-3.5 lmono">
              {det.year && <span>{det.year}</span>}
              {det.runtime && (
                <>
                  <span className="text-white/20">·</span>
                  <span>{det.runtime} мин</span>
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
      <div className="px-[52px] pt-[38px] pb-20 max-w-[860px] max-mob:px-5 max-mob:pt-7 max-mob:pb-[60px]">
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
              title="Нет в Radarr — данные из Jellyfin"
            >
              только Jellyfin
            </span>
          )}
          {det.studio && <span className={ms.lang}>{det.studio}</span>}
          {det.hasFile ? (
            <span className={ms.badge}>
              {det.quality ?? "файл есть"}
              {det.size ? ` · ${fmtSize(det.size)}` : ""}
            </span>
          ) : (
            <span className="whitespace-nowrap rounded-full bg-groove px-2 py-0.5 font-mono text-2xs text-muted">
              Файл отсутствует
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-7">
          {det.hasFile && (
            <button
              className="flex items-center gap-2 px-[30px] py-[13px] rounded-lg border-none cursor-pointer font-ui text-lead-lg font-bold tracking-2 bg-[var(--bc,var(--accent))] text-white transition-all hover:brightness-[1.18] hover:-translate-y-0.5"
              style={{ "--bc": accent } as React.CSSProperties}
              disabled={busy}
              onClick={play}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="6,3 21,12 6,21" />
              </svg>
              {busy ? "…" : "Смотреть"}
            </button>
          )}
          {det.hasFile && devices.length > 0 && (
            <div className="relative">
              <button
                className={ms.button.iconSm}
                title="Играть на устройстве"
                onClick={() => setCastOpen((v) => !v)}
              >
                📺
              </button>
              {castOpen && (
                <div className="absolute top-[30px] right-0 min-w-[140px] p-1.5 rounded-xl flex flex-col gap-1 z-10 bg-surface border border-hair">
                  {devices.map((dev) => (
                    <button
                      key={dev.id}
                      className="text-left bg-none border-none text-ink font-[inherit] px-2 py-1.5 rounded-lg cursor-pointer hover:bg-accent/[0.18] disabled:opacity-50 disabled:cursor-default"
                      onClick={() => {
                        playOnDevice(dev.id, det.jellyfinId);
                        setCastOpen(false);
                      }}
                    >
                      {dev.deviceName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!det.inArr && det.tmdbId != null && (
            <button
              className={ms.button.accentSm}
              disabled={act === "add"}
              title="Добавить в Radarr и запустить поиск"
              onClick={addToLib}
            >
              {act === "add" ? "…" : "➕ В библиотеку"}
            </button>
          )}
          {det.inArr && det.tmdbId != null && (
            <>
              <button
                className={cn(
                  ms.button.sm,
                  det.monitored && ms.button.accentSm,
                )}
                disabled={act === "mon"}
                title={det.monitored ? "Снять с мониторинга" : "Мониторить"}
                onClick={() => toggleMonitor(!det.monitored)}
              >
                {act === "mon"
                  ? "…"
                  : det.monitored
                    ? "★ Мониторится"
                    : "☆ Мониторить"}
              </button>
              {!det.hasFile && (
                <button
                  className={ms.button.sm}
                  disabled={act === "find"}
                  title="Найти фильм (force search)"
                  onClick={findMovie}
                >
                  {act === "find" ? "…" : "⬇ Найти"}
                </button>
              )}
            </>
          )}
          {stuck.map((s) => (
            <button
              key={s.downloadId ?? s.hash}
              className={cn(ms.button.sm, "self-start text-warn")}
              title={s.importMessage}
              onClick={() => setImportItem(s)}
            >
              ⚠ Импорт застрявшей
            </button>
          ))}
        </div>

        {/* Раздачи */}
        <div style={{ marginTop: 20 }}>
          <div className="font-ui text-label font-extrabold tracking-section uppercase text-muted mb-4">РАЗДАЧИ</div>
          <button
            className={cn(ms.button.sm, "mb-2")}
            disabled={det.tmdbId == null}
            title={det.tmdbId == null ? "Нет tmdbId" : ""}
            onClick={() => setShowPicker((v) => !v)}
          >
            {showPicker ? "Скрыть" : "🔍 Найти раздачу"}
          </button>
          {showPicker && det.tmdbId != null ? (
            <ReleasePicker
              params={{ type: "movie", id: det.tmdbId }}
              onGrabbed={onMediaUpdate}
            />
          ) : (
            !showPicker && (
              <div className={ms.empty}>
                Нажми «Найти», чтобы искать раздачи с нужной озвучкой/качеством.
              </div>
            )
          )}
        </div>

        {/* Качается из торрента (Media v2) */}
        <ContentTorrents
          contentType="movie"
          tmdbId={det.tmdbId}
          reloadKey={pickReload}
        />

        {/* Пофайловый выбор файла из торрента (Media v2) */}
        <div style={{ marginTop: 16 }}>
          <button
            className={cn(ms.button.sm, "mb-2")}
            onClick={() => setShowPick((v) => !v)}
          >
            {showPick ? "Скрыть торрент" : "🔍 Скачать из торрента"}
          </button>
          {showPick && (
            <TorrentFilePicker
              contentType="movie"
              tmdbId={det.tmdbId}
              title={det.title}
              onGrabbed={() => setPickReload((n) => n + 1)}
            />
          )}
        </div>

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
