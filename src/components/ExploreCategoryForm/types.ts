/**
 * Form values for the explore category form (controlled by the component).
 */
export interface ExploreCategoryFormValues {
  title: string;
  description: string;
  background_url: string;
}

/**
 * Payload emitted on submit. Matches create/update API input.
 * background_url is always set (form validates before submit).
 */
export interface ExploreCategoryFormPayload {
  title: string;
  description: string | null;
  background_url: string;
}

/**
 * Category shape used to prefill the form in edit mode.
 */
export interface ExploreCategoryFormCategory {
  title: string;
  description?: string | null;
  background_url?: string | null;
}

export function emptyFormValues(): ExploreCategoryFormValues {
  return {
    title: '',
    description: '',
    background_url: '',
  };
}

export function categoryToFormValues(category: ExploreCategoryFormCategory): ExploreCategoryFormValues {
  return {
    title: category.title ?? '',
    description: category.description ?? '',
    background_url: category.background_url ?? '',
  };
}

export function formValuesToPayload(values: ExploreCategoryFormValues): ExploreCategoryFormPayload {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    background_url: values.background_url.trim(),
  };
}
