# BeanBalance

BeanBalance is a full-stack café loyalty platform built for a staff dashboard and member self-service flow. The repository name remains `loyalty_points`, and the product is branded as BeanBalance for a polished customer-facing experience.

## What this app includes

- Member registration and login with JWT auth
- Staff-only member directory with search, pagination, and sorting
- Purchase recording with automatic tier-aware points earning
- Reward redemption with balance validation and point ledger audit trail
- Auditable point history via `PointLedger`
- Centralized loyalty rules in `server/src/config.ts`
- React + Vite client and Express + Prisma server

## Rules enforced centrally

The following business rules are defined in one reusable loyalty layer and reused by the API:

- Tier thresholds: Bronze at 0, Silver at 500 lifetime points, Gold at 1500 lifetime points
- Rewards are priced in points and must be available before redemption
- Purchases award points based on the member’s tier before the purchase
- Each redemption reduces current points and records a negative ledger delta
- Each purchase increases current points and lifetime earned points, and writes an audit ledger row
- Ledger records keep the full point history auditable for staff review

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: SQLite with Prisma ORM
- Validation: Zod
- Auth: JWT + bcryptjs
- Tests: Vitest + Supertest

## Local setup

From the repo root:

1. `npm install`
2. `npm run db:generate`
3. `npm run db:migrate`
4. `npm run db:seed`
5. `npm run dev`

This starts the backend API and the React app together.

## Production build and start

- Build: `npm run build`
- Start API: `npm run start`

## API documentation

The application exposes a REST API under `/api` with JSON responses.

### Auth
- `POST /api/auth/register` — register a member or staff account
- `POST /api/auth/login` — sign in with email or phone and password
- `GET /api/auth/me` — return the signed-in user profile

### Members
- `GET /api/members` — staff-only member search, pagination, and sorting
- `GET /api/members/:id` — member detail for self or staff access
- `GET /api/members/:id/summary` — points and tier summary
- `GET /api/members/:id/transactions` — ledger, purchases, and redemptions
- `POST /api/members/:id/purchases` — record a purchase and award points
- `POST /api/members/:id/redemptions` — redeem an active reward

### Rewards
- `GET /api/rewards` — list currently active rewards
- `POST /api/rewards` — create a reward (staff only)
- `PUT /api/rewards/:id` — update a reward (staff only)
- `DELETE /api/rewards/:id` — deactivate a reward (staff only)

### Health
- `GET /api/health` — service health check

## Demo accounts

- Staff: `staff@beanbalance.com` / `Staff123!`
- Member: `member@beanbalance.com` / `Member123!`

## Roadmap

The product currently highlights exactly three future features:

1. Gift-card top-ups and seasonal campaigns.
2. QR-code redemption in mobile checkout.
3. Personalized member offers and push reminders.

## Project structure

- `server/` – API, Prisma schema, routes, and tests
- `client/` – React front end
- `README.md` – project instructions
- `REASONING.md` – architecture and decisions
- `AI_LOGS.md` – transcript log

## Verification

The project was verified with:

- `npm run typecheck`
- `npm test`
- `npm run build`

The test suite currently reports 9 passing tests, and the production build succeeds.
