# BinZ Backend

## Setup

```bash
cd backend
npm install
cp .env.example .env   # then fill in MONGO_URI (and Twilio/Gmail if you want those features live)
npm start               # or: npm run dev (nodemon, auto-restart)
```

Server runs on `http://localhost:5000` by default (`PORT` in `.env` to change it).

## Requirements

- **MongoDB** — required. Either run one locally (`mongodb://localhost:27017/binzDB` is the default) or point `MONGO_URI` at Atlas/another instance. The server exits on startup if it can't connect.
- **Twilio** — optional. Without `twilioAccountSid` / `twilioAuthToken`, `POST /sendSMS` will fail but pickup booking on the frontend still succeeds (SMS is called best-effort).
- **Gmail** — optional. Without `EMAIL_USER` / `EMAIL_PASS` (a Gmail **App Password**, not your login password), the ticket confirmation email will silently fail but the ticket is still created.
- **Video upload (`POST /uploadVideo`)** — currently simulated: waits 5 seconds then awards a random 5-10 coins, no Python/detector script needed. Swap the `setTimeout` body in `server.js` for a real detection call whenever you're ready to wire that up.

## Auth model (current, no-password demo)

`/register` and `/login` don't require a password — accounts are identified by email only. If you later want real passwords, both routes already support them (pass `password` in the body and it'll be hashed/checked); the frontend just isn't sending one right now.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | Create account (firstName, lastName, email, state) |
| POST | `/login` | Fetch account by email |
| POST | `/sendSMS` | Send pickup-confirmation SMS via Twilio |
| POST | `/storePhoneNumber` | Save a phone number to a user |
| GET | `/leaderboard` | Top 3 users by coins |
| GET | `/getCoins/:email` | Current coin balance |
| POST | `/rewardCoins` | Add (or subtract) coins for a user |
| POST | `/uploadVideo` | Upload a cleanup video for garbage detection |
| POST | `/submit-ticket` | Raise an e-waste pickup ticket |
