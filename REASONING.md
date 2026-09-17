# Reasoning and engineering notes

## Product goals

The application is designed as a small café loyalty platform with two user roles:

- Members can register, log in, view their points, and redeem rewards.
- Staff can view the member roster, search/filter members, and manage reward catalog items.

The business requirement was to keep the points logic centralized and auditable. This avoids logic drift between purchase and redemption flows.

## Architecture choices

### Backend

The backend is an Express API in `server/` with Prisma + SQLite for persistence. The app uses:

- JWT auth for session management
- bcryptjs for password hashing
- Zod for request validation
- Prisma transactions for points updates and redemption safety

### Centralized loyalty config

All loyalty rules are in `server/src/config.ts` so the same calculations are applied everywhere. This includes:

- tier threshold checks
- points earned per rupee based on membership tier
- reward catalog seed data

This keeps the app maintainable and reduces the chance of mismatched tier logic in the UI and API.

## Auditability requirement

The `PointLedger` table stores every point movement as a ledger event:

- `EARN` entries for purchase-based points
- `REDEEM` entries for reward consumption
- `balanceAfter` persists the balance after each event

This makes the points history traceable and supports future staff review or operational reconciliation.

## SQLite-specific constraints

Because SQLite does not support Prisma enums, the schema uses string fields for role, tier, and related values rather than native enums. This was also important for `mode: 'insensitive'` on Prisma queries; those search operations were replaced with SQLite-safe filtering and in-memory sorting to keep the staff search endpoint functional.

## Validation strategy

The app validates request payloads and route params using Zod, and each module enforces authorization rules:

- `requireAuth` checks JWT presence and validity.
- `requireStaff` restricts staff-only routes.
- `requireSelfOrStaff` allows members to access their own records while enabling staff access.

## Demo workflow

The seed script creates:

- staff user with role `STAFF`
- member user with role `MEMBER`
- standard reward catalog for redemption

This makes the app immediately usable in Codespaces with minimal setup.

## Final verification

The app was validated with:

- `npm run typecheck`
- `npm test`
- `npm run build`

The current state passes all nine API tests and the production build succeeds.
