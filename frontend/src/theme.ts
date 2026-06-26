import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "mc-theme";

function getInitial(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

// Тема ставится на обёртку .mc (data-theme). Дефолт — dark (где приземлился
// дизайн), ручной переключатель запоминается в localStorage.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    // Also set on <html> so palette tokens reach Radix/shadcn portals
    // (Dialog/Sheet/Popover render outside the .mc wrapper, at document body).
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}
