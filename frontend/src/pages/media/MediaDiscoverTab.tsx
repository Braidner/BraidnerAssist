// Discover tab for MediaPage: lookup search, recommendations, calendar.

import { useNavigate } from "react-router-dom";
import { Card } from "../../components/ui/Card.tsx";
import {
  posterUrl,
  type ArrLookupItem,
  type Recommendation,
  type CalendarItem,
  type TmdbItem,
} from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import { media as ms } from "./shared/mediaStyles.ts";

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
    <div className={ms.grid}>
      {items.map((it) => (
        <button
          key={it.kind + it.tmdbId}
          className={ms.item}
          title={it.title}
          disabled={busy === "tmdb" + it.tmdbId}
          onClick={() => onOpenTmdb(it)}
        >
          <span className={ms.posterBox}>
            {it.poster ? (
              <img
                className={ms.itemPoster}
                src={posterUrl(it.poster)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span
                className={cn(
                  ms.itemPoster,
                  "grid place-items-center text-xl opacity-50",
                )}
              >
                {it.kind === "movie" ? "🎬" : "📺"}
              </span>
            )}
          </span>
          <span className={ms.itemName}>{it.title}</span>
          <span className={ms.itemMeta}>
            {it.kind === "movie" ? "🎬 фильм" : "📺 сериал"}
            {it.year ? ` · ${it.year}` : ""}
          </span>
          <span className={ms.itemPlay}>
            {busy === "tmdb" + it.tmdbId ? "…" : "›"}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={ms.pageMain}>
      {/* Найти и добавить — поиск по всем тайтлам Sonarr/Radarr; пусто → подборки */}
      <Card
        icon="pulse"
        title="Найти и добавить"
        action={
          <span className={ms.panelCount}>
            {dq.trim()
              ? tmdb
                ? tmRes.length
                : dres.length
              : tmdb
                ? trending.length
                : recs.length}
          </span>
        }
      >
        <div className={cn(ms.field, "mt-1")}>
          <input
            className={ms.input}
            placeholder="Поиск фильмов и сериалов…"
            value={dq}
            onChange={(e) => setDq(e.target.value)}
          />
          {dq && (
            <button
              className={ms.button.iconSm}
              title="Очистить"
              onClick={() => setDq("")}
            >
              ✕
            </button>
          )}
        </div>

        {tmdb ? (
          dq.trim() ? (
            dsearching && tmRes.length === 0 ? (
              <div className={ms.grid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={ms.skeleton} />
                ))}
              </div>
            ) : tmRes.length === 0 ? (
              <div className={cn(ms.empty, "mt-2.5")}>Ничего не найдено.</div>
            ) : (
              renderTmdbGrid(tmRes)
            )
          ) : trending.length > 0 ? (
            renderTmdbGrid(trending)
          ) : (
            <div className={cn(ms.empty, "mt-2.5")}>
              Введи название, чтобы найти фильм или сериал.
            </div>
          )
        ) : dq.trim() ? (
          dsearching && dres.length === 0 ? (
            <div className={ms.grid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={ms.skeleton} />
              ))}
            </div>
          ) : dres.length === 0 ? (
            <div className={cn(ms.empty, "mt-2.5")}>Ничего не найдено.</div>
          ) : (
            <div className={ms.grid}>
              {dres.map((it) => (
                <button
                  key={it.kind + it.id}
                  className={ms.item}
                  title={it.title}
                  onClick={() => onOpenDiscover(it)}
                >
                  <span className={ms.posterBox}>
                    {it.poster ? (
                      <img
                        className={ms.itemPoster}
                        src={posterUrl(it.poster)}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <span
                        className={cn(
                          ms.itemPoster,
                          "grid place-items-center text-xl opacity-50",
                        )}
                      >
                        {it.kind === "movie" ? "🎬" : "📺"}
                      </span>
                    )}
                    {it.added && (
                      <span className={ms.seenBadge} title="Уже в библиотеке">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className={ms.itemName}>{it.title}</span>
                  <span className={ms.itemMeta}>
                    {it.kind === "movie" ? "🎬 фильм" : "📺 сериал"}
                    {it.year ? ` · ${it.year}` : ""}
                  </span>
                  <span className={ms.itemPlay}>›</span>
                </button>
              ))}
            </div>
          )
        ) : recs.length > 0 ? (
          <div className={ms.grid}>
            {recs.map((r) => {
              const key = "rec" + r.kind + r.id;
              return (
                <div key={key} className={ms.item}>
                  {r.poster ? (
                    <img
                      className={ms.itemPoster}
                      src={posterUrl(r.poster)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  ) : (
                    <span
                      className={cn(
                        ms.itemPoster,
                        "grid place-items-center text-xl opacity-50",
                      )}
                    >
                      {r.kind === "movie" ? "🎬" : "📺"}
                    </span>
                  )}
                  <span className={ms.itemName}>{r.title}</span>
                  <span className={ms.itemMeta}>
                    {r.kind === "movie" ? "фильм" : "сериал"}
                    {r.year ? ` · ${r.year}` : ""}
                  </span>
                  <button
                    className={cn(ms.button.accentSm, "mt-1.5 w-full")}
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
          <div className={cn(ms.empty, "mt-2.5")}>
            Введи название фильма или сериала, чтобы найти и открыть карточку.
          </div>
        )}
      </Card>

      {/* Скоро выйдет — ближайшие эпизоды/релизы (полное — на /media/calendar) */}
      {calendar.length > 0 && (
        <Card
          icon="chart"
          title="Скоро выйдет"
          action={
            <button
              className={ms.button.sm}
              onClick={() => nav("/media/calendar")}
            >
              Всё расписание
            </button>
          }
        >
          <div className={ms.calendarRows}>
            {calendar.slice(0, 6).map((it, i) => (
              <div key={i} className={ms.calendarRow}>
                <span className={ms.calendarKind}>
                  {it.kind === "series" ? "📺" : "🎬"}
                </span>
                <span className={ms.calendarTitle} title={it.title}>
                  {it.title}
                  {it.kind === "series" && it.seasonNumber != null && (
                    <span className={ms.calendarEp}>
                      {" "}
                      S{it.seasonNumber}
                      {it.episodeNumber != null ? `E${it.episodeNumber}` : ""}
                    </span>
                  )}
                </span>
                <span className={ms.calendarWhen}>{relDay(it.airDate)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
