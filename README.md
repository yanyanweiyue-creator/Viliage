# It Takes a Village

A full-stack, no-dependency web prototype for a personalized caregiver resource village. Users create an account, complete a first-visit survey, enter an interactive two-island scene, and use Waffles—the animated capybara guide—to find education, legal, or recreation resources from a Google Sheet.

## What is included

- Account creation, login, and email-code password reset with salted `scrypt` password hashes and HTTP-only session cookies
- First-visit Community Compass survey and personal record
- Two-island scene with island zoom, ten independently configured building hotspots, distinct island habitats, pets, a dragon, livestock, birds, and village walkers
- Support/contact, opt-in community chat, a dedicated Settings icon, avatar-based My Record, education AI, legal AI, recreation AI, and activity panels
- Font size, color palette, language, reduced-motion, low-stimulation, and three-channel sound controls
- Dynamic resource loading from the provided Google Sheet with a local fallback
- Configurable resource scoring with tag-first matching, issue penalties, AI-assisted synonym expansion, result counts from 3–10, and a visible explanation for every score
- Server-side OpenAI Responses API integration; the API key is never sent to the browser
- Google Apps Script webhook that updates one user per row according to sheet headers
- Editable content and asset paths in one configuration file

## Run locally

Node.js 20 or newer is required. No package installation is needed.

```bash
cp .env.example .env
set -a && source .env && set +a
node server.mjs
```

Open `http://127.0.0.1:4173`.

The app works without an OpenAI key in deterministic demo mode. For live AI explanations, create a new key after revoking the one exposed in chat and set `OPENAI_API_KEY` only in `.env` or your deployment platform's secret manager.

## Replace the survey

Open `public/site-config.js` and change `survey.url`. The current in-app fields mirror the first page of the supplied Community Compass form. If the questions change, update the survey form in `public/index.html` and the `responses` object in `public/app.js`.

Google Forms run inside a cross-origin frame and do not reliably tell the parent website which signed-in user submitted a response. The prototype therefore stores the matching in-app answers as the user's personal record while keeping the original Form one click away.

## Replace the island and buildings

1. Export your island art as a wide 16:9 PNG or WebP.
2. Put it in `public/assets/`.
3. Change `map.image` in `public/site-config.js`.
4. Adjust each building's `x` and `y` percentages in the same file.

The approved illustration remains the 2D visual source. Invisible polygonal hit areas follow each School, Courthouse, Village, Park, or Woods illustration, so users click the artwork directly without visible oval buttons. The 3D Canvas renderer generates matching building models separately while reusing the same configuration and navigation actions.

## Google Sheet resource database

The server reads the selected worksheet through the public Google Visualization endpoint and refreshes its cache every 60 seconds:

`https://docs.google.com/spreadsheets/d/1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0/edit?gid=1709372674`

To switch databases later, set `RESOURCE_SHEET_ID` and `RESOURCE_SHEET_GID` in `.env`; no application-code change is required.

Add rows beneath the existing headers and the app will pick them up automatically. Keep `Resource Name`, `URL`, `Description`, `Diagnosis`, `Category1/2`, `Age`, `Tag1–5`, `Location1–4`, `Price`, and optional `Issues` or `Issue1–4` columns. If the sheet becomes private, use a service account or an authenticated backend instead of exposing credentials to the browser.

## Personalized scoring engine

The v2.1 ranking pipeline is `island diagnosis hard filter → building category hard filter → optional clarification → Description Gate → scoring → conditional expansion → tier/score sort`. A diagnosis or category mismatch is permanently excluded and can never return through scoring. The Description Gate uses no more than 20% of the strongest user-confirmed concepts; the full original intent becomes available only after a resource passes the gate. AI prediction is called lazily only when direct and synonym results still cannot fill the selected count.

Administrators can change every weight, threshold, result count, gate ratio, and clarification limit in `config/scoring-config.json` without editing application code. Primary tag matches use +25/+15/+4, confirmed-secondary tag matches use +12/+7/+2, and AI-predicted matches are capped at +3/+1/+1. `GET /api/scoring-config` exposes the active non-secret configuration for debugging; every returned resource includes its tier, passed filters, gate evidence, score, explanation, and matched keywords.

See `docs/RECOMMENDATION-ARCHITECTURE.md` for the database model, search architecture, API contract, worked scoring example, and test coverage.

For production-scale storage, use normalized `resources`, `resource_tags`, `resource_categories`, and `resource_issues` tables with indexes on normalized terms and resource IDs. The current in-memory pass is linear and suitable for thousands of cached rows. Tens of thousands of rows should add a database full-text index or precomputed inverted tag index while keeping this same scoring contract.

## Connect the user record sheet

Use `integrations/google-apps-script.gs`:

1. Open the supplied user-record spreadsheet.
2. Choose **Extensions → Apps Script**.
3. Paste the script, save, and deploy it as a Web App.
4. Copy the deployment `/exec` URL into `USER_SHEET_WEBHOOK_URL`.

The script finds the header row, updates the same user instead of creating duplicates, wraps long text, sizes columns appropriately, and deliberately writes only a safety marker in `Password`. Passwords and password hashes must never be stored in a spreadsheet.

The same script now handles `send-password-reset` requests with `GmailApp.sendEmail`. After replacing the script, create a **new Apps Script deployment version**, then set its `/exec` URL as `PASSWORD_EMAIL_WEBHOOK_URL`; if that secret is omitted, the app automatically reuses `USER_SHEET_WEBHOOK_URL` for password email delivery. Users can request a six-digit code from the Login screen; only a hash is stored, requests are rate-limited, codes expire after 10 minutes, and a successful reset invalidates existing sessions.

The script also handles `log-resource-error` requests for the Error database spreadsheet. Set the deployment `/exec` URL as `ERROR_SHEET_WEBHOOK_URL`, keep `ERROR_SHEET_ID=1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0`, and keep `ERROR_SHEET_GID=1952899933`. Resource shortage events, high-score shortage events, and user-disliked resources are appended as new rows by matching the sheet's row-1 headers. Any `helpful`/`Helpful` column is always written as `No`.

The supplied user sheet currently has eight row-1 headers: `User name`, `Password`, `response of survey`, `AI personal record`, `history`, `feedback`, `Chat History`, and `Email`. The server sends all eight exact keys whenever the account, survey, resource-search history, feedback, or community-message history changes. The Apps Script identifies an existing row by `userId` when available, otherwise by `Email`, and only falls back to `User name`; therefore repeated updates keep one account on one row. The `Password` cell contains only the safety marker “Not stored — secure hash only.” After changing `integrations/google-apps-script.gs`, create a new Apps Script deployment version so the existing `/exec` URL uses the update.

## Live local environment

The village map uses an approximate IP location to choose the user's hemisphere and local time zone. The server sends coordinates to Open-Meteo for current conditions, sunrise, and sunset, then returns only an approximate city, weather, and sky timing to the browser. Raw IP addresses are not returned to the browser, written to the user record, or stored on disk.

The scene changes between spring, summer, autumn, and winter; maps WMO weather codes to clouds, fog, rain, snow, and thunderstorms; and moves both sun and moon along a quadratic arc that stays in the upper half of the village. The moon phase is calculated for the local date, flipped for the user's hemisphere, and renders only its illuminated silhouette—crescent, quarter, gibbous, or full—rather than retaining a dark circular ball. Night skies use individually layered, depth-scaled stars and soft nebula glows instead of a repeating texture. Weather is refreshed every 10 minutes. Low-stimulation mode removes precipitation and seasonal particle animation.

Settings also offers an illustrated **2D** mode and an immersive **3D** mode. The 2D scene overlays live large-scale swells, moving highlights, shoreline foam, pointer ripples, and animated airflow while masking waves away from the land. The 3D renderer is generated locally with Canvas: it adds two visibly separated perspective islands, type-specific School/Courthouse/Village/Park/Woods models, layered moving water, broken sun reflections, interactive ripples, volumetric cloud shapes, airflow ribbons, forest depth, lens bloom, and island-specific ecology—fruiting jujube trees on Autism Island and pines/wildflowers on ADHD Island—without sending graphics data to another service. Every building has a separate tested 3D ground coordinate and a contact shadow. Low-stimulation mode pauses continuous animation. Both visual choices are saved on the device.

Weather ambience and two original fallback scores—daytime **Garden Footsteps** and nighttime **Starlit Current**—are synthesized locally with the browser Web Audio API, alongside replaceable animal recordings. Clear, cloudy, fog, rain, snow, and storm conditions each use different layered filters, with additional seasonal and day/night textures; 3D mode adds a close shoreline layer. Bird and gull calls use the first 3.2 seconds of the project-provided gentle morning-bird recording. The new sparse-insect track joins the environment channel only during local summer from 10:00–16:00, while the small-farm track plays only from 15 minutes before through 45 minutes after local sunrise. Browsers require a user gesture, therefore sound starts only after the user selects **Enable sound** in Settings. Master, weather/environment, background-music, and animal volumes are saved on the device; environment defaults louder than the gentler music and animal channels. Low-stimulation mode reduces every channel.

Each user can replace the day and night score from Settings with an MP3, OGG, WAV, M4A, AAC, or WebM file up to 30 MB. The selected files are stored as bytes in IndexedDB on that browser only: they are never uploaded to the server, never added to the user spreadsheet, and never synchronized across devices. Clearing site data removes them. **Use original** deletes the local copy and immediately restores the procedural score.

The configurable ecosystem keeps land animals on island-specific waypoint routes. Every creature is rendered as original inline SVG artwork—no emoji—and its head, ears, wings, tail, arms, and legs are animated independently for smooth walking, grazing, drinking, flying, and resting. In 3D mode, procedural surface texture, perspective scaling, richer lighting, and ground shadows give the models more depth. Cow and sheep graze every five minutes and visit a pond edge every ten minutes; villagers move among buildings and over the bridge by day and enter buildings at night. Villager routes are sampled along every segment and rejected if any step leaves the two land masks or bridge corridor. Ordinary birds fly only by day, a gull flock departs toward the horizon around sunset, and the azure dragon has one deterministic 12% chance per local date to cross the dawn sky. Routes, actors, event windows, audio files, and optional owned/licensed day/night music are all editable under `ecosystem` in `public/site-config.js`. See `AUDIO_CREDITS.md` before replacing or publishing sound files.

Weather data: [Open-Meteo](https://open-meteo.com/). Approximate IP geolocation: [Really Free GeoIP](https://reallyfreegeoip.org/).

## Village community

The Support building includes three system group chats, invite-only user-created groups, consent-based private connections, community search by name or email, per-user pinning/history clearing, friend removal, blocking, and a friends-only Moments feed. Every group shows its member list, lets members invite accepted friends, and provides one-click `@member` and `@everyone` mentions. Chats include a sticker picker. Moments can contain text and one small image; authors may limit a post to selected friends or hide it from selected friends. Search can send a friend request to any opted-in, unblocked community member; private chat and Moments remain friends-only. Server-side language moderation rejects harmful or abusive language in community names, groups, posts, and messages.

System-created groups remove shared messages older than 12 hours through a Cloudflare scheduled trigger. In user-created groups and private chats, **Clear my history** stores a per-user cutoff: earlier messages disappear only for that user and remain available to other members. The Settings buildings were removed; the dedicated top-right gear opens visual, sound, motion, language, and local-music settings, while the avatar opens My Record.

Cloudflare stores community profiles, memberships, connections, messages, per-user room preferences, block lists, and Moments in D1, so conversations survive code updates. The local server uses ignored `data/community.json` for development. Images are currently stored as size-limited data URLs; production growth should move them to object storage such as Cloudflare R2. Messages are not end-to-end encrypted; the interface states this directly and warns users not to share passwords, addresses, urgent medical details, or use peer chat as emergency/professional support. A public launch should add moderation/reporting workflows, rate limiting, notifications, malware scanning for uploads, and a formal safeguarding review.

## Editable content

Project editors can update these values in `public/site-config.js` without touching application logic:

- survey URL
- support and contact cards
- activity listings
- island image path
- logo SVG path in `public/index.html`
- building labels, topics, icons, and positions

Users have no activity-editing controls.

## Deployment notes

Cloudflare deployment is now supported with Workers, Static Assets, and a D1 database. D1 keeps accounts and sessions separate from code deployments, so users can still sign in after new versions are published. Follow `CLOUDFLARE.md` for first-time deployment, existing-account import, secrets, custom domains, GitHub auto-deployment, and safe future database changes.

The local Node server also persists SHA-256-hashed session tokens in `data/sessions.json` and atomically updates user data. Both data files are ignored by Git, so pulling new source code does not replace local accounts.

For other Node hosts, add `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESOURCE_SHEET_ID`, `RESOURCE_SHEET_GID`, `USER_SHEET_WEBHOOK_URL`, `ERROR_SHEET_WEBHOOK_URL`, and `ERROR_SHEET_GID` as server configuration and mount the `data/` directory on durable storage.

Before a real public launch, add email verification/password reset, rate limiting, abuse monitoring, and a privacy/security review for the data you collect. Cloudflare provides HTTPS for the deployed Worker and D1 supplies the durable account store.

## Image-generation prompt

The placeholder used the built-in image generator with this core brief: a wide 16:9, calm hand-painted 2.5D map with exactly two neighboring green islands, a small wooden bridge, pale aqua water, open building zones, no labels, no buildings, no people, and no logos.
