type CategoryLike = { slug: string; name: string } | null | undefined;

export function isWeddingCategory(category: CategoryLike): boolean {
  return (
    !!category &&
    (category.slug.toLowerCase() === 'wedding' || category.name.toLowerCase().includes('wedding'))
  );
}

/** Corporate events must have a LinkedIn URL. */
export function isCorporateCategory(category: CategoryLike): boolean {
  return (
    !!category &&
    (category.slug.toLowerCase() === 'corporate-event' || category.name.toLowerCase().includes('corporate'))
  );
}

const LINKEDIN_URL_PATTERN = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com(\/\S*)?$/i;

export function isLinkedInUrl(value: string): boolean {
  return LINKEDIN_URL_PATTERN.test(value.trim());
}

export const LINKEDIN_URL_ERROR = 'Enter a valid LinkedIn URL (e.g. https://www.linkedin.com/company/your-company)';

const EMAIL_SUFFIX_PATTERN =
  /^@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/** Store as @company.com. Accepts company.com or @company.com. */
export function normalizeEmailSuffix(value: string): string {
  let suffix = value.trim().toLowerCase();
  if (!suffix) return '';
  if (!suffix.startsWith('@')) suffix = `@${suffix}`;
  return suffix;
}

export function isEmailSuffix(value: string): boolean {
  return EMAIL_SUFFIX_PATTERN.test(normalizeEmailSuffix(value));
}

export const EMAIL_SUFFIX_ERROR = 'Enter a valid email suffix (e.g. @company.com)';

export function emailDomainSuffix(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf('@');
  if (at < 0 || at === email.trim().length - 1) return null;
  return `@${email.trim().toLowerCase().slice(at + 1)}`;
}

export function emailMatchesSuffix(email: string, suffix: string | null | undefined): boolean {
  const domain = emailDomainSuffix(email);
  const normalized = suffix ? normalizeEmailSuffix(suffix) : '';
  return !!domain && !!normalized && domain === normalized;
}
