# glimpsapp_admin

**Database & API**

- **DB:** PostgreSQL (use `DATABASE_URL` env var)
- **ORM:** Prisma (schema at `prisma/schema.prisma`)
- **Example API:** `src/app/api/users/route.ts` (GET/POST)

Quick commands:

```bash
# install deps
npm install

# generate Prisma client
npm run prisma:generate

# run migrations (creates tables) — development only
npm run prisma:migrate

# Pull prisma db
npx prisma db pull

# start dev server
npm run dev
```

**Deploying on AWS (database migration on server)**

1. **Create migrations locally** (once): run `npm run prisma:migrate` so `prisma/migrations/` exists and is committed.
2. **On the server**, set the production database URL:
   ```bash
   export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
   ```
   (Or use `.env` / your process manager’s env.)
3. **Install, generate client, run migrations, then start**:
   ```bash
   npm ci
   npm run prisma:generate
   npm run prisma:deploy
   npm run build
   npm run start
   ```
   `prisma:deploy` runs `prisma migrate deploy` and applies all pending migrations to the server DB; use this instead of `prisma:migrate` in production.

## People in media

Face detection, embeddings, and matching run only on the server. The mobile app calls the APIs below and renders the returned media URLs. It must not download an event's gallery to recognize faces.

Photographer uploads (`event_day_media`) and user posts (`post_media`) are registered as `media_assets` linked to an event. Upload requests only insert a `pending` row. A separate worker detects faces and writes embeddings with pgvector.

### Server setup

Do this on every database (local, dev, and production) before using the feature:

1. Install the [pgvector](https://github.com/pgvector/pgvector) extension that matches the PostgreSQL major version. The migration runs `CREATE EXTENSION vector` and stores `vector(128)` columns. PostgreSQL on Windows does not include pgvector until you install it.
   - Windows (PostgreSQL 16): this project’s local database does not include pgvector until an administrator installs it. Download `vector.v0.8.6-pg16.zip` from [andreiramani/pgvector_pgsql_windows](https://github.com/andreiramani/pgvector_pgsql_windows/releases/tag/0.8.6_16) (built for PostgreSQL 16). In an elevated PowerShell, stop the `postgresql-x64-16` service, extract the zip so `lib\vector.dll` lands in `C:\Program Files\PostgreSQL\16\lib` and `share\extension\vector*` lands in `C:\Program Files\PostgreSQL\16\share\extension`, start the service, then run `npm run prisma:deploy`.
   - Linux packages: install `postgresql-16-pgvector` (the package name follows the server version), then restart PostgreSQL if the extension files were added after the server started.
2. Apply migrations: `npm run prisma:deploy` then `npm run prisma:generate`. This includes `20261004120000_people_in_media`.
3. Set the variables in `.env.example` (`FACE_PROVIDER`, `FACE_EMBEDDING_DIM`, `FACE_MATCH_MIN_SIMILARITY`, `FACE_MAX_ATTEMPTS`, `FACE_WORKER_BATCH`, `FACE_WORKER_SECRET`). `FACE_EMBEDDING_DIM` must stay `128` until a new migration changes the column.
4. Keep the existing object-storage variables set (`AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `UPLOAD_TOKEN_SECRET`). Production hosts such as Vercel cannot store uploads on local disk.
5. Restart the app so it loads the new client and environment.
6. Processing starts by itself after a gallery upload, a feed post, or a face-reference enrollment. The response is sent first; face detection runs just after it. A daily Vercel cron retries anything that pass did not finish. `npm run faces:process` is only needed when you want to drain the queue from your own machine.

```bash
npm run faces:process
```

The script reads `FACE_WORKER_SECRET` and posts to `APP_BASE_URL` (default `http://localhost:3000`) at `POST /api/internal/media/process` with header `x-face-worker-secret`. Each call processes a small batch and retries failed jobs until `FACE_MAX_ATTEMPTS`.

### Vercel

`npm run build` runs `prisma migrate deploy` before the Next.js build, so a deploy applies pending migrations, including people-in-media. The hosted Postgres must allow `CREATE EXTENSION vector` (Prisma Postgres does). Set `DIRECT_URL` to the direct database host when `DATABASE_URL` is the pooled URL; migrations use `DIRECT_URL` when it is set.

Set these project environment variables: `FACE_PROVIDER` (`local` is enough to test the pipeline; it only matches an identical file), `FACE_WORKER_SECRET`, and `CRON_SECRET`. Vercel Cron calls `GET /api/internal/media/process` once a day with `Authorization: Bearer <CRON_SECRET>`. You do not run `npm run faces:process` on Vercel.

`FACE_PROVIDER=local` makes the pipeline runnable without a GPU. It builds a deterministic vector from the file bytes, so only the same file matches itself. It does not recognize a person across different photos, and it skips videos. For real recognition set `FACE_PROVIDER=http`, `FACE_SERVICE_URL`, and optionally `FACE_SERVICE_TOKEN`. The service receives the raw image or video bytes and must return JSON:

```json
{ "faces": [{ "confidence": 0.9, "box": { "x": 0, "y": 0, "width": 1, "height": 1 }, "embedding": [0.1] }] }
```

`embedding` must contain 128 finite numbers. The app never returns embeddings, storage keys, or face boxes from its APIs.

### APIs

All routes except the worker use the existing Bearer JWT. App-user tokens come from `/api/auth`. Admin tokens come from `/api/admin/login`. Responses use `{ message, data, meta }`.

Photographer files are queued by the existing gallery save: the panel upload and `POST /api/admin/events/:eventId/days/:dayId/media`. User posts are queued by the existing `POST /api/feed`. That request is unchanged for current clients. When the caller is the app user who owns the post, the event on their token is used. An optional `event_id` form field overrides it. The user must be a guest of that event. The post is still created if face registration cannot run.

| Method | Path | Who | Purpose |
|---|---|---|---|
| PUT | `/api/users/me/face-reference` | App user | Multipart `file` plus `consent=true`. Stores the photo and queues processing. JSON `{ "consent": false }` withdraws consent and deletes the biometric data. |
| GET | `/api/users/me/face-reference` | App user | Consent and status. No embedding. |
| DELETE | `/api/users/me/face-reference` | App user | Same as withdrawing consent. |
| GET | `/api/media/:id/status` | Uploader, matched user, or event admin | Processing status, face count, last error. |
| POST | `/api/media/:id/match` | Event admin | Queue the asset again. Returns 202. Does not detect faces in the request. |
| GET | `/api/media/:id/matches` | Event admin | Matched users and similarity scores. |
| GET | `/api/media/:id/access` | Uploader, matched guest, or event admin | Opaque `media_url` only. |
| GET | `/api/events/:eventId/my-media?user_id=&page=&limit=` | App user who is a guest | Photographer and user-post media where `user_id` matched. `user_id` must be the signed-in user. |
| GET | `/api/admin/events/:eventId/people-media?page=&status=` | Event admin | Status, face count, match count, errors, guest face-reference jobs. |
| POST | `/api/admin/events/:eventId/people-media` | Event admin | Body `{ "media_asset_id" }` or `{ "user_id" }` to requeue a failed job. |

Saving the same gallery row or post media again returns the existing face-search asset instead of inserting a duplicate.

The admin panel lists this under **People** on each event.

## CI/CD (dev + prod)

This repository now includes:

- `.github/workflows/ci.yml`: lint + build on PR/push for `dev` and `main`
- `.github/workflows/cd.yml`: auto-deploy to `dev` when code is merged into `dev`, and manual deploy for `prod`

### Branch strategy

- `dev` branch: merge PR -> auto deploy to `dev` environment
- `main` branch: use manual workflow dispatch to deploy `prod`

### Required GitHub Environments

Create two GitHub Environments in your repository settings:

- `dev`
- `prod` (recommended: require manual approval in protection rules)

### Required environment secrets (set in each environment)

- `DATABASE_URL`
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY` (private SSH key)
- `APP_DIR` (absolute path on server)
- `APP_START_CMD` (optional override)
- `APP_BUILD_CMD` (optional override)

`APP_BUILD_CMD` default:

`npm ci && npm run prisma:generate && npm run prisma:deploy && npm run build`

`APP_START_CMD` default:

`pm2 restart glimpsapp-admin || pm2 start npm --name glimpsapp-admin -- start`

### Security best practices

- Keep all credentials in environment secrets (never in repo files)
- Use separate credentials/servers for `dev` and `prod`
- Protect `main` with required status checks and PR reviews
- Enable environment protection/approval for `prod`