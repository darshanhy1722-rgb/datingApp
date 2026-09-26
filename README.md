# Spark — a dating app

A full-stack dating app in the style of Hinge and Bumble: build a profile with photos and
prompts, browse people near you who match your filters, like someone (optionally with a
comment), see who liked you, match, and chat.

- **Backend:** Node.js + Express, with Node's built-in SQLite (`node:sqlite`), so there are no native dependencies
- **Frontend:** plain HTML/CSS/JS served by the same server, with no build step

## Features

**Sign up**
- First name, date of birth (18+ only; others see your age, never your birthday), gender, and who you want to see: Women, Men or Everyone
- Email + password (hashed with scrypt), bearer-token sessions

**Profile setup (4 steps, each editable later from the Profile tab)**
1. **Photos:** upload 2–6 photos. They're resized in the browser and stored in `uploads/`.
2. **Prompts:** answer 1–3 Hinge-style prompts such as "A perfect first date" or "Typical Sunday".
3. **Location:** "Use my current location" fills in your area automatically, or you can type it.
   Exact coordinates are rounded to about 100 m and never shown to anyone. Others only see your area and a distance.
4. **About you:** height, what you're looking for, job, education, drinking, smoking, children, and a bio.

**Discover**
- Full scrollable profiles with photos between prompt answers, plus detail chips (distance, height, job…)
- You only see people whose gender matches who you want to see, **and** who want to see your gender
- Like (♥), with an optional comment that becomes the first message if you match, or pass (✕). Keyboard: → / ←

**Filters**
- Show me (Women / Men / Everyone), age range, maximum distance, height range
- Looking for, education, drinking, smoking, children. Leave any of these empty to see everyone.
- Age ranges work both ways: you won't see people whose age range excludes you

**Likes You, matches and chat**
- A "Likes" tab shows who liked you and their comment. Like them back to match instantly.
- "It's a match!" screen, a list of matches, 1:1 chat (polls every 3 seconds), and unmatch

## Getting started

Requires Node.js 22.5 or newer.

```bash
npm install
npm run seed   # optional: adds demo profiles around Bengaluru
npm start      # http://localhost:3000
```

With the seed data, log in as `demo@example.com` / `password123`. Several demo profiles have
already liked the demo user, so check the **Likes** tab. Every demo account (`ananya@example.com`,
`priya@example.com`, …) uses the same password.

Environment variables: `PORT` (default `3000`), `DB_PATH` (default `./dating.db`) and
`UPLOAD_DIR` (default `./uploads`).

> **Upgrading from the first version?** The database layout changed. On first start the old
> `dating.db` is reset automatically. Run `npm run seed` again for demo data.

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
| POST | `/api/signup` | `{ email, password, name, birthdate, gender, interested_in }` → `{ token, user }` |
| POST | `/api/login` | `{ email, password }` → `{ token, user }` |
| POST | `/api/logout` | End the current session |
| GET | `/api/me` | Your profile, filters and which setup steps are still `missing` |
| PUT | `/api/me` | Update details, location (`city`, `latitude`, `longitude`) or `interested_in` |
| PUT | `/api/me/filters` | Replace your filters |
| PUT | `/api/me/prompts` | `{ prompts: [{ prompt, answer }] }` |
| POST | `/api/me/photos` | Raw image body (JPEG/PNG/WebP, max 8 MB) |
| DELETE | `/api/me/photos/:id` | Remove a photo |
| GET | `/api/discover` | Up to 20 people who pass both sides' filters, closest first |
| POST | `/api/swipes` | `{ target_id, liked, comment? }` → `{ matched, match_id? }` |
| GET | `/api/likes` | People who liked you and are waiting for your answer |
| GET | `/api/matches` | Your matches with the latest message |
| DELETE | `/api/matches/:id` | Unmatch |
| GET | `/api/matches/:id/messages?after=<id>` | Messages, optionally only those newer than `after` |
| POST | `/api/matches/:id/messages` | `{ body }` → send a message |

## Ideas for next steps

- Reorder photos by dragging
- Real-time chat over WebSockets instead of polling
- Bumble-style "women message first" option
- Photo verification, reporting/blocking, email verification, and login rate limiting
