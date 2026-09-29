# shakwaa

منصة عربية (RTL) لإدارة بوتات تيليجرام والطلبات الديناميكية.

## Stack

- Next.js 16 + React 19 + TypeScript
- MongoDB (official driver) + GridFS
- Tailwind CSS 4
- Telegram Bot API (webhooks)
- Argon2id + TOTP (Google Authenticator)

## Run locally

```bash
# 1) MongoDB
docker compose up -d

# 2) Env (already scaffolded as .env.example)
cp .env.example .env

# 3) Install
npm install

# 4) Seed demo users + sample request type
npm run seed

# 5) Dev server
npm run dev
```

Open http://localhost:3000

### Demo accounts (from seed)

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `superadmin` | `ChangeMe!Super1` |
| Admin | `admin` | `ChangeMe!Admin1` |

Set `TELEGRAM_WEBHOOK_BASE_URL` to a public HTTPS URL (e.g. ngrok) before starting bots.

## Scripts

- `npm run dev` — development
- `npm run build` / `npm start` — production
- `npm run seed` — seed DB
- `npm run indexes` — ensure indexes
- `npm test` — unit tests
