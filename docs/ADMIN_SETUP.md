# Admin dashboard setup (Supabase)

The admin dashboard at **hoardhounds.com/admin** keeps your business records in a Supabase database.
This guide connects the two. It takes about 20 minutes, and you only do it once.

> Nothing here changes the public website. Until steps 1–6 are done, /admin just shows
> "Admin isn't connected yet".

## How your data is protected

- **The database enforces the rules itself** (row-level security). Every table refuses anyone who
  isn't signed in. Business records are readable only by an **admin who has finished two-step
  login** (password + authenticator app). The website can't override this. Even someone who
  copies the site's code or steals your password gets nothing without your phone.
- **The website only ever holds the "publishable" key.** It's designed to be public. Supabase also
  gives you a **secret** key (older projects call it `service_role`): that one bypasses every rule,
  so it must **never** go into GitHub, the website, or an email. The admin refuses to start if one
  is configured by mistake.
- **No sign-ups.** You turn public sign-up off, so the only accounts are ones you create.
- **Admins can only be created in the Supabase SQL editor**, not from the app.
- Employees (coming later) get their own role: they'll see only their own profile, the jobs
  they're assigned to (no prices or payments), and their own hours.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (the free plan is fine to start).
2. Click **New project**. Name it `hoard-hounds`, choose a US East region, and create a strong
   database password. **Save that password in your password manager.**
3. Wait a minute or two for the project to finish setting up.

> **Free plan notes:** free projects pause after about a week with no activity. If the admin
> says it can't reach the server, open the Supabase dashboard and click **Restore/Resume**.
> Check Supabase's pricing page for what backups each plan includes. Until you're on a plan
> with backups, export your expenses to CSV each month (Expenses → This year → Export CSV).

## 2. Create the tables and security rules

1. In your project, open **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261104000001_schema.sql` from this repository (on GitHub, click the
   file, then the copy button). Paste it in and click **Run**. You should see "Success".
3. New query again. Paste `supabase/migrations/20261104000002_security.sql` and click **Run**.

Run them in that order, once each.

**Optional sample data:** to explore with made-up numbers first, also run `supabase/seed_demo.sql`.
Every sample row is labeled **Demo** in the app. Remove them all later with the
**Clear demo data** button, or by running `select public.clear_demo_data();` while signed in as an
admin. Your real records and expense categories are kept.

## 3. Lock down sign-in

In **Authentication**:

1. **Sign In / Providers** (may be called *Providers* or *Settings*): turn **off** "Allow new users
   to sign up". Keep **Email** turned on.
2. Under the Email provider, set the **minimum password length to 12** if the option is there.
3. **Multi-Factor** (or *MFA*): make sure **TOTP (authenticator app)** is enabled. It is by default.
4. **URL Configuration**:
   - **Site URL:** `https://hoardhounds.com/admin/`
   - **Redirect URLs:** add `https://hoardhounds.com/admin/**`
     (and `http://localhost:5173/admin/**` if you'll run the site on your computer).

## 4. Create your login

1. **Authentication → Users → Add user → Create new user.**
2. Enter `johnice.edward@gmail.com` and a strong password (12+ characters). Tick
   **Auto Confirm User**, then create the user.

## 5. Make yourself an admin

In **SQL Editor**, run:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'johnice.edward@gmail.com';
```

It should say "1 row affected". (This is the only way to create an admin, on purpose.)

## 6. Connect the website

1. In Supabase, open **Project Settings → API Keys** (or click **Connect** on the project home).
   Copy:
   - the **Project URL**, like `https://abcdefghijk.supabase.co`
   - the **Publishable key**, starting with `sb_publishable_`. Older projects show an
     **anon public** key instead, which also works. **Not** the secret / service_role key.
2. In GitHub: **slightglimmer/hoard-hounds → Settings → Secrets and variables → Actions →
   Variables tab → New repository variable**. Add two variables:
   - `VITE_SUPABASE_URL`, set to the Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`, set to the publishable key

These are "variables", not "secrets", because both values are public by design.

## 7. Publish and sign in

The admin goes live when the `admin-dashboard` branch is merged into `main`, which you'll approve.
After that deploy finishes:

1. Go to **hoardhounds.com/admin** and sign in.
2. You'll be asked to **set up two-step login**: install an authenticator app (Google
   Authenticator, Microsoft Authenticator, 1Password or Authy), scan the QR code, and type the
   6-digit code.
3. From then on, each sign-in asks for your password and a fresh code from the app.

## Lost your phone or authenticator app?

In Supabase **SQL Editor**, run this to remove your authenticator. Then sign in with your password
and set up a new one:

```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'johnice.edward@gmail.com');
```

Forgot your password? Use **Forgot your password?** on the sign-in page. The reset link opens
the admin, asks for your authenticator code, then lets you choose a new password.

## Good to know

- **Labor costs are estimates:** hours × hourly rate, before employer taxes. This app doesn't run
  payroll. If you pay wages through a payroll service, don't also enter those wages as expenses,
  or labor will be counted twice on the Overview.
- **Revenue** on the Overview comes from customer payments recorded on jobs (the Jobs section
  is coming in a later phase).
- **Tax categories** on expense categories are suggestions to organize your records. Confirm how
  to report each one with your tax preparer.
- **Developers:** the files in `supabase/migrations/` also work with the Supabase CLI
  (`supabase link` then `supabase db push`).
