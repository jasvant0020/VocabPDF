// src/utils/theme.ts
// Centralized theme definitions for dark/light mode support

export const Colors = {
  dark: {
    background: '#0F1117',
    surface: '#1A1D27',
    surfaceElevated: '#22263A',
    primary: '#6C63FF',
    primaryLight: '#8B84FF',
    accent: '#FF6B6B',
    accentGreen: '#43D9AD',
    accentAmber: '#FFB347',
    text: '#F0F0F8',
    textSecondary: '#9A9AB0',
    textMuted: '#5A5A7A',
    border: '#2A2D40',
    borderLight: '#1E2133',
    card: '#1E2133',
    success: '#43D9AD',
    warning: '#FFB347',
    error: '#FF6B6B',
    overlay: 'rgba(0,0,0,0.7)',
    white: '#FFFFFF',
    black: '#000000',
  },
  light: {
    background: '#F5F6FA',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    primary: '#6C63FF',
    primaryLight: '#8B84FF',
    accent: '#FF6B6B',
    accentGreen: '#2DBD94',
    accentAmber: '#E6962A',
    text: '#1A1D27',
    textSecondary: '#5A5A7A',
    textMuted: '#9A9AB0',
    border: '#E8E8F0',
    borderLight: '#F0F0F8',
    card: '#FFFFFF',
    success: '#2DBD94',
    warning: '#E6962A',
    error: '#FF6B6B',
    overlay: 'rgba(0,0,0,0.5)',
    white: '#FFFFFF',
    black: '#000000',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
};

export const Shadows = {
  dark: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 3,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 6,
    },
    lg: {
      shadowColor: '#6C63FF',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 10,
    },
  },
  light: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#6C63FF',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
  },
};
