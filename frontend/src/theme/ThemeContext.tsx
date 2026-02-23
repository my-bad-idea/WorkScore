import { createContext, useContext } from 'react';
import type { ThemeMode } from './index';

const ThemeContext = createContext<ThemeMode>('light');

export function ThemeProvider({ value, children }: { value: ThemeMode; children: React.ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeMode {
  return useContext(ThemeContext);
}
