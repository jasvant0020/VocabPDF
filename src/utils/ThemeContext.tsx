// src/utils/ThemeContext.tsx
// FIXED:
//  - Theme preference persisted to expo-file-system (no AsyncStorage dep needed)
//  - Instant toggle with no flicker (state update is synchronous after load)
//  - System theme followed via Appearance.addChangeListener
//  - Provides isDark, themeMode, colors, setThemeMode

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import * as FileSystem from "expo-file-system/legacy";
import { Colors } from './theme';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextType {
  isDark: boolean;
  themeMode: ThemeMode;
  colors: typeof Colors.dark;
  setThemeMode: (mode: ThemeMode) => void;
}

const PREF_PATH = (FileSystem.documentDirectory ?? '') + 'theme_pref.txt';

const resolveIsDark = (mode: ThemeMode, systemScheme: ColorSchemeName): boolean => {
  if (mode === 'system') return systemScheme === 'dark';
  return mode === 'dark';
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  themeMode: 'dark',
  colors: Colors.dark,
  setThemeMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );

  // Load saved pref on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await FileSystem.readAsStringAsync(PREF_PATH);
        const mode = saved.trim() as ThemeMode;
        if (['dark', 'light', 'system'].includes(mode)) {
          setThemeModeState(mode);
        }
      } catch {
        // File doesn't exist yet — keep default 'dark'
      }
    })();
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    // Persist (non-blocking)
    FileSystem.writeAsStringAsync(PREF_PATH, mode).catch(() => {});
  }, []);

  const isDark = resolveIsDark(themeMode, systemScheme);
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, colors, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
