/**
 * Shared types for guest users (reusable in server and frontend).
 */

export interface FindOrCreateGuestUserParams {
  mobile_number?: string | null;
  country_code?: string | null;
  user_role_id: number;
  user_role_name: string;
  email?: string | null;
}

export interface FindOrCreateGuestUserResult {
  user_id: string;
  is_new_user: boolean;
}
