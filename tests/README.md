# Automated tests

Nothing here talks to the real Supabase project, Stripe, or the live website.

| Command | What it checks | Needs |
|---|---|---|
| `npm run test:functions` | The Supabase server functions (payments, webhook, quote links, inquiries) with simulated Stripe/Supabase responses | Node 22+ |
| `npm run test:db` | Database security rules and logic: every migration is applied to a throwaway local database, then each `tests/db/*.sql` file runs | A local PostgreSQL 15+ reachable with `psql` (set `PGHOST`, `PGPORT`, `PGUSER`) |
| `npm run test:ui` | The admin dashboard, customer quote page and website in a real browser (demo mode and a simulated "live" mode) | Playwright with Chromium (`PLAYWRIGHT=/path/to/node_modules/playwright` if it isn't installed globally) |

`tests/db/run.sh` drops and recreates a database called `hh_test` (or `$HH_TEST_DB`). Never point it at the real Supabase database.

`tests/db/00_supabase_stub.sql` is a small stand-in for the parts of Supabase the migrations use (roles, `auth.uid()`, `auth.jwt()`, storage tables).

Browser test screenshots go to `$TMPDIR/hh-test-output` (or the folder passed to `tests/ui/run.sh`).
