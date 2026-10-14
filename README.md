# Sri Guru HR Consultants – Website

Static website for Sri Guru HR Consultants, Hyderabad — *Specialists in workforce optimisation*.

## Structure

| Path | What it is |
|---|---|
| `index.html` | The website (single page) |
| `css/styles.css` | Styles, light and dark themes |
| `js/main.js` | Theme toggle, mobile menu, enquiry and resume forms (WhatsApp / email) |
| `assets/` | Logo files, favicon and link-preview image |
| `admin.html`, `js/admin.js`, `css/admin.css` | Admin page: sign in, view candidates / vacancies / enquiries, download resumes, export CSV |
| `js/config.js` | Supabase Project URL and anon key (public values) |
| `supabase/` | Database schema and the `submit` Edge Function (stores forms, uploads resumes, emails via Resend) |
| `business-card/` | Visiting card design and print PDF (not part of the website) |

## Run locally

Open `index.html` in a browser. No build step is needed.

## Deploy

Every push to `main` deploys the site to GitHub Pages via `.github/workflows/deploy.yml` (only `index.html`, `css/`, `js/` and `assets/` are published).
One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
Live site: https://srimouni.github.io/HrConsulting/ — the link-preview tags (`og:url`, `og:image`) in `index.html` point there; update them when a custom domain is connected.

## Back end (Supabase + Resend)

Forms post to a Supabase Edge Function that stores submissions and resumes and emails
hr@sriguruhrconsultants.com through Resend. See [SUPABASE-SETUP.md](SUPABASE-SETUP.md).
Until it is configured, forms fall back to WhatsApp / the visitor's email app.
