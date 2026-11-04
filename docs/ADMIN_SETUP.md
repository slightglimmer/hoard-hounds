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

(Setting up from scratch? `supabase/setup_everything.sql` already includes every update.)

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

- `supabase/setup_everything.sql` is the two files in `supabase/migrations/` combined, plus a line
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
