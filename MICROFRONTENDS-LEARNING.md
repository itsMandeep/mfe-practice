# Microfrontends — Learning Summary

A revision guide covering the route-based microfrontend architecture used at KGeN, the practice project that reproduces it (`mfe-practice`), and every infrastructure component involved.

---

## 1. TL;DR

- **Architecture:** Route-based microfrontends (Next.js **Multi-Zones**). Each app owns a URL prefix (`/`, `/gamer`, `/quests`) and is built and deployed independently.
- **Key frontend config:** `basePath: '/gamer'` in each child app's `next.config`, so both pages and assets (`/gamer/_next/...`) live under the prefix.
- **Key infra piece:** one routing layer in front (Cloudflare) that sends each path prefix to the right app's origin.
- **Cross-app navigation:** plain `<a>` → full page load. In-app navigation: `next/link` → client-side.
- **Shared things:** design system package (UI), auth cookie on the root domain.

---

## 2. Microfrontend types (know all, explain why you chose one)

| Type | How it works | Pros | Cons | When to use |
|---|---|---|---|---|
| **Route-based / Multi-Zones** *(what we used)* | Each app owns a path; edge/proxy routes by path | Simplest, true independent deploys, failure isolation | Full reload across apps, duplicated React bundles | Apps map cleanly to sections of the site |
| **Module Federation** | Host app loads remote components at runtime (Webpack/Rspack/Vite plugin) | Multiple teams on one page, shared deps | Runtime coupling, version mismatch risk, complex | Dashboards with widgets from many teams |
| **single-spa** | JS orchestrator mounts different apps (even different frameworks) per route | Mix frameworks | Extra orchestration layer | Migrating between frameworks |
| **iframes** | Each app in an iframe | Strongest isolation | Poor UX, SEO, sizing, communication | Embedding third-party / legacy apps |
| **Web Components** | Apps expose custom elements | Framework-agnostic | Styling/SSR challenges | Shared widgets across stacks |
| **Server-side composition / ESI** | Server stitches HTML fragments from services | Fast first paint, SEO | Infra-heavy | Large content/e-commerce sites |

**Mobile (React Native)** has no URL-based edge routing. Options: feature modules in a monorepo (most common), Re.Pack / Module Federation for RN (runtime remote bundles), or WebViews embedding web zones.

---

## 3. Multi-Zones in detail

### 3.1 `basePath`
```ts
// apps/gamer/next.config.ts
const nextConfig = {
  basePath: '/gamer',
  transpilePackages: ['@mfe/ui'],
};
```
What it does:
- Pages served under `/gamer/...` (`localhost:3001/` → 404, `/gamer` → works).
- Static assets become `/gamer/_next/static/...` → **no collision** with other apps' `/_next/...`, so the router can send all `/gamer/*` traffic (pages + assets) to one app.

### 3.2 Navigation rules
- **Inside a zone:** `next/link` with `href="/profile"` (basePath is prepended automatically) → client-side navigation.
- **Across zones:** `<a href="/">` or `<a href="/gamer">` → full page load (separate React trees, no shared router).

### 3.3 Gotcha (common interview question)
`next/link`, `next/router`, `next/image` add basePath automatically. **Raw `<img src="/logo.png">` and `fetch('/api/x')` do NOT** — prefix manually (`/gamer/logo.png`) or use an env like `NEXT_PUBLIC_BASE_PATH`.

### 3.4 Where routing can live
1. **Edge / proxy** (KGeN + practice): Cloudflare Worker / rules, Nginx, ALB, K8s Ingress.
2. **Home app rewrites** (official Next Multi-Zones approach):
```ts
// apps/home/next.config.ts
async rewrites() {
  return [
    { source: '/gamer', destination: `${process.env.GAMER_URL}/gamer` },
    { source: '/gamer/:path*', destination: `${process.env.GAMER_URL}/gamer/:path*` },
  ];
}
```

### 3.5 Shared concerns
- **UI consistency:** shared design system package (monorepo workspace package, or versioned private npm package).
- **Auth:** cookie set on the root domain (`kgen.io`) → readable by every zone (same origin).
- **State:** cannot share in-memory state across zones → use cookies, URL, or backend.
- **Config:** env vars per environment (URLs of other zones, API URLs).

### 3.6 Trade-offs

| Pros | Cons |
|---|---|
| Independent deploys & rollbacks per team | Full reload when crossing zones |
| Each app can upgrade Next/React independently | React + shared libs downloaded per zone |
| Failure isolation (`/gamer` down, `/` still up) | Header/footer drift unless shared package kept in sync |
| Simple mental model, no runtime integration | Cross-zone state needs cookies/URL/backend |

**Monorepo vs npm package for shared UI:** monorepo = everyone always on latest (but every app must redeploy to ship it); npm package = teams upgrade on their own schedule (but UI can drift).

---

## 4. Components by layer

```
CODE      pnpm workspace + @mfe/ui
BUILD     Next.js (Turbopack dev / next build) + Docker (prod image)
CI/CD     GitHub Actions / Jenkins → Vercel / EC2 / K8s
HOSTING   Vercel | EC2 | ECS | EKS (behind ALB)
CDN       Vercel CDN | CloudFront (+ S3 for uploads)
EDGE      Cloudflare (DNS, TLS, WAF, path routing, Workers)
```

### 4.1 Code layer
**pnpm workspaces (monorepo)**
- One repo, many packages; `pnpm-workspace.yaml` lists `apps/*`, `packages/*`. Local packages are symlinked (`node_modules/@mfe/ui → ../../packages/ui`).
- `pnpm -r --parallel dev` → run the `dev` script in every package that has one, all at once (dev servers never exit, so sequential would hang).
- Alternatives: npm/Yarn workspaces, **Turborepo**, **Nx** (task caching, "affected" builds), polyrepo.
- At scale: remote build caching, affected-only builds, Bazel-like systems at very large companies.

**Shared UI package (`@mfe/ui`)**
- `transpilePackages: ['@mfe/ui']` makes Next compile raw TS from a workspace package.
- At scale: Storybook, visual regression tests (Chromatic), design tokens, semver.

### 4.2 Build layer
**Next.js** — framework; `next build` compiles pages, applies basePath, **inlines `NEXT_PUBLIC_*` env values into JS**, outputs hashed static files.

**Turbopack** — Rust bundler used by recent Next versions (default for `next dev`). Alternatives: Webpack, Vite, Rspack, esbuild, Parcel. Why it matters at scale: dev startup + CI build time = developer productivity.

**Docker**
- Packages app + Node + deps into an **image**; runs identically anywhere as a **container**.
- **Docker Compose** = define multi-container setups in one YAML (local dev tool).
- Typical Next Dockerfile is multi-stage: `deps` → `builder` (receives `--build-arg` envs, runs `next build`) → small `runner` (`node server.js` with standalone output).
- Alternatives: Podman. At scale: images run on Kubernetes / ECS / Cloud Run.

### 4.3 Local infra
**Nginx (reverse proxy)** — forwards requests to other servers by rules:
```nginx
location /gamer  { proxy_pass http://host.docker.internal:3001; }
location /quests { proxy_pass http://host.docker.internal:3002; }
location /       { proxy_pass http://host.docker.internal:3000; }
```
(No path after the port → full path forwarded unchanged. Upgrade headers needed for dev hot reload websockets.)
Alternatives: Caddy, Traefik, HAProxy, Envoy. At scale: K8s ingress controllers, ALB path rules, TLS termination, load balancing, rate limiting.

### 4.4 Hosting
**Vercel** — builds Next, runs server code as serverless functions, serves static via CDN. One project per app via *Root Directory*. Alternatives: Netlify, Cloudflare (OpenNext), AWS Amplify, self-hosted containers.

**AWS compute**
| | What | Who manages running containers |
|---|---|---|
| **EC2** | Virtual machine | You (SSH, `docker pull`, `docker run`) |
| **ECS** | AWS container orchestrator | AWS (task definition → tasks; service keeps N running; rolling updates). Runs on EC2 or **Fargate** (serverless) |
| **EKS** | Managed Kubernetes | Kubernetes (portable, more powerful, more complex) |

**ECR** — private image registry (GitHub for images). CI pushes, servers pull. Versioned tags → rollback.

**ALB (Application Load Balancer)** — step by step:
1. Request hits ALB address (forwarded from Cloudflare/CloudFront).
2. **Listener** (port 443) terminates TLS.
3. **Rules** (path/host/header) → pick a **target group** (e.g. `/gamer/*` → `gamer-tg`).
4. **Health checks** remove unhealthy targets.
5. Request goes to a healthy target (round-robin).
6. Response flows back.
During deploys: new targets registered → pass health checks → old targets **drained** → zero downtime.

### 4.5 CDN
- Caches static files near users. Hashed filenames (`abc123.js`) → long cache lifetimes, no stale-asset problem on deploy.
- **CloudFront** (AWS), with **S3** as storage for uploaded assets (images etc.). Can either sit in front of the ALB (caching `_next/static`) or serve assets from S3 via `assetPrefix`.
- Alternatives: Cloudflare CDN, Fastly, Akamai, Vercel's built-in CDN.

### 4.6 Edge
**Cloudflare**
- DNS for the domain, TLS, DDoS/WAF/bot protection, caching, **path routing** to origins.
- **Workers** = code running inside Cloudflare's network (V8 isolates, near-instant cold starts).
- Config-only alternatives: Cloudflare Origin Rules, CloudFront behaviors, Next rewrites. Code alternatives: Lambda@Edge / CloudFront Functions, Fastly Compute, Akamai EdgeWorkers, Vercel Edge Middleware.
- At scale the edge is also the **release-control plane**: canary (5% traffic to new version), A/B tests, feature flags, geo-routing, auth checks, rate limits.

**Wrangler** — Cloudflare CLI to develop/deploy Workers (`wrangler.jsonc`). At scale edge config is managed as IaC (Terraform/Pulumi).

**DNS** — maps names to servers; new subdomains can take minutes to propagate.

### 4.7 CI/CD
- **CI** (checks): lint, typecheck, build, tests — per changed app (`dorny/paths-filter` + matrix; or `nx affected` / `turbo --filter`).
- **CD** (deploy): Vercel Git integration / Jenkins job / Wrangler deploy.
- Alternatives: **Jenkins** (self-hosted), GitHub Actions, GitLab CI, CircleCI, Buildkite.
- **Secrets:** repo secrets in CI; at scale Vault / AWS Secrets Manager / SSM; least-privilege tokens.
- At scale: preview deploys per PR, dev → staging → prod promotion, canary/blue-green with auto-rollback.

---

## 5. Build-time vs runtime env (important)

`NEXT_PUBLIC_*` values are **baked into the JS bundle at `next build`**.

| Build-time env (KGeN) | Runtime env ("build once, deploy many") |
|---|---|
| Simple, works out of the box | One image promoted dev → staging → prod |
| One image per environment | Config injected at container start (`window.__ENV`, server-read config) |
| Config change = rebuild | Config change = restart |

Server-only env vars (no `NEXT_PUBLIC_`) can be read at runtime.

---

## 6. KGeN production architecture

- 8 React/Next apps, each on a `kgen.io` path prefix via `basePath` (e.g. `kgen.io/gamer`).
- Each app had its **own Dockerfile**.
- **Jenkins:** separate job per environment; stage job accepted a branch parameter, prod was fixed to `main`; deploy triggered manually ("Build").
- **Env vars fetched in Jenkins at build time** → passed as build args.
- Deployed to **EC2** — initially manual blue-green ("spin up instance, deploy, make it main"), later automated.
- **CloudFront** served static build files; **S3** for uploaded assets (images).
- **Cloudflare** for DNS, routing (path → app origin) and edge.
- DevOps vocabulary (pods, ingress, cluster) indicates **Kubernetes** in the later setup.

---

## 7. Flow 1 — Code push → live

1. **Developer** pushes to Git.
2. **Git repo** stores code (no auto-deploy).
3. **Jenkins job** (manual click, per env): checkout → fetch env vars → `docker build --build-arg ...` → tag image → push to registry → trigger deploy.
4. **Docker build:** install deps → `next build` (basePath applied, `NEXT_PUBLIC_*` inlined, hashed assets) → small runtime image.
5. **Registry (ECR/Docker Hub):** stores versioned image.
6. **EC2 / K8s:** pull image → start new container → becomes healthy → traffic switched → old stopped.
7. **ALB / Ingress:** health-checks new targets, routes to them, drains old.
8. **CloudFront:** new hashed asset names → no invalidation needed for assets.
9. **Cloudflare:** unchanged (route config only changes when adding a new app).
10. **User** refreshes → new version.

## 8. Flow 2 — Request → response

1. **Browser** opens `kgen.io/gamer/profile`.
2. **DNS (Cloudflare)** → IP of nearest Cloudflare edge.
3. **Cloudflare edge:** TLS → security (DDoS/WAF) → cache check → path routing `/gamer/*` → gamer origin.
4. **CloudFront** (if in path): serves cached static; passes page requests through.
5. **ALB / Ingress:** rule match → gamer target group/service → healthy container/pod.
6. **Next.js server (gamer):** match route (basePath stripped) → read cookies → fetch backend data (SSR) → render HTML with asset URLs.
7. **Response** back through ALB → CloudFront → Cloudflare → browser.
8. **Browser:** paint HTML → load JS/CSS from CDN → images from S3/CloudFront → **hydrate** → client-side API calls.
9. **Next click:** same zone → client-side nav; other zone → full page load, flow restarts at step 1.

---

## 9. Kubernetes vocabulary & incident triage

```
Cluster
 ├── Node (VM)
 │     └── Pod (container: gamer Next server)
 ├── Deployment → "keep 3 gamer pods running" (replicas, rolling updates)
 ├── Service    → stable internal address across pods
 └── Ingress    → "/gamer → gamer service" (backed by ALB / Nginx)
```

| Term | Meaning | ≈ AWS/ECS |
|---|---|---|
| Cluster | Control plane + worker machines | ECS cluster |
| Node | One VM in the cluster | EC2 instance |
| Pod | Smallest running unit (your container) | Task |
| Deployment | Desired replicas + rolling updates | ECS service |
| Service | Stable name, load-balances pods | Target group |
| Ingress | External routing rules | ALB rules |

**What DevOps phrases mean**
- *"3 pods are up"* → all desired replicas running & healthy (normal).
- *"Pod is down / not running"* → container failing:

| Status | Meaning | Typical cause |
|---|---|---|
| `CrashLoopBackOff` | Starts, crashes, repeats | Startup bug, missing env, bad config |
| `ImagePullBackOff` | Can't download image | Wrong tag, registry auth |
| `OOMKilled` | Killed for memory | Leak / limit too low |
| `Pending` | No node has room | Cluster out of CPU/memory |
| Running, not Ready | Readiness check failing | App hung, dependency down |

- *"Ingress issue"* → pods fine, routing broken (path rule, TLS cert, controller down) → 404/502.
- *"Cluster is not running"* → all apps in the cluster affected.

**Triage from outside in:** Cloudflare/DNS → Ingress/ALB → Service/pods Ready → pod logs → backend APIs/DB.

```bash
kubectl get pods                    # status of pods
kubectl describe pod <name>         # events: why it failed
kubectl logs <pod-name>             # app console output
kubectl get deploy                  # desired vs ready replicas (3/3)
kubectl rollout undo deploy/gamer   # roll back
kubectl get ingress                 # external routing rules
```

---

## 10. Practice project (`mfe-practice`) — what was built

```
mfe-practice/
  apps/home      → owns /,       port 3000, no basePath
  apps/gamer     → owns /gamer,  port 3001, basePath '/gamer'
  apps/quests    → owns /quests, port 3002, basePath '/quests'
  packages/ui    → @mfe/ui shared Header (workspace:*)
  proxy/nginx.conf + docker-compose.yml → local router on :8080
  edge/          → Cloudflare Worker router (wrangler.jsonc, src/index.ts)
  .github/workflows/ci.yml → per-app CI + Worker deploy
```

| Step | What | KGeN equivalent |
|---|---|---|
| 1–3 | Monorepo + 3 Next apps with basePath | 8 Next apps |
| 4 | Shared UI package | Design system |
| 5 | Nginx in Docker on :8080 | Cloudflare routing (local stand-in) |
| 6 | Push to GitHub | Git repo |
| 7 | 3 Vercel projects (Root Directory per app) + Ignored Build Step | Jenkins job + EC2 per app |
| 8 | Cloudflare Worker router on workers.dev | Cloudflare on kgen.io |
| 9 | GitHub Actions (paths-filter, matrix, wrangler deploy) | Jenkins pipelines |
| 10 | *(next)* Shared auth cookie, RN WebView shell | — |

**Worker router (core logic)**
```ts
const prefix = Object.keys(ZONES).find(
  p => url.pathname === p || url.pathname.startsWith(p + '/'),
);
const origin = prefix ? ZONES[prefix] : HOME;
const target = new URL(url.pathname + url.search, origin);
return fetch(new Request(target, request), { redirect: 'manual' });
```

**Verification checklist**
- `localhost:3001/` → 404, `/gamer` → works (basePath).
- Assets load from `/gamer/_next/static/...`.
- Cross-zone click = new document request; in-zone click = no reload.
- Stop one app → only its path breaks (failure isolation).
- Change only gamer → only gamer rebuilds/deploys.

**Gotchas hit along the way**
- `create-next-app --use-pnpm` creates a `pnpm-workspace.yaml` + lockfile **inside each app** → workspace can't find `@mfe/ui`. Fix: delete them, keep only the root workspace file (move settings like `allowBuilds` to root).
- zsh globbing: quote `"@mfe/ui@workspace:*"`.
- `npx` fails with `EBADDEVENGINES` because root `package.json` declares pnpm in `devEngines` → use `pnpm dlx`.
- Vercel platform 404 on every URL → Framework Preset stuck on "Other" after changing Root Directory → set to Next.js, redeploy.
- New `workers.dev` subdomain takes a few minutes for DNS.
- Next dev behind a proxy may need `allowedDevOrigins`.

---

## 11. Interview one-liners

- **Architecture:** "We used route-based microfrontends, similar to Next.js Multi-Zones. Each of our 8 Next apps owned a URL prefix via `basePath` and was deployed independently. Cloudflare routed `/gamer/*` and other prefixes to each app's origin. Shared auth came from a root-domain cookie and shared UI from our design-system package."
- **Deploys:** "Each app had its own Dockerfile and per-environment Jenkins jobs. Env values were injected at build time, since `NEXT_PUBLIC_*` is inlined by `next build`. We started with manual blue-green deploys on EC2 and later automated them."
- **Request path:** "Requests hit Cloudflare first for DNS, security and path routing; static assets came from CloudFront/S3; only HTML and data requests reached our Next servers."
- **CI:** "Pipelines were per app, triggered by path changes; shared-package changes fanned out to all consumers; edge routing config was deployed as code."
- **Incidents:** "We triaged from the edge inward — Cloudflare, ingress, pods, then backend — and failure isolation meant one zone going down didn't take the whole site with it."
- **Edge at scale:** "The edge is also the release-control plane — canaries, A/B tests, geo-routing, auth and rate limiting."
