# Deployment runbook — commercial site + Experience Lab

One image, two applications, one origin. The Lab is a separate static build
copied in at `/lab/`; nothing imports across the boundary.

Background: `ADR-001-lab-integration.md` (why) and `INTEGRATION-COMMERCIAL.md`
(the exact patch). This file is the operational sequence. Everything below was
executed against a real nginx container in Phase 8, not reasoned about.

---

## 1. Build

**Lab** — in the Experience Lab repository:

```bash
LAB_BASE=/lab/ npm run build
```

> On Git Bash / MSYS, prefix with `MSYS_NO_PATHCONV=1` or the shell rewrites
> `/lab/` into a Windows path and you get `/Program Files/Git/lab/...` baked
> into every asset URL. It builds successfully and is completely broken.

**Two guards — both must pass before the build leaves the machine:**

```bash
grep -o '/lab/assets/[^"]*' dist/index.html    # must print
grep -rl '/lab/brand' dist/assets/*.js         # must match ≥1 chunk
```

The second is the one that matters. Without `LAB_BASE` the page still loads and
looks correct, but every specimen resolves to `/brand/…` at the origin root —
where **the commercial site has its own `/brand/` directory using the same 14
filenames**. The result is not a 404; it is the wrong image, served silently.
Verified in staging: all 14 Lab brand filenames collide with commercial ones.

Then place it in the commercial build context:

```bash
rm -rf frontend/lab && cp -r <lab>/dist frontend/lab
```

**Commercial** — unchanged. `npm run build` still runs its three prebuild gates
(opacity scale, SEO output, sitemap).

## 2. Image

```bash
cd frontend
docker build -t hianzy:<tag> \
  --build-arg SITE_URL=https://hianzy.com \
  --build-arg REACT_APP_BACKEND_URL=<api origin> .
```

The Dockerfile copies `lab/` into `/usr/share/nginx/html/lab/` after the
commercial build. `.dockerignore` does not exclude `lab/`; if that changes, the
Lab silently disappears from the image and `/lab/` returns 404.

## 3. Routing

Two `location` blocks above `location /`, given in full in
`INTEGRATION-COMMERCIAL.md`. Three things about them are load-bearing:

- **`try_files $uri $uri/ /lab/index.html =404;`** — the trailing `=404`. A
  missing `/lab/` without it answers **500**, which reads as a broken server
  rather than an undeployed section. Measured: 500 before, 404 after.
- **Headers are repeated per block.** `add_header` is not additive; a location
  setting one of its own stops inheriting the server block entirely.
- **`/lab/assets/` is its own block** so hashed chunks get `immutable`.

Ordering note: nginx picks the longest matching prefix, then a matching regex
**overrides** it. The pre-existing extension regex therefore serves
`/lab/fonts/*.woff2` and `/lab/brand/*.avif` at `max-age=3600`. Observed, not
assumed. Leave it alone.

## 4. CSP

**No change required.** The Lab build emits zero inline script, so the existing
`script-src 'self'` covers it with no hash and no `'unsafe-inline'`. Verified in
staging: the CSP header on `/lab/` is byte-identical to `/`, and a full run
through every reality produced **zero** `securitypolicyviolation` events.

No external hotlinks: 60 requests across all sixteen realities, all same-origin.

## 5. Caching and rollback

| path | policy | why |
|---|---|---|
| `/lab/index.html`, `/lab/` | `no-cache, must-revalidate` | carries the chunk hashes; must never go stale |
| `/lab/assets/*` | `public, immutable, max-age=31536000` | content-hashed by Vite |
| `/lab/fonts/*`, `/lab/brand/*` | `public, max-age=3600` | via the extension regex |

**Rolling forward is safe.** The shell is revalidated every load, so a new
deploy is picked up immediately and points at the new hashes.

**The one real window:** a visitor who loaded the Lab *before* a deploy still
has the old shell in memory. If they then enter a reality whose lazy chunk the
deploy replaced, the dynamic import 404s. Tested by deleting a chunk under a
live client — the Lab recovers to the Index with *"This reality could not be
loaded. Returned to the index."*, stays navigable, and other realities still
open. No white screen. Acceptable without further work.

**Rollback** is redeploying the previous image. Because chunk names are hashed
and `index.html` is never cached, a rollback restores a self-consistent pair.
Do not roll back only the Lab directory while leaving a newer shell.

## 6. Health and smoke checks

The container's `HEALTHCHECK` already probes `/`. After deploy:

```bash
B=https://hianzy.com
curl -s -o /dev/null -w '%{http_code} ' $B/            # 200 commercial
curl -s -o /dev/null -w '%{http_code} ' $B/lab/        # 200 lab shell
curl -s -o /dev/null -w '%{http_code} ' $B/lab/fonts/rajdhani-700.woff2   # 200
curl -s -o /dev/null -w '%{http_code} ' $B/lab/brand/char-fixer.avif      # 200
curl -s -o /dev/null -w '%{http_code} ' $B/sitemap.xml # 200 xml, NOT the lab shell
curl -s -o /dev/null -w '%{http_code}\n' $B/lab/nope   # 200 (SPA fallback)
curl -s $B/lab/ | grep -o '<title>[^<]*</title>'       # Experience Lab
curl -s $B/ | grep -o '<title>[^<]*</title>'           # commercial
```

In a browser, the check that matters most: **load `/` and confirm the network
panel contains no request whose path starts with `/lab/`.** That is the whole
architectural promise, and it is one glance.

Then `/lab/#/memory` from a cold load, and Escape back to the Index.

## 7. Failure isolation — what "the Lab is down" looks like

Proven in staging by breaking it on purpose:

| broken | `/lab/` | `/`, `/work`, `/sitemap.xml` |
|---|---|---|
| entry chunk removed | 404 on the chunk, shell still 200 | **200, correct title** |
| whole `/lab/` removed | 404 (with the `=404` guard) | **200, correct title** |

The commercial site cannot be taken down by the Lab, because `location /` has
already served it and executed none of the Lab's code.

## 8. Analytics — the integration point

`src/analytics/events.ts` defines eleven event names and a single-slot sink
that is empty by default. **With no sink registered the whole surface is
tree-shaken out** — searching the deployed chunks for `reality_enter` returns
nothing. That is intended (zero cost when unused) and is exactly what an
integrator will mistake for "never built".

To wire a product: call `onEvent(fn)` once at startup and rebuild. The call
sites and strings return on their own. There is deliberately no `window` hook
in production to attach to from outside the bundle.

Events carry a reality id and nothing else — no visitor id, device data,
coordinates or dwell sampling. Two visitors walking the same route emit
identical streams.

## 9. Known staging-only noise

Running staging on a port other than the API's configured origin produces CORS
failures on `/api/auth/me` and `/api/case-studies` plus a `favicon.ico` 404.
All three are commercial-side and pre-existing; none involve `/lab/`. The
commercial build ships no favicon and declares no icon link — worth fixing one
day, in that repository, not this one.
