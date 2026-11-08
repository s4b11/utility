# Utility — a private, personal toolbox (web + Android)

A private, single-owner personal app built as **one** Fermyon Spin (WebAssembly) HTTP
component. The Rust component serves both the JSON API and the React single-page app, with
all assets embedded into the `.wasm` at compile time. The same frontend ships as an Android
app with Tauri 2. Everything is self-hosted: no CDN, no runtime asset requests.

## Features

- **Commands** — save quick-access commands with a category, tags, and one-click copy; full-text
  search + tag filtering.
- **Links** — save site links with category + tags; search/filter; open in a new tab.
- **JSON** — client-side format / minify / validate + a collapsible, syntax-colored tree.
- **Markdown** — live preview rendered and **sanitized server-side** (`pulldown-cmark` + `ammonia`).
- **Notes** — plain-text notes with tags; search + tag filter; optional reminder.
- **Tasks** — to-dos with due date, optional start, priority, tags, and **recurrence**; grouped
  Overdue / Today / Upcoming / No-date / Done with an inline done toggle.
- **Calendar** — single events calendar (start/end, all-day, location, tags, recurrence) with
  **month + agenda** views and a **unified overlay** of task deadlines and active reminders.
- **Reminders** — attach a reminder to any note/task/event, with **snooze / done** in the
  notification centre, plus foreground browser notifications.
- **Notifications** — the app bar bell opens an in-app notification centre: due reminders,
  overdue and soon-due tasks, events in the next day, new jobs, cards expiring or expired,
  and failed email sends. `GET /api/notifications` computes them from the stored data and
  keeps read / cleared state; the app polls while open and shows a snackbar for new ones.
  In-app only: Fermyon Cloud has no scheduler and there is no push service (no FCM).
- **Email templates**: 30 designed HTML emails, from professional (formal letter, meeting
  invitation, follow-up, invoice, quotation, payment reminder and receipt, introduction,
  meeting recap, job application, interview invitation, job offer, leave request,
  resignation) through semi-formal (project update, newsletter, thank-you note, welcome,
  announcement, feedback request, incident notice, webinar invitation, reference request)
  to informal (event invitation, friendly catch-up, birthday, congratulations, holiday
  greetings, farewell, get well soon). Fill in the
  fields, see a live preview, and send from your own Gmail with To/Cc/Bcc. Sent emails are kept in a
  history you can reuse. Templates live in `email_templates/` and are rendered server-side by
  `src/email_render.rs` (every value is HTML-escaped, and only http(s)/mailto links are allowed).
- **Pull to refresh**: on phones, pull any list down to reload it.
- **Single-owner auth** — first-run setup creates the only account; login-only afterward, with a
  "Remember me" option. Argon2id passwords, DB-backed sessions (only a SHA-256 of the token is
  stored), HttpOnly/Secure/SameSite=Strict cookie, CSRF via a per-session token, login throttling,
  and a strict `Content-Security-Policy: default-src 'self'`.
- Material 3 Expressive UI, specified in `docs/design/DESIGN.md` with its reference page
  `docs/design/components.html`: colour roles generated from the `#2563EB` seed in light and dark
  themes, the M3 type scale, the corner scale and shape library, spring motion, state layers with
  ripples, a navigation rail on wide windows and a navigation bar (plus a modal rail) on phones.
  The component layer is copied verbatim into `frontend/src/styles/m3e.css`; app-specific rules
  built only from the same roles live in `frontend/src/styles/app.css`, and Tailwind exposes the
  roles (`bg-surface-container`, `text-on-surface-variant`, `bg-primary`, ...).
- **Back gesture**: on Android the back gesture returns to the previous page and closes the
  open dialog, sheet, menu or compose view first; it only leaves the app from the first screen.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Fermyon Spin 3.x, target `wasm32-wasip1` |
| Backend | Rust, `spin-sdk = "3.1"` (`#[http_component]` + `spin_sdk::http::Router` + sync `spin_sdk::sqlite`) |
| Storage | Spin SQLite (`default` database) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v3 |
| Icons | Lucide (`lucide-react`), bundled |
| Android | Tauri 2 (`src-tauri/`) |

> **SDK version matters:** keep `spin-sdk` on the `3.1.x` line for Spin 3.x + `wasm32-wasip1`.
> `spin-sdk` 6.x targets WASIp3 / `wasm32-wasip2` with a different (`#[http_service]`, async) API.

## Prerequisites

- [Spin](https://spinframework.dev) 3.x, Rust + the `wasm32-wasip1` target
  (`rustup target add wasm32-wasip1`), and Node.js / npm.

## Develop

```sh
npm --prefix frontend ci     # frontend dependencies
spin build                   # builds the frontend into dist/, then the wasm component

# wallet_key encrypts wallet secrets at rest; use any long random value locally
SPIN_VARIABLE_WALLET_KEY=$(openssl rand -hex 32) spin up   # http://127.0.0.1:3000
```

For frontend work, `spin watch` rebuilds on changes. Because the frontend is embedded in the
wasm, a change to it takes effect after the next `spin build`.

First run: open the app and complete the one-time **setup** to create your owner account.

## Using your own deployment

The web app talks to whichever server served it. The Android app and two server-side fallbacks
point at the original deployment, `https://utility.fermyon.app`: change it to your own app URL
in `frontend/src/lib/api.ts` and `src/handlers/jobs.rs` before building the APK.

## Deploy to Fermyon Cloud

```sh
spin login                                                   # once
spin cloud deploy --build --link sqlite:default=toolbox-db   # creates + links the cloud DB
```

The schema self-initializes in code (idempotent `CREATE TABLE IF NOT EXISTS` migrations), so no
manual SQL is needed on the Cloud database. After deploy, open the returned URL and complete setup.

## Sending email (Gmail relay)

Fermyon Cloud can only make HTTPS requests, so the server can't log in to SMTP with an app password.
Instead, mail goes through a tiny Google Apps Script web app that runs on **your** Google account
and calls `GmailApp.sendEmail` as you. No Google password is stored in utility.

1. In the app, open **Settings › Email**, fill in your name and Gmail address, and press the copy button
   to copy the relay script. It already contains your secret.
2. Open <https://script.new> while signed in to that Gmail account, paste the script over everything, and save.
3. Choose **Deploy › New deployment › Web app** with **Execute as: Me** and **Who has access: Anyone**,
   authorise it, and paste the web app URL (it ends in `/exec`) back into Settings.
4. Press **Check connection**, then **Send test email**.

The relay rejects any request without the shared secret, which is stored encrypted with `wallet_key`.
If you press **New secret**, paste the updated script into Apps Script and deploy a new version.
Gmail's normal daily sending limits apply.

## CI/CD (GitHub Actions)

| Workflow | Runs on | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | Pull requests, pushes to any branch except `main` | Type-checks and builds the frontend, then builds the Spin wasm server that embeds it |
| `.github/workflows/release.yml` | Pushes to `main` (not docs-only), or **Run workflow** | Runs CI, then in parallel deploys that exact build to Fermyon Cloud (with a smoke test) and builds + signs `utility.apk`, then publishes the APK as a GitHub release |

Manual runs let you choose whether to deploy the web app, build the APK, or both.

The Fermyon deploy is opt-in: set the repository **variable** `DEPLOY_FERMYON` to `true` to enable it.

Repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Needed for | Notes |
|---|---|---|
| `FERMYON_PAT` | Fermyon deploy | Fermyon Cloud personal access token |
| `ANDROID_KEYSTORE_BASE64` | Stable APK signature | `base64 -w0 release.jks`; without it each APK is signed with a throwaway key and cannot update an existing install |
| `ANDROID_KEYSTORE_PASSWORD` | Stable APK signature | Store password (also used as the key password) |
| `ANDROID_KEY_ALIAS` | Stable APK signature | Optional; defaults to `utility` |

App variables (`wallet_key`, `webhook_secret`, `groq_api_key`) live in Fermyon Cloud and persist
across deploys; the pipeline never changes them. Set them with
`spin cloud variables set --app personal-app name=value`.

## Layout

```
spin.toml                 # one HTTP component; route "/...", sqlite_databases=["default"]
src/                      # Rust: router, handlers, auth, db, migrations, markdown, static_files
migrations/               # schema (embedded via include_str!)
frontend/                 # React + Vite SPA (builds into dist/, embedded into the wasm)
src-tauri/                # Tauri 2 Android app wrapping the same frontend
docs/design/              # DESIGN.md + components.html: the UI component system
.github/workflows/        # ci.yml (checks) and release.yml (deploy + APK + GitHub release)
```

## License

[MIT](LICENSE)
