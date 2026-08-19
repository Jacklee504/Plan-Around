# Integrations

A factual record of what PlanAround actually depends on, and what was deliberately not integrated.

No API keys, account identifiers, billing details or claim codes are recorded here.

## Runtime integrations

- **Vercel** — canonical frontend hosting, deployed from this repository's `main` branch.
- **GitHub Pages** — fallback static mirror (`output: "export"`, GitHub Pages-specific `basePath`).
- **Cloudflare Worker** — the API boundary between the browser and the AI provider: CORS, rate limiting, request validation, retries and the provider proxy itself.
- **Featherless** — production model inference (`Qwen/Qwen3-VL-30B-A3B-Instruct`; see [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the full AI boundary description).

## Development/review integrations

- **GitHub** — source control and issue tracking.
- **Claude Code** — primary coding agent used for this project's development.

## Sponsor perks intentionally not integrated into runtime

Evaluated and deliberately left out of the running product, because none of them solve a real PlanAround requirement:

- **Prelint** — a natural GitHub/spec-compliance review tool with no runtime product distortion, but connecting it requires installing a GitHub App through the GitHub UI, which is an account-level action for the repository owner rather than something a coding agent can do on their behalf.
- **`.xyz` domain** — evaluated; not used because the existing Vercel URL is sufficient for this submission.
- **DevSwarm Pro** — a Claude Code / git-worktree workflow tool, useful for development but never a runtime dependency; setup is an account/OAuth action outside this repository.
- **Tin Computer** — explicitly positioned by the sponsor as post-submission growth tooling (landing page/SEO/analytics fixes). Reserved for after submission; not connected to `main` before then.
- **YouCam** — image enhancement/generation APIs. PlanAround already has an image-preparation path and the production vision model already accepts screenshots directly; an extra remote image processor would only add latency, privacy surface and failure modes without solving a real problem.
- **Hawkeye** — not used; no useful macOS fit for the development environment.

## Operational notes

- **Worker rate limits**: `worker/wrangler.jsonc` currently sets 3 requests/minute per client and 12 requests/minute globally on the analysis routes. Raising the global limit for concurrent judge traffic is a deliberate decision that depends on the live Featherless plan's concurrency and remaining credits, so it is left for whoever has that account access rather than changed speculatively here.
- **Health check**: the Worker exposes `GET /health` (no provider call, no secrets) for cheap uptime checks; see [`scripts/productionSmoke.ts`](scripts/productionSmoke.ts).
- **Provider preflight**: [`scripts/providerPreflight.ts`](scripts/providerPreflight.ts) reports Featherless plan/model status from `FEATHERLESS_API_KEY` without printing the key. Run it before a demo to confirm credits/model availability.

## Domain

Canonical URL: `https://planaround.vercel.app/`

Fallback mirror: `https://jacklee504.github.io/Plan-Around/`

No custom domain is currently connected. If one is added later, update this file, the README live-demo link, and the Cloudflare Worker's allowed-origin list together.
