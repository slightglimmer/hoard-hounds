# Setting up your admin dashboard

This connects hoardhounds.com/admin to a free database, which is where your business records are kept.
There are 5 steps. You only do this once. Stuck? Send Claude a screenshot.

---

## Step 1: Make a free Supabase account

1. Go to **supabase.com** and click **Start your project**.
2. Sign up. Using **Continue with GitHub** is easiest.
3. Click **New project**.
   - **Name:** `hoard-hounds`
   - **Database password:** click **Generate a password**, then **save it somewhere safe**
     (like your phone's password manager). You'll rarely need it, but don't lose it.
   - **Region:** pick one that says **East US**.
4. Click **Create new project** and wait about 2 minutes.

## Step 2: Add yourself as a user

1. On the left side, click **Authentication** (the icon looks like a person or a key).
2. Click **Users**, then the **Add user** button, then **Create new user**.
3. Type your email, `johnice.edward@gmail.com`, and make up a password.
   Use **at least 12 characters**, like a short sentence.
4. Make sure **Auto Confirm User** is checked, then click **Create user**.

That email and password is what you'll use to log in to your dashboard.

## Step 3: Paste one block of setup code

1. On the left side, click **SQL Editor**.
2. Open this file on GitHub: **supabase/setup_everything.sql**
   (in the `admin-dashboard` branch). Click the **copy** button at the top right of the file.
3. Back in Supabase, paste it into the big empty box and click **Run** at the bottom right.
4. At the bottom you should see: **"All done! Your database is set up and you are the admin."**

If a warning pops up about "destructive operations", click **Run this query**. It's safe.

## Step 4: Turn off sign-ups

This stops strangers from making accounts.

1. Click **Authentication** on the left, then **Sign In / Providers**.
2. Turn **off** the switch that says **Allow new users to sign up**. Click **Save** if you see one.
3. Still in Authentication, click **URL Configuration**.
4. In **Site URL**, type `https://hoardhounds.com/admin/` and click **Save**.

## Step 5: Send Claude two things

1. Click the **Connect** button at the top of your Supabase project
   (or go to **Project Settings → API Keys**).
2. Copy and send Claude:
   - the **Project URL**. It looks like `https://abcdefgh.supabase.co`
   - the **Publishable key**. It starts with **`sb_publishable_`**

These two are **safe to share**: they're like your store's street address.

**Do NOT send** anything that says **secret** or **service_role**. That's the master key.
If you're not sure, send a screenshot first and Claude will point to the right one.

Claude does the rest. After you say it's OK to go live, you'll log in at **hoardhounds.com/admin**,
and it will walk you through connecting an authenticator app on your phone.

---

## Updates (run each one once)

Some new dashboard features need a small addition to your database. Claude will tell you when.

- **Price Sheet & Estimates (Phase 2):** in Supabase, open **SQL Editor**, paste everything from
  **supabase/migrations/20261105000003_estimates.sql**, and click **Run**. It should say
  **"All done! Estimates are set up."**
- **Online payments:** see "Online payments: cards and Klarna (Stripe)" below.
- **Quote links:** see "Quote links: customers accept and pay online" below.
- **Website requests and dumpsters:** see "Website requests (Inquiries) and dumpsters" below.

(Setting up from scratch? `supabase/setup_everything.sql` already includes every update.)

---

## Online payments: cards and Klarna (Stripe)

Lets you text or email customers a secure payment link from any job. They pay by card, or over
time with Klarna (subject to approval), and the payment is recorded on the job automatically.
Do these once, in order. Claude can walk you through each one.

1. **Create your Stripe account** at stripe.com and finish **activating** it (business details for
   Hoard Hounds LLC and your business bank account).
2. **Turn on Klarna:** Stripe dashboard → **Settings → Payments → Payment methods** → **Klarna** →
   turn it on (Affirm too, if you like). Cards are on already.
3. **Database update:** Supabase → **SQL Editor** → paste everything from
   **supabase/migrations/20261105000004_online_payments.sql** → **Run**. It should say
   *"All done! Online payments are set up in your database."*
4. **Add two server functions:** Supabase → **Edge Functions** → **Deploy a new function** →
   **Via editor**:
   - Name it `stripe-payments`, paste everything from **supabase/functions/stripe-payments/index.ts**,
     and deploy.
   - Do the same for `stripe-webhook` with **supabase/functions/stripe-webhook/index.ts**. Then open
     its settings and turn **off** "Verify JWT" (also called "Enforce JWT verification"). Stripe
     uses its own signature instead, which the function checks.
5. **Add your Stripe secret key:** Stripe → **Developers → API keys** → copy the **Secret key**.
   Supabase → **Edge Functions → Secrets** → add a secret named `STRIPE_SECRET_KEY` and paste it there.
   **Never paste the secret key anywhere else**: not in chat, not in GitHub, not in the website.
6. **Tell Stripe where to send payments:** Stripe → **Developers → Webhooks** (Stripe may call
   these "event destinations") → add an endpoint:
   - URL: `https://cvzodwrgxlgxrtpeszri.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Copy its **Signing secret** (starts with `whsec_`) into Supabase **Edge Functions → Secrets**
     as `STRIPE_WEBHOOK_SECRET`.

**Payments stay OFF until you switch them on, in two places** (both are needed):
- Supabase **Edge Functions → Secrets**: `ONLINE_PAYMENTS_ENABLED` = `true`. Without it, the server
  refuses to create any payment link or checkout.
- GitHub **Actions variables**: `VITE_ONLINE_PAYMENTS` = `true` (shows the payment buttons), then
  re-run the deploy. `VITE_QUOTE_LINKS` = `true` turns on customer quote links (after the
  `public-quote` function is deployed).

A **live** Stripe key (`sk_live_…`) is refused until you also add the secret `STRIPE_LIVE_APPROVED`
= `true`. Test keys (`sk_test_…`) work without it. To switch payments off again, delete
`ONLINE_PAYMENTS_ENABLED` (and the GitHub variable).

**Try it in test mode first:** Stripe has a test mode with its own keys (`sk_test_…`) and webhook.
Pay a test link with card number `4242 4242 4242 4242`, any future date and any CVC, then check that
the payment appears on the job. Then repeat steps 5 and 6 with your live keys.

Good to know: Stripe charges a fee on each payment (more for pay-over-time options like Klarna).
Each link can be paid once. Klarna only appears when Stripe and Klarna approve your business and
the amount fits their limits.

---

## Quote links: customers accept and pay online

Send a customer a private link to their quote. They open it on their phone, see every line and the
total, and pick one: **pay the deposit**, **pay in full** (card, or over time with Klarna), or
**accept now and pay later**. Accepting creates the job and customer for you, and payments are
recorded on the job automatically.

Do the online payments steps above first. Then, once:

1. **Database update:** Supabase → **SQL Editor** → paste everything from
   **supabase/migrations/20261105000005_quote_links.sql** → **Run**. It should say
   *"All done! Quote links are set up."*
2. **Add one more server function:** Supabase → **Edge Functions** → **Deploy a new function** →
   **Via editor**. Name it `public-quote`, paste everything from
   **supabase/functions/public-quote/index.ts**, and deploy. Then open its settings and turn **off**
   "Verify JWT". (Customers don't have accounts. The function only shows the one quote whose secret
   link it's given.)
3. **Update the payment webhook function:** open `stripe-webhook` in Supabase, replace its code with
   the latest **supabase/functions/stripe-webhook/index.ts**, and deploy again.

**Using it:** Price Sheet → Estimates → open an estimate → **Create quote link** → **Text it** or
**Email it**. Tap **Quote template** on the Estimates page to change the welcome message, fine print,
how many days quotes are good for, and your usual deposit.

To see what customers see without a real quote, open **hoardhounds.com/quote/#demo**.

---

## Website requests (Inquiries) and dumpsters

Saves quote requests and their photos in your dashboard (**Inquiries**), and adds dumpster
tracking on jobs, the private **Job costing** calculator on estimates, and the dumpster allowance
on estimates and quote links. Until you do these steps, everything keeps working the old way:
requests arrive by email through Formspree, and the new sections stay hidden.

**Before switching the website form over:** the privacy policy needs updating, because it
currently says photos are kept by the form service. A draft is in
`docs/legal/privacy-policy-DRAFT.md`. Get it reviewed, then ask Claude to publish it.

1. **Database update:** Supabase → **SQL Editor** → **+** (new query) → paste everything from
   **supabase/migrations/20261109000006_inquiries_dumpsters.sql** → **Run**. It should say
   *"All done! Inquiries, photos and dumpster tracking are set up."* This also creates the private
   photo storage. Nothing existing is deleted; "Truck rental" is just hidden for new expenses.
2. **Add the server function:** Supabase → **Edge Functions** → **Deploy a new function** →
   **Via editor**. Name it `submit-inquiry`, paste everything from
   **supabase/functions/submit-inquiry/index.ts**, deploy, then turn **off** "Verify JWT" in its
   settings. (Website visitors don't have accounts. The function checks every request itself.)
3. **Switch the website form** (only after the privacy policy is updated): GitHub → the
   hoard-hounds repository → **Settings → Secrets and variables → Actions → Variables** → add
   `VITE_FORM_PROVIDER` with the value `supabase`. Then re-run the latest "Deploy to GitHub Pages"
   action (Actions tab → the latest run → **Re-run all jobs**). Keep your existing
   `VITE_FORM_ENDPOINT` (Formspree): it becomes the backup if the new system is ever unreachable,
   and it emails you a short "new request" alert.
4. **Test it:** on hoardhounds.com, send yourself a request with a photo. It should say
   *"Thanks! Your request #101 is in."* and appear under **Inquiries** with the photo. To undo,
   delete the `VITE_FORM_PROVIDER` variable and re-run the deploy.

**Optional, free extras** (you can add them later):
- **Spam check (Cloudflare Turnstile):** make a free Cloudflare account → Turnstile → add the site
  `hoardhounds.com`. Put the **site key** in GitHub Actions variables as `VITE_TURNSTILE_SITE_KEY`,
  and the **secret key** in Supabase **Edge Functions → Secrets** as `TURNSTILE_SECRET_KEY`. Set
  both, or neither.
- **Confirmation emails (Resend):** free tier. Verify your domain in Resend, then add Supabase
  secrets `RESEND_API_KEY`, `INQUIRY_FROM_EMAIL` (for example `Hoard Hounds <hello@hoardhounds.com>`)
  and `OWNER_NOTIFY_EMAIL`. The website only says "we emailed you" when an email was really sent.

Good to know: Supabase's free plan includes 1 GB of file storage. Photos are shrunk to about
300–600 KB before upload, so that's roughly 2,000+ photos. Delete spam requests (and their
photos) with **Delete request** on the request page.

---

## Later, if you need them

**Lost your phone or authenticator app?** In Supabase, open **SQL Editor**, paste this and click **Run**.
Then log in with just your password and set up the app again.

```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'johnice.edward@gmail.com');
```

**Forgot your password?** Click **Forgot your password?** on the login page.

**The dashboard says it can't reach the server?** Free Supabase projects fall asleep after about a
week of no use. Log in to supabase.com and click **Restore project**.

**Back up your records:** on the free plan, export your expenses each month:
Expenses → This year → Export CSV.

---

## Technical notes (for developers)

- Inquiries: the `submit-inquiry` function validates fields, checks image file contents (JPEG, PNG,
  WEBP, HEIC; max 6 photos, 8 MB each), rate-limits by a keyed hash of the sender's IP (5/hour) and
  by email (5/day), optionally verifies Turnstile, saves with the service role, and uploads photos
  to the private `inquiry-photos` bucket under random names. Storage policies allow only admins
  (aal2) to view or delete; there are no client upload policies. Admins see photos through 1-hour
  signed URLs (the admin CSP allows images from the Supabase origin).
- Job costing (`estimate_costing`) and dumpster rentals are admin-only and are never included in
  `get_shared_estimate`. Suggested price = cost / (1 − margin), rounded up to the dollar.
- Tests: `npm run test:functions`, `npm run test:db` (local PostgreSQL), `npm run test:ui`
  (Playwright). See `tests/README.md`.
- Quote links: each shared estimate has a random 256-bit `share_token`, used only in the URL fragment
  (`/quote/#token`), so it isn't sent in requests or referrers. The `public-quote` function reads and
  accepts quotes only through `get_shared_estimate` / `accept_shared_estimate`, which only the
  service role can run. Payment amounts are computed on the server from the database.
- `supabase/setup_everything.sql` is the files in `supabase/migrations/` combined, plus a line
  that makes johnice.edward@gmail.com an admin. The migrations also work with the Supabase CLI
  (`supabase link`, then `supabase db push`).
- Every table uses row-level security. Admin access requires the `admin` role **and** two-step
  login (the `aal2` claim). Admins can only be created in the SQL editor. The future employee role
  sees only its own profile, assigned jobs (no money fields) and its own unapproved hours.
- The site only holds the publishable key. It's public by design, and the database rules protect
  the data. The admin refuses to start if a secret or service_role key is configured.
- The two values go in the GitHub Actions variables `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`, or directly in `.github/workflows/deploy.yml`.
- Optional sample data: `supabase/seed_demo.sql`. Every row is labeled **Demo**, and the
  dashboard has a **Clear demo data** button.
- Labor cost is an estimate (hours × rate, before employer taxes). If wages are paid through a
  payroll service, don't also enter them as expenses, or labor is counted twice.
- Redirect URLs for password reset: add `https://hoardhounds.com/admin/**` under
  Authentication → URL Configuration → Redirect URLs.
