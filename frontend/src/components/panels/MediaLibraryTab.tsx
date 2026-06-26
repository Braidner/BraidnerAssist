// Library tab for MediaPage: hero, continue-watching row, poster grid, filters.

import { useNavigate } from "react-router-dom";
import {
  refreshJellyfin, getMediaLibrary, jellyfinPosterUrl, jellyfinBackdropUrl,
  type LibraryItem, type ResumeItem,
} from "../../lib/api.ts";
import { useToast } from "../Toast.tsx";

interface MediaLibraryTabProps {
  library: LibraryItem[];
  setLibrary: (l: LibraryItem[]) => void;
  libReady: boolean;
  resume: ResumeItem[];
  fType: "all" | "Series" | "Movie";
  setFType: (v: "all" | "Series" | "Movie") => void;
  onlyUnwatched: boolean;
  setOnlyUnwatched: (v: boolean | ((prev: boolean) => boolean)) => void;
  sortBy: "name" | "year";
  shownLibrary: LibraryItem[];
  onPlayResume: (it: ResumeItem) => void;
  busy: string | null;
}

export function MediaLibraryTab({
  library,
  setLibrary,
  libReady,
  resume,
  fType,
  setFType,
  onlyUnwatched,
  setOnlyUnwatched,
  sortBy: _sortBy,
  shownLibrary,
  onPlayResume,
  busy: _busy,
}: MediaLibraryTabProps) {
  const nav = useNavigate();
  const toast = useToast();

  const openDetail = (it: LibraryItem) =>
    nav(`/media/${it.type === "Series" ? "series" : "movie"}/${it.id}`);

  return (
    <div className="lib-page">

      {/* Hero — first resume item, or first library item */}
      {(() => {
        const heroItem = resume[0]
          ? { id: resume[0].id, title: resume[0].title, type: "resume" as const, progress: resume[0].positionPct }
          : shownLibrary[0]
          ? { id: shownLibrary[0].id, title: shownLibrary[0].name, type: shownLibrary[0].type as string, progress: undefined }
          : null;
        if (!heroItem) return null;
        const colors = ['#cc3300','#0077dd','#00aaee','#8833ff','#ffaa00','#00b8ae'];
        const accent = colors[heroItem.title.charCodeAt(0) % colors.length];
        const bg = `radial-gradient(ellipse at 60% 40%, ${accent}88 0%, ${accent}22 50%, #050508 100%)`;
        const handleHeroPlay = () => {
          const item = resume[0];
          if (item) { onPlayResume(item); return; }
          const lib = shownLibrary[0];
          if (lib) nav(`/media/${lib.type === "Series" ? "series" : "movie"}/${lib.id}`);
        };
        return (
          <div className="lib-hero" style={{ cursor: 'pointer' }} onClick={handleHeroPlay}>
            <div className="lib-hero-bg" style={{ background: bg }}>
              <img
                src={jellyfinBackdropUrl(heroItem.id)}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="lib-hero-glow" style={{ background: `radial-gradient(ellipse at 74% 50%, ${accent}40 0%, transparent 58%)` }}/>
            <div className="lib-hero-grain"/>
            <div className="lib-hero-vignette"/>
            <div className="lib-hero-body">
              <div className="lib-hero-eyebrow">
                <span className="lib-hero-dot" style={{ background: accent }}/>
                {heroItem.progress != null ? 'ПРОДОЛЖИТЬ ПРОСМОТР' : 'В БИБЛИОТЕКЕ'}
              </div>
              <h1 className="lib-hero-title">{heroItem.title}</h1>
              <div className="lib-hero-meta">
                <span className="lmono">{heroItem.type === 'Series' ? 'СЕРИАЛ' : heroItem.type === 'Movie' ? 'ФИЛЬМ' : ''}</span>
              </div>
              <div className="lib-hero-actions">
                <button className="lib-btn-play" style={{ '--bc': accent } as React.CSSProperties}
                  onClick={(e) => { e.stopPropagation(); handleHeroPlay(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 21,12 6,21"/></svg>
                  Смотреть
                </button>
              </div>
              {heroItem.progress != null && (
                <div className="lib-hero-prog-row">
                  <div className="lib-prog-track">
                    <div className="lib-prog-fill" style={{ width: heroItem.progress + '%', background: accent }}/>
                  </div>
                  <span className="lmono lib-prog-lbl">{Math.round(heroItem.progress)}% просмотрено</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Continue watching row */}
      {resume.length > 0 && (
        <div className="lib-section">
          <div className="lib-sec-head">
            <span className="lib-sec-title">ПРОДОЛЖИТЬ ПРОСМОТР</span>
            <span className="lib-count-badge lmono">{resume.length}</span>
          </div>
          <div className="lib-h-track">
            {resume.map((it) => {
              const colors = ['#cc3300','#0077dd','#00aaee','#8833ff','#ffaa00','#00b8ae'];
              const accent = colors[it.title.charCodeAt(0) % colors.length];
              return (
                <div key={it.id} className="watch-card" onClick={() => onPlayResume(it)}>
                  <div className="watch-thumb">
                    <div className="watch-bg">
                      <img src={jellyfinPosterUrl(it.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}/>
                    </div>
                    <div className="watch-vignette"/>
                    <div className="watch-play-layer">
                      <div className="watch-play-btn">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 21,12 6,21"/></svg>
                      </div>
                    </div>
                    <div className="watch-prog-bar">
                      <div className="watch-prog-fill" style={{ width: it.positionPct + '%', background: accent }}/>
                    </div>
                  </div>
                  <div className="watch-info">
                    <div className="watch-title">{it.title}</div>
                    <div className="watch-meta lmono">
                      <span style={{ color: accent }}>{Math.round(it.positionPct)}% просмотрено</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Library poster grid */}
      <div className="lib-section">
        <div className="lib-sec-head">
          <span className="lib-sec-title">БИБЛИОТЕКА</span>
          <span className="lib-count-badge lmono">{shownLibrary.length}</span>
          <button className="lib-scan-btn" onClick={() => refreshJellyfin().then(() => getMediaLibrary().then((l) => { setLibrary(l); toast.success("Скан библиотеки запущен"); }))}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M3 12h18"/></svg>
            Сканировать
          </button>
        </div>

        <div className="lib-filter-tabs">
          {[
            { label: 'Все', val: 'all' as const },
            { label: 'Сериалы', val: 'Series' as const },
            { label: 'Фильмы', val: 'Movie' as const },
          ].map(f => (
            <button key={f.val} className={`lib-ftab${fType === f.val ? ' ft-on' : ''}`} onClick={() => setFType(f.val)}>{f.label}</button>
          ))}
          <button className={`lib-ftab${onlyUnwatched ? ' ft-on' : ''}`} onClick={() => setOnlyUnwatched(v => !v)}>Не просмотрено</button>
        </div>

        {!libReady ? (
          <div className="lib-h-track lib-poster-row">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ flex: '0 0 auto', width: 160, aspectRatio: '2/3', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}/>
            ))}
          </div>
        ) : shownLibrary.length === 0 ? (
          <div style={{ padding: '24px 0', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            {library.length === 0 ? 'Библиотека пуста или ещё не отсканирована.' : 'Ничего не подходит под фильтр.'}
          </div>
        ) : (
          <div className="lib-h-track lib-poster-row">
            {shownLibrary.map((it) => {
              const isSeries = it.type === "Series";
              const colors = ['#cc3300','#0077dd','#00aaee','#8833ff','#ffaa00','#00b8ae'];
              const accent = colors[it.name.charCodeAt(0) % colors.length];
              const initials = it.name.split(' ').slice(0,2).map((w: string) => w[0] || '').join('').toUpperCase();
              return (
                <div key={it.id} className="poster-card" onClick={() => openDetail(it)}>
                  <div className="poster-art" style={{ '--pa': accent } as React.CSSProperties}>
                    <img
                      src={jellyfinPosterUrl(it.id)}
                      alt=""
                      loading="lazy"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 60% 40%, ${accent}88 0%, ${accent}22 50%, #050508 100%)`, zIndex: 0 }}/>
                    <div style={{ position: 'absolute', bottom: '-10%', right: '-4%', lineHeight: 1, fontFamily: "'Oswald', sans-serif", fontSize: 100, color: 'rgba(255,255,255,0.07)', userSelect: 'none', pointerEvents: 'none', zIndex: 0 }}>{initials}</div>
                    {isSeries && it.childCount ? <span className="poster-badge">{it.childCount} сез.</span> : null}
                    <div className="poster-overlay" style={{ zIndex: 5 }}>
                      <div className="poster-play-btn">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 21,12 6,21"/></svg>
                      </div>
                      {it.unplayed > 0 && <div className="poster-genres">{it.unplayed} не просмотрено</div>}
                    </div>
                    {it.played && <span className="poster-badge" style={{ background: 'var(--accent)', color: '#000', top: 9, left: 9, right: 'auto' }}>✓</span>}
                  </div>
                  <div className="poster-info">
                    <div className="poster-title">{it.name}</div>
                    <div className="poster-sub lmono">{isSeries ? 'сериал' : 'фильм'}{it.year ? ` · ${it.year}` : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
