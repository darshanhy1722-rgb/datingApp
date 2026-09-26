# Spark — a simple dating app

A full-stack dating app MVP: create a profile, swipe through people who match your
preferences, get a match when the like is mutual, and chat with your matches.

- **Backend:** Node.js + Express, with Node's built-in SQLite (`node:sqlite`), so there are no native dependencies
- **Frontend:** plain HTML/CSS/JS served by the same server, with no build step

## Features

- Email + password accounts (passwords hashed with scrypt, bearer-token sessions)
- Profiles: name, age (18+), gender, who you want to see, age range, city, bio, photo URL
- Discover feed filtered **both ways**: you only see people who fit your preferences *and* whose preferences you fit
- Swipe by dragging the card, using the ✕ / ♥ buttons, or the ← / → keys
- Mutual likes create a match with an "It's a match!" screen
- 1:1 chat between matches (polls every 3 seconds)
- Unmatch, which deletes the conversation and keeps you out of each other's feeds

## Getting started

Requires Node.js 22.5 or newer.

```bash
npm install
npm run seed   # optional: adds demo profiles
npm start      # http://localhost:3000
```

With the seed data, log in as `demo@example.com` / `password123`. Some demo profiles have
already liked the demo user, so you'll get matches quickly.

Environment variables: `PORT` (default `3000`) and `DB_PATH` (default `./dating.db`).

## Tests

```bash
npm test
```

## API

All endpoints except signup and login need an `Authorization: Bearer <token>` header.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/signup` | Create an account → `{ token, user }` |
| POST | `/api/login` | `{ email, password }` → `{ token, user }` |
| POST | `/api/logout` | End the current session |
| GET | `/api/me` | Your profile |
| PUT | `/api/me` | Update any profile fields |
| GET | `/api/discover` | Up to 20 compatible profiles you haven't swiped on yet |
| POST | `/api/swipes` | `{ target_id, liked }` → `{ matched, match_id? }` |
| GET | `/api/matches` | Your matches with the latest message |
| DELETE | `/api/matches/:id` | Unmatch |
| GET | `/api/matches/:id/messages?after=<id>` | Messages, optionally only those newer than `after` |
| POST | `/api/matches/:id/messages` | `{ body }` → send a message |

## Ideas for next steps

- Photo uploads (currently a photo URL)
- Real-time chat over WebSockets instead of polling
- Location-based distance filtering
- Reporting/blocking, email verification, and rate limiting on login
