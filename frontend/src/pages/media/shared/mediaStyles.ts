import { cn } from "@/lib/utils.ts";
import { ui } from "@/lib/ui.ts";

export const media = {
  page: "flex flex-1 flex-col",
  pageCols:
    "grid grid-cols-[1.4fr_1fr] items-start gap-[22px] max-[900px]:grid-cols-1",
  pageMain: "flex flex-col gap-5",
  pageSide: "flex flex-col gap-5",
  input: cn(ui.input, "min-w-0 flex-1"),
  field: "flex items-stretch gap-2",
  empty: "py-3 font-mono text-xs text-muted",
  panelCount: ui.panelCount,
  button: {
    base: ui.button.base,
    sm: ui.button.sm,
    icon: ui.button.icon,
    iconSm: ui.button.iconSm,
    accent: cn(ui.button.base, ui.button.accent),
    accentSm: cn(ui.button.sm, ui.button.accent),
    accentIcon: cn(ui.button.icon, ui.button.accent),
    accentIconSm: cn(ui.button.iconSm, ui.button.accent),
  },
  seg: "mb-3 flex gap-1.5 rounded-xl bg-surface p-1",
  segButton:
    "h-8 flex-1 rounded-[9px] border-0 bg-transparent text-cell font-medium text-muted transition-colors hover:text-ink",
  segButtonOn: "bg-accent text-accent-ink hover:text-accent-ink",
  label: "mb-1.5 mt-[18px] font-mono text-data text-muted",
  subtleToggle:
    "mt-[22px] w-full border-0 bg-transparent py-2 text-left font-mono text-pill text-muted transition-colors hover:text-ink",
  list: "mt-3.5 flex flex-col gap-[9px]",
  row: "flex flex-col gap-2 rounded-xl border border-hair bg-surface p-3",
  rowTitle:
    "line-clamp-2 text-cell leading-[1.35] text-ink [font-family:var(--font-ui)]",
  rowFoot: "flex items-center gap-2.5",
  rowMeta:
    "min-w-0 flex-1 truncate whitespace-nowrap font-mono text-label text-muted",
  okText: "text-ok",
  badge:
    "whitespace-nowrap rounded-full bg-accent px-2 py-0.5 font-mono text-2xs text-accent-ink",
  lang: "whitespace-nowrap rounded-full bg-info/15 px-2 py-0.5 font-mono text-2xs text-info",
  reject: "whitespace-nowrap font-mono text-2xs text-bad",
  checkbox: "size-[15px] flex-none cursor-pointer accent-accent",
  progress: "h-1.5 min-w-20 flex-1 overflow-hidden rounded bg-groove",
  progressFill: "h-full rounded bg-accent",
  grid: "mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 max-narrow:grid-cols-[repeat(auto-fill,minmax(116px,1fr))] max-narrow:gap-2",
  item: "relative flex min-h-[76px] cursor-pointer flex-col gap-1 overflow-hidden rounded-xl border border-hair bg-raise p-3 pt-0 text-left text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60",
  posterBox: "relative -mx-3 mb-2 block w-[calc(100%+24px)]",
  itemPoster: "mb-2 aspect-[2/3] w-full bg-groove object-cover",
  itemName: "line-clamp-2 text-cell leading-[1.3]",
  itemMeta: "font-mono text-2xs text-muted",
  itemPlay: "absolute bottom-2.5 right-2.5 text-sm text-accent",
  seenBadge:
    "absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-[10px] bg-emerald-400 px-1.5 text-data font-bold text-[#06241a]",
  skeleton:
    "aspect-[2/3] animate-[skel-pulse_1.4s_ease-in-out_infinite] rounded-xl bg-surface",
  calendarRows: "mt-2 flex flex-col gap-1.5",
  calendarRow: "flex items-center gap-[9px] rounded-[10px] px-2.5 py-[7px]",
  calendarKind: "flex-none text-sm",
  calendarTitle: "min-w-0 flex-1 truncate whitespace-nowrap text-cell",
  calendarEp: "font-mono text-accent",
  calendarWhen: "flex-none font-mono text-data text-muted",
  libPage: "media-safe-bottom pb-[72px]",
  libHero: "relative mb-[52px] h-[500px] overflow-hidden",
  libHeroBg: "absolute inset-0",
  libHeroGlow: "pointer-events-none absolute inset-0",
  libHeroGrain:
    "pointer-events-none absolute inset-0 bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23g)' opacity='0.14'/%3E%3C/svg%3E\")] bg-[length:180px] opacity-50 mix-blend-overlay",
  libHeroVignette:
    "absolute inset-0 bg-[linear-gradient(to_right,rgba(9,9,13,0.97)_0%,rgba(9,9,13,0.65)_42%,rgba(9,9,13,0.06)_72%,transparent_100%),linear-gradient(to_top,rgba(0,0,0,0.6)_0%,transparent_30%),linear-gradient(to_bottom,rgba(0,0,0,0.25)_0%,transparent_18%)]",
  libHeroBody:
    "relative z-[1] flex h-full max-w-[660px] flex-col justify-end px-[52px] pb-12 max-narrow:px-6",
  libEyebrow:
    "mb-2.5 flex items-center gap-[9px] [font-family:Syne,var(--font)] text-2xs font-extrabold uppercase tracking-6 text-white/40",
  libHeroTitle:
    "mb-3.5 [font-family:Oswald,var(--font)] text-hero font-bold leading-[0.92] text-white max-narrow:text-5xl",
  libHeroMeta: "mb-3.5 flex flex-wrap items-center gap-2",
  libActions: "mb-6 flex flex-wrap gap-3",
  playButton:
    "flex h-auto cursor-pointer items-center gap-2 rounded-[7px] border-0 bg-[var(--bc,var(--accent))] px-[26px] py-3 [font-family:Syne,var(--font)] text-body font-bold tracking-2 text-white transition-[filter,transform] shadow-[0_14px_34px_rgba(229,51,51,0.24),inset_0_1px_0_rgba(255,255,255,0.18)] hover:brightness-[1.12] hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(229,51,51,0.28),inset_0_1px_0_rgba(255,255,255,0.20)] tracking-2 transition-all duration-300 ease-out disabled:pointer-events-none disabled:opacity-55",
  progRow: "flex max-w-[360px] items-center gap-3",
  progTrack: "h-1 flex-1 overflow-hidden rounded bg-white/15",
  progFill: "h-full rounded",
  progLabel: "text-data text-white/50",
  section: "mt-8",
  sectionHead: "mb-3 flex items-center gap-3",
  sectionTitle:
    "[font-family:Syne,var(--font)] text-xs font-extrabold uppercase tracking-5 text-ink",
  countBadge:
    "rounded-full bg-surface px-2 py-0.5 font-mono text-2xs text-muted",
  hTrack:
    "-mt-4 flex gap-4 overflow-x-auto overflow-y-hidden scroll-smooth pb-7 pt-4 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden",
  railInset: "px-[clamp(22px,4vw,56px)] max-mob:px-5",
  railHeaderInset: "px-[clamp(22px,4vw,56px)] max-mob:px-5",
  posterRow: "gap-5",
  scanButton:
    "ml-auto flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-hair bg-raise px-3 py-2 [font-family:Syne,var(--font)] text-data font-bold uppercase tracking-3 text-muted transition-colors hover:text-ink",
  filterTabs: "mb-4 flex flex-wrap gap-2",
  filterTab:
    "rounded-full border border-hair bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink",
  filterTabOn: "bg-accent text-accent-ink hover:text-accent-ink",
  watchCard: "media-hover-card relative w-[260px] flex-none cursor-pointer",
  watchThumb: "media-hover-art relative aspect-video overflow-hidden rounded-xl bg-groove",
  watchVignette:
    "absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.55),transparent_65%)] transition-[background] duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:bg-[linear-gradient(to_top,rgba(0,0,0,0.7),rgba(0,0,0,0.2)_60%)]",
  watchPlayLayer:
    "absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100",
  roundPlay:
    "grid size-11 place-items-center rounded-full bg-white/90 text-black scale-[0.86] transition-transform duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-100",
  watchProg: "absolute bottom-0 left-0 right-0 h-1 bg-white/20",
  watchInfo: "mt-2",
  watchTitle: "truncate text-sm font-semibold text-ink",
  watchMeta: "mt-1 font-mono text-2xs",
  posterCard: "media-hover-card relative w-40 flex-none cursor-pointer",
  posterArt:
    "media-hover-art relative aspect-[2/3] overflow-hidden rounded-[10px] bg-groove",
  posterBadge:
    "absolute right-2 top-2 z-[2] rounded-full bg-black/70 px-2 py-1 text-2xs font-semibold text-white",
  posterOverlay:
    "media-card-overlay absolute inset-0 z-[3] flex items-end justify-end p-2 opacity-0 transition-opacity duration-700 ease-out",
  posterTopActions:
    "absolute left-2 right-2 top-2 z-[4] flex items-center justify-end gap-2 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 group-focus-within:opacity-100",
  posterActionButton:
    "grid size-8 cursor-pointer place-items-center rounded-full border border-white/15 bg-black/55 text-white/80 backdrop-blur-md transition-all hover:bg-white/90 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
  posterRating:
    "absolute bottom-2 left-2 z-[4] flex items-center gap-1 rounded bg-black/65 px-2 py-1 text-2xs font-semibold text-white",
  posterGenres:
    "absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 text-2xs text-white",
  posterInfo: "mt-2",
  posterTitle: "truncate text-sm font-semibold text-ink",
  posterSub: "mt-1 font-mono text-2xs text-muted",

  // Hero enrichments
  heroMetaRow: "mb-3 flex flex-wrap items-center gap-2 font-mono text-xs text-white/60",
  heroMetaSep: "text-white/25",
  heroGenreTag:
    "rounded-[5px] border border-white/20 px-2 py-0.5 text-2xs font-medium uppercase tracking-genre text-white/80",
  heroDesc:
    "mb-5 max-w-[420px] text-body leading-relaxed text-white/70 line-clamp-2",
  heroGhostBtn:
    "flex h-auto cursor-pointer items-center gap-2 rounded-[7px] border border-white/30 bg-transparent px-[22px] py-3 [font-family:Syne,var(--font)] text-body font-bold tracking-2 text-white/90 shadow-none transition-colors hover:-translate-y-0.5 hover:border-white/58 hover:bg-white/[0.075] hover:text-white hover:shadow-none focus-visible:border-white/55 focus-visible:ring-white/35 active:bg-white/[0.055] tracking-2 transition-all duration-300 ease-out disabled:pointer-events-none disabled:opacity-55",
  heroLoadingSheen:
    "pointer-events-none absolute inset-0 z-[1] animate-[skel-pulse_1.4s_ease-in-out_infinite] bg-[linear-gradient(100deg,transparent_0%,rgba(255,255,255,0.045)_45%,transparent_78%)]",

  // Discovery page
  discPage: "media-safe-bottom pb-[72px]",
  discHeader: "mb-8 flex items-center gap-4",
  discHeaderIcon:
    "grid size-14 shrink-0 place-items-center rounded-2xl bg-surface text-accent",
  discHeaderTitle:
    "[font-family:Oswald,var(--font)] text-[34px] font-bold uppercase leading-none text-ink",
  discHeaderSub: "mt-1 font-mono text-data text-muted",
  discShuffleBtn:
    "ml-auto flex cursor-pointer items-center gap-2 rounded-[11px] border border-hair bg-surface px-4 py-2 [font-family:Syne,var(--font)] text-cell font-bold tracking-2 text-ink transition-colors hover:border-accent hover:text-accent",
  discSection: "mb-11",
  discSecHead: "mb-3 flex items-center gap-3",
  discSecLabel:
    "[font-family:Oswald,var(--font)] text-xl font-bold uppercase tracking-3 text-ink",
  discSecLink:
    "cursor-pointer border-0 bg-transparent p-0 text-left transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
  discSecLine: "h-px flex-1 bg-hair",
  discSecCount: "font-mono text-data text-muted",
  posterRankBadge:
    "pointer-events-none absolute bottom-1 right-1 z-[1] select-none [font-family:Oswald,var(--font)] text-[52px] font-bold leading-none text-white/[0.07]",

  // Search toggle in discover
  discSearchBar: "mb-6 flex items-stretch gap-2",

};
