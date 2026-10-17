# Hoard Hounds LLC: Website

*We Clear the Clutter. You Reclaim the Property.*

The marketing website for Hoard Hounds LLC, property cleanouts and junk removal in Redford, Michigan and Metro Detroit.
It's built with **React 19**, **Tailwind CSS 4** and **Vite**. There are no other runtime dependencies.

---

## 1. Before you launch: replace the placeholders

Search the project for `PLACEHOLDER` to find each one.

| What | Where |
|---|---|
| Phone number and email (set to (734) 589-7627 and johnice.edward@gmail.com) | `src/config/site.js` |
| Business hours (hidden until you add them) | `src/config/site.js` → `hours` |
| Domain (`https://www.hoardhounds.com`) | `src/config/site.js`, `index.html`, `privacy.html`, `public/robots.txt`, `public/sitemap.xml` |
| Illustrations standing in for photos | `public/images/` (see section 5) |
| Privacy policy text | `src/PrivacyPage.jsx`. Have someone review it before launch |

Services, service areas, navigation and the "What we don't handle" list are also in `src/config/site.js`.

**Content rules this site follows** (keep them in mind when editing): no reviews, testimonials, years in business,
project counts or statistics; no "licensed, bonded or insured" claims; no 24/7 or same-day promises; no before/after
photos that aren't your real work. Add any of these only once they're true and you can back them up.

---

## 2. Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # opens a live-reloading preview at http://localhost:5173
npm run build      # makes the production site in dist/
npm run preview    # serves dist/ at http://localhost:4173
```

`npm run build` also **prerenders** every page to plain HTML (`scripts/prerender.js`), so search engines and
visitors see the full content immediately instead of waiting for JavaScript.

---

## 3. Receiving quote requests (the form backend)

A website on its own can't store anything. The quote form is fully built (validation, photo upload, resizing,
spam protection, success and error messages), but it needs a **form service** to receive each request, store the
photos and email you. The form works in three modes, set with the `VITE_FORM_PROVIDER` setting:

| Mode | What happens |
|---|---|
| `demo` (default) | Nothing is sent. The form shows a "Preview mode" note. Good for testing only. |
| `netlify` | Requests go to **Netlify Forms**. Set automatically when you host on Netlify (see `netlify.toml`). |
| `endpoint` | Requests are posted to the URL in `VITE_FORM_ENDPOINT` (Formspree, Basin, Getform, or your own API). |

### Recommended: Netlify Forms (easiest)

If you publish on Netlify (section 4), this works with **no extra code or accounts**:

1. Deploy the site to Netlify. `netlify.toml` already sets `VITE_FORM_PROVIDER=netlify`.
2. In the Netlify dashboard, open **your site → Forms** and enable form detection if asked, then redeploy.
   A form named **quote** will appear.
3. Under **Forms → Form notifications**, add an **email notification** to your business inbox.
4. Submit a test request from the live site and confirm you get the email and can open the photos.

**Where photos are stored:** Netlify keeps each submission and its photos in your Netlify account, behind your
login. They are not public on your website. Photo links in notification emails require you to be logged in to view.
Delete old submissions in the dashboard when you no longer need them.

**Limits to know:** each submission (form fields plus photos) must be under about 8 MB. The form automatically resizes
phone photos to roughly 300–600 KB each and caps uploads at 6 photos and 7.5 MB total, so this is rarely an issue.
Netlify's free plan includes a monthly allowance of submissions and upload storage. Check
[Netlify's pricing page](https://www.netlify.com/pricing/) for current numbers, since they change. Spam is filtered by
Netlify plus a hidden "honeypot" field on the form.

The hidden `<form name="quote" ...>` at the bottom of `index.html` is how Netlify learns the form's fields. If you
add or rename a field in `src/sections/QuoteForm.jsx`, update that hidden form too.

### Alternative: Formspree (works on any host)

1. Create a form at [formspree.io](https://formspree.io) and copy its endpoint, e.g. `https://formspree.io/f/abcdwxyz`.
   File uploads require one of Formspree's paid plans; check their pricing.
2. Set these environment variables in your host's dashboard (or in a local `.env` file, see `.env.example`):
   ```
   VITE_FORM_PROVIDER=endpoint
   VITE_FORM_ENDPOINT=https://formspree.io/f/abcdwxyz
   ```
3. Rebuild and redeploy. Submissions and photos appear in your Formspree dashboard and arrive by email.

Basin and Getform work the same way. A custom API works too: the form sends a standard `multipart/form-data`
POST with the fields `name`, `email`, `phone`, `address`, `cleanoutType`, `description`, `preferredDate`, `consent`
and the files `photo1` … `photo6`.

### For high volume later

If you outgrow a form service, the usual next step is a small serverless function (Netlify Functions, Vercel, or
Cloudflare Workers) that saves photos to private cloud storage (Amazon S3, Cloudflare R2 or Google Cloud Storage)
and emails you. Keep that storage bucket **private**. Customers' property photos and addresses should never sit in a
public folder.

---

## 4. Publishing the website

### Option A: Netlify (recommended, and forms work automatically)

1. Sign in at [netlify.com](https://www.netlify.com) with GitHub.
2. **Add new site → Import an existing project →** choose this repository.
3. Leave the base directory empty. Netlify reads the build command (`npm run build`) and publish directory
   (`dist`) from `netlify.toml`.
4. Click **Deploy**. You'll get a free `something.netlify.app` address to test on.
5. Follow section 3 to turn on form notifications.
6. **Custom domain:** buy a domain (e.g. from Cloudflare, Namecheap or Google/Squarespace Domains), then in Netlify go
   to **Domain management → Add a domain** and follow the DNS steps. HTTPS is set up automatically.

No GitHub? You can also run `npm run build` and drag the `dist` folder onto
[app.netlify.com/drop](https://app.netlify.com/drop). Netlify Forms still work with drag-and-drop deploys.

### Option B: Vercel or Cloudflare Pages

Import the repository, build command `npm run build`, output
directory `dist`. Use the **Formspree** option from section 3 and add the two `VITE_FORM_*` environment variables in
the project settings.

### After it's live

- Update every placeholder domain (section 1) to your real domain and redeploy.
- Add the site to [Google Search Console](https://search.google.com/search-console) and submit `/sitemap.xml`.
- Create a free [Google Business Profile](https://www.google.com/business/) for Hoard Hounds. For a local service
  business it matters as much as the website for searches like "Redford junk removal". Use the same name, phone
  and website everywhere.
- Test the form from your phone and confirm the email arrives.

---

## 5. Replacing the placeholder images

The two scene illustrations are deliberately illustrations, not stock photos, so nobody mistakes them for
Hoard Hounds' completed jobs.

| File | Used in | Suggested photo |
|---|---|---|
| `public/images/hero-cleared-room.svg` | Hero | A bright, empty, freshly cleared room (ideally one of your own jobs, with the owner's permission) |
| `public/images/about-home.svg` | About | Your truck, your team in branded shirts, or a Metro Detroit street |

To swap one: add your photo (e.g. `public/images/hero.jpg`, around 1600 px wide, compressed to under 300 KB with
[Squoosh](https://squoosh.app)), then update the `src` and `alt` text in `src/sections/Hero.jsx` or
`src/sections/About.jsx`. For the hero, also update the `preload` link in `index.html`. Free stock sources such as
Unsplash or Pexels are fine in the meantime. Just don't present stock photos as your own projects.

---

## 6. Logo and brand files

| File | Use |
|---|---|
| `public/brand/hoard-hounds-mark.svg` | Hound-and-house icon on its own (social avatars, stickers, embroidery) |
| `public/brand/hoard-hounds-logo.svg` | Horizontal logo for light backgrounds |
| `public/brand/hoard-hounds-logo-reversed.svg` | Horizontal logo on forest green (vehicles, dark shirts) |
| `public/og-image.png` | Preview image shown when the site is shared on social media or by text |
| `public/favicon.svg`, `public/apple-touch-icon.png` | Browser tab and phone home-screen icons |

The logo files use the **Fraunces** (wordmark) and **Plus Jakarta Sans** (tagline) fonts, both free from Google Fonts.
Before sending a logo to a printer, sign shop or embroiderer, open it in a vector editor (Illustrator, Affinity
Designer, Inkscape or Figma) and **convert the text to outlines** so it prints correctly without the fonts installed.

**Brand colors:** Forest `#243B32` · Cream `#F7F3EB` · Sage `#A7B8A2` · Charcoal `#292929` · Gold `#D9A441`

---

## 7. How the code is organized

```
hoard-hounds/ (this repository)
├── index.html, privacy.html   Page shells: SEO tags, fonts, hidden Netlify form
├── netlify.toml               Netlify build and form settings
├── scripts/prerender.js       Turns each page into static HTML after the build
├── public/                    Images, logo files, favicon, robots.txt, sitemap.xml
└── src/
    ├── config/site.js         Business info, services, service areas (edit this first)
    ├── App.jsx                Home page: puts the sections in order
    ├── PrivacyPage.jsx        Privacy policy page
    ├── entry-server.jsx       Prerendering and Google structured data (LocalBusiness and FAQ)
    ├── index.css              Tailwind setup, brand colors, fonts, buttons, animations
    ├── lib/submitQuote.js     Photo resizing and sending the quote form
    ├── components/            Header, Footer, Logo, Icon, Reveal (scroll animation), mobile call bar
    └── sections/              Hero, Services, HowItWorks, WhoWeServe, About, QuoteForm, ServiceArea, FAQ
```

**Built in:** mobile, tablet and desktop layouts; a sticky header with a quote button; a click-to-call bar on phones;
smooth scrolling; subtle scroll animations that switch off for visitors who prefer reduced motion; keyboard and
screen-reader friendly navigation and form; color contrast that meets WCAG AA; and SEO titles, descriptions, Open
Graph tags, a sitemap and schema.org data targeting Detroit property cleanouts, Redford junk removal and Metro Detroit
estate cleanouts.
