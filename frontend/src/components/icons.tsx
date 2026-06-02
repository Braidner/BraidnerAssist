import type { SVGProps } from "react";

// Порт набора иконок из дизайн-бандла (mc-widgets.jsx). stroke = currentColor.
type IconProps = SVGProps<SVGSVGElement>;

export const icons = {
  check: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  plus: (p: IconProps) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  list: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  cpu: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M10 1.5v3M14 1.5v3M10 19.5v3M14 19.5v3M1.5 10h3M1.5 14h3M19.5 10h3M19.5 14h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  pulse: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M2 12h4l3-8 6 16 3-8h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  note: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M5 3h10l4 4v14H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 3v5h5M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  bot: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="4" y="8" width="16" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V4M12 4h-2M9 13h.01M15 13h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  moon: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M20 14.5A8 8 0 119.5 4 6.5 6.5 0 0020 14.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  sun: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 1.5v3M12 19.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1.5 12h3M19.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  dumbbell: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  drop: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 3s6 6.5 6 11a6 6 0 11-12 0c0-4.5 6-11 6-11z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  target: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  flame: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 3c1 3-2 4-2 7a2 2 0 104 0c2 1.5 3 3.5 3 6a5 5 0 11-10 0c0-3 2-4 2-7 1 1 2 1 3-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  server: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="4" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 7.5h.01M7 16.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  cloud: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M7 18a4 4 0 01-.5-7.97A6 6 0 0118 9.5a3.5 3.5 0 01-.5 8.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  home: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 11l8-7 8 7M6 10v9h12v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  close: (p: IconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
  trash: (p: IconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 001 1h10a1 1 0 001-1l1-13M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  git: (p: IconProps) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 6h5M6 8.5v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  external: (p: IconProps) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  gear: (p: IconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} as const;

export type IconName = keyof typeof icons;
