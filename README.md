# Spark — a dating app

A full-stack dating app in the style of Hinge and Bumble: build a profile with photos and
prompts, browse people near you who match your filters, like a specific photo or prompt
(optionally with a comment), see who liked you, match, and chat.

**Design:** a mobile-first app shell (phone-sized and centred on desktop) with a bottom tab
bar. It uses warm honey-yellow accents in the style of Bumble, editorial serif headings and white
prompt cards in the style of Hinge, bottom sheets, toasts, loading placeholders, and an animated
"It's a match!" screen.

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

**Discover**
- Full scrollable profiles: name, photos between prompt answers, and a "vitals" card (age, height, distance, job, education…)
- You only see people whose gender matches who you want to see, **and** who want to see your gender
- Tap ♥ on a **specific photo or prompt** to like it, optionally with a comment that becomes the first message if you match. Tap ✕ to pass. Keyboard: → / ←

**Filters**
- Show me (Women / Men / Everyone), age range, maximum distance, height range
- Looking for, education, drinking, smoking, children. Leave any of these empty to see everyone.
- Age ranges work both ways: you won't see people whose age range excludes you

**Likes You, chats and profile**
- The **Likes** tab shows who liked you, what they liked ("Liked your photo" / "Liked your prompt") and their comment. Tap **Match** to match instantly.
- **Chats** has a row of new matches plus conversations, with **"Your move"** badges when it's your turn to reply (like Bumble)
- In a new chat, conversation starters are suggested from the other person's prompts
- **Profile** shows a profile-strength ring, **Edit / View** tabs (see your profile as others do), dating filters and log out

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
| POST | `/api/swipes` | `{ target_id, liked, comment?, item? }` → `{ matched, match_id? }`. `item` is `{ type: "photo", photo_id }` or `{ type: "prompt", prompt }` |
| GET | `/api/likes` | People who liked you, with their comment and the photo or prompt they liked |
| GET | `/api/matches` | Your matches with the latest message and who sent it |
| DELETE | `/api/matches/:id` | Unmatch |
| GET | `/api/matches/:id/messages?after=<id>` | Messages, optionally only those newer than `after` |
| POST | `/api/matches/:id/messages` | `{ body }` → send a message |

## Ideas for next steps

- Reorder photos by dragging
- Dark mode
- Real-time chat over WebSockets instead of polling
- Bumble-style "women message first" option
- Photo verification, reporting/blocking, email verification, and login rate limiting
