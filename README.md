# CV Match AI — Simple Build

The simplest version of this app: **one HTML page + one serverless
function**. No database, no sign-ups other than Vercel and Anthropic, no
build step, no framework.

## What it does
- Upload a CV (PDF, DOCX, or TXT) — text is extracted right in the browser
  (no server involved for this part).
- Paste a job description, pick a country and level.
- Click **Generate CV** → the one serverless function (`/api/generate`)
  calls Claude with your API key (kept secret on the server) and returns the
  tailored CV, cover letter, and interview questions.
- Click **Download CV as PDF** → opens your browser's print dialog; choose
  "Save as PDF."

That's the whole app. Two files: `public/index.html` and `api/generate.js`.

## What's NOT in this version (on purpose, for simplicity)
- No database — nothing is saved, no admin page, no history.
- No login — anyone with the link can use it.
- If you want those later, the fuller Next.js + Supabase version I built
  earlier adds them back in.

## Steps to deploy (free, ~5 minutes)

### 1. Get an Anthropic API key
Go to https://console.anthropic.com → **API Keys** → **Create Key**. Copy it.

### 2. Put the project on GitHub
1. Create a new empty repo on https://github.com/new
2. From this folder, run:
   ```bash
   git init
   git add .
   git commit -m "CV Match AI - simple build"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/cv-match-ai.git
   git push -u origin main
   ```

### 3. Deploy on Vercel
1. Go to https://vercel.com → sign up/log in with GitHub (free).
2. **Add New → Project** → import the repo you just pushed.
3. Vercel will detect it as a plain project (no framework) — leave all
   build settings as default, you don't need to change anything.
4. Before clicking Deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = your key from step 1
   - (optional) `AI_MODEL` = `claude-sonnet-4-6`
5. Click **Deploy**.

That's it — you'll get a free `https://your-project.vercel.app` URL that
anyone can open and use.

## Running it locally first (optional)
If you want to test before deploying:
```bash
npm install -g vercel
vercel dev
```
It'll ask a couple of setup questions the first time, then serve the site
at `http://localhost:3000` with the same serverless function behavior as
production. Add your `ANTHROPIC_API_KEY` to a `.env` file in this folder
first (it's already in `.gitignore` so it won't get pushed to GitHub).

## A note on cost
Vercel's free Hobby plan and Anthropic's API both work on a pay-as-you-go /
free-tier basis — Vercel hosting itself is free for this kind of low-traffic
app; the only real cost is the small per-request Anthropic API usage, which
is usually a fraction of a cent per CV generated.
