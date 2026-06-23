# Capy Village

A full-stack, no-dependency web prototype for a personalized caregiver resource village. Users create an account, complete a first-visit survey, enter an interactive two-island scene, and use an animated capybara guide to find education or legal resources from a Google Sheet.

## What is included

- Account creation and login with salted `scrypt` password hashes and HTTP-only session cookies
- First-visit Community Compass survey and personal record
- Two-island scene with island zoom and ten independently configured building hotspots
- Support/contact, settings, education AI, legal AI, and activity panels
- Font size, color palette, language, reduced-motion, and low-stimulation controls
- Dynamic resource loading from the provided Google Sheet with a local fallback
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

Add rows beneath the existing headers and the app will pick them up automatically. Keep `URL`, description, `Diagnosis`, `Category`, `Age`, tag, `Location`, and `Price` columns. If the sheet becomes private, use a service account or an authenticated backend instead of exposing credentials to the browser.

## Connect the user record sheet

Use `integrations/google-apps-script.gs`:

1. Open the supplied user-record spreadsheet.
2. Choose **Extensions → Apps Script**.
3. Paste the script, save, and deploy it as a Web App.
4. Copy the deployment `/exec` URL into `USER_SHEET_WEBHOOK_URL`.

The script finds the header row, updates the same user instead of creating duplicates, wraps long text, sizes columns appropriately, and deliberately leaves `Password` blank. Passwords must never be stored in a spreadsheet.

## Editable content

Project editors can update these values in `public/site-config.js` without touching application logic:

- survey URL
- support and contact cards
- activity listings
- island image path
- building labels, topics, icons, and positions

Users have no activity-editing controls.

## Deployment notes

This is a Node server, not a static-only site, because authentication, AI keys, and Google Sheet writes must remain server-side. Deploy it to a Node-capable host such as Render, Railway, Fly.io, or Cloud Run. Add `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESOURCE_SHEET_ID`, `RESOURCE_SHEET_GID`, and `USER_SHEET_WEBHOOK_URL` as server configuration.

Before a real launch, replace the JSON user store and in-memory sessions with a managed database and durable session store, add email verification/password reset, configure HTTPS, and complete a privacy/security review for the data you collect.

## Image-generation prompt

The placeholder used the built-in image generator with this core brief: a wide 16:9, calm hand-painted 2.5D map with exactly two neighboring green islands, a small wooden bridge, pale aqua water, open building zones, no labels, no buildings, no people, and no logos.
