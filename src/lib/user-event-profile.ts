export type UserEventProfileFields = {
  full_name: string;
  avatar_url: string | null;
  instagram_id: string | null;
};

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
  };
}
