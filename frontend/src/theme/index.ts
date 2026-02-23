import { theme, ThemeConfig } from 'antd';

const THEME_KEY = 'theme';

/** 用户选择的主题偏好：浅色、深色、跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** 实际生效的主题（仅亮/暗，用于渲染） */
export type ThemeMode = 'light' | 'dark';

export function getStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
  } catch (_) {}
  return 'system';
}

export function setStoredTheme(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch (_) {}
}

/** 根据系统 prefers-color-scheme 得到当前应使用的亮/暗 */
export function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 根据偏好得到实际生效的主题 */
export function getResolvedTheme(preference: ThemePreference): ThemeMode {
  return preference === 'system' ? getSystemTheme() : preference;
}

export function getThemeConfig(mode?: ThemeMode): ThemeConfig {
  const m = mode ?? getResolvedTheme(getStoredTheme());

  const shared: ThemeConfig = {
    token: {
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      borderRadius: 10,
      borderRadiusLG: 14,
      borderRadiusSM: 8,
      wireframe: false,
    },
    components: {
      Card: {
        borderRadiusLG: 16,
      },
      Button: {
        borderRadius: 10,
        controlHeight: 38,
        controlHeightLG: 44,
      },
      Table: {
        borderRadiusLG: 12,
        headerBg: 'transparent',
      },
      Input: {
        borderRadius: 10,
        controlHeight: 38,
      },
      Select: {
        borderRadius: 10,
        controlHeight: 38,
      },
      DatePicker: {
        borderRadius: 10,
        controlHeight: 38,
      },
      Modal: {
        borderRadiusLG: 16,
      },
      Menu: {
        itemBorderRadius: 8,
      },
    },
  };

  if (m === 'dark') {
    return {
      ...shared,
      algorithm: theme.darkAlgorithm,
      token: {
        ...shared.token,
        colorPrimary: '#818cf8',
        colorInfo: '#818cf8',
        colorSuccess: '#34d399',
        colorWarning: '#fbbf24',
        colorError: '#f87171',
        colorBgContainer: '#1c1c2e',
        colorBgElevated: '#242440',
        colorBgLayout: '#121220',
        colorBorder: 'rgba(255,255,255,0.1)',
        colorBorderSecondary: 'rgba(255,255,255,0.06)',
        colorText: '#e2e2f0',
        colorTextSecondary: '#9ca3b8',
        colorTextTertiary: '#6b7294',
      },
      components: {
        ...shared.components,
        Card: {
          ...shared.components?.Card,
          colorBgContainer: '#1c1c2e',
        },
        Table: {
          ...shared.components?.Table,
          headerBg: 'rgba(255,255,255,0.04)',
          colorBgContainer: '#1c1c2e',
        },
        Modal: {
          ...shared.components?.Modal,
          contentBg: '#242440',
          headerBg: '#242440',
        },
        Menu: {
          ...shared.components?.Menu,
          itemBorderRadius: 8,
          darkItemBg: 'transparent',
          darkItemSelectedBg: 'rgba(129,140,248,0.2)',
        },
      },
    };
  }

  return {
    ...shared,
    algorithm: theme.defaultAlgorithm,
    token: {
      ...shared.token,
      colorPrimary: '#6366f1',
      colorInfo: '#6366f1',
      colorSuccess: '#22c55e',
      colorWarning: '#f59e0b',
      colorError: '#ef4444',
      colorBgLayout: '#f0f2f8',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorText: '#1e1b4b',
      colorTextSecondary: '#6b7280',
    },
  };
}
