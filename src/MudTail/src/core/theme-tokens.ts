/**
 * Theme tokens and CSS export generator for MudBlazor & Material UI in Tailwind CSS
 * Includes complete 0-24 elevation levels, crisp Material border radii, and utility generation.
 */

export interface PalettePreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  tertiary: string;
  surface: string;
  background: string;
  darkSurface: string;
  darkBackground: string;
  accent: string;
}

export const PALETTE_PRESETS: Record<string, PalettePreset> = {
  mudblazor: {
    id: 'mudblazor',
    name: 'MudBlazor Purple (Default)',
    primary: '#594ae2',
    secondary: '#ff4081',
    tertiary: '#1ec8a5',
    surface: '#ffffff',
    background: '#f8fafc',
    darkSurface: '#1e1e2d',
    darkBackground: '#12121e',
    accent: '#7950f2',
  },
  materialBlue: {
    id: 'materialBlue',
    name: 'Material Blue 3',
    primary: '#0284c7',
    secondary: '#ec4899',
    tertiary: '#06b6d4',
    surface: '#ffffff',
    background: '#f0f9ff',
    darkSurface: '#0f172a',
    darkBackground: '#020617',
    accent: '#38bdf8',
  },
  emeraldGreen: {
    id: 'emeraldGreen',
    name: 'Emerald FinTech',
    primary: '#059669',
    secondary: '#d97706',
    tertiary: '#14b8a6',
    surface: '#ffffff',
    background: '#f0fdf4',
    darkSurface: '#064e3b',
    darkBackground: '#022c22',
    accent: '#34d399',
  },
  sunsetAmber: {
    id: 'sunsetAmber',
    name: 'Amber Glow',
    primary: '#ea580c',
    secondary: '#8b5cf6',
    tertiary: '#f59e0b',
    surface: '#ffffff',
    background: '#fff7ed',
    darkSurface: '#1c1917',
    darkBackground: '#0c0a09',
    accent: '#fb923c',
  },
  deepIndigo: {
    id: 'deepIndigo',
    name: 'Deep Cyber Indigo',
    primary: '#6366f1',
    secondary: '#a855f7',
    tertiary: '#3b82f6',
    surface: '#ffffff',
    background: '#faf5ff',
    darkSurface: '#181824',
    darkBackground: '#0e0e17',
    accent: '#818cf8',
  },
};

export interface ThemeOptions {
  palette: PalettePreset;
  borderRadius: number; // in px (e.g. 0, 2, 4, 6, 8, 12; default 4px for MudBlazor/Material)
  elevationScale: number; // 1 to 3 multiplier
  darkMode: boolean;
}

/**
 * Returns raw shadow string for any elevation level 0 through 24
 */
export function getElevationShadow(level: number, scale = 1, isDark = false): string {
  if (level <= 0) return 'none';
  const clamped = Math.min(24, Math.max(1, Math.round(level)));

  // Standard Material umbra / penumbra / ambient shadow components
  const baseUmbra = [
    '0px 0px 0px 0px',
    '0px 2px 1px -1px',
    '0px 3px 1px -2px',
    '0px 3px 3px -2px',
    '0px 2px 4px -1px',
    '0px 3px 5px -1px',
    '0px 3px 5px -1px',
    '0px 4px 5px -2px',
    '0px 5px 5px -3px',
    '0px 5px 6px -3px',
    '0px 6px 6px -3px',
    '0px 6px 7px -4px',
    '0px 7px 8px -4px',
    '0px 7px 8px -4px',
    '0px 7px 9px -4px',
    '0px 8px 9px -5px',
    '0px 8px 10px -5px',
    '0px 8px 11px -5px',
    '0px 9px 11px -5px',
    '0px 9px 12px -6px',
    '0px 10px 13px -6px',
    '0px 10px 13px -6px',
    '0px 10px 14px -6px',
    '0px 11px 14px -7px',
    '0px 11px 15px -7px',
  ];

  const basePenumbra = [
    '0px 0px 0px 0px',
    '0px 1px 1px 0px',
    '0px 2px 2px 0px',
    '0px 3px 4px 0px',
    '0px 4px 5px 0px',
    '0px 5px 8px 0px',
    '0px 6px 10px 0px',
    '0px 7px 10px 1px',
    '0px 8px 10px 1px',
    '0px 9px 12px 1px',
    '0px 10px 14px 1px',
    '0px 11px 15px 1px',
    '0px 12px 17px 2px',
    '0px 13px 19px 2px',
    '0px 14px 21px 2px',
    '0px 15px 22px 2px',
    '0px 16px 24px 2px',
    '0px 17px 26px 2px',
    '0px 18px 28px 2px',
    '0px 19px 29px 2px',
    '0px 20px 31px 3px',
    '0px 21px 33px 3px',
    '0px 22px 35px 3px',
    '0px 23px 36px 3px',
    '0px 24px 38px 3px',
  ];

  const baseAmbient = [
    '0px 0px 0px 0px',
    '0px 1px 3px 0px',
    '0px 1px 5px 0px',
    '0px 1px 8px 0px',
    '0px 1px 10px 0px',
    '0px 1px 14px 0px',
    '0px 1px 18px 0px',
    '0px 2px 16px 1px',
    '0px 3px 14px 2px',
    '0px 3px 16px 2px',
    '0px 4px 18px 3px',
    '0px 4px 20px 3px',
    '0px 5px 22px 4px',
    '0px 5px 24px 4px',
    '0px 5px 26px 4px',
    '0px 6px 28px 5px',
    '0px 6px 30px 5px',
    '0px 6px 32px 5px',
    '0px 7px 34px 6px',
    '0px 7px 36px 6px',
    '0px 8px 38px 7px',
    '0px 8px 40px 7px',
    '0px 8px 42px 7px',
    '0px 9px 44px 8px',
    '0px 9px 46px 8px',
  ];

  const uAlpha = isDark ? 0.35 + clamped * 0.015 : (0.06 + clamped * 0.005) * scale;
  const pAlpha = isDark ? 0.3 + clamped * 0.015 : (0.08 + clamped * 0.003) * scale;
  const aAlpha = isDark ? 0.25 + clamped * 0.015 : (0.04 + clamped * 0.003) * scale;

  return `${baseUmbra[clamped]} rgba(0,0,0,${uAlpha.toFixed(2)}), ${basePenumbra[clamped]} rgba(0,0,0,${pAlpha.toFixed(2)}), ${baseAmbient[clamped]} rgba(0,0,0,${aAlpha.toFixed(2)})`;
}

/**
 * Generates an exportable, self-contained CSS file with all tokens,
 * compatible with MudBlazor CSS, Material Design 3 and Tailwind CSS.
 */
export function generateExportableCss(options: ThemeOptions): string {
  const { palette, borderRadius, elevationScale } = options;

  // Build complete elevation token definitions for 0 to 24
  let elevationTokensLight = '  --mud-elevation-0: none;\n';
  let elevationClasses = '.mud-elevation-0 { box-shadow: var(--mud-elevation-0) !important; }\n';

  for (let i = 1; i <= 24; i++) {
    elevationTokensLight += `  --mud-elevation-${i}: ${getElevationShadow(i, elevationScale, false)};\n`;
    elevationClasses += `.mud-elevation-${i} { box-shadow: var(--mud-elevation-${i}) !important; }\n`;
  }

  let elevationTokensDark = '  --mud-elevation-0: none;\n';
  for (let i = 1; i <= 24; i++) {
    elevationTokensDark += `  --mud-elevation-${i}: ${getElevationShadow(i, elevationScale, true)};\n`;
  }

  return `/**
 * MudTail Material UI - Extended Stylesheet
 * Generated by MudTail Theme Engine
 * Compatible with Tailwind CSS v4 / v3, MudBlazor C# Blazor apps, and standard front-end sites.
 */

:root {
  /* MudBlazor & Material 3 Palette Tokens */
  --mud-palette-primary: ${palette.primary};
  --mud-palette-primary-rgb: ${hexToRgb(palette.primary)};
  --mud-palette-secondary: ${palette.secondary};
  --mud-palette-secondary-rgb: ${hexToRgb(palette.secondary)};
  --mud-palette-tertiary: ${palette.tertiary};
  --mud-palette-surface: ${palette.surface};
  --mud-palette-background: ${palette.background};
  --mud-palette-text-primary: #1e293b;
  --mud-palette-text-secondary: #64748b;
  --mud-palette-text-disabled: #94a3b8;
  --mud-palette-border: #e2e8f0;
  --mud-palette-divider: #f1f5f9;

  /* Status Colors */
  --mud-palette-success: #10b981;
  --mud-palette-warning: #f59e0b;
  --mud-palette-error: #ef4444;
  --mud-palette-info: #0284c7;

  /* Material 3 System Design Tokens */
  --md-sys-color-primary: var(--mud-palette-primary);
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-surface: var(--mud-palette-surface);
  --md-sys-color-on-surface: var(--mud-palette-text-primary);
  --md-sys-color-outline: var(--mud-palette-border);

  /* Shape & Radius Tokens (MudBlazor default is 4px) */
  --mud-default-borderradius: ${borderRadius}px;
  --mud-input-borderradius: ${Math.max(2, borderRadius)}px;

  /* Material Elevations (Levels 0 through 24) */
${elevationTokensLight}
  /* Transitions */
  --mud-transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --mud-transition-medium: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --mud-transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Dark Theme Tokens */
[data-theme="dark"],
.dark {
  --mud-palette-surface: ${palette.darkSurface};
  --mud-palette-background: ${palette.darkBackground};
  --mud-palette-text-primary: #f8fafc;
  --mud-palette-text-secondary: #94a3b8;
  --mud-palette-text-disabled: #475569;
  --mud-palette-border: rgba(255, 255, 255, 0.12);
  --mud-palette-divider: rgba(255, 255, 255, 0.08);

  --md-sys-color-surface: var(--mud-palette-surface);
  --md-sys-color-on-surface: var(--mud-palette-text-primary);
  --md-sys-color-outline: var(--mud-palette-border);

${elevationTokensDark}
}

/* MudBlazor & Material Component Utility Classes */
.mud-paper {
  background-color: var(--mud-palette-surface);
  color: var(--mud-palette-text-primary);
  border-radius: var(--mud-default-borderradius);
  transition: box-shadow var(--mud-transition-medium), background-color var(--mud-transition-medium);
}
.mud-paper-outlined {
  border: 1px solid var(--mud-palette-border);
  box-shadow: none !important;
}
.mud-paper-square {
  border-radius: 0 !important;
}

.mud-card {
  background-color: var(--mud-palette-surface);
  color: var(--mud-palette-text-primary);
  border-radius: var(--mud-default-borderradius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* MudBlazor Elevation Utility Classes (0 to 24) */
${elevationClasses}

/* MudBlazor Rounded Border Utility Classes */
.mud-rounded-0 { border-radius: 0px !important; }
.mud-rounded-sm { border-radius: 2px !important; }
.mud-rounded-base { border-radius: 4px !important; }
.mud-rounded { border-radius: var(--mud-default-borderradius) !important; }
.mud-rounded-md { border-radius: 6px !important; }
.mud-rounded-lg { border-radius: 8px !important; }
.mud-rounded-xl { border-radius: 12px !important; }
.mud-rounded-2xl { border-radius: 16px !important; }
.mud-rounded-full { border-radius: 9999px !important; }

/* Directional Rounded Utilities */
.mud-rounded-t { border-top-left-radius: var(--mud-default-borderradius) !important; border-top-right-radius: var(--mud-default-borderradius) !important; }
.mud-rounded-b { border-bottom-left-radius: var(--mud-default-borderradius) !important; border-bottom-right-radius: var(--mud-default-borderradius) !important; }
.mud-rounded-l { border-top-left-radius: var(--mud-default-borderradius) !important; border-bottom-left-radius: var(--mud-default-borderradius) !important; }
.mud-rounded-r { border-top-right-radius: var(--mud-default-borderradius) !important; border-bottom-right-radius: var(--mud-default-borderradius) !important; }

/* MudAppBar, ToolBar, Drawer & Tabs */
.mud-appbar { display: flex; flex-direction: column; width: 100%; box-sizing: border-box; flex-shrink: 0; }
.mud-toolbar { position: relative; display: flex; align-items: center; min-height: 56px; padding: 0 16px; }
.mud-spacer { flex-grow: 1; }
.mud-drawer { display: flex; flex-direction: column; box-sizing: border-box; background-color: var(--mud-palette-surface); }
.mud-tabs { display: flex; flex-direction: column; width: 100%; }

/* Material Ripple Effect */
.mud-ripple {
  position: relative;
  overflow: hidden;
  transform: translate3d(0, 0, 0);
}
.mud-ripple::after {
  content: "";
  display: block;
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
  background-image: radial-gradient(circle, #fff 10%, transparent 10.01%);
  background-repeat: no-repeat;
  background-position: 50%;
  transform: scale(10, 10);
  opacity: 0;
  transition: transform .4s, opacity .8s;
}
.mud-ripple:active::after {
  transform: scale(0, 0);
  opacity: .3;
  transition: 0s;
}

/* Input Floating Label & Focus Ring */
.mud-input-outlined {
  border-radius: var(--mud-input-borderradius);
  border: 1px solid var(--mud-palette-border);
  transition: border-color var(--mud-transition-fast), box-shadow var(--mud-transition-fast);
}
.mud-input-outlined:focus-within {
  border-color: var(--mud-palette-primary);
  box-shadow: 0 0 0 2px rgba(var(--mud-palette-primary-rgb), 0.2);
}
`;
}

/**
 * Generate Tailwind CSS theme extension snippet
 */
export function generateTailwindConfigSnippet(preset: PalettePreset): string {
  return `// tailwind.config.js / @theme extension
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        mud: {
          primary: '${preset.primary}',
          secondary: '${preset.secondary}',
          tertiary: '${preset.tertiary}',
          surface: 'var(--mud-palette-surface)',
          background: 'var(--mud-palette-background)',
        },
        md: {
          primary: 'var(--md-sys-color-primary)',
          'on-primary': 'var(--md-sys-color-on-primary)',
          surface: 'var(--md-sys-color-surface)',
          'on-surface': 'var(--md-sys-color-on-surface)',
          outline: 'var(--md-sys-color-outline)',
        }
      },
      borderRadius: {
        'mud': 'var(--mud-default-borderradius)',
        'mud-sm': '2px',
        'mud-base': '4px',
        'mud-md': '6px',
      },
      boxShadow: {
        'mud-0': 'none',
        'mud-1': 'var(--mud-elevation-1)',
        'mud-2': 'var(--mud-elevation-2)',
        'mud-3': 'var(--mud-elevation-3)',
        'mud-4': 'var(--mud-elevation-4)',
        'mud-6': 'var(--mud-elevation-6)',
        'mud-8': 'var(--mud-elevation-8)',
        'mud-12': 'var(--mud-elevation-12)',
        'mud-16': 'var(--mud-elevation-16)',
        'mud-24': 'var(--mud-elevation-24)',
      }
    }
  }
};`;
}

export function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `${r}, ${g}, ${b}`;
  }
  const bigint = parseInt(clean, 16);
  if (isNaN(bigint)) return '89, 74, 226';
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

export function isValidHex(hex: string): boolean {
  return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex.trim());
}

export function normalizeHex(hex: string): string {
  const clean = hex.trim().replace('#', '');
  if (clean.length === 3) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toLowerCase();
  }
  return `#${clean}`.toLowerCase();
}

/**
 * Calculates relative luminance for WCAG contrast calculation
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex).split(',').map((v) => parseInt(v.trim(), 10) / 255);
  const a = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/**
 * Returns WCAG contrast ratio between two hex colors (e.g. 4.5:1 is AA for normal text)
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

/**
 * Creates a cohesive PalettePreset from user-selected primary and secondary colors
 */
export function createCustomPalette(
  primary: string,
  secondary: string,
  name = 'Custom Visual Theme',
  tertiary?: string
): PalettePreset {
  const cleanPrimary = normalizeHex(primary);
  const cleanSecondary = normalizeHex(secondary);
  const cleanTertiary = tertiary ? normalizeHex(tertiary) : '#1ec8a5';

  return {
    id: `custom-${Date.now()}`,
    name,
    primary: cleanPrimary,
    secondary: cleanSecondary,
    tertiary: cleanTertiary,
    surface: '#ffffff',
    background: '#f8fafc',
    darkSurface: '#1e1e2d',
    darkBackground: '#12121e',
    accent: cleanSecondary,
  };
}
