import { cn } from "./cn.ts";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70";

export const ui = {
  focus,
  shell:
    "mc min-h-screen flex-col bg-page text-ink antialiased [font-family:var(--font-ui)]",
  content: "flex min-h-0 flex-1",
  main:
    "app-main flex min-w-0 flex-1 flex-col pb-9 max-mob:gap-[18px] max-mob:pb-[30px]",
  surface:
    "rounded-card border border-hair bg-raise transition-colors duration-150",
  panel:
    "rounded-card border border-hair bg-raise p-6 min-w-0 max-mob:px-[18px] max-mob:py-5",
  panelHead: "mb-4 flex items-center justify-between gap-3",
  panelTitle:
    "flex items-center gap-2.5 font-mono text-cell font-medium uppercase tracking-5 text-muted",
  panelCount: "whitespace-nowrap font-mono text-pill text-muted",
  button: {
    base: cn(
      "inline-flex h-9 flex-none cursor-pointer items-center justify-center gap-[7px] whitespace-nowrap rounded-xl border border-hair bg-raise px-4 text-body font-medium leading-none text-ink-soft transition-[background-color,border-color,color,transform] duration-150",
      "hover:border-accent/40 hover:bg-surface-2 hover:text-ink hover:-translate-y-px",
      "active:translate-y-0 active:border-accent/60 active:text-accent disabled:cursor-default disabled:opacity-45",
      focus,
    ),
    sm: "h-[30px] gap-[5px] rounded-[10px] px-3 text-xs",
    icon: "w-9 px-0",
    iconSm: "h-[30px] w-[30px] px-0",
    accent:
      "border-accent/70 bg-accent text-accent-ink shadow-[var(--accent-glow-sm)] hover:bg-accent hover:text-accent-ink hover:shadow-[var(--accent-glow)] active:text-accent-ink",
  },
  input: cn(
    "min-w-0 rounded-[10px] border border-hair bg-surface px-3 py-2 text-body text-ink outline-none transition-colors placeholder:text-muted",
    "focus:border-accent/60 focus:outline focus:outline-2 focus:outline-accent/20 focus:outline-offset-1",
  ),
  iconButton: cn(
    "grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-[13px] border border-hair bg-raise text-ink-soft transition-colors",
    "hover:border-accent/40 hover:bg-surface-2 hover:text-ink active:text-accent disabled:cursor-default disabled:opacity-45",
    focus,
  ),
  pill: cn(
    "inline-flex items-center justify-center rounded-full border border-hair bg-raise px-3 py-1.5 text-xs text-muted transition-colors",
    "hover:border-accent/40 hover:bg-surface-2 hover:text-ink",
    focus,
  ),
  overlay:
    "fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity duration-200",
  drawer:
    "fixed bottom-0 right-0 top-0 z-50 w-[min(420px,92vw)] overflow-hidden rounded-l-card border-l border-hair bg-raise",
  drawerInner: "flex h-full flex-col overflow-y-auto px-[22px] pb-7 pt-6",
  drawerHead: "mb-4 flex items-center justify-between gap-3",
  drawerKind:
    "flex min-w-0 items-center gap-[7px] font-mono text-pill text-muted",
};
