/**
 * Theme Resolution & Color Formatting Utilities
 *
 * Implements gradient calculation rules and hexadecimal color normalization:
 * - Background: Primary == Secondary -> solid; Primary != Secondary -> gradient.
 * - Buttons: Button Primary == Button Secondary -> solid; Button Primary != Button Secondary -> gradient.
 * - Case-insensitive hexadecimal comparison (#6366F1 == #6366f1).
 */

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class CustomThemeEntitlementError extends Error {
  statusCode: number;
  constructor(message = "Custom App Themes is not included in this event's purchase plan") {
    super(message);
    this.name = 'CustomThemeEntitlementError';
    this.statusCode = 403;
  }
}

export interface EventThemeCacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
}

const themeCache = new Map<string, EventThemeCacheEntry<unknown>>();
export const THEME_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateEventThemeCache(eventId?: string): void {
  if (eventId) {
    themeCache.delete(eventId);
  } else {
    themeCache.clear();
  }
}

export function isEventThemeCached(eventId: string): boolean {
  const entry = themeCache.get(eventId);
  return Boolean(entry && entry.expiresAt > Date.now());
}

export function getCachedEventTheme<T>(eventId: string): T | null {
  const cached = themeCache.get(eventId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }
  return null;
}

export function setCachedEventTheme<T>(eventId: string, data: T, ttlMs: number = THEME_CACHE_TTL_MS): void {
  themeCache.set(eventId, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export const DEFAULT_APP_THEME = {
  name: 'Default Glimpse Theme',
  primary_color: '#0F172A',
  secondary_color: '#F97316',
  button_primary_color: '#4338CA',
  button_secondary_color: '#0369A1',
  text_color: '#FFFFFF',
  body_text_color: '#CBD5E1',
} as const;

/**
 * Normalizes input string to valid #RRGGBB uppercase format.
 * Returns null if input is not a valid 3-digit or 6-digit hex color.
 */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) return null;

  const hexOnly = trimmed.slice(1);
  if (hexOnly.length === 3) {
    const [r, g, b] = hexOnly.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return `#${hexOnly}`.toUpperCase();
}

/**
 * Validates whether string is a valid hex color code.
 */
export function isValidHexColor(input: unknown): boolean {
  return normalizeHexColor(input) !== null;
}

/**
 * Compares two colors case-insensitively and returns true if they match.
 */
export function areColorsEqual(
  c1: string | null | undefined,
  c2: string | null | undefined
): boolean {
  if (!c1 || !c2) return false;
  const n1 = normalizeHexColor(c1);
  const n2 = normalizeHexColor(c2);
  return n1 !== null && n1 === n2;
}

export type ThemeStyle = 'solid' | 'gradient';

/**
 * Computes gradient style:
 * If color1 equals color2, solid style is used.
 * If color1 differs from color2, gradient style is used.
 */
export function resolveGradientStyle(
  color1: string | null | undefined,
  color2: string | null | undefined
): ThemeStyle {
  if (!color1 || !color2) return 'solid';
  return areColorsEqual(color1, color2) ? 'solid' : 'gradient';
}

export interface FormattedThemePayload {
  id: string | null;
  themeId: string | null;
  name: string;
  themeName: string;
  primary_color: string;
  primaryColor: string;
  secondary_color: string;
  secondaryColor: string;
  button_primary_color: string;
  buttonPrimaryColor: string;
  button_secondary_color: string;
  buttonSecondaryColor: string;
  text_color: string;
  textColor: string;
  body_text_color: string;
  bodyTextColor: string;
  background_style: ThemeStyle;
  backgroundStyle: ThemeStyle;
  button_style: ThemeStyle;
  buttonStyle: ThemeStyle;
  is_background_gradient: boolean;
  isBackgroundGradient: boolean;
  is_button_gradient: boolean;
  isButtonGradient: boolean;
  is_custom: boolean;
  isCustom: boolean;
  custom_themes_enabled: boolean;
  customThemesEnabled: boolean;
  event_id: string;
  eventId: string;
  created_at?: Date | null;
  createdAt?: Date | null;
  updated_at?: Date | null;
  updatedAt?: Date | null;
}

/**
 * Formats a theme database record into unified API response with both snake_case
 * and camelCase fields for seamless web and Flutter consumption.
 */
export function formatThemeResponse(options: {
  eventId: string;
  customThemesEnabled: boolean;
  themeRow: {
    id: string;
    name: string;
    primary_color: string;
    secondary_color: string;
    button_primary_color: string;
    button_secondary_color: string;
    text_color?: string | null;
    body_text_color?: string | null;
    created_at?: Date | null;
    updated_at?: Date | null;
  } | null;
}): FormattedThemePayload {
  const { eventId, customThemesEnabled, themeRow } = options;

  const isCustom = customThemesEnabled && Boolean(themeRow);
  const activeTheme = isCustom && themeRow ? themeRow : {
    id: null,
    name: DEFAULT_APP_THEME.name,
    primary_color: DEFAULT_APP_THEME.primary_color,
    secondary_color: DEFAULT_APP_THEME.secondary_color,
    button_primary_color: DEFAULT_APP_THEME.button_primary_color,
    button_secondary_color: DEFAULT_APP_THEME.button_secondary_color,
    text_color: DEFAULT_APP_THEME.text_color,
    body_text_color: DEFAULT_APP_THEME.body_text_color,
    created_at: null,
    updated_at: null,
  };

  const primary = normalizeHexColor(activeTheme.primary_color) ?? DEFAULT_APP_THEME.primary_color;
  const secondary = normalizeHexColor(activeTheme.secondary_color) ?? DEFAULT_APP_THEME.secondary_color;
  const buttonPrimary = normalizeHexColor(activeTheme.button_primary_color) ?? DEFAULT_APP_THEME.button_primary_color;
  const buttonSecondary = normalizeHexColor(activeTheme.button_secondary_color) ?? DEFAULT_APP_THEME.button_secondary_color;
  const textColor = normalizeHexColor(activeTheme.text_color) ?? DEFAULT_APP_THEME.text_color;
  const bodyTextColor = normalizeHexColor(activeTheme.body_text_color) ?? DEFAULT_APP_THEME.body_text_color;

  const bgStyle = resolveGradientStyle(primary, secondary);
  const btnStyle = resolveGradientStyle(buttonPrimary, buttonSecondary);

  return {
    id: activeTheme.id,
    themeId: activeTheme.id,
    name: activeTheme.name,
    themeName: activeTheme.name,
    primary_color: primary,
    primaryColor: primary,
    secondary_color: secondary,
    secondaryColor: secondary,
    button_primary_color: buttonPrimary,
    buttonPrimaryColor: buttonPrimary,
    button_secondary_color: buttonSecondary,
    buttonSecondaryColor: buttonSecondary,
    text_color: textColor,
    textColor: textColor,
    body_text_color: bodyTextColor,
    bodyTextColor: bodyTextColor,
    background_style: bgStyle,
    backgroundStyle: bgStyle,
    button_style: btnStyle,
    buttonStyle: btnStyle,
    is_background_gradient: bgStyle === 'gradient',
    isBackgroundGradient: bgStyle === 'gradient',
    is_button_gradient: btnStyle === 'gradient',
    isButtonGradient: btnStyle === 'gradient',
    is_custom: isCustom,
    isCustom: isCustom,
    custom_themes_enabled: customThemesEnabled,
    customThemesEnabled: customThemesEnabled,
    event_id: eventId,
    eventId: eventId,
    created_at: activeTheme.created_at ?? null,
    createdAt: activeTheme.created_at ?? null,
    updated_at: activeTheme.updated_at ?? null,
    updatedAt: activeTheme.updated_at ?? null,
  };
}
