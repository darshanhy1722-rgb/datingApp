# Spark — a dating app

A full-stack dating app in the style of Hinge and Bumble: build a profile with photos and
prompts, browse people near you who match your filters, like a specific photo or prompt
(optionally with a comment), see who liked you, match, and chat.

**Design:** a mobile-first app shell (phone-sized and centred on desktop) in a Bumble-like
style: white screens, bold sans-serif type, black buttons, warm yellow accents, and a bottom tab
bar with **Profile · Discover · People · Liked You · Chats**. It also has bottom sheets, toasts,
loading placeholders and an animated "It's a match!" screen.

**App colour:** tap the 🎨 palette icon on the Profile tab (or Settings → App colour) to pick an
accent colour (**Honey** yellow, **Rose** pink, **Ocean** blue, **Lavender** purple, **Mint** green or
**Sunset** orange) and **Light / Dark / Auto** appearance. The choice is saved on that device.

- **Backend:** Node.js + Express, with Node's built-in SQLite (`node:sqlite`), so there are no native dependencies
- **Frontend:** plain HTML/CSS/JS served by the same server, with no build step

## Features

**Sign up (one question per screen, like Hinge)**
- First name → date of birth (18+ only; others see your age, never your birthday) → gender → who you want to date (Women / Men / Everyone) → email + password
- Passwords are hashed with scrypt; sessions use bearer tokens

**Profile setup (4 steps, each editable later from the Profile tab)**
1. **Photos:** upload 2–6 photos. They're resized in the browser and stored in `uploads/`.
2. **Prompts:** answer 1–3 Hinge-style prompts such as "A perfect first date" or "Typical Sunday".
3. **Location:** "Use my current location" fills in your area automatically, or you can type it.
   Exact coordinates are rounded to about 100 m and never shown to anyone. Others only see your area and a distance.
4. **About you:** height, what you're looking for, job, education, drinking, smoking, children, and a bio.

**People (one profile at a time)**
- Full scrollable profile: main photo with name and age, "My basics" chips, prompts between photos, and a "My location" card ("Lives in…", "From…", distance)
- You only see people whose gender matches who you want to see, **and** who want to see your gender
- At the end: **✕** pass, **★ SuperSwipe** (3 a day; you appear first in their Liked You), **♥** like. You can also drag the main photo left or right. Keyboard: ← ↑ →
- **Note** on any photo or prompt: like it with a message that starts your chat if you match
- **Block** and **Report** (with a reason) on every profile and in chat. Both hide you from each other everywhere.

**Discover (daily picks)**
- "Recommended for you" carousel ranked by what you have in common (same goals, prompts you both answered, same area or hometown…), with the reason shown on each card
- "Near you" carousel, and a "New picks in X hours" timer. Picks change once a day.

**Filters**
- Show me (Women / Men / Everyone), age range, maximum distance, height range
- Looking for, education, drinking, smoking, children. Leave any of these empty to see everyone.
- Age ranges work both ways: you won't see people whose age range excludes you

**Liked You, Chats and Profile**
- **Liked You**: filter chips **All · Notes · SuperSwipes · New · Nearby** with counts. SuperSwipes come first, and each tile says what they liked. Like back to match instantly.
- **Chats**: "Your matches" with a yellow **24-hour countdown ring**. A new match expires if nobody says hi within 24 hours. Recent chats show a **"Your move"** badge. There's search, conversation starters based on their prompts, and unmatch / block / report from the ⋯ menu.
- **Profile**: completion ring, **Edit profile** (edit or preview), SuperSwipe and Filters cards, a "finish your profile" card and checklist, a **Safety and wellbeing** tab, and settings

**Terms & Privacy**
- Signing up requires ticking "I'm 18 or older and I agree to the Terms & Conditions and Privacy Policy". The server rejects signups without it and records which version was accepted and when.
- Draft pages at `/terms.html` and `/privacy.html`, written for India (IT Act & IT Rules 2021, DPDP Act 2023). **Replace the [bracketed placeholders] and have a lawyer review them before launch.**
- When the Terms change, bump `TERMS_VERSION` in `src/options.js`. Everyone is then asked to accept the new version the next time they open the app, and browsing, liking and messaging are blocked until they do.

## Getting started

Requires Node.js 22.5 or newer.

```bash
npm install
npm run seed   # optional: adds demo profiles around Bengaluru
npm start      # http://localhost:3000
```

With the seed data, log in as `demo@example.com` / `password123`. Several demo profiles have
already liked the demo user (one with a SuperSwipe), so check **Liked You**. **Chats** has a new
match with the countdown running, an active conversation and an expired match. Every demo account (`ananya@example.com`,
`priya@example.com`, …) uses the same password.

Environment variables: `PORT` (default `3000`), `DB_PATH` (default `./dating.db`) and
`UPLOAD_DIR` (default `./uploads`).

> **Upgrading?** Databases from the second version onward are upgraded automatically and keep
> their data. A database from the very first version is reset on start; run `npm run seed` again.

Notes:
- The browser only allows "Use my current location" on `http://localhost` or HTTPS.
- Turning coordinates into an area name uses OpenStreetMap's free Nominatim service. If it's
  unreachable, people just type their area.
- Demo profile photos load from randomuser.me. If a photo can't load, a coloured placeholder
  with the person's initial is shown.

## Tests

```bash
npm test
```

## API

All endpoints except signup, login and options need an `Authorization: Bearer <token>` header.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/options` | Genders, prompts, filter choices and limits |
| POST | `/api/signup` | `{ email, password, name, birthdate, gender, interested_in, accept_terms: true }` → `{ token, user }` |
| POST | `/api/me/accept-terms` | `{ version }`. Accept the current Terms (for accounts created before them) |
| POST | `/api/login` | `{ email, password }` → `{ token, user }` |
| POST | `/api/logout` | End the current session |
| GET | `/api/me` | Your profile, filters and which setup steps are still `missing` |
| PUT | `/api/me` | Update details, location (`city`, `latitude`, `longitude`) or `interested_in` |
| PUT | `/api/me/filters` | Replace your filters |
| PUT | `/api/me/prompts` | `{ prompts: [{ prompt, answer }] }` |
| POST | `/api/me/photos` | Raw image body (JPEG/PNG/WebP, max 8 MB) |
| DELETE | `/api/me/photos/:id` | Remove a photo |
| GET | `/api/discover` | Up to 20 people who pass both sides' filters, closest first |
| POST | `/api/swipes` | `{ target_id, liked, comment?, item?, super? }` → `{ matched, match_id?, super_swipes_left }`. `item` is `{ type: "photo", photo_id }` or `{ type: "prompt", prompt }` |
| GET | `/api/recommended` | Daily picks with `common_ground` reasons, plus people near you |
| GET | `/api/likes` | People who liked you (SuperSwipes first), with their note and what they liked |
| GET | `/api/matches` | Your matches with the latest message, who sent it, and `expires_at` / `expired` |
| POST | `/api/users/:id/block` | Block someone; removes any match |
| POST | `/api/users/:id/report` | `{ reason, details? }`. Report and block someone |
| DELETE | `/api/matches/:id` | Unmatch |
| GET | `/api/matches/:id/messages?after=<id>` | Messages, optionally only those newer than `after` |
| POST | `/api/matches/:id/messages` | `{ body }` → send a message |

## Ideas for next steps

- Reorder photos by dragging
- Dark mode
- Real-time chat over WebSockets instead of polling
- Bumble-style "women message first" option
- Photo verification, reporting/blocking, email verification, and login rate limiting
