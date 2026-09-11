# ADR-001 — How the Experience Lab reaches the commercial site

**Status:** accepted, Phase 7
**Decision:** separate build, same origin, served at `/lab/` by the existing nginx.

## The constraint that decided it

The two applications cannot share a bundle. This is not a preference:

| | commercial (`hi-anzy-website/frontend`) | Experience Lab |
|---|---|---|
| build | CRA + CRACO (`react-scripts` 5) | Vite / Rolldown |
| React | 18.3.1 | 19 |
| three | 0.165 | 0.185 |
| @react-three/fiber | 8.16 | 9 (**requires React 19**) |
| routing | `react-router-dom` | hash, no router by rule |
| styling | Tailwind + Radix | own token system, no UI kit |

R3F 9 hard-requires React 19, and two copies of three.js in one graph is a
broken scene, not a slow one. So "same application, lazy route" (option A)
costs either a React 18 downgrade of the Lab — which is a rewrite of sixteen
realities — or a React 18→19 and R3F 8→9 upgrade of approved commercial work.
Phase 7 forbids both.

## What was chosen

**Option C — separate deployment behind a same-origin path.**

```
nginx  ──  /            →  commercial SPA shell   (untouched)
       ──  /static/     →  commercial hashed assets (untouched)
       ──  /lab/        →  Experience Lab build
```

The Lab builds with `LAB_BASE=/lab/`, producing `/lab/assets/…`,
`/lab/fonts/…`, `/lab/brand/…`. Its contents are copied into the same nginx
image at `/usr/share/nginx/html/lab/`.

### Why this one

- **Zero bytes on the commercial entry.** The Lab is a separate document. A
  visitor who never opens it downloads none of three.js, R3F or GSAP.
- **Failure isolation.** If the Lab's assets 404 or its JS throws, `location /`
  never executed any of it. Reality 0 cannot be taken down by Reality 1–16.
- **No dependency collision.** Two React versions, two three.js versions, two
  build systems — never in the same module graph.
- **SEO stays coherent.** Same origin, so no subdomain split of authority. The
  Lab is one `<a href>` away and is not crawled as a separate property.
- **The routing is already free.** The Lab uses hash routing, so `/lab/#/memory`
  needs no server-side route table — one `location` block serving one
  `index.html` covers all sixteen realities and every deep link.
- **Reversible in one block.** Deleting the `location /lab/` stanza removes the
  Lab entirely and changes nothing else.

### Why not the others

- **A — same app, lazy route.** Impossible without a version war (above).
- **B — separate app, same path, shared build pipeline.** Inherits CRA's
  constraints for no gain over C.
- **D — subdomain.** Isolates equally well but splits the origin: separate
  certificate, separate analytics property, cookie boundary, and a weaker link
  between the marketing site and the thing it is showing off.

## What this requires

**Lab side (done in Phase 7):**
- `vite.config.ts` reads `LAB_BASE`, defaulting to `/` so local dev is unchanged.
- `specimenSrc()` builds from `import.meta.env.BASE_URL`. Vite rewrites `base`
  into HTML and CSS `url()` on its own; a path assembled in JavaScript is just
  a string to it, and would have 404'd every specimen on deploy.

**Serving side (not applied — deployment is not authorised in this phase):**
- one nginx `location /lab/` block, mirroring the existing header and cache
  policy, with `try_files $uri $uri/ /lab/index.html`;
- the Lab's `dist/` copied to `/usr/share/nginx/html/lab/` in the image.

The commercial CSP already fits: the Lab's build emits **no inline script**, so
`script-src 'self'` needs no hash and no `'unsafe-inline'`.

## What is deliberately still open

The commercial repository has been read-only for the whole of this project and
remains so here. The entry link and the nginx block are specified in
`docs/INTEGRATION-COMMERCIAL.md` as an exact, reversible patch, to be applied
by whoever owns that repository. Phase 7 does not write to it.
