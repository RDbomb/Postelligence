# Postelligence

A social media management dashboard that lets you write one post and publish it to multiple platforms simultaneously â€” LinkedIn, YouTube, Bluesky, Instagram, Facebook, Threads, and more.

Built with Next.js 14, Supabase, Tailwind CSS, and Recharts.

---

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js v20+** â€” [Download here](https://nodejs.org/)
- **Yarn v1.22+** â€” Install with `npm install -g yarn`

---

## Getting Started

### 1. Install dependencies

```bash
yarn install
```

This project uses Yarn as its package manager. Do not use `npm install` or `pnpm install` â€” they generate competing lockfiles that will drift from `yarn.lock`.

---

### 1.1 Generate Local SSL Certificates (for HTTPS mode)

If you plan to test OAuth callbacks locally using `yarn dev:https`, generate the required `localhost` SSL certificates:

```bash
mkdir -p certificates
npx mkcert -key-file ./certificates/localhost-key.pem -cert-file ./certificates/localhost.pem localhost 127.0.0.1 ::1
```

*(Note: Install `mkcert` globally via `brew install mkcert` or `choco install mkcert` if needed).*

---

### 2. Set up environment variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env.local
```

Open `.env.local` and replace each placeholder value with your actual credentials. The `.env.example` file lists all required variables with descriptions. You do not need to fill in every platform â€” only add credentials for platforms you intend to connect.

---

### 3. Run the development server

**Standard HTTP (recommended for local dev):**

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**HTTPS (required for some OAuth callbacks like Instagram):**

```bash
yarn dev:https
```

Open [https://localhost:3000](https://localhost:3000) in your browser. SSL certificates are pre-generated in the `certificates/` folder.

---

## Database Setup

Run the Supabase migrations in order to create all required tables:

```
supabase/migrations/001_create_social_accounts.sql
supabase/migrations/002_create_media_bucket.sql
supabase/migrations/003_create_drafts_library_scheduled.sql
supabase/migrations/004_create_media_library_bucket.sql
supabase/migrations/005_add_content_hash_to_media_library.sql
supabase/migrations/005_enable_scheduler_publishing_status.sql
supabase/migrations/006_add_platform_results_to_scheduled_posts.sql
supabase/migrations/007_create_analytics_cache.sql
```

Apply them via the Supabase dashboard (SQL editor) or with the Supabase CLI:

```bash
npx supabase db push
```

---

## Supabase Edge Functions

If you modify any of the following files, redeploy the affected Edge Function:

- `supabase/functions/auto-publish/index.ts`
- `supabase/functions/auto-publish/deno.json`
- `supabase/functions/bluesky-video-upload/index.ts`

**Deploy auto-publish:**

```bash
npx supabase login
npx supabase functions deploy auto-publish --project-ref YOUR_PROJECT_REF
```

**Deploy bluesky-video-upload:**

```bash
npx supabase functions deploy bluesky-video-upload --project-ref YOUR_PROJECT_REF
```

---

## Platform Support

| Platform   | Publishing | Analytics        | Notes |
|------------|-----------|------------------|-------|
| LinkedIn   | âœ…         | âš ï¸ Partial        | Engagement requires `r_member_social` LinkedIn approval |
| YouTube    | âœ…         | âœ… Full           | Requires Google OAuth with YouTube Data API v3 |
| Bluesky    | âœ…         | âœ… Full           | Uses public API, no extra permissions needed |
| Instagram  | âœ…         | âœ… Full           | Requires Meta Business/Creator account |
| Facebook   | âœ…         | âš ï¸ Partial        | Post analytics require Meta `pages_read_user_content` approval |
| Threads    | âœ…         | âœ… Full           | Requires Meta developer app |
| Twitter/X  | ðŸš§ WIP     | âŒ Not yet        | Integration under development |
| Pinterest  | âŒ Planned | âŒ Not yet        | Planned for a future release |
| Reddit     | âŒ Planned | âŒ Not yet        | Awaiting developer approval |

---

## Auth & Route Protection

Authentication is enforced at **two** layers, on purpose.

### 1. `proxy.ts` (Next.js 16 middleware)

Runs before rendering on every matched request and does two jobs:

- **Refreshes the Supabase session.** `getUser()` revalidates the access token and rotates the auth cookies when it has expired. Without this, a signed-in user's session dies silently when the token lapses.
- **Redirects optimistically** â€” signed-out visitors leaving the app shell go to `/login`; signed-in visitors hitting `/login` go to `/dashboard`.

Protected prefixes mirror the `app/(shell)/` segments. Deliberate exclusions:

| Excluded | Why |
|---|---|
| `/automation/action-completed` | Public landing page for token-authenticated external approval links sent over Discord/Telegram. Sits under the protected `/automation` prefix but must stay open. |
| `/api/*` | Route handlers authenticate themselves and must return 401 JSON, not an HTML redirect. Keeps `/api/scheduler/run` (cron) and `/api/automation/external-approve` (token) reachable. |
| `/auth/*` | OAuth callbacks â€” redirecting these breaks the code exchange. |
| `/admin` | Authenticates client-side against `sessionStorage`, not Supabase. |

### 2. `getUser()` in pages, layouts and route handlers

These are **kept**, not replaced by the proxy. Two reasons:

- A proxy is a single spoofable choke point. [CVE-2025-29927](https://nvd.nist.gov/vuln/detail/CVE-2025-29927) let a crafted `x-middleware-subrequest` header skip Next.js middleware entirely. If the proxy were the only gate, that bug would have exposed every page and API route.
- In the App Router a **layout's guard does not stop its child page from executing** â€” they render in parallel. A page cannot rely on its layout for protection.

The rule: the proxy avoids rendering work and keeps tokens fresh; **authorisation lives next to the data it protects.**

---

## Code Quality & Git Hooks

Hooks are managed by [husky](https://typicode.github.io/husky/) and installed automatically by `yarn install`.

| Hook | Runs | Blocks on |
|---|---|---|
| `pre-commit` | `lint-staged` â†’ `eslint --fix` on staged files | any remaining ESLint **error** |
| `commit-msg` | `commitlint` | message not matching Conventional Commits |
| `pre-push` | `eslint .` then `next build` (type-checks too) | any lint error or build/type failure |

### Commit message format

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(optional scope): subject
```

Allowed types: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `revert`.
Subject must be lower-case, non-empty, no trailing period; header â‰¤100 chars.

```bash
# accepted
feat(automation): add discord webhook publishing
fix(auth): handle expired youtube refresh token
chore(deps): upgrade next to 16

# rejected
discord added
Fixed the thing.
```

### Useful scripts

```bash
yarn lint         # eslint across the project
yarn lint:fix     # eslint with --fix
yarn typecheck    # tsc --noEmit
```

> **Bypassing hooks** (`--no-verify`) is discouraged â€” `pre-push` is the last gate before shared branches.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion |
| Charts | Recharts |
| Icons | lucide-react |
| Auth & Database | Supabase (PostgreSQL + Auth) |
| File Storage | Supabase Storage |
| Edge Functions | Supabase Edge Functions (Deno) |
| Package Manager | Yarn (v1 Classic) |

---

## Project Structure

```
Postelligence/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ page.tsx                        # Landing / login page
â”‚   â”œâ”€â”€ auth/                           # OAuth callbacks (Google + per platform)
â”‚   â”œâ”€â”€ dashboard/
â”‚   â”‚   â”œâ”€â”€ page.tsx                    # Main dashboard (server component)
â”‚   â”‚   â”œâ”€â”€ DashboardClient.tsx         # Interactive dashboard UI
â”‚   â”‚   â”œâ”€â”€ DashboardShellClient.tsx    # Sidebar + navbar shell
â”‚   â”‚   â””â”€â”€ (shell)/                   # Sub-pages with shared layout
â”‚   â”‚       â”œâ”€â”€ analytics/             # Analytics dashboard with charts
â”‚   â”‚       â”œâ”€â”€ calendar/              # Scheduled post calendar
â”‚   â”‚       â”œâ”€â”€ drafts/                # Draft management
â”‚   â”‚       â”œâ”€â”€ library/               # Media library
â”‚   â”‚       â”œâ”€â”€ integrations/          # Platform connections
â”‚   â”‚       â””â”€â”€ ai-studio/             # AI caption/hashtag tools
â”‚   â””â”€â”€ api/
â”‚       â”œâ”€â”€ integrations/<platform>/   # connect / callback / disconnect per platform
â”‚       â”œâ”€â”€ posts/publish/             # Core multi-platform publish engine
â”‚       â”œâ”€â”€ analytics/refresh/         # Manual + background analytics cache refresh
â”‚       â”œâ”€â”€ media/                     # LinkedIn & YouTube media pre-upload
â”‚       â”œâ”€â”€ media-library/             # Media library CRUD
â”‚       â”œâ”€â”€ scheduled-posts/           # Scheduled post CRUD
â”‚       â””â”€â”€ scheduler/run/             # Cron-triggered auto-publisher
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ ui/                            # Button, Badge, GlassPanel
â”‚   â””â”€â”€ email-auth-form.tsx
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ supabase/                      # Supabase client wrappers
â”‚   â”œâ”€â”€ integrations/                  # Per-platform OAuth + API helpers
â”‚   â”œâ”€â”€ analytics/
â”‚   â”‚   â”œâ”€â”€ social-analytics.ts        # Live analytics fetcher (all platforms)
â”‚   â”‚   â””â”€â”€ analytics-cache.ts         # Supabase-backed cache (stale-while-revalidate)
â”‚   â”œâ”€â”€ scheduler/auto-publisher.ts    # Scheduled post publishing logic
â”‚   â””â”€â”€ types.ts                       # Shared TypeScript types
â””â”€â”€ supabase/
    â”œâ”€â”€ migrations/                    # SQL migration files
    â””â”€â”€ functions/                     # Deno edge functions
```

---

*Built by Siddharth Jagdale*
