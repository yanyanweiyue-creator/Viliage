# It Takes a Village

A full-stack, no-dependency web prototype for a personalized caregiver resource village. Users create an account, complete a first-visit survey, enter an interactive two-island scene, and use Waffles—the animated capybara guide—to find education or legal resources from a Google Sheet.

## What is included

- Account creation and login with salted `scrypt` password hashes and HTTP-only session cookies
- First-visit Community Compass survey and personal record
- Two-island scene with island zoom, ten independently configured building hotspots, distinct island habitats, pets, a dragon, livestock, birds, and village walkers
- Support/contact, settings, education AI, legal AI, and activity panels
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

The placeholder scene was generated specifically for this prototype. Buildings are separate HTML layers, so changing the background does not require changing navigation code. You can later add a per-building `image` property and render your own sprite inside each building button.

## Google Sheet resource database

The server reads the selected worksheet through the public Google Visualization endpoint and refreshes its cache every 60 seconds:

`https://docs.google.com/spreadsheets/d/1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0/edit?gid=1709372674`

To switch databases later, set `RESOURCE_SHEET_ID` and `RESOURCE_SHEET_GID` in `.env`; no application-code change is required.

Add rows beneath the existing headers and the app will pick them up automatically. Keep `Resource Name`, `URL`, `Description`, `Diagnosis`, `Category1/2`, `Age`, `Tag1–5`, `Location1–4`, `Price`, and optional `Issues` or `Issue1–4` columns. If the sheet becomes private, use a service account or an authenticated backend instead of exposing credentials to the browser.

## Personalized scoring engine

The ranking pipeline is `query + personal record → normalized direct keywords → AI/heuristic related terms → per-resource scoring → threshold → descending rank → selected result count`. Tags are evaluated before descriptions for each keyword, so a tag match is not double-counted again in the description. Exact phrases, partial phrases, common synonyms, punctuation, casing, and basic singular/plural forms are normalized. Preferences such as “affordable,” “soon,” or “takes insurance” can trigger stacked penalties against matching `Issues` values.

Administrators can change every weight, minimum score, default count, and maximum count in `config/scoring-config.json` without editing application code. The default direct weights are +10 exact tag, +5 partial tag, +3 exact description phrase, +1 partial description, -10 exact issue conflict, and -5 partial issue conflict. AI-suggested matches use lower weights. `GET /api/scoring-config` exposes the active non-secret configuration for debugging; every returned resource includes `score`, `explanation`, and `matchedKeywords`.

For production-scale storage, use normalized `resources`, `resource_tags`, `resource_categories`, and `resource_issues` tables with indexes on normalized terms and resource IDs. The current in-memory pass is linear and suitable for thousands of cached rows. Tens of thousands of rows should add a database full-text index or precomputed inverted tag index while keeping this same scoring contract.

## Connect the user record sheet

Use `integrations/google-apps-script.gs`:

1. Open the supplied user-record spreadsheet.
2. Choose **Extensions → Apps Script**.
3. Paste the script, save, and deploy it as a Web App.
4. Copy the deployment `/exec` URL into `USER_SHEET_WEBHOOK_URL`.

The script finds the header row, updates the same user instead of creating duplicates, wraps long text, sizes columns appropriately, and deliberately leaves `Password` blank. Passwords must never be stored in a spreadsheet.

## Live local environment

The village map uses an approximate IP location to choose the user's hemisphere and local time zone. The server sends coordinates to Open-Meteo for current conditions, sunrise, and sunset, then returns only an approximate city, weather, and sky timing to the browser. Raw IP addresses are not returned to the browser, written to the user record, or stored on disk.

The scene changes between spring, summer, autumn, and winter; maps WMO weather codes to clouds, fog, rain, snow, and thunderstorms; moves the sun between the local sunrise and sunset; and shows the moon and stars at night. Weather is refreshed every 10 minutes. Low-stimulation mode removes precipitation and seasonal particle animation.

Weather-aware ambience is synthesized locally with the browser Web Audio API, so no sound file or listening data is uploaded. Browsers require a user gesture, therefore sound starts only after the user selects **Enable sound** in Settings. Master, weather/environment, and animal volumes are saved on the device; environment defaults louder than the gentler animal channel. Low-stimulation mode reduces both channels.

Weather data: [Open-Meteo](https://open-meteo.com/). Approximate IP geolocation: [Really Free GeoIP](https://reallyfreegeoip.org/).

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

This is a Node server, not a static-only site, because authentication, AI keys, and Google Sheet writes must remain server-side. Deploy it to a Node-capable host such as Render, Railway, Fly.io, or Cloud Run. Add `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESOURCE_SHEET_ID`, `RESOURCE_SHEET_GID`, and `USER_SHEET_WEBHOOK_URL` as server configuration.

Before a real launch, replace the JSON user store and in-memory sessions with a managed database and durable session store, add email verification/password reset, configure HTTPS, and complete a privacy/security review for the data you collect.

## Image-generation prompt

The placeholder used the built-in image generator with this core brief: a wide 16:9, calm hand-painted 2.5D map with exactly two neighboring green islands, a small wooden bridge, pale aqua water, open building zones, no labels, no buildings, no people, and no logos.
