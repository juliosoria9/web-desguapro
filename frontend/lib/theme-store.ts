import { create } from 'zustand';

interface ThemeState {
  dark: boolean;
  toggle: () => void;
  load: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  dark: false,
  toggle: () =>
    set((state) => {
      const next = !state.dark;
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', next ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', next);
      }
      return { dark: next };
    }),
  load: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored ? stored === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', dark);
    set({ dark });
  },
}));
