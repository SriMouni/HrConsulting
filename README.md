# Sri Guru HR Consultants – Website

Static website for Sri Guru HR Consultants, Hyderabad — *Specialists in workforce optimisation*.

## Structure

| Path | What it is |
|---|---|
| `index.html` | The website (single page) |
| `css/styles.css` | Styles, light and dark themes |
| `js/main.js` | Theme toggle, mobile menu, enquiry and resume forms (WhatsApp / email) |
| `assets/` | Logo files, favicon and link-preview image |
| `business-card/` | Visiting card design and print PDF (not part of the website) |

## Run locally

Open `index.html` in a browser. No build step is needed.

## Deploy

Every push to `main` deploys the site to GitHub Pages via `.github/workflows/deploy.yml` (only `index.html`, `css/`, `js/` and `assets/` are published).
One-time setup: repository **Settings → Pages → Source: GitHub Actions**.
Live site: https://srimouni.github.io/HrConsulting/ — the link-preview tags (`og:url`, `og:image`) in `index.html` point there; update them when a custom domain is connected.
