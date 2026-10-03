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
