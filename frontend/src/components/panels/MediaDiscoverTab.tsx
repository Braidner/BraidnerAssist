// Discover tab for MediaPage: lookup search, recommendations, calendar.

import { useNavigate } from "react-router-dom";
import { Card } from "../Card.tsx";
import {
  posterUrl,
  type ArrLookupItem, type Recommendation, type CalendarItem, type TmdbItem,
} from "../../lib/api.ts";

// Относительный день выхода для компактной карточки расписания.
function relDay(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.round((t - Date.now()) / 86_400_000);
  if (diff <= 0) return "вышло";
  if (diff === 1) return "завтра";
  if (diff <= 21) return `+${diff} дн`;
  return new Date(iso).toLocaleDateString("ru-RU");
}

interface MediaDiscoverTabProps {
  tmdb: boolean;
  dq: string;
  setDq: (v: string) => void;
  dres: ArrLookupItem[];
  tmRes: TmdbItem[];
  trending: TmdbItem[];
  dsearching: boolean;
  recs: Recommendation[];
  calendar: CalendarItem[];
  busy: string | null;
  onAddRec: (rec: Recommendation) => void;
  onOpenDiscover: (it: ArrLookupItem) => void;
  onOpenTmdb: (it: TmdbItem) => void;
}

export function MediaDiscoverTab({
  tmdb,
  dq,
  setDq,
  dres,
  tmRes,
  trending,
  dsearching,
  recs,
  calendar,
  busy,
  onAddRec,
  onOpenDiscover,
  onOpenTmdb,
}: MediaDiscoverTabProps) {
  const nav = useNavigate();

  const renderTmdbGrid = (items: TmdbItem[]) => (
    <div className="media-grid">
      {items.map((it) => (
        <button
          key={it.kind + it.tmdbId}
          className="neu media-item"
          title={it.title}
          disabled={busy === "tmdb" + it.tmdbId}
          onClick={() => onOpenTmdb(it)}
        >
          <span className="media-poster-box">
            {it.poster ? (
              <img className="media-item-poster" src={posterUrl(it.poster)} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <span className="media-item-poster lk-poster-ph">{it.kind === "movie" ? "🎬" : "📺"}</span>
            )}
          </span>
          <span className="media-item-name">{it.title}</span>
          <span className="media-item-meta mono">
            {it.kind === "movie" ? "🎬 фильм" : "📺 сериал"}{it.year ? ` · ${it.year}` : ""}
          </span>
          <span className="media-item-play">{busy === "tmdb" + it.tmdbId ? "…" : "›"}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="page-col-main">
      {/* Найти и добавить — поиск по всем тайтлам Sonarr/Radarr; пусто → подборки */}
      <Card
        icon="pulse"
        title="Найти и добавить"
        action={<span className="panel-count">{dq.trim() ? (tmdb ? tmRes.length : dres.length) : (tmdb ? trending.length : recs.length)}</span>}
      >
        <div className="add-field" style={{ marginTop: 4 }}>
          <input
            className="neu-in mc-input"
            placeholder="Поиск фильмов и сериалов…"
            value={dq}
            onChange={(e) => setDq(e.target.value)}
          />
          {dq && <button className="btn btn-icon btn-sm" title="Очистить" onClick={() => setDq("")}>✕</button>}
        </div>

        {tmdb ? (
          dq.trim() ? (
            dsearching && tmRes.length === 0 ? (
              <div className="media-grid">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="neu-in media-skel" />)}
              </div>
            ) : tmRes.length === 0 ? (
              <div className="empty" style={{ marginTop: 10 }}>Ничего не найдено.</div>
            ) : (
              renderTmdbGrid(tmRes)
            )
          ) : trending.length > 0 ? (
            renderTmdbGrid(trending)
          ) : (
            <div className="empty" style={{ marginTop: 10 }}>Введи название, чтобы найти фильм или сериал.</div>
          )
        ) : dq.trim() ? (
          dsearching && dres.length === 0 ? (
            <div className="media-grid">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="neu-in media-skel" />)}
            </div>
          ) : dres.length === 0 ? (
            <div className="empty" style={{ marginTop: 10 }}>Ничего не найдено.</div>
          ) : (
            <div className="media-grid">
              {dres.map((it) => (
                <button
                  key={it.kind + it.id}
                  className="neu media-item"
                  title={it.title}
                  onClick={() => onOpenDiscover(it)}
                >
                  <span className="media-poster-box">
                    {it.poster ? (
                      <img
                        className="media-item-poster"
                        src={posterUrl(it.poster)}
                        alt=""
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <span className="media-item-poster lk-poster-ph">{it.kind === "movie" ? "🎬" : "📺"}</span>
                    )}
                    {it.added && <span className="media-badge media-badge-seen" title="Уже в библиотеке">✓</span>}
                  </span>
                  <span className="media-item-name">{it.title}</span>
                  <span className="media-item-meta mono">
                    {it.kind === "movie" ? "🎬 фильм" : "📺 сериал"}{it.year ? ` · ${it.year}` : ""}
                  </span>
                  <span className="media-item-play">›</span>
                </button>
              ))}
            </div>
          )
        ) : recs.length > 0 ? (
          <div className="media-grid">
            {recs.map((r) => {
              const key = "rec" + r.kind + r.id;
              return (
                <div key={key} className="neu media-item">
                  {r.poster ? (
                    <img
                      className="media-item-poster"
                      src={posterUrl(r.poster)}
                      alt=""
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <span className="media-item-poster lk-poster-ph">{r.kind === "movie" ? "🎬" : "📺"}</span>
                  )}
                  <span className="media-item-name">{r.title}</span>
                  <span className="media-item-meta mono">
                    {r.kind === "movie" ? "фильм" : "сериал"}{r.year ? ` · ${r.year}` : ""}
                  </span>
                  <button
                    className="btn btn-sm btn-accent media-item-add"
                    disabled={busy === key}
                    onClick={() => onAddRec(r)}
                  >
                    {busy === key ? "…" : "+ Добавить"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty" style={{ marginTop: 10 }}>Введи название фильма или сериала, чтобы найти и открыть карточку.</div>
        )}
      </Card>

      {/* Скоро выйдет — ближайшие эпизоды/релизы (полное — на /media/calendar) */}
      {calendar.length > 0 && (
        <Card
          icon="chart"
          title="Скоро выйдет"
          action={<button className="btn btn-sm" onClick={() => nav("/media/calendar")}>Всё расписание</button>}
        >
          <div className="cal-rows">
            {calendar.slice(0, 6).map((it, i) => (
              <div key={i} className={`cal-row ${it.hasFile ? "cal-has" : ""}`}>
                <span className="cal-kind">{it.kind === "series" ? "📺" : "🎬"}</span>
                <span className="cal-title" title={it.title}>
                  {it.title}
                  {it.kind === "series" && it.seasonNumber != null && (
                    <span className="cal-ep mono"> S{it.seasonNumber}{it.episodeNumber != null ? `E${it.episodeNumber}` : ""}</span>
                  )}
                </span>
                <span className="cal-when mono">{relDay(it.airDate)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
