import { z } from 'zod';

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

const uuidSchema = z.string().uuid();

const hexColorField = z
  .string()
  .trim()
  .refine((val) => HEX_COLOR_REGEX.test(val), {
    message: 'Color must be in hexadecimal format (e.g. #RRGGBB or #RGB)',
  });

export const setEventThemeBodySchema = z
  .object({
    // Name options
    name: z.string().trim().min(1, 'Theme name is required').max(150).optional(),
    theme_name: z.string().trim().min(1).max(150).optional(),
    themeName: z.string().trim().min(1).max(150).optional(),

    // Colors: snake_case
    primary_color: hexColorField.optional(),
    secondary_color: hexColorField.optional(),
    button_primary_color: hexColorField.optional(),
    button_secondary_color: hexColorField.optional(),

    // Colors: camelCase
    primaryColor: hexColorField.optional(),
    secondaryColor: hexColorField.optional(),
    buttonPrimaryColor: hexColorField.optional(),
    buttonSecondaryColor: hexColorField.optional(),

    // Existing preset linking
    app_theme_id: uuidSchema.optional().nullable(),
    themeId: uuidSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const presetId = data.app_theme_id || data.themeId;
    if (presetId) return; // Linking existing preset is valid

    const name = data.name || data.theme_name || data.themeName;
    const primary = data.primary_color || data.primaryColor;
    const secondary = data.secondary_color || data.secondaryColor;
    const btnPrimary = data.button_primary_color || data.buttonPrimaryColor;
    const btnSecondary = data.button_secondary_color || data.buttonSecondaryColor;

    if (!name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Theme name is required when creating or updating custom theme colors',
      });
    }
    if (!primary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['primary_color'],
        message: 'Primary color is required',
      });
    }
    if (!secondary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['secondary_color'],
        message: 'Secondary color is required',
      });
    }
    if (!btnPrimary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['button_primary_color'],
        message: 'Button primary color is required',
      });
    }
    if (!btnSecondary) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['button_secondary_color'],
        message: 'Button secondary color is required',
      });
    }
  });

export type SetEventThemeBodyInput = z.infer<typeof setEventThemeBodySchema>;

export interface NormalizedEventThemeInput {
  app_theme_id?: string | null;
  name?: string;
  primary_color?: string;
  secondary_color?: string;
  button_primary_color?: string;
  button_secondary_color?: string;
}

export function normalizeEventThemeInput(input: SetEventThemeBodyInput): NormalizedEventThemeInput {
  const presetId = input.app_theme_id || input.themeId;
  if (presetId) {
    return { app_theme_id: presetId };
  }

  const name = (input.name || input.theme_name || input.themeName)!.trim();
  const primary = normalizeHexColor(input.primary_color || input.primaryColor)!;
  const secondary = normalizeHexColor(input.secondary_color || input.secondaryColor)!;
  const btnPrimary = normalizeHexColor(input.button_primary_color || input.buttonPrimaryColor)!;
  const btnSecondary = normalizeHexColor(input.button_secondary_color || input.buttonSecondaryColor)!;

  return {
    name,
    primary_color: primary,
    secondary_color: secondary,
    button_primary_color: btnPrimary,
    button_secondary_color: btnSecondary,
  };
}
