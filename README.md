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