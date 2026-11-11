export type UserEventProfileFields = {
  full_name: string;
  avatar_url: string | null;
  instagram_id: string | null;
  linkedin_url: string | null;
};

const LINKEDIN_HINT_RE = /linkedin\.com/i;
const EXTERNAL_HOST_RE = /^(?:https?:\/\/|www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|$)/i;

export function looksLikeLinkedInValue(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return LINKEDIN_HINT_RE.test(raw.trim());
}

/**
 * Normalize optional Instagram handle or URL.
 * Empty/blank clears to null. Strips leading `@` for bare handles and preserves URLs
 * (including legacy LinkedIn values if sent by un-updated mobile clients).
 */
export function normalizeInstagramInput(
  raw: string | null | undefined
): { value: string | null; valid: boolean } {
  if (raw === null || raw === undefined) return { value: null, valid: true };
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, valid: true };
  if (trimmed.length > 255) return { value: null, valid: false };
  if (/^https?:\/\//i.test(trimmed)) {
    return /\s/.test(trimmed) ? { value: null, valid: false } : { value: trimmed, valid: true };
  }
  const stripped = trimmed.replace(/^@+/, '').trim();
  if (!stripped) return { value: null, valid: true };
  if (/\s/.test(stripped)) return { value: null, valid: false };
  return { value: stripped, valid: true };
}

/**
 * Normalize optional LinkedIn URL or profile slug.
 * Empty/blank clears to null. Accepts `linkedin.com/...` URLs (with or without scheme)
 * or bare profile slugs (`john-doe`, `in/john-doe`) normalized to `https://www.linkedin.com/in/...`.
 */
export function normalizeLinkedInInput(
  raw: string | null | undefined
): { value: string | null; valid: boolean } {
  if (raw === null || raw === undefined) return { value: null, valid: true };
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, valid: true };
  if (trimmed.length > 500 || /\s/.test(trimmed)) return { value: null, valid: false };

  if (looksLikeLinkedInValue(trimmed)) {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
    return { value: withScheme, valid: true };
  }

  // Reject non-LinkedIn domains or URLs with schemes.
  if (/^[a-z]+:\/\//i.test(trimmed) || EXTERNAL_HOST_RE.test(trimmed)) {
    return { value: null, valid: false };
  }

  const slug = trimmed.replace(/^\/+/, '').replace(/^in\//i, '').replace(/^@+/, '').replace(/\/+$/, '');
  if (!slug || /[^a-zA-Z0-9._%-]/.test(slug)) {
    return { value: null, valid: false };
  }
  return { value: `https://www.linkedin.com/in/${slug}`, valid: true };
}

/**
 * Resolve stored social fields with legacy read fallback:
 * if `linkedin_url` is empty and `instagram_id` holds a LinkedIn URL, expose it under `linkedin_url`.
 */
export function resolveSocialLinks(row: {
  instagram_id?: string | null;
  linkedin_url?: string | null;
}): { instagram_id: string; linkedin_url: string } {
  const rawIg = row.instagram_id?.trim() ?? '';
  const rawLi = row.linkedin_url?.trim() ?? '';

  if (!rawLi && rawIg && looksLikeLinkedInValue(rawIg)) {
    const normalized = normalizeLinkedInInput(rawIg);
    return {
      instagram_id: '',
      linkedin_url: normalized.value ?? rawIg,
    };
  }

  return {
    instagram_id: rawIg,
    linkedin_url: rawLi,
  };
}

export function withResolvedSocialLinks<
  T extends { instagram_id?: string | null; linkedin_url?: string | null }
>(row: T): Omit<T, 'instagram_id' | 'linkedin_url'> & { instagram_id: string; linkedin_url: string } {
  const social = resolveSocialLinks(row);
  return {
    ...row,
    instagram_id: social.instagram_id,
    linkedin_url: social.linkedin_url,
  };
}

export function overlayEventProfile<T extends UserEventProfileFields>(
  user: T,
  profile: UserEventProfileFields | null
): T {
  if (!profile) return user;
  return {
    ...user,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
    instagram_id: profile.instagram_id,
    linkedin_url: profile.linkedin_url,
  };
}
