# Resonance AI

A production-ready text-to-speech platform with **zero-shot voice cloning**, organization-based billing, and a polished dashboard UI. Users pick or create voices, generate speech from text, and manage usage through a pay-as-you-go subscription.

## Features

- **Text-to-speech** — Generate natural speech from up to 5,000 characters with adjustable temperature, top-p, top-k, and repetition penalty
- **Voice library** — Browse curated system voices and create custom voices from uploaded or recorded audio samples
- **Voice cloning** — Chatterbox Turbo clones any voice from a short reference clip stored in object storage
- **Generation history** — Revisit past generations with waveform playback and parameter presets
- **Organizations** — Multi-tenant access via Clerk organizations
- **Usage-based billing** — Polar subscriptions gate generation and custom voice creation; meters track TTS and voice usage
- **Secure audio delivery** — Voice and generation audio proxied through authenticated API routes (not public bucket URLs)

## Architecture

```mermaid
flowchart TB
    subgraph client [Browser]
        UI[Next.js App]
    end

    subgraph railway [Railway / Next.js]
        API[tRPC + REST API]
        Prisma[(PostgreSQL)]
    end

    subgraph modal [Modal GPU]
        TTS[Chatterbox Turbo TTS]
    end

    subgraph storage [Cloudflare R2]
        Voices[voices/system/*]
        Custom[voices/orgs/*]
        Gens[generations/orgs/*]
    end

    subgraph services [External Services]
        Clerk[Clerk Auth]
        Polar[Polar Billing]
        Sentry[Sentry]
    end

    UI --> API
    API --> Clerk
    API --> Polar
    API --> Prisma
    API --> storage
    API -->|POST /generate| TTS
    TTS -->|read voice refs| storage
    API --> Sentry
```

### Request flow: TTS generation

1. User submits text + voice in the dashboard
2. `generations.create` (tRPC) verifies an active Polar subscription
3. Frontend calls **Modal Chatterbox** with the voice's `r2ObjectKey`
4. Modal reads the reference audio from R2, runs GPU inference, returns WAV bytes
5. App uploads output to R2, creates a `Generation` row in Postgres
6. User is redirected to the generation detail page; audio streams from `/api/audio/[id]`

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| API | tRPC 11, TanStack Query, TanStack Form |
| Auth | Clerk (users + organizations) |
| Database | PostgreSQL, Prisma 7 |
| Object storage | Cloudflare R2 (S3-compatible) |
| TTS inference | [Chatterbox Turbo](https://github.com/resemble-ai/chatterbox) on [Modal](https://modal.com) (A10G GPU) |
| Billing | [Polar](https://polar.sh) (subscriptions + usage meters) |
| Observability | Sentry |
| Package manager | [Bun](https://bun.sh) |

## Project structure

```
resonance-ai/
├── frontend/                 # Next.js application (deploy this to Railway)
│   ├── app/                  # App Router pages and API routes
│   ├── components/           # Shared UI components (shadcn)
│   ├── features/             # Feature modules (TTS, voices, billing, dashboard)
│   ├── lib/                  # Prisma, R2, Polar, Chatterbox client, env
│   ├── prisma/               # Schema and migrations
│   ├── scripts/              # Seed voices, sync OpenAPI types
│   ├── trpc/                 # tRPC routers and server setup
│   └── types/                # Generated Chatterbox API types
└── modal/
    └── chatterbox_tts.py     # Modal GPU service (FastAPI + Chatterbox)
```

## Prerequisites

- [Bun](https://bun.sh) 1.1+
- [Node.js](https://nodejs.org) 22+ (Railway uses this in production)
- PostgreSQL database (Neon, Railway Postgres, etc.)
- [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket
- [Clerk](https://clerk.com) application with **Organizations** enabled
- [Polar](https://polar.sh) account with a product and usage meters
- [Modal](https://modal.com) account with GPU access
- [Hugging Face](https://huggingface.co) token (for Chatterbox model download on Modal)

---

## Local development

### 1. Clone and install

```bash
git clone <your-repo-url>
cd resonance-ai/frontend
bun install
```

### 2. Environment variables

Create `frontend/.env.local` from the template below.

#### Clerk

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

#### Database

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

#### App

```env
APP_URL=http://localhost:3000
```

#### Cloudflare R2

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
```

R2 endpoint format: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

#### Chatterbox TTS (Modal)

```env
CHATTERBOX_API_URL=https://your-workspace--chatterbox-tts-chatterbox-serve.modal.run
CHATTERBOX_API_KEY=your_shared_api_key
```

#### Polar

```env
POLAR_ACCESS_TOKEN=polar_oat_...
POLAR_SERVER=sandbox
POLAR_PRODUCT_ID=prod_...
POLAR_METER_VOICE_CREATION=voice_creation
POLAR_METER_TTS_GENERATION=tts_generation
POLAR_METER_TTS_PROPERTY=characters
```

Use `POLAR_SERVER=production` for live billing.

#### Optional

```env
SKIP_ENV_VALIDATION=1
```

Only for temporary local builds when env vars are incomplete.

### 3. Database setup

```bash
cd frontend

# Apply migrations
bunx prisma migrate deploy

# Generate Prisma client (also runs on postinstall/build)
bunx prisma generate
```

### 4. Seed system voices

Place reference audio files in `frontend/scripts/system-voices/`, then:

```bash
bunx tsx scripts/seed-system-voices.ts
```

This uploads audio to R2 at `voices/system/{voiceId}` and upserts `Voice` rows in the database.

### 5. Run the dev server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in, select an organization, and use the dashboard.

> **Note:** Use `bun run dev` and `bun run build` — not `bunx run build` (that runs a different package).

---

## Modal TTS service

The GPU inference layer lives in `modal/chatterbox_tts.py`. It exposes a FastAPI app with `POST /generate` and interactive docs at `/docs`.

### Setup

```bash
cd modal
uv venv
source .venv/bin/activate        # Windows: .\.venv\Scripts\Activate.ps1
uv pip install modal
modal setup
```

### Configure R2 in the script

Edit the constants at the top of `chatterbox_tts.py` to match your bucket:

```python
R2_BUCKET_NAME = "your-bucket-name"
R2_ACCOUNT_ID = "your-cloudflare-account-id"
```

### Create Modal secrets

```bash
modal secret create cloudflare-r2 \
  AWS_ACCESS_KEY_ID=<r2-access-key-id> \
  AWS_SECRET_ACCESS_KEY=<r2-secret-access-key>

modal secret create hf-token HF_TOKEN=<huggingface-token>

modal secret create chatterbox-api-key CHATTERBOX_API_KEY=<same-key-as-frontend>
```

### Deploy

```bash
modal deploy chatterbox_tts.py
```

Copy the deployed URL into `CHATTERBOX_API_URL` in your frontend env.

### Test without the website

**CLI (runs on Modal GPU):**

```bash
modal run chatterbox_tts.py \
  --prompt "Hello, this is a test." \
  --voice-key "voices/system/<voice-id-from-db>" \
  --output-path "output.wav"
```

**HTTP:**

```bash
curl -X POST "https://<modal-url>/generate" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <your-api-key>" \
  -d '{"prompt": "Hello!", "voice_key": "voices/system/<voice-id>"}' \
  --output test.wav
```

**Swagger UI:** `https://<modal-url>/docs`

### Expected generation times (~25 words)

| Scenario | Time |
|----------|------|
| Warm container (recent traffic) | ~10–30 seconds |
| Cold start (after ~5 min idle) | ~2–4 minutes |

Modal scales containers down after 5 minutes of inactivity (`scaledown_window`).

### Sync OpenAPI types

After deploying Modal, regenerate TypeScript types for the Chatterbox client:

```bash
cd frontend
CHATTERBOX_API_URL=https://<modal-url> bunx tsx scripts/sync-api.ts
```

---

## Deployment

### Frontend (Railway)

| Setting | Value |
|---------|-------|
| Root directory | `frontend` |
| Build command | `bun run build` |
| Start command | `bun run start` |

Set all environment variables from [Local development](#2-environment-variables). Ensure `APP_URL` is your public Railway URL (e.g. `https://your-app.up.railway.app`).

`bun run build` runs `prisma generate` automatically — the generated client is gitignored and created at build time.

Run migrations against production once:

```bash
DATABASE_URL=<production-url> bunx prisma migrate deploy
```

### Modal

```bash
cd modal
modal deploy chatterbox_tts.py
```

Point `CHATTERBOX_API_URL` and `CHATTERBOX_API_KEY` on Railway to match the deployed service.

---

## API overview

### tRPC (`/api/trpc`)

| Router | Procedures | Description |
|--------|------------|-------------|
| `voices` | `getAll`, … | List system and org custom voices |
| `generations` | `create`, `getAll`, `getById` | TTS generation (requires subscription) |
| `billing` | `getStatus`, `createCheckout`, `createPortalSession` | Polar subscription and usage |

### REST

| Route | Method | Description |
|-------|--------|-------------|
| `/api/voices/create` | POST | Upload custom voice audio (subscription required) |
| `/api/voices/[voiceId]` | GET | Stream voice preview audio |
| `/api/audio/[generationId]` | GET | Stream generated audio |

All routes require Clerk authentication and organization context (except auth pages).

### Modal Chatterbox

| Route | Method | Description |
|-------|--------|-------------|
| `/generate` | POST | Synthesize speech from `prompt` + `voice_key` |
| `/docs` | GET | OpenAPI / Swagger UI |

Requires `X-Api-Key` header.

---

## R2 object layout

| Path | Contents |
|------|----------|
| `voices/system/{voiceId}` | System voice reference audio |
| `voices/orgs/{orgId}/{voiceId}` | Custom voice reference audio |
| `generations/orgs/{orgId}/{generationId}` | Generated TTS output |

The database stores these paths in `Voice.r2ObjectKey` and `Generation.r2ObjectKey`.

---

## Billing model

- **Subscription required** for TTS generation and custom voice creation
- Polar `getStateExternal` checks active subscriptions per Clerk `orgId`
- Usage events are ingested to Polar meters after successful operations:
  - Voice creation → `POLAR_METER_VOICE_CREATION`
  - TTS generation → `POLAR_METER_TTS_GENERATION` (with character count metadata)

Users without a subscription see an upgrade prompt with a checkout link.

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start Next.js dev server |
| `bun run build` | Generate Prisma client + production build |
| `bun run start` | Start production server |
| `bun run lint` | Run ESLint |
| `bunx prisma migrate dev` | Create/apply migrations (development) |
| `bunx prisma migrate deploy` | Apply migrations (production) |
| `bunx tsx scripts/seed-system-voices.ts` | Seed system voices to R2 + DB |
| `bunx tsx scripts/sync-api.ts` | Regenerate Chatterbox OpenAPI types |

---

## Troubleshooting

### `Cannot find module '@/lib/generated/prisma/client'`

Run `bunx prisma generate` or `bun run build`. The client is generated at build time and is not committed.

### `bunx run build` fails with "Cannot find module build"

Use `bun run build`, not `bunx run build`.

### R2 `InvalidAccessKeyId` or `Malformed Access Key Id`

- Use **Cloudflare R2** API tokens, not Backblaze B2 keys
- Endpoint must include `https://` and use `R2_ACCOUNT_ID`:  
  `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- Seed script and `lib/r2.ts` must target the same provider

### Modal `POST /generate` returns 500

Check Modal logs for `[generate] failed`. Common causes:

- Voice file missing at `voice_key` path on R2 mount
- Invalid `cloudflare-r2` or `hf-token` Modal secrets
- Cold start timeout on first request (retry after container is warm)

### Modal request stuck on "Pending"

Normal during GPU inference (10–60s warm, 2–4 min cold). If it hangs for many minutes, redeploy after ensuring the handler calls `_synthesize()` directly (not `self.generate.local()` from the ASGI route).

### `generations.create` succeeds but detail page 404

Ensure the tRPC mutation returns the real `generationId`, not the literal string `"generationId"`.

### Voice create returns 403 `SUBSCRIPTION_REQUIRED`

Expected without an active Polar subscription. Fix Polar env vars and complete checkout via the upgrade button.

### `billing.createCheckout` returns 500

Verify `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, and `POLAR_SERVER` (`sandbox` vs `production`) all match the same Polar environment.

---

## License

Private project. Add your license here if open-sourcing.
