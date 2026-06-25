# Cloudflare deployment and safe updates

This project is prepared for **Cloudflare Workers + Static Assets + D1**.

- `public/` is deployed as the website.
- `cloudflare/worker.mjs` runs all `/api/*` routes.
- D1 stores accounts, password hashes, short-lived hashed password-reset codes, surveys, history, feedback, hashed login sessions, community profiles, rooms, per-user chat preferences, blocks, and friends-only posts.
- Deploying or rolling back Worker code does not replace D1 data.
- Schema changes are applied as numbered files in `migrations/`; never edit or delete a migration that has already reached production.

## First deployment

Use Node.js 20 or newer.

1. Authenticate and create the persistent database:

   ```bash
   npx wrangler@4 login
   npx wrangler@4 d1 create it-takes-a-village-db
   ```

2. Copy the returned `database_id` into `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

3. Create the production tables:

   ```bash
   npm run cloudflare:migrate:remote
   ```

4. Import existing local accounts before opening the public website:

   ```bash
   npm run cloudflare:export-users
   npx wrangler@4 d1 execute it-takes-a-village-db --remote --file=./data/cloudflare-users-import.sql
   ```

   The generated SQL contains user records and password hashes. It is ignored by Git and must never be uploaded or shared. Because Cloudflare uses the same password-hash format, existing passwords continue to work after import.

5. Add server-only secrets. Paste each value only into Wrangler's secure prompt:

   ```bash
   npx wrangler@4 secret put OPENAI_API_KEY
   npx wrangler@4 secret put USER_SHEET_WEBHOOK_URL
   npx wrangler@4 secret put ERROR_SHEET_WEBHOOK_URL
   npx wrangler@4 secret put PASSWORD_EMAIL_WEBHOOK_URL
   npx wrangler@4 secret put PASSWORD_RESET_SECRET
   ```

   `PASSWORD_EMAIL_WEBHOOK_URL` may use the same Google Apps Script `/exec` URL after the updated `integrations/google-apps-script.gs` has been saved and deployed as a new version. If this secret is omitted, the Worker automatically falls back to `USER_SHEET_WEBHOOK_URL` for reset email delivery. Apps Script sends the six-digit code through the Google account's Gmail service. Use a long random value for `PASSWORD_RESET_SECRET`; codes are stored only as salted hashes in D1 and expire after 10 minutes.

   `ERROR_SHEET_WEBHOOK_URL` may reuse the same Apps Script `/exec` URL as the user sheet, as long as that Apps Script deployment runs under an account with access to the Error database spreadsheet. The Worker sends `ERROR_SHEET_ID` and `ERROR_SHEET_GID`, appends one row per resource shortage, high-score shortage, or disliked-resource event, and always writes `No` to the `helpful` column.

6. Deploy:

   ```bash
   npm run cloudflare:deploy
   ```

Cloudflare will return the `https://villageresources.yanyanweiyue.workers.dev/` URL from the Worker name in `wrangler.jsonc`. A custom domain can be added from **Workers & Pages → villageresources → Settings → Domains & Routes**.

## Continue changing the website

- Visual/UI changes: edit files in `public/`.
- Recommendation logic: edit `scoring-engine.mjs` and `config/scoring-config.json`.
- API or account features: edit `cloudflare/worker.mjs`; keep `server.mjs` aligned for local Node development.
- Database fields or tables: create a new migration rather than changing any migration already deployed:

  ```bash
  npx wrangler@4 d1 migrations create it-takes-a-village-db describe_your_change
  ```

Test locally with:

```bash
cp .dev.vars.example .dev.vars
npm test
npm run cloudflare:migrate:local
npm run cloudflare:dev
```

Put only local development secrets in `.dev.vars`; it is ignored by Git.

Then push to `main`. The included GitHub Actions workflow applies only unapplied migrations and deploys the new code/assets. D1 rows stay in place.

## GitHub automatic deployment

In the GitHub repository, add Actions secrets:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token allowed to edit Workers and D1.
- `CLOUDFLARE_ACCOUNT_ID` — shown in the Cloudflare dashboard.

After those are configured, every push to `main` runs `.github/workflows/deploy-cloudflare.yml`. Migration failure stops deployment, which prevents new code from running against an incompatible database.

## Account persistence guarantees

- Passwords are never stored in plaintext.
- Session tokens are stored only as SHA-256 hashes.
- Password-reset codes are six digits, hashed with a server-only secret, limited to five attempts, rate-limited to one request per minute, and expire after 10 minutes.
- Login sessions live in D1 for seven days and survive Worker deployments/restarts.
- Community memberships, accepted connections, per-user history cutoffs, blocks, messages, and Moments survive Worker deployments/restarts.
- The scheduled trigger runs every 12 hours and deletes messages older than 12 hours only from system-managed groups.
- The local Node server writes users and hashed sessions atomically to ignored data files, so ordinary code updates do not overwrite them.
- Do not delete the D1 database, reuse its name for testing, or run destructive SQL in a migration.
