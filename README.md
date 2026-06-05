# alisonhaire.com

Personal site and content hub for Alison Haire. Astro + React islands, deployed on Cloudflare Pages.

- **Static-first** for speed and SEO (recruiters Google you).
- **React only where it earns its weight** — currently just the Ally AI assistant.
- **Build-time content fetching** from Ghost (blogs) and YouTube (talks). Rebuild on webhook.
- **Free to run** on Cloudflare's free tier. The only paid piece (OpenRouter for Ally) defaults to free models.
- **n8n integration hooks** baked in: `/api/ingest` accepts authenticated docs for your RAG pipeline; copy edits can land via GitHub commits triggering CF Pages rebuilds.

---

## Architecture at a glance

```
Sources                Build                 Edge
─────────              ─────                 ────
Ghost ──┐
YouTube ┼─► astro build ──► alisonhaire.com (Cloudflare Pages, static)
Static  │                          │
JSON/MD ┘                          ├─► /api/ally   ──► OpenRouter (CAG via prop, RAG optional)
                                   └─► /api/ingest ──► your Supabase / n8n (HMAC-authenticated)
```

Content sources:

| What           | Where                              | Update path                       |
|----------------|------------------------------------|------------------------------------|
| Hero, bio, copy | `src/content/site/index.json`      | Edit JSON, push, or n8n commits   |
| Projects       | `src/content/projects/index.json`  | Edit JSON                          |
| Talks          | `src/content/talks/index.json`     | Featured + curated; YouTube auto-fetches recent |
| Podcasts       | `src/content/podcasts/index.json`  | Edit JSON                          |
| Publications   | `src/content/publications/index.json` | Edit JSON                       |
| Experience/CV  | `src/content/experience/index.json` | Edit JSON                         |
| Blog posts     | Ghost (`blog.alisonhaire.com`)     | Publish in Ghost; webhook rebuilds |
| Ally voice     | `src/content/ally/context.md`      | Edit markdown                      |

---

## Local development

```bash
pnpm install
cp .env.example .env
# Fill in keys you have. Empty keys make their data sources silently fall back.
pnpm dev
```

Open http://localhost:4321.

Without any keys, the site builds fine — Ghost falls back to `publications.fallbackPosts`, YouTube renders curated talks only, Ally uses keyword fallback answers.

### Useful commands

```bash
pnpm dev          # local dev server (HMR, port 4321)
pnpm build        # production build to dist/
pnpm preview      # preview the built site locally
pnpm check        # type-check + content schema validation
pnpm format       # prettier write
```

---

## Deployment (Cloudflare Pages)

### One-time setup

1. **Create the Pages project** in the Cloudflare dashboard.
   - Source: this GitHub repo (`DeveloperAlly/website-alison-haire`).
   - Production branch: `main`.
   - Build command: `pnpm build`
   - Build output directory: `dist`
   - Node version: `20`
   - Compatibility flags: `nodejs_compat` (needed for some adapters).

2. **Add environment variables** (Settings → Environment variables → Production):
   See `.env.example` for the full list. At minimum:
   - `OPENROUTER_API_KEY` — for the Ally assistant.
   - `GHOST_CONTENT_API_KEY`, `GHOST_URL` — for live blog posts.
   - `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_HANDLE` — for auto-fetched talks.

3. **Bind the rate-limit KV namespace** (Settings → Functions → KV namespace bindings):
   - Create a namespace called `ally-rate`.
   - Bind to variable name `ALLY_RATE_KV`.
   - Without this binding, `/api/ally` runs without rate limiting (logs a warning).

4. **Add the custom domain** (Custom domains → Set up).
   - Add `alisonhaire.com`.
   - Cloudflare auto-configures DNS if the domain is managed in the same account.

5. **Grab a deploy hook URL** (Settings → Builds & deployments → Deploy hooks).
   - Name it `n8n-content-update`.
   - Save the URL into your n8n credential store. Hitting it triggers a rebuild.

### Updating content

| Change             | What to do                                                              |
|--------------------|-------------------------------------------------------------------------|
| New blog post      | Publish in Ghost. (Wire a Ghost webhook → n8n → CF deploy hook to auto-rebuild.) |
| Edit hero/bio copy | Edit `src/content/site/index.json`, commit, push. Pages auto-deploys.    |
| Add a project      | Edit `src/content/projects/index.json`. Commit.                          |
| Update Ally voice  | Edit `src/content/ally/context.md`. Commit.                              |
| New talk           | Either edit `src/content/talks/index.json` for curated, or rely on YouTube auto-fetch for the recent grid. |
| Update CV          | Edit `src/content/experience/index.json` and/or replace `public/resume.pdf`. |

---

## n8n workflows

This site is designed to integrate with n8n in three ways. Wire whichever you need.

### 1. Rebuild on blog publish

```
[Ghost webhook (post.published)] → [HTTP POST → CF deploy hook URL]
```

Free, fastest. New post appears within ~60s.

### 2. AI-pipeline copy edits

```
[Trigger (manual / cron)] → [Claude / OpenRouter generates new copy]
                          → [GitHub: create-or-update-file → src/content/site/index.json]
                          → [GitHub: create PR  (so you can review)]
                          → (after merge, CF auto-deploys)
```

Use the `claude.ai Github MCP` server's `create_pull_request_with_copilot` or `push_files` actions.

### 3. RAG document ingest (for the AI assistant)

```
[Source (Notion / Google Drive / etc.)] → [n8n: extract text + chunk]
                                       → [n8n: HMAC-sign body]
                                       → [HTTP POST → https://alisonhaire.com/api/ingest]
                                       → /api/ingest forwards to your Supabase Edge Function
                                       → Supabase: embed + upsert into pgvector
```

The `/api/ingest` worker is a thin authenticated proxy. It does NOT do embedding itself — that's your separate Supabase / n8n pipeline. The worker exists so you don't have to expose your Supabase URL/key to n8n directly.

#### Computing the HMAC signature in n8n

In an n8n Function node:

```javascript
const crypto = require('crypto');
const body = JSON.stringify(items[0].json.payload);
const ts = Math.floor(Date.now() / 1000);
const signature = crypto
  .createHmac('sha256', $env.INGEST_SHARED_SECRET)
  .update(`${ts}.${body}`)
  .digest('hex');
return [{
  json: {
    body,
    headers: {
      'content-type': 'application/json',
      'x-ingest-timestamp': String(ts),
      'x-ingest-signature': signature,
    },
  },
}];
```

Then feed that into an HTTP Request node pointing at `https://alisonhaire.com/api/ingest`.

---

## API contracts

### `POST /api/ally`

Visitor → Ally chat. Public; rate-limited per IP per day.

```jsonc
// Request
{
  "message": "What does Alison actually do?",
  "context": "<CAG bundle from ally/context.md>",   // sent by the browser
  "ragChunks": ["...", "..."]                         // optional, future server-side enrichment
}

// 200
{ "reply": "...", "model": "meta-llama/...", "remaining": 19 }

// 429
{ "error": "rate_limit", "retryAfter": 18342 }
```

### `POST /api/ingest`

n8n → your RAG backend. Auth: HMAC-SHA256 over `${timestamp}.${body}` with `INGEST_SHARED_SECRET`. Timestamp must be within ±5 minutes of server time.

```
Headers:
  content-type: application/json
  x-ingest-timestamp: 1717603200
  x-ingest-signature: <hex hmac-sha256 of `${ts}.${rawBody}`>
Body: any JSON your Supabase function expects
```

Returns whatever the forward URL returns. If `INGEST_FORWARD_URL` is unset, returns `503 not_configured` and the endpoint is inert.

---

## Secrets

**The cardinal rule: `.env` is gitignored. NEVER commit it. NEVER paste keys into chat.**

### Secret inventory

| Key                          | Where it lives                              | Used by                              | Rotate every |
|------------------------------|---------------------------------------------|--------------------------------------|--------------|
| `OPENROUTER_API_KEY`         | CF Pages env (prod) + local `.env` (dev)    | `/api/ally`                          | 90 days       |
| `GHOST_CONTENT_API_KEY`      | CF Pages env + local `.env`                 | `astro build` (Writing page)         | 180 days      |
| `YOUTUBE_API_KEY`            | CF Pages env + local `.env`                 | `astro build` (Talks page)           | 180 days      |
| `INGEST_SHARED_SECRET`       | CF Pages env + n8n credentials              | `/api/ingest`                        | 90 days       |
| `INGEST_FORWARD_URL`         | CF Pages env                                | `/api/ingest`                        | when backend changes |
| `CF_DEPLOY_HOOK_URL`         | n8n credentials only                        | n8n workflows                        | 365 days      |
| `GITHUB_PAT_FOR_N8N`         | n8n credentials only                        | n8n workflows (if committing copy)   | 90 days       |

### Rotation procedure

1. Generate a new key in the upstream service (OpenRouter, GitHub, etc.).
2. Update the value in Cloudflare Pages → Settings → Environment variables.
3. Trigger a manual redeploy (Deployments → Retry deployment).
4. **Once verified**, revoke the old key in the upstream service.

### What to do if a key leaks

1. **Revoke immediately** in the upstream service.
2. Generate a new one.
3. Update CF Pages env vars + redeploy.
4. If the leak was via git: see "Removing a leaked secret from git history" below.

### Removing a leaked secret from git history

If you committed and pushed a key:

```bash
# 1. Remove the file from the latest commit (assuming it was the most recent)
git rm --cached path/to/leaked-file
git commit --amend --no-edit
git push --force-with-lease origin main

# 2. If it's deeper in history, use git-filter-repo (preferred over filter-branch):
brew install git-filter-repo
git filter-repo --path path/to/leaked-file --invert-paths
git push --force-with-lease origin main

# 3. Assume the key is compromised even if the repo is private — rotate it.
```

---

## Project structure

```
.
├── .env.example                # committed, every required key with placeholder
├── .gitignore                  # blocks .env, .DS_Store, *.zip, etc.
├── astro.config.mjs
├── package.json                # pnpm + Node 20+
├── tsconfig.json
├── public/
│   ├── assets/                 # avatar, logos
│   └── resume.pdf              # downloadable CV
├── src/
│   ├── content/
│   │   ├── config.ts           # Zod schemas (one place, source of truth)
│   │   ├── site/index.json     # hero, bio, links, stats, eras
│   │   ├── projects/index.json
│   │   ├── talks/index.json
│   │   ├── podcasts/index.json
│   │   ├── publications/index.json
│   │   ├── experience/index.json
│   │   └── ally/context.md     # Ally CAG bundle
│   ├── components/             # Astro (static, ship zero JS)
│   ├── islands/
│   │   └── Ally.tsx            # only React on the site
│   ├── lib/
│   │   ├── adapters/           # ghost.ts, youtube.ts
│   │   └── schemas/            # post.ts, video.ts
│   ├── styles/                 # tokens + components + site (preserved from design)
│   └── pages/                  # index, experience, projects, speaking, writing, contact
└── functions/
    ├── tsconfig.json
    └── api/
        ├── ally.ts             # OpenRouter proxy + rate limit
        └── ingest.ts           # HMAC-authenticated passthrough for n8n
```

---

## Design provenance

The visual design comes from a Claude Design handoff bundle (`Personal Website-handoff.zip`). The original prototype was React via Babel-standalone in a single HTML file. This codebase preserves every CSS class name verbatim (`aw-card`, `hero__grid`, `proj__top`, etc.) so the design files can serve as a 1:1 visual reference and AI-assisted edits can map cleanly.

CSS lives unmodified in `src/styles/`:
- `colors_and_type.css` — design tokens (Lilypad neon-on-dark palette, type scale, motion).
- `components.css` — reusable card / button / chip primitives.
- `site.css` — layout and section-specific rules.

The Lucide icon library is loaded once via UMD in `Layout.astro` and swaps every `<i data-lucide="…">` into an SVG on page load. The Ally island uses `lucide-react` directly because it manages its own re-renders.

---

## License

Personal site, all rights reserved.
