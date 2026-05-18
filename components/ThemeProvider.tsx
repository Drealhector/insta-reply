"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type Ctx = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void };

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "insta-reply-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Hydrate from localStorage / system preference on first mount
  useEffect(() => {
    const saved = (typeof window !== "undefined" && (localStorage.getItem(STORAGE_KEY) as Theme | null)) || null;
    const initial: Theme =
      saved ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.classList.toggle("dark", t === "dark");
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark"), setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}

// Inline script that runs before React hydrates, so the page doesn't flash
// light-on-load when the user prefers dark. Put this in <head>.
export const themeBootScript = `
(function(){
  try {
    var t = localStorage.getItem('${STORAGE_KEY}');
    if (!t) {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
