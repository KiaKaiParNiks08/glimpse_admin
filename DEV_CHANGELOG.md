# Dev changelog (local, uncommitted work)

Tracks which files changed on which date, why, and how to undo it.
Last git commit before this work: `6d144ad` (2026-04-17, "Merge pull request #36 from JagdishThakre/dev").
Nothing below is committed yet — run `git status` to see the same list.

---

## How to resume after a restart

1. PostgreSQL 16 runs as the Windows service `postgresql-x64-16` (starts automatically). If the app shows
   Prisma error P1001: `Start-Service postgresql-x64-16` (admin PowerShell).
2. `npm run dev` in this folder → http://localhost:3000. Run only **one** dev server at a time
   (two servers share `.next` and break pages; fix: stop server, delete `.next`, start again).
3. After changing `prisma/schema.prisma` or pulling new migrations: `npx prisma migrate deploy` then
   `npx prisma generate`, then restart `npm run dev`.
4. Panel login: `niks@glimps.app` / `niks@123` (super_admin).
5. API docs: http://localhost:3000/api/docs/openapi

Local DB: `glimp_dev_db` on `127.0.0.1:5432`, user `glimp_db_admin` (password in `.env`).

---

## 2026-09-22 / 2026-09-23 — Local setup

| File | Change |
|---|---|
| `.gitignore` | added `.env` (2026-09-22) |
| `prisma/migrations/20260923162555_init/` | new — init migration generated during local DB setup |
| `prisma/migrations/migration_lock.toml` | new — created by Prisma with the init migration |

DB data added (not in files): roles `super_admin` / `event_admin` / `user` (ids 1/2/3), admin user `niks@glimps.app`.

---

## 2026-09-27 — Event phases on the event itself (REVERTED on 2026-09-28)

Added pre/ongoing/post flags on `events` plus a `phase` + `sections` payload in `GET /api/events/{event_id}`.
Fully removed on 2026-09-28 because the tags belong on the parts of an event (see below):
migration `20260927120000_add_event_phases` deleted and rolled back locally, files restored to the last commit,
`src/server/event-phase.ts` deleted. Only `isEventGuest()` in `src/server/event-guests.ts` stays (used by favorites).

---

## 2026-09-27 — Favorites (gallery media + posts, per event)

Mobile users add gallery media (`event_day_media`) or feed posts to favorites per event. Only a mapping
row is stored in `user_favorites`; nothing is re-uploaded.

- `POST /api/favorites` — body `{ user_id, event_id, item_type: "day_media" | "post", item_id, add_favourite: true | false }`
- `GET /api/favorites?user_id=&event_id=&type=all|day_media|post&page=&limit=`
- `is_favorite` flag: `GET /api/feed` (with `viewer_user_id` + `event_id`), `GET /api/events/day-media` (with `viewer_user_id`)

**New files**
- `prisma/migrations/20260927140000_add_user_favorites/migration.sql` — `user_favorites` table
- `src/lib/validations/favorites.ts` — request schemas
- `src/server/favorites.ts` — add/remove, list, `getFavoritedItemIds()`
- `src/app/api/favorites/route.ts` — GET/POST

**Modified files**
- `prisma/schema.prisma` — `user_favorites` model + back-relations on `users`, `events`, `event_day_media`, `posts`
- `src/lib/validations/index.ts` — exports favorites schemas
- `src/lib/validations/posts.ts` — `event_id` on feed list query
- `src/lib/validations/events.ts` — `viewer_user_id` on day-media query
- `src/server/posts.ts` — `is_favorite` on feed list
- `src/app/api/events/day-media/route.ts` — `is_favorite` per item
- `src/server/event-guests.ts` — `isEventGuest()`
- `src/lib/openapi.ts` — Favorites docs, new params on feed/day-media

**Undo the DB part**
```sql
DROP TABLE user_favorites;
DELETE FROM _prisma_migrations WHERE migration_name = '20260927140000_add_user_favorites';
```

---

## 2026-09-28 — Event parts (REVERTED the same day)

A separate `event_parts` table + wizard step was built, then removed because the tags belong on sessions.
Migration `20260928160000_add_event_parts` deleted and rolled back locally; its files deleted/restored.

---

## 2026-09-28 — Pre / ongoing / post tags on sessions (REVERTED on 2026-10-01)

Reverted: the phase tags belong on Current Happening and the post-event report, not on sessions (see 2026-10-01).
Migration `20260928180000_add_session_phase_tags` rolled back locally (undo SQL below was run) and its folder deleted.
The `parseTimeToDate` UTC fix and `src/lib/event-phase.ts` (phase helpers) were kept.

Each session (Onboarding, Haldi, Sangeet, Reception…) is tagged with the mobile app phases it shows in:
`show_pre_event`, `show_ongoing_event`, `show_post_event` (one, two or all three; at least one). New and
existing sessions default to ongoing only. The current phase comes from the event's start/end dates in
`EVENT_TIMEZONE` (optional `.env`, default `Asia/Kolkata`): pre = before start date, ongoing = start..end,
post = after end date. `GET /api/events/{event_id}` returns the full event plus `phase` and `event_sessions`
(only sessions tagged for the current phase, by day then start time). Admin tokens can preview with `?phase=pre|ongoing|post`.
`GET /api/events/{event_id}/days` also returns the three flags on every session.

**New files**
- `prisma/migrations/20260928180000_add_session_phase_tags/migration.sql` — 3 columns on `event_sessions` + check
- `src/lib/event-phase.ts` — phase helpers (timezone, today, `getEventPhase`, `isSessionInPhase`)

**Modified files**
- `prisma/schema.prisma` — 3 phase columns on `event_sessions`
- `src/types/events.ts` — flags on `EventDetailsSession`
- `src/server/event-days.ts` — select the flags
- `src/lib/validations/events.ts` — flags on `eventSessionSchema` (+ "at least one" check), `eventDetailsQuerySchema`
- `src/server/events.ts` — save flags in `upsertEventDaysWithSessions`; **fix:** `parseTimeToDate` now uses UTC (session times shifted by the server timezone, e.g. -5:30 in IST, on every save)
- `src/app/actions/events.ts` — load flags in `getEventDaysAction`; clearer validation message on days save
- `src/app/dashboard/events/CreateEventWizard.tsx` + `events.module.scss` — "Show in app during" checkboxes per session (step 2)
- `src/app/api/events/[event_id]/route.ts` — adds `phase` + `event_sessions`
- `src/lib/openapi.ts` — docs for `/api/events/{event_id}`

**Undo the DB part**
```sql
ALTER TABLE event_sessions DROP CONSTRAINT event_sessions_at_least_one_phase,
  DROP COLUMN show_pre_event, DROP COLUMN show_ongoing_event, DROP COLUMN show_post_event;
DELETE FROM _prisma_migrations WHERE migration_name = '20260928180000_add_session_phase_tags';
```

---

## 2026-09-29 — Session-wise gallery media + gallery watermark

Gallery media is now uploaded per **session** (Haldi, Sangeet…) instead of per day, and each event can have a
watermark (image + position + opacity) that is drawn **on top of** gallery images (files are not modified).

- Media page: the day dropdown is replaced by sessions grouped by day. Older day-wise uploads were moved to the
  first session of their day by the migration; any left without a session show as "Without session (older uploads)".
- Wizard: new step 3 "Gallery watermark" (upload, 5 positions, sample-image preview, strength slider 5–100%).
  Explore / Highlights / Admins moved to steps 4 / 5 / 6.
- Saving "Days & sessions" now updates days/sessions in place (matched by date / session id), so session ids and
  their media survive. Removed sessions: their media stays on the day without a session. Removed days are deleted
  only when they have no media.
- `GET /api/events/{event_id}`: adds `watermark` and `media_sections` ("All media" = every item of the event, then
  one section per session; since 2026-10-01 all sessions) and `media_count` per session; optional `viewer_user_id` for `is_favorite`.
- `GET /api/events/day-media`: accepts `event_session_id` (or `event_day_id`).
- `POST /api/admin/events/{event_id}/days/{event_day_id}/media`: body now requires `event_session_id`.

**New files**
- `prisma/migrations/20260929160000_session_media_and_watermark/migration.sql` — `event_day_media.event_session_id` (+ backfill), watermark columns on `events`
- `src/lib/watermark.ts` — positions, defaults, API object, overlay style
- `src/components/WatermarkOverlay.tsx` — watermark `<img>` drawn over media
- `public/watermark-sample.svg` — sample image for the wizard preview

**Modified files**
- `prisma/schema.prisma` — `event_session_id` + relation on `event_day_media`; watermark columns on `events`
- `src/server/events.ts` — in-place `upsertEventDaysWithSessions`; `setEventWatermark`; watermark fields in `getEventById`
- `src/server/event-day-media.ts` — session id on create; list by session / by event
- `src/server/event-days.ts`, `src/types/events.ts` — `event_session_id` on day media
- `src/lib/validations/events.ts` — session `id`, `eventWatermarkSchema`, day-media query by session, `viewer_user_id` on event details
- `src/app/actions/events.ts` — `setEventWatermarkAction`; session ids in `getEventDaysAction`
- `src/app/actions/event-day-media.ts` — presign/create by session, delete checked by event, watermark for the page
- `src/app/dashboard/events/CreateEventWizard.tsx` + `events.module.scss` — watermark step, session ids kept on save;
  edit mode now always shows every date from start to end (saved days merged in), also after changing dates in step 1
- `src/app/dashboard/events/[event_id]/media/page.tsx` + `event-media.module.scss` — session dropdown, watermark overlay
- `src/app/api/events/[event_id]/route.ts` — `watermark`, `media_sections`
- `src/app/api/events/day-media/route.ts` — by session
- `src/app/api/admin/events/[event_id]/days/[event_day_id]/media/route.ts` — requires `event_session_id`
- `src/lib/openapi.ts` — docs for the three endpoints above

**Undo the DB part**
```sql
ALTER TABLE events DROP CONSTRAINT events_watermark_position_check, DROP CONSTRAINT events_watermark_opacity_check,
  DROP COLUMN watermark_url, DROP COLUMN watermark_position, DROP COLUMN watermark_opacity;
DROP INDEX idx_event_day_media_event_session_id;
ALTER TABLE event_day_media DROP CONSTRAINT fk_day_media_session, DROP COLUMN event_session_id;
DELETE FROM _prisma_migrations WHERE migration_name = '20260929160000_session_media_and_watermark';
```

---

## 2026-10-01 — Section title + phases for Current Happening and the post-event report

The session phase tags (2026-09-28) were removed. Instead:
- **Current Happening popup** (Events list → Happening): "Section title" (blank = "Current Happening"; each item
  keeps its own title) and "Show in app during" Pre-event / Ongoing / Post-event checkboxes, saved with **Save**.
- **Edit event, step 1, Post-event report (PDF)**: report title (blank = "Post-event report") and the same three
  checkboxes, saved on **Next**.
- All phases are on by default (existing events too); at least one must stay on (validation + DB check).
- `GET /api/events/{event_id}`: `event_sessions` / `media_sections` now include **all** sessions (no phase filter);
  new `current_happening { title, show_*, visible_now }` and `post_event_report { title, url, original_name,
  uploaded_at, show_*, visible_now }`. `visible_now` = enabled for `phase.current` (report: also needs a PDF).

**New files**
- `prisma/migrations/20261001120000_happening_and_report_settings/migration.sql` — title + 3 phase flags for each section on `events`, 2 check constraints

**Modified files**
- `prisma/schema.prisma` — new `events` columns; session `show_*` columns removed
- `src/lib/event-phase.ts` — generic `PhaseFlags`, `PHASE_FLAG_OPTIONS`, `isVisibleInPhase`, default titles (replaces `isSessionInPhase`)
- `src/lib/validations/events.ts` — session flags removed; `currentHappeningSettingsSchema`, `postEventReportSettingsSchema`
- `src/server/events.ts` — new fields in `getEventById`; `setCurrentHappeningSettings`, `setPostEventReportSettings`; session flags removed
- `src/server/event-days.ts`, `src/types/events.ts` — session flags removed
- `src/app/actions/events.ts` — `getCurrentHappeningSettingsAction`, `setCurrentHappeningSettingsAction`, `setPostEventReportSettingsAction`
- `src/app/dashboard/events/CurrentHappeningModal.tsx` — section title + phase checkboxes
- `src/app/dashboard/events/CreateEventWizard.tsx` — session checkboxes removed; report settings loaded and saved on step 1
- `src/app/dashboard/events/events.module.scss` — `.sessionPhases*` renamed to `.phaseChecks*`; settings box styles
- `src/components/EventForm/EventForm.tsx`, `PostEventPdfUploadField.tsx` — report title + phase checkboxes
- `src/app/api/events/[event_id]/route.ts` — no session filter; `current_happening`, `post_event_report`
- `src/lib/openapi.ts` — docs for `/api/events/{event_id}`

**Undo the DB part**
```sql
ALTER TABLE events DROP CONSTRAINT events_current_happening_phase_check, DROP CONSTRAINT events_post_event_pdf_phase_check,
  DROP COLUMN current_happening_title, DROP COLUMN current_happening_show_pre_event,
  DROP COLUMN current_happening_show_ongoing_event, DROP COLUMN current_happening_show_post_event,
  DROP COLUMN post_event_pdf_title, DROP COLUMN post_event_pdf_show_pre_event,
  DROP COLUMN post_event_pdf_show_ongoing_event, DROP COLUMN post_event_pdf_show_post_event;
DELETE FROM _prisma_migrations WHERE migration_name = '20261001120000_happening_and_report_settings';
```

No test data left behind: the test changed "Phase Test Pre" settings and restored them.

## 2026-10-02 — Dashboard API only returns sections that are shown

`GET /api/events/{event_id}` no longer returns the `show_*` / `visible_now` booleans. Instead:
- `current_happening { title, items[] }` is included only when the event has happening items **and** the section
  is enabled for the current phase (items as in `GET /api/events/current-happening`; photos via `/photos`).
- `post_event_report { title, url, original_name, size, uploaded_at }` only when a PDF is uploaded **and** it is
  enabled for the current phase. The raw `post_event_pdf_*` columns are no longer in the response.
- `watermark` is omitted (instead of `null`) when not set.

**Modified files**
- `src/app/api/events/[event_id]/route.ts` — phase-gated, omit-when-empty sections; happening items embedded
- `src/lib/openapi.ts` — docs for `/api/events/{event_id}`

Test data: a temporary happening item on "Phase Test Pre" was created and deleted by the test; settings restored.

## 2026-10-02 — Seed event categories

The event form's Category dropdown lists active rows of `event_categories` (`listEventCategoriesForSelect`, ordered
by name). There is no admin UI or API to manage them; the old `CreateTable.sql` seeded 5 but the Prisma migrations
did not, so a fresh DB had none. Added 16 categories (Wedding, Engagement, Reception, Baby Shower, Birthday Party,
Anniversary, Naming Ceremony, Housewarming, Graduation, Religious Ceremony, Corporate Event, Conference,
Product Launch, Concert, Festival, Other). Existing slugs are skipped.

**New files**
- `prisma/migrations/20261002150000_seed_event_categories/migration.sql` — inserts the categories (`ON CONFLICT (slug) DO NOTHING`)

**Undo the DB part** (fails for a category already used by an event — `ON DELETE RESTRICT`)
```sql
DELETE FROM event_categories WHERE slug IN ('wedding','engagement','reception','baby-shower','birthday-party',
  'anniversary','naming-ceremony','housewarming','graduation','religious-ceremony','corporate-event','conference',
  'product-launch','concert','festival','other');
DELETE FROM _prisma_migrations WHERE migration_name = '20261002150000_seed_event_categories';
```

## 2026-10-02 — Watermark size + "Unable to fetch event" / days save errors

**Errors:** edit showed "Unable to fetch event" (`Unknown field current_happening_title`) and saving days & sessions
failed (`column show_pre_event does not exist`). Cause: the running dev server still had the Prisma client from
before the 2026-10-01 migrations. Fixed by restarting it (stop, delete `.next`, `npm run dev`); no code change.

**Watermark size:** new "Watermark size (square)" slider in wizard step 3, 16–120 px (default 48) = side of the
square in **actual image pixels**; the preview and media gallery scale it from the image's natural width. The
uploaded watermark file must be at most 48×48 px (checked in the browser before upload; older uploads are not
re-checked). API `watermark.width_percent` is replaced by `watermark.size`.

**New files**
- `prisma/migrations/20261002170000_watermark_size/migration.sql` — `events.watermark_size` (16–120, default 48)

**Modified files**
- `prisma/schema.prisma` — `watermark_size`
- `src/lib/watermark.ts` — size constants, `clampWatermarkSize`, size-based overlay style, `checkImageMaxDimensions`
- `src/components/WatermarkOverlay.tsx` — `size` prop, scales by the media image's natural width
- `src/components/VenueForm/ImageUploadField.tsx` — optional `validateFile` and `note` props
- `src/app/dashboard/events/CreateEventWizard.tsx` — size slider, 48×48 upload check, save/load size
- `src/app/dashboard/events/[event_id]/media/page.tsx` — pass size to the overlay
- `src/lib/validations/events.ts`, `src/app/actions/events.ts`, `src/server/events.ts` — validate/save/select size
- `src/app/api/events/[event_id]/route.ts` — strip raw `watermark_size`
- `src/lib/openapi.ts` — `watermark.size`

**Undo the DB part**
```sql
ALTER TABLE events DROP CONSTRAINT events_watermark_size_check, DROP COLUMN watermark_size;
DELETE FROM _prisma_migrations WHERE migration_name = '20261002170000_watermark_size';
```

Test: a day + session and a watermark were saved on "abhi wed" and removed again; the event was restored.

## 2026-10-02 — Multiple cover images with ordering

Event form (create + edit, step 1): "Cover images" now takes up to 10 images (multi-select upload). Reorder by
drag-and-drop or ← / → buttons, remove with ×; image 1 is the main cover. Create still needs at least one.
Saved in the new `event_cover_images` table (`display_order`); `events.cover_image` is kept = first image so the
event list and older code keep working. `GET /api/events/{event_id}` adds `cover_images` (URLs in admin order).
The migration copied each existing `cover_image` in as image 1.

**New files**
- `prisma/migrations/20261002190000_event_cover_images/migration.sql` — table + index + FK (cascade) + backfill
- `src/components/EventForm/CoverImagesField.tsx` + `CoverImagesField.module.scss` — multi upload, reorder, remove

**Modified files**
- `prisma/schema.prisma` — `event_cover_images` model + relation on `events` (file reformatted by `prisma format`)
- `src/lib/validations/events.ts` — `cover_images` (max `MAX_EVENT_COVER_IMAGES` = 10)
- `src/server/events.ts` — save cover images on create/update (replace all, in order; `cover_image` = first); select them in `getEventById`
- `src/components/EventForm/EventForm.tsx` — `cover_images` field replaces the single cover upload
- `src/app/dashboard/events/CreateEventWizard.tsx` — load/pass `cover_images` in edit mode
- `src/app/api/events/[event_id]/route.ts` — `cover_images` array
- `src/lib/openapi.ts` — `cover_image` / `cover_images`

**Undo the DB part**
```sql
DROP TABLE event_cover_images;
DELETE FROM _prisma_migrations WHERE migration_name = '20261002190000_event_cover_images';
```

Test: a temporary event `cover-test-tmp` was created and deleted by the test.

## 2026-10-03 — LinkedIn URL for corporate events

Event form, Basic info: when the category is Corporate Event (slug `corporate-event` or a name containing
"corporate"), a required "LinkedIn URL" field appears (must be a linkedin.com URL). Also enforced on the server in
`createEventAction` / `updateEventAction`. Switching to another category clears it. `GET /api/events/{event_id}`
returns `linkedin_url`.

**New files**
- `prisma/migrations/20261003000000_event_linkedin_url/migration.sql` — `events.linkedin_url VARCHAR(500)`
- `src/lib/event-categories.ts` — `isWeddingCategory`, `isCorporateCategory`, `isLinkedInUrl`

**Modified files**
- `prisma/schema.prisma` — `linkedin_url`
- `src/lib/validations/events.ts` — `linkedin_url` (LinkedIn URL format)
- `src/server/events.ts` — save/select `linkedin_url`; `getCorporateLinkedInError`
- `src/app/actions/events.ts` — corporate LinkedIn check; field-level validation messages are now shown
- `src/components/EventForm/EventForm.tsx` — LinkedIn field + validation for corporate events
- `src/app/dashboard/events/CreateEventWizard.tsx` — load/pass `linkedin_url` in edit mode
- `src/lib/openapi.ts` — `linkedin_url`

**Undo the DB part**
```sql
ALTER TABLE events DROP COLUMN linkedin_url;
DELETE FROM _prisma_migrations WHERE migration_name = '20261003000000_event_linkedin_url';
```

Test: a temporary event `linkedin-test-tmp` was created and deleted by the test.

## 2026-10-03 — Fix /login ⇄ /dashboard redirect loop

Login stores the admin JWT in two places: the httpOnly `glimps_admin_session` cookie (checked by the `/login`
layout and the dashboard layout's profile check) and sessionStorage (checked by the `/login` page and needed by the
dashboard pages for Bearer `/api/*` calls). sessionStorage is per tab, so a new tab had the cookie but no token:
the `/login` layout sent it to `/dashboard`, the dashboard page sent it back to `/login`, forever. The reverse
(token but no cookie) looped too.

Rules now in place (also in `.cursor/rules/admin-auth.mdc`, so they are kept in future work):
- The cookie is the single source of truth. Only `login/layout.tsx` (server) redirects `/login` → `/dashboard`;
  the `/login` page no longer redirects based on the sessionStorage token.
- The dashboard layout always copies the cookie's JWT into the tab's sessionStorage after the profile check
  passes (fixes new tabs and old tabs holding an expired token).
- Every client-side "go to /login" (layout, dashboard/admins/app-config/app-themes pages, Log out, 401
  interceptor) goes through `signOutToLogin`, which clears the token **and** the cookie via a server action.
  Log out no longer depends on `/api/admin/logout`, which needs a Bearer token and silently failed without one.
- The cookie now has `Max-Age` = `ADMIN_JWT_TTL_SECONDS` (default 7 days), so it expires with its JWT.

Tested on the dev server: login sets `Max-Age=604800`; `/login` with a valid cookie → 307 `/dashboard`;
with no or an invalid cookie → 200 login form.

**New files**
- `src/lib/admin-sign-out.ts` — `signOutToLogin`: the only way client code may send an admin to `/login`
- `.cursor/rules/admin-auth.mdc` — the rules above

**Modified files**
- `src/lib/admin-session.ts` — `getAdminJwtFromCookies`, `clearAdminSessionCookie`
- `src/app/actions/profile.ts` — `getAdminTokenFromSessionAction`, `clearAdminSessionAction`
- `src/lib/admin-jwt-client.ts` — `setAdminJwtInSessionStorage`
- `src/lib/jwt.ts` — export `getAdminJwtTtlSeconds`
- `src/app/api/admin/login/route.ts` — cookie `maxAge`
- `src/app/login/page.tsx` — removed the sessionStorage-based redirect
- `src/app/dashboard/layout.tsx` — always sync the token from the cookie; `signOutToLogin` on failure and Log out
- `src/app/dashboard/page.tsx`, `admins/page.tsx`, `app-config/page.tsx`, `app-themes/page.tsx` — `signOutToLogin`
- `src/lib/api/interceptors.ts` — 401 handler uses `signOutToLogin`

**Before going to the server (production checklist)**
- Set `ADMIN_JWT_SECRET` to a long random value, the same on every instance. If it is unset, the fallback
  `dev-only-secret-change-me` is used (anyone could forge admin tokens). Different secrets on different instances
  log admins out randomly.
- Behind a reverse proxy (nginx etc.), forward `X-Forwarded-Proto` so the cookie gets `Secure` on HTTPS.
- After deploying, test: log in, open the panel in a new tab, log out, and log in again; then delete the
  `glimps_admin_session` cookie in DevTools and reload — each must end on a working page, never a loop.

---

## 2026-10-03 — Light page theme

Dashboard page content is white. Buttons and action text use the previous page background (`#0f172a`). Sidebar and header stay `#1e293b`.

**Modified files**
- `src/app/dashboard/dashboard.module.css` — content background white; sidebar and header unchanged
- `src/app/dashboard/page.tsx`, `DashboardCharts.tsx`, `dashboard-charts.module.css` — dashboard page and charts
- `src/components/PaginatedTable.module.scss`
- `src/app/dashboard/events/events.module.scss`, `admins/admins.module.scss`, `venues/venues.module.scss`, `explore-categories/explore-categories.module.scss`, `app-themes/app-themes.module.scss`, `app-config/app-config.module.scss`, `profile/profile.module.scss`, `events/[event_id]/media/event-media.module.scss`
- `src/components/EventForm/EventForm.module.scss`, `CoverImagesField.module.scss`, `VenueForm/VenueForm.module.scss`, `ExploreCategoryForm/ExploreCategoryForm.module.scss`

## 2026-10-04 — Route transition feedback

Clicked sidebar items use the existing active style immediately, a 2px bar runs at the top during the route change, and list/dashboard/form pages show skeleton blocks instead of “Loading…” while their data arrives. A second click on the same destination is ignored. Sidebar, header, and loaded page layouts are unchanged.

**New files**
- `src/components/navigation/NavigationProvider.tsx` — progress bar and `navigate()`
- `src/components/navigation/navigation.module.css`
- `src/components/navigation/ContentSkeleton.tsx`
- `src/components/navigation/content-skeleton.module.css`
- `src/app/dashboard/loading.tsx`

**Modified files**
- `src/app/layout.tsx`, `src/app/globals.css` — provider; progress cursor on busy controls
- `src/app/dashboard/layout.tsx` — pending nav state; shell skeleton instead of a full-page loading line
- `src/app/login/page.tsx`, `src/app/dashboard/events/page.tsx`, `events/addEditEvent/page.tsx`, `change-password/page.tsx` — one navigation per click
- `src/components/PaginatedTable.tsx` and `.module.scss` — skeleton rows on first load
- `src/app/dashboard/page.tsx`, `DashboardCharts.tsx`, `dashboard-charts.module.css`
- `src/app/dashboard/profile/page.tsx`, `admins/page.tsx`, `app-config/page.tsx`, `app-themes/page.tsx`
- `src/app/dashboard/events/CreateEventWizard.tsx`, `events/[event_id]/media/page.tsx`

## Local test data (safe to delete)

Created on 2026-09-27/28 while testing; everything is named `phase-test…` (sessions on
"Phase Test Ongoing" are removed with the event; the 2026-09-29 save test
filled their empty descriptions with "desc" and recreated "All Day Lounge" on its first day).
```sql
DELETE FROM posts WHERE caption LIKE 'phase-test%';
DELETE FROM users WHERE email LIKE 'phase-test-%';
DELETE FROM events WHERE slug LIKE 'phase-test-%';
DELETE FROM venues WHERE name = 'Phase Test Palace';
DELETE FROM event_categories WHERE slug = 'phase-test-wedding';
```

---

## 2026-10-04 — People in media

Server-side face search for photographer gallery files and user-post media. Uploads only create a `pending` `media_assets` row. A worker detects faces, stores embeddings in pgvector, and matches them to consented user face references. Embeddings are not returned by APIs.

**New files**
- `prisma/migrations/20261004120000_people_in_media/migration.sql` — `media_assets`, `media_faces`, `user_face_references`, `media_matches`
- `src/server/people-media/` — provider interface, local and HTTP providers, registration, matching, worker batch
- `src/lib/face-worker-auth.ts` — worker secret check
- `src/lib/validations/people-media.ts` — request schemas
- `src/app/api/users/me/face-reference/route.ts` — consent and face-reference enrollment
- `src/app/api/media/[id]/status/route.ts` — processing status
- `src/app/api/media/[id]/match/route.ts` — requeue matching
- `src/app/api/media/[id]/matches/route.ts` — match list without embeddings
- `src/app/api/media/[id]/access/route.ts` — authorized media URL
- `src/app/api/events/[event_id]/my-media/route.ts` — current user's matched media
- `src/app/api/admin/events/[event_id]/people-media/route.ts` — admin status and retries
- `src/app/api/internal/media/process/route.ts` — worker endpoint
- `src/app/dashboard/events/[event_id]/people-media/page.tsx` — admin UI
- `scripts/process-media-faces.mjs` — calls the worker until the queue is idle
- `scripts/install-pgvector-windows.ps1` — copies the PostgreSQL 16 pgvector files (must be run as administrator)

**Modified files**
- `prisma/schema.prisma` — new models and relations on `users`, `events`, `event_day_media`, `post_media`
- `src/server/event-day-media.ts` — existing panel and admin gallery saves also register a pending asset
- `src/app/api/feed/route.ts` — existing post create also registers pending assets for the token event
- `src/lib/validations/posts.ts` — optional `event_id` on feed create
- `src/middleware.ts` — worker route uses `x-face-worker-secret` instead of a user JWT
- `src/lib/upload.ts` — saved files also return `storageKey`
- `src/lib/s3-presign.ts` — `getObjectBuffer` for the worker
- `src/app/dashboard/events/page.tsx` — People link on each event
- `package.json` — `faces:process` script
- `.env.example` — `FACE_*` variables
- `README.md` — server setup for pgvector, env, and the worker

**Undo the DB part**
```sql
DROP TABLE IF EXISTS media_matches;
DROP TABLE IF EXISTS media_faces;
DROP TABLE IF EXISTS user_face_references;
DROP TABLE IF EXISTS media_assets;
DELETE FROM _prisma_migrations WHERE migration_name = '20261004120000_people_in_media';
```

No local test rows were inserted. `npm run prisma:deploy` was tried on 2026-10-04 and rolled back (`prisma migrate resolve --rolled-back 20261004120000_people_in_media`) because PostgreSQL 16 does not have the `vector` extension yet. No people-in-media tables were created. Install pgvector with an elevated `scripts/install-pgvector-windows.ps1`, restart PostgreSQL, then run `npm run prisma:deploy` again. `FACE_PROVIDER=local` does not recognize a person across different photos; production needs `FACE_PROVIDER=http` and a face service.

---

## 2026-10-05 — Duplicate event slug

Creating or updating an event whose slug or event code already exists now returns that reason to the form instead of a generic failure. The database unique constraint is unchanged.

**Modified files**
- `src/app/actions/events.ts` — map Prisma P2002 on `slug` and `event_code`

---

## 2026-10-04 — My recognized media requires user_id

`GET /api/events/:eventId/my-media` now requires query `user_id`, same as favorites. It must match the app-user token, and only that user's face matches are returned. Session gallery stays on `GET /api/events/day-media`.

**Modified files**
- `src/lib/validations/people-media.ts` — required `user_id`
- `src/app/api/events/[event_id]/my-media/route.ts` — uses that user id
- `README.md` — query documented

---

## 2026-10-04 — Event planner and photographer

A wizard step after Gallery watermark saves one event planner and one photographer. Mobile reads them from `GET /api/events/team?event_id=`.

**New files**
- `prisma/migrations/20261004210000_event_team/migration.sql` — `event_team` table, one row per role
- `src/server/event-team.ts` — load and save the two contacts
- `src/app/api/events/team/route.ts` — mobile GET
- `src/app/dashboard/events/EventTeamFields.tsx` — planner and photographer form

**Modified files**
- `prisma/schema.prisma` — `event_team` model
- `src/lib/validations/events.ts` — team form schema
- `src/app/actions/events.ts` — panel load and save
- `src/app/dashboard/events/CreateEventWizard.tsx` — new step, later steps shifted by one
- `src/app/dashboard/events/events.module.scss` — two-column form
- `src/lib/openapi.ts` — documents the GET

**Undo the DB part**
```sql
DROP TABLE IF EXISTS event_team;
DELETE FROM _prisma_migrations WHERE migration_name = '20261004210000_event_team';
```

No test rows were inserted. Leave a name blank to store nothing for that person.

---

## 2026-10-05 — Comment replies on the feed comments list

`GET /api/feed/{post_id}/comments` pages top-level comments and now includes each thread in `replies`. A reply to a reply stays on that same comment. `meta.total` counts top-level comments only.

**Modified files**
- `src/server/comments.ts` — nest replies under each comment
- `src/lib/validations/comments.ts` — `parent_comment_id` query no longer hides replies
- `src/app/api/feed/[post_id]/comments/route.ts` — route comment
- `src/lib/openapi.ts` — documents the `replies` array

A local check inserted one comment and two replies on post `c1f1b7de-9bce-4255-bca7-b4a183eea1dd`, confirmed `replies` on `GET /api/feed/{post_id}/comments`, then deleted those three rows and restored `posts.comment_count`. Nothing from that check remains.

---

## 2026-10-05 — Feed video upload finishes before the response

`POST /api/feed` goes through middleware, which was keeping only the first 10MB of the request. A larger video was cut off, the post was saved without a complete file, and the response went out while the phone was still uploading. The limit is now 70MB (one 50MB video, or six 10MB images). An empty or cut-off file is rejected instead of creating the post. A `.mp4`, `.mov`, or `.webm` file is accepted when the phone sends no type or `application/octet-stream`.

**Modified files**
- `next.config.ts` — `middlewareClientMaxBodySize` and server-action body limit set to 70MB
- `src/app/api/feed/route.ts` — wait for a complete file; reject an empty media part
- `src/lib/upload.ts` — do not store a buffer that is shorter than the file
- `src/lib/upload-rules.ts` — resolve video type from the filename when the MIME type is generic

A local check posted a `.mp4` sent as `application/octet-stream` and a 12MB video. Both returned `201` with `post_media` only after the file was stored. Those two posts and their S3 objects were deleted afterward. Nothing from that check remains.

---

## 2026-10-05 — Face processing on Vercel, session media upload

Vercel cannot keep `npm run faces:process` running. Each gallery upload, feed post, and face-reference enrollment now processes the queue after the response is sent. A daily cron retries leftovers. The production build runs `prisma migrate deploy` first.

Session media (Events → Media) uploads one file at a time straight to storage, then saves the session row. A file that storage rejects is named in the error, and files that did upload are still saved on the session. Presigned uploads no longer require an S3 checksum the browser does not send. A `.mp4`, `.mov`, or `.webm` file is accepted when the browser sends no type.

**New files**
- `src/server/people-media/schedule.ts` — runs the face queue after the response
- `src/app/dashboard/events/[event_id]/media/layout.tsx` — allows the upload action 60 seconds
- `vercel.json` — daily cron `GET /api/internal/media/process`

**Modified files**
- `src/server/people-media/register.ts` — queue processing after gallery and feed registration
- `src/server/people-media/face-reference.ts` — queue processing after enrollment
- `src/app/api/internal/media/process/route.ts` — GET for Vercel Cron
- `src/lib/face-worker-auth.ts` — accepts `CRON_SECRET`
- `src/middleware.ts` — allows the cron request
- `package.json` — build applies migrations
- `prisma.config.ts` — migrations use `DIRECT_URL` when set
- `src/lib/s3-presign.ts` — browser PUT is not signed with a checksum
- `src/app/dashboard/events/[event_id]/media/page.tsx` — save each successful session file
- `src/app/actions/event-day-media.ts` — resolve the file type; report a save failure
- `src/lib/upload-client.ts` — accept a filename when the type is generic
- `README.md`, `.env.example` — Vercel env and cron

The hosted database still needs the `vector` extension or the people-in-media migration fails the deploy. `FACE_PROVIDER=local` only matches identical files.

---

## 2026-10-08 — Feed posts belong to one event

`POST /api/feed` stores `event_id` (the form value, or the user token event when the author matches). `GET /api/feed?event_id=` returns only that event. A post with no event is not listed for any event. Face search for a post uses that same event, and `GET /api/events/{event_id}/my-media` already returns matches for that event only.

Session media on the panel now uploads through the server, the same way current-happening does. The browser no longer PUTs the file to S3, which was failing on Vercel.

**New files**
- `prisma/migrations/20261008120000_posts_event_id/migration.sql` — nullable `posts.event_id`

**Modified files**
- `prisma/schema.prisma` — `posts.event_id`
- `src/server/posts.ts` — save and filter by event
- `src/app/api/feed/route.ts` — store the event before face registration
- `src/lib/validations/posts.ts`, `src/lib/openapi.ts` — event filter documented
- `src/app/actions/event-day-media.ts` — server upload for one session file
- `src/app/dashboard/events/[event_id]/media/page.tsx` — uses that upload

**Undo the DB part**
```sql
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_event_id_fkey;
DROP INDEX IF EXISTS idx_posts_event_id;
ALTER TABLE posts DROP COLUMN IF EXISTS event_id;
DELETE FROM _prisma_migrations WHERE migration_name = '20261008120000_posts_event_id';
```

Posts created before this column stay with `event_id` null, so they no longer appear in an event feed.

---

## 2026-10-10 — Happening photos on the list, face match during upload

`GET /api/events/current-happening` and the event dashboard were omitting `happening_photos`, so the app had no photos to open. Those arrays are included again, with `photo_count`. `GET /api/events/current-happening/photos?happening_id=` is unchanged.

Face matching now runs inside the upload request. A free Vercel project does not need `npm run faces:process` or a cron. A feed post is indexed for its event even when another guest created it. `GET /api/events/{event_id}/my-media?user_id=` still returns only that event's matches for that user.

**Modified files**
- `src/app/api/events/current-happening/route.ts` — include photos
- `src/app/api/events/[event_id]/route.ts` — include photos on the dashboard
- `src/server/people-media/schedule.ts` — process before the response returns
- `src/server/people-media/register.ts` — index every event post, then match
- `src/server/people-media/face-reference.ts` — wait for the same processing
- `src/lib/openapi.ts` — sample responses for feed, session media, happening, and recognized media

`FACE_PROVIDER=local` still matches only an identical file. A real match across two different photos needs `FACE_PROVIDER=http`.

---

## 2026-10-10 — Profile picture enrolls the face reference

`POST /api/users/{user_id}/profile-picture` now stores that photo as the face reference and runs matching in the same request. The mobile app does not call `PUT /api/users/me/face-reference`.

**Modified files**
- `src/app/api/users/[user_id]/profile-picture/route.ts` — enroll after the avatar is saved

If the face tables are missing, the avatar is still saved and `face_reference` is null.

---

## 2026-10-10 — Profile photo must be the same person

The first `POST /api/users/{user_id}/profile-picture` still saves the avatar and enrolls that face. A later photo is compared with Amazon Rekognition before anything is replaced. A different person gets a 400 and the old picture stays. If Rekognition is not configured, the picture is still updated so existing profile uploads keep working.

**New files**
- `src/server/people-media/profile-verify.ts` — CompareFaces against the enrolled photo

**Modified files**
- `src/app/api/users/[user_id]/profile-picture/route.ts` — check before saving
- `package.json` — `@aws-sdk/client-rekognition`
- `.env.example` — `PROFILE_FACE_MIN_SIMILARITY`

The IAM user needs `rekognition:CompareFaces`. People-in-media gallery matching still uses the 128-number embedding pipeline, not Rekognition.

---

## Known open items

- `GET /api/feed` returns deleted posts unless `status=active` is passed (existing behaviour).
- Security issues found during review, not fixed yet: legacy admin cookie forgeable with the default secret; any token can edit/delete users; OTP returned in `/api/auth` responses; venue/explore/upload server actions without auth; feed/like/favorites trust `user_id` from the request.
- No admin UI for event categories (seeded by migration since 2026-10-02; add/rename others directly in `event_categories`).
- Other environments still need `npm run prisma:deploy` for `20260927140000_add_user_favorites`, `20260929160000_session_media_and_watermark`, `20261001120000_happening_and_report_settings`, `20261002150000_seed_event_categories`, `20261002170000_watermark_size`, `20261002190000_event_cover_images`, `20261003000000_event_linkedin_url`, `20261004120000_people_in_media` and `20261004210000_event_team`. Install pgvector before the people-in-media migration, or `prisma migrate deploy` stops before `event_team`. If an environment already applied `20260928180000_add_session_phase_tags`, run its undo SQL (2026-09-28 section) first.
- People in media: production face recognition still needs `FACE_PROVIDER=http` and `FACE_SERVICE_URL`. The local provider only matches identical files. Vercel runs one batch after each upload and a daily cron; `npm run faces:process` is only for draining the queue from your own machine.
- Before deploying: go through the production checklist in the 2026-10-03 "/login ⇄ /dashboard redirect loop" section (`ADMIN_JWT_SECRET`, `X-Forwarded-Proto`, post-deploy login test).
- Swapping two session titles on the same day in one save (A↔B) hits the unique (day, title) constraint; rename in two saves.
- Watermark is an overlay: the mobile app must draw it (see `watermark` in `GET /api/events/{event_id}`); downloaded original files have no watermark.
