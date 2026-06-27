import type { ReactNode } from "react";
import { media as ms } from "./mediaStyles.ts";

interface MediaHeroProgress {
  valuePct: number;
  label: string;
}

interface MediaHeroProps {
  title: string;
  eyebrow: ReactNode;
  backgroundSrc?: string | null;
  overview?: string | null;
  metaItems?: ReactNode[];
  badges?: string[];
  actions: ReactNode;
  progress?: MediaHeroProgress | null;
  onOpen?: () => void;
  loading?: boolean;
}

export function MediaHero({
  title,
  eyebrow,
  backgroundSrc,
  overview,
  metaItems = [],
  badges = [],
  actions,
  progress,
  onOpen,
  loading = false,
}: MediaHeroProps) {
  const filteredMeta = metaItems.filter(Boolean);

  return (
    <div
      className={ms.libHero}
      style={{ cursor: onOpen ? "pointer" : "default" }}
      onClick={onOpen}
      aria-busy={loading}
    >
      <div
        className={ms.libHeroBg}
        style={{
          background:
            "radial-gradient(circle at 78% 32%, rgba(229,51,51,0.16), transparent 34%), linear-gradient(135deg, #09090d 0%, #15141b 52%, #08080c 100%)",
        }}
      >
        {backgroundSrc ? (
          <>
            <img
              src={backgroundSrc}
              alt=""
              style={{
                position: "absolute",
                inset: "-24px",
                width: "calc(100% + 48px)",
                height: "calc(100% + 48px)",
                objectFit: "cover",
                objectPosition: "top center",
                opacity: 0.22,
                filter: "blur(22px) saturate(1.18)",
                transform: "scale(1.04)",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <img
              src={backgroundSrc}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
                opacity: 0.55,
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </>
        ) : null}
      </div>
      <div className={ms.libHeroGlow} style={{ background: "radial-gradient(ellipse at 74% 50%, rgba(255,255,255,0.02) 0%, transparent 58%)" }} />
      <div className={ms.libHeroGrain} />
      <div className={ms.libHeroVignette} />
      {loading ? <div className={ms.heroLoadingSheen} /> : null}
      <div className={ms.libHeroBody}>
        <div className={ms.libEyebrow} style={{ animation: "heroSlide 0.55s 0.08s cubic-bezier(.22,.61,.36,1) both" }}>
          <span className="size-1.5 shrink-0 rounded-full bg-accent" />
          {eyebrow}
        </div>

        <h1 className={ms.libHeroTitle} style={{ animation: "heroSlide 0.65s 0.16s cubic-bezier(.22,.61,.36,1) both" }}>
          {title}
        </h1>

        {filteredMeta.length > 0 || badges.length > 0 ? (
          <div className={ms.heroMetaRow} style={{ animation: "heroSlide 0.55s 0.28s cubic-bezier(.22,.61,.36,1) both" }}>
            {filteredMeta.map((item, idx) => (
              <span key={idx} className="contents">
                {idx > 0 ? <span className={ms.heroMetaSep}>·</span> : null}
                <span>{item}</span>
              </span>
            ))}
            {badges.slice(0, 4).map((badge) => (
              <span key={badge} className={ms.heroGenreTag}>
                {badge}
              </span>
            ))}
          </div>
        ) : null}

        {overview ? (
          <p className={ms.heroDesc} style={{ animation: "heroSlide 0.55s 0.38s cubic-bezier(.22,.61,.36,1) both" }}>
            {overview}
          </p>
        ) : null}

        <div className={ms.libActions} style={{ animation: "heroSlide 0.55s 0.46s cubic-bezier(.22,.61,.36,1) both" }}>
          {actions}
        </div>

        {progress ? (
          <div className={ms.progRow} style={{ animation: "heroSlide 0.55s 0.54s cubic-bezier(.22,.61,.36,1) both" }}>
            <div className={ms.progTrack}>
              <div className={ms.progFill} style={{ width: `${progress.valuePct}%` }} />
            </div>
            <span className={ms.progLabel}>{progress.label}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
