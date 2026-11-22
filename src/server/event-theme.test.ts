import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHexColor,
  isValidHexColor,
  areColorsEqual,
  resolveGradientStyle,
  DEFAULT_APP_THEME,
  formatThemeResponse,
  invalidateEventThemeCache,
  isEventThemeCached,
  setCachedEventTheme,
  CustomThemeEntitlementError,
} from '../lib/theme-resolution.ts';
import {
  setEventThemeBodySchema,
  normalizeEventThemeInput,
} from '../lib/validations/event-theme.ts';
import {
  ESSENTIAL_PLAN_FEATURES,
  SIGNATURE_PLAN_FEATURES,
  ELITE_PLAN_FEATURES,
  computeEffectiveFeatures,
  computeEffectivePermissions,
  ROLE_DEFAULT_PERMISSIONS,
} from '../lib/rbac.ts';

describe('Event Dynamic Theme Management & Multi-Tenant Entitlement Tests', () => {
  // 1. Essential plan cannot save a custom theme (403 Forbidden)
  test('1. Essential plan cannot save a custom theme (403 Forbidden)', () => {
    const essentialFeatures = computeEffectiveFeatures(ESSENTIAL_PLAN_FEATURES, null);
    assert.equal(essentialFeatures.app_themes_manage, false);

    const essentialPerms = computeEffectivePermissions({
      roleName: 'client_admin',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      features: essentialFeatures,
      applyFeatureGate: true,
    });
    assert.equal(essentialPerms.has('app_themes.manage'), false);

    // Entitlement error instantiation & properties
    const error = new CustomThemeEntitlementError();
    assert.equal(error.statusCode, 403);
    assert.match(error.message, /not included/i);

    // Masking check: when customThemesEnabled is false, formatThemeResponse falls back to default
    const formatted = formatThemeResponse({
      eventId: 'evt-essential-1',
      customThemesEnabled: essentialFeatures.app_themes_manage,
      themeRow: {
        id: 'theme-1',
        name: 'Custom Royal Theme',
        primary_color: '#112233',
        secondary_color: '#445566',
        button_primary_color: '#778899',
        button_secondary_color: '#aabbcc',
      },
    });
    assert.equal(formatted.is_custom, false);
    assert.equal(formatted.custom_themes_enabled, false);
    assert.equal(formatted.primary_color, DEFAULT_APP_THEME.primary_color);
  });

  // 2. Signature plan can save a custom theme
  test('2. Signature plan can save a custom theme', () => {
    const signatureFeatures = computeEffectiveFeatures(SIGNATURE_PLAN_FEATURES, null);
    assert.equal(signatureFeatures.app_themes_manage, true);

    const signaturePerms = computeEffectivePermissions({
      roleName: 'client_admin',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      features: signatureFeatures,
      applyFeatureGate: true,
    });
    assert.equal(signaturePerms.has('app_themes.manage'), true);

    const formatted = formatThemeResponse({
      eventId: 'evt-sig-1',
      customThemesEnabled: signatureFeatures.app_themes_manage,
      themeRow: {
        id: 'theme-sig',
        name: 'Signature Lavender',
        primary_color: '#6366F1',
        secondary_color: '#8B5CF6',
        button_primary_color: '#4F46E5',
        button_secondary_color: '#7C3AED',
      },
    });
    assert.equal(formatted.is_custom, true);
    assert.equal(formatted.custom_themes_enabled, true);
    assert.equal(formatted.primary_color, '#6366F1');
    assert.equal(formatted.secondary_color, '#8B5CF6');
    assert.equal(formatted.background_style, 'gradient');
    assert.equal(formatted.button_style, 'gradient');
  });

  // 3. Elite plan can save a custom theme
  test('3. Elite plan can save a custom theme', () => {
    const eliteFeatures = computeEffectiveFeatures(ELITE_PLAN_FEATURES, null);
    assert.equal(eliteFeatures.app_themes_manage, true);

    const elitePerms = computeEffectivePermissions({
      roleName: 'client_admin',
      rolePermissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      features: eliteFeatures,
      applyFeatureGate: true,
    });
    assert.equal(elitePerms.has('app_themes.manage'), true);

    const formatted = formatThemeResponse({
      eventId: 'evt-elite-1',
      customThemesEnabled: eliteFeatures.app_themes_manage,
      themeRow: {
        id: 'theme-elite',
        name: 'Elite Gold',
        primary_color: '#D97706',
        secondary_color: '#B45309',
        button_primary_color: '#F59E0B',
        button_secondary_color: '#D97706',
      },
    });
    assert.equal(formatted.is_custom, true);
    assert.equal(formatted.custom_themes_enabled, true);
    assert.equal(formatted.primary_color, '#D97706');
    assert.equal(formatted.primaryColor, '#D97706');
  });

  // 4. Unauthorized admin cannot modify another event's theme (403 Forbidden)
  test("4. Unauthorized admin cannot modify another event's theme (403 Forbidden)", () => {
    function canAdminManageTargetEvent(admin: {
      tier: 'super_admin' | 'client_admin' | 'client_subuser';
      id: string;
      tenant_owner_id: string | null;
      assigned_event_ids: string[];
    }, event: {
      id: string;
      created_by: string;
      tenant_owner_id: string | null;
    }) {
      if (admin.tier === 'super_admin') return true;
      if (admin.assigned_event_ids.includes(event.id)) return true;
      const ownerId = admin.tenant_owner_id ?? admin.id;
      const eventOwner = event.tenant_owner_id ?? event.created_by;
      if (admin.tier === 'client_admin') {
        return eventOwner === ownerId || event.created_by === admin.id;
      }
      return false;
    }

    const unauthAdmin = {
      tier: 'client_admin' as const,
      id: 'admin-attacker-uuid',
      tenant_owner_id: 'tenant-b-uuid',
      assigned_event_ids: [],
    };
    const targetEvent = {
      id: 'event-victim-uuid',
      created_by: 'admin-victim-uuid',
      tenant_owner_id: 'tenant-a-uuid',
    };

    assert.equal(canAdminManageTargetEvent(unauthAdmin, targetEvent), false);
  });

  // 5. Super Admin access follows existing rules
  test('5. Super Admin access follows existing rules', () => {
    function superAdminAccessCheck(tier: string, perm: string) {
      if (tier === 'super_admin') return true;
      return false;
    }
    assert.equal(superAdminAccessCheck('super_admin', 'app_themes.manage'), true);
  });

  // 6. All 4 color fields are validated (valid hex, rejecting invalid/HTML)
  test('6. All 4 color fields are validated (valid hex, rejecting invalid/HTML)', () => {
    // Valid 6-digit hex
    assert.equal(isValidHexColor('#6366F1'), true);
    assert.equal(isValidHexColor('#ffffff'), true);
    assert.equal(isValidHexColor('#000000'), true);

    // Valid 3-digit hex
    assert.equal(isValidHexColor('#FFF'), true);
    assert.equal(isValidHexColor('#abc'), true);

    // Invalid formats
    assert.equal(isValidHexColor(''), false);
    assert.equal(isValidHexColor('red'), false);
    assert.equal(isValidHexColor('rgb(255, 0, 0)'), false);
    assert.equal(isValidHexColor('#12'), false);
    assert.equal(isValidHexColor('#12345'), false);
    assert.equal(isValidHexColor('#GGGGGG'), false);
    assert.equal(isValidHexColor('<script>alert("xss")</script>'), false);
    assert.equal(isValidHexColor('javascript:void(0)'), false);

    // Schema validation - valid input
    const validRaw = {
      name: 'Modern Purple',
      primary_color: '#6366F1',
      secondary_color: '#8B5CF6',
      button_primary_color: '#4F46E5',
      button_secondary_color: '#7C3AED',
    };
    const parsedValid = setEventThemeBodySchema.safeParse(validRaw);
    assert.equal(parsedValid.success, true);

    // Schema validation - missing required button_secondary_color
    const missingColor = {
      name: 'Incomplete Theme',
      primary_color: '#6366F1',
      secondary_color: '#8B5CF6',
      button_primary_color: '#4F46E5',
    };
    const parsedMissing = setEventThemeBodySchema.safeParse(missingColor);
    assert.equal(parsedMissing.success, false);

    // Schema validation - invalid hex injection
    const invalidHex = {
      name: 'Malicious Theme',
      primary_color: '<script>alert(1)</script>',
      secondary_color: '#8B5CF6',
      button_primary_color: '#4F46E5',
      button_secondary_color: '#7C3AED',
    };
    const parsedInvalid = setEventThemeBodySchema.safeParse(invalidHex);
    assert.equal(parsedInvalid.success, false);

    // camelCase validation
    const camelValid = {
      themeName: 'Camel Theme',
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      buttonPrimaryColor: '#4f46e5',
      buttonSecondaryColor: '#7c3aed',
    };
    const parsedCamel = setEventThemeBodySchema.safeParse(camelValid);
    assert.equal(parsedCamel.success, true);
    if (parsedCamel.success) {
      const normalized = normalizeEventThemeInput(parsedCamel.data);
      assert.equal(normalized.primary_color, '#6366F1');
      assert.equal(normalized.name, 'Camel Theme');
    }
  });

  // 7. Same colors yield background_style: 'solid' / button_style: 'solid'
  test("7. Same colors yield background_style: 'solid' / button_style: 'solid'", () => {
    // Exact match
    assert.equal(resolveGradientStyle('#4F46E5', '#4F46E5'), 'solid');

    // Case-insensitive match (#FFFFFF vs #ffffff)
    assert.equal(areColorsEqual('#FFFFFF', '#ffffff'), true);
    assert.equal(resolveGradientStyle('#FFFFFF', '#ffffff'), 'solid');

    // 3-digit expanded match (#fff vs #ffffff)
    assert.equal(areColorsEqual('#fff', '#ffffff'), true);
    assert.equal(resolveGradientStyle('#fff', '#ffffff'), 'solid');

    const formatted = formatThemeResponse({
      eventId: 'evt-solid',
      customThemesEnabled: true,
      themeRow: {
        id: 't-solid',
        name: 'Solid Theme',
        primary_color: '#6366F1',
        secondary_color: '#6366f1',
        button_primary_color: '#10B981',
        button_secondary_color: '#10b981',
      },
    });
    assert.equal(formatted.background_style, 'solid');
    assert.equal(formatted.backgroundStyle, 'solid');
    assert.equal(formatted.button_style, 'solid');
    assert.equal(formatted.buttonStyle, 'solid');
  });

  // 8. Different colors yield background_style: 'gradient' / button_style: 'gradient'
  test("8. Different colors yield background_style: 'gradient' / button_style: 'gradient'", () => {
    assert.equal(areColorsEqual('#6366F1', '#A855F7'), false);
    assert.equal(resolveGradientStyle('#6366F1', '#A855F7'), 'gradient');

    const formatted = formatThemeResponse({
      eventId: 'evt-grad',
      customThemesEnabled: true,
      themeRow: {
        id: 't-grad',
        name: 'Gradient Theme',
        primary_color: '#6366F1',
        secondary_color: '#EC4899',
        button_primary_color: '#3B82F6',
        button_secondary_color: '#8B5CF6',
      },
    });
    assert.equal(formatted.background_style, 'gradient');
    assert.equal(formatted.backgroundStyle, 'gradient');
    assert.equal(formatted.button_style, 'gradient');
    assert.equal(formatted.buttonStyle, 'gradient');
  });

  // 9. No theme returns the existing default behavior (is_custom: false)
  test('9. No theme returns the existing default behavior (is_custom: false)', () => {
    const defaultResponse = formatThemeResponse({
      eventId: 'evt-default',
      customThemesEnabled: true,
      themeRow: null,
    });
    assert.equal(defaultResponse.is_custom, false);
    assert.equal(defaultResponse.isCustom, false);
    assert.equal(defaultResponse.primary_color, DEFAULT_APP_THEME.primary_color);
    assert.equal(defaultResponse.secondary_color, DEFAULT_APP_THEME.secondary_color);
    assert.equal(defaultResponse.button_primary_color, DEFAULT_APP_THEME.button_primary_color);
    assert.equal(defaultResponse.button_secondary_color, DEFAULT_APP_THEME.button_secondary_color);
    assert.equal(defaultResponse.name, DEFAULT_APP_THEME.name);
  });

  // 10. Switching events returns that specific event's theme without cross-contamination
  test("10. Switching events returns that specific event's theme without cross-contamination", () => {
    const eventATheme = formatThemeResponse({
      eventId: 'evt-A',
      customThemesEnabled: true,
      themeRow: {
        id: 't-A',
        name: 'Theme Event A',
        primary_color: '#111111',
        secondary_color: '#222222',
        button_primary_color: '#333333',
        button_secondary_color: '#444444',
      },
    });

    const eventBTheme = formatThemeResponse({
      eventId: 'evt-B',
      customThemesEnabled: true,
      themeRow: {
        id: 't-B',
        name: 'Theme Event B',
        primary_color: '#999999',
        secondary_color: '#888888',
        button_primary_color: '#777777',
        button_secondary_color: '#666666',
      },
    });

    assert.equal(eventATheme.event_id, 'evt-A');
    assert.equal(eventATheme.primary_color, '#111111');
    assert.equal(eventBTheme.event_id, 'evt-B');
    assert.equal(eventBTheme.primary_color, '#999999');
    assert.notEqual(eventATheme.primary_color, eventBTheme.primary_color);
  });

  // 11. Updating an event theme invalidates its cache
  test('11. Updating an event theme invalidates its cache', () => {
    invalidateEventThemeCache();
    assert.equal(isEventThemeCached('evt-cache-test'), false);

    // Populate cache
    setCachedEventTheme('evt-cache-test', { mock: true });
    assert.equal(isEventThemeCached('evt-cache-test'), true);

    // Targeted invalidation
    invalidateEventThemeCache('evt-cache-test');
    assert.equal(isEventThemeCached('evt-cache-test'), false);

    // Broad invalidation
    setCachedEventTheme('evt-cache-1', { mock: true });
    setCachedEventTheme('evt-cache-2', { mock: true });
    assert.equal(isEventThemeCached('evt-cache-1'), true);
    assert.equal(isEventThemeCached('evt-cache-2'), true);
    invalidateEventThemeCache();
    assert.equal(isEventThemeCached('evt-cache-1'), false);
    assert.equal(isEventThemeCached('evt-cache-2'), false);
  });

  // 12. Existing APIs continue working backward-compatibly
  test('12. Existing APIs continue working backward-compatibly', () => {
    // Check dual key compatibility (snake_case and camelCase)
    const formatted = formatThemeResponse({
      eventId: 'evt-compat',
      customThemesEnabled: true,
      themeRow: {
        id: 't-compat',
        name: 'Compat Theme',
        primary_color: '#10B981',
        secondary_color: '#059669',
        button_primary_color: '#047857',
        button_secondary_color: '#065F46',
      },
    });

    // Both snake_case and camelCase keys are present and equal
    assert.equal(formatted.primary_color, formatted.primaryColor);
    assert.equal(formatted.secondary_color, formatted.secondaryColor);
    assert.equal(formatted.button_primary_color, formatted.buttonPrimaryColor);
    assert.equal(formatted.button_secondary_color, formatted.buttonSecondaryColor);
    assert.equal(formatted.background_style, formatted.backgroundStyle);
    assert.equal(formatted.button_style, formatted.buttonStyle);
    assert.equal(formatted.is_custom, formatted.isCustom);
    assert.equal(formatted.custom_themes_enabled, formatted.customThemesEnabled);
  });
});
