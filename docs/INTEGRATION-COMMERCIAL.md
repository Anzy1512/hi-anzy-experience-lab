# Applying the Lab to the commercial site

**Nothing in this document has been applied.** The commercial repository
(`Anzy1512/hi-anzy-platform`) has been read-only for the whole of this project
and stayed read-only through Phase 7. This is the exact change to make, written
so that whoever owns that repository can apply and reverse it without reading
any Lab source.

See `ADR-001-lab-integration.md` for why it is shaped this way.

Three changes. Each is independent, and each reverses by deleting it.

---

## 1. Build the Lab for the subpath

In the Experience Lab repository:

```bash
LAB_BASE=/lab/ npm run build      # emits dist/ with /lab/-prefixed asset URLs
```

`dist/` is then a self-contained directory: `index.html`, `assets/`, `fonts/`,
`brand/`. It has no server requirements beyond static file serving.

Verify before shipping — the one failure this can have is silent:

```bash
grep -o '/lab/assets/[^"]*' dist/index.html   # must print, not be empty
grep -rl '/lab/brand' dist/assets/*.js        # must match at least one chunk
```

If the second is empty the build was made without `LAB_BASE` and every
specimen image will 404 once deployed, while the page itself looks fine.

## 2. Copy it into the image

`frontend/Dockerfile`, in the **serve** stage, immediately after the existing
`COPY --from=build /app/build /usr/share/nginx/html`:

```dockerfile
# The Experience Lab: a separate static build, mounted at /lab/. Nothing in the
# commercial bundle imports it, and nothing in it imports the commercial bundle.
COPY lab/ /usr/share/nginx/html/lab/
```

with the Lab's `dist/` placed at `frontend/lab/` in the build context.

## 3. Serve it

`frontend/nginx.conf.template`, as a new block **above** the existing
`location /`:

```nginx
    # The Experience Lab. Its own SPA, its own hashed assets, its own failure
    # domain: if anything here 404s, `location /` has already served the
    # commercial site and executed none of it.
    #
    # Headers are repeated rather than inherited — add_header is not additive,
    # so a location that sets one of its own stops inheriting the server block
    # entirely. Same reason the blocks below each carry the full set.
    #
    # The CSP is the commercial one unchanged: the Lab's build emits no inline
    # script, so `script-src 'self'` needs no hash and no 'unsafe-inline'.
    location /lab/ {
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options        "SAMEORIGIN" always;
        add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy     "camera=(), microphone=(), geolocation=()" always;
        add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: blob: https://images.unsplash.com; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; worker-src 'self' blob:; connect-src 'self' ${CSP_CONNECT_SRC}" always;
        add_header Cache-Control          "no-cache, must-revalidate" always;
        try_files $uri $uri/ /lab/index.html;
    }

    # Hashed and immutable, exactly like /static/.
    location /lab/assets/ {
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cache-Control "public, immutable, max-age=31536000" always;
        try_files $uri =404;
    }
```

> **Note the ordering.** nginx picks the longest matching *prefix* location
> first, then tests regex locations — and a matching regex **overrides** the
> prefix it had chosen. So the existing
> `\.(xml|txt|json|map|ico|png|jpg|jpeg|svg|webp|avif|woff2?|…)$` block claims
> `/lab/fonts/*.woff2` and `/lab/brand/*.avif` rather than the `/lab/` block
> above. That is harmless: its `try_files $uri =404` serves both correctly from
> disk, and `max-age=3600` is reasonable for each. `.js`, `.css` and `.html` are
> not in that list, so the Lab's chunks and shell fall to the prefix blocks as
> intended. No change needed — recorded so the next person does not "fix" a
> thing that is working.

## 4. The entry link

One surface, not five. A plain anchor — no React import, no bundle change, no
route:

```jsx
<a className="…" href="/lab/">
  ENTER THE EXPERIENCE LAB
</a>
```

**Recommended placement: the foot of `/how-we-work`.** That page's subject is
the method the Lab dramatises, and a visitor who has reached the bottom of it
has already shown the interest the Lab rewards. It is one block, in one page,
touching no hero, no nav, no service copy and no Work or Network content.

The alternative — a quiet link in `Footer.js` — is even smaller and reaches
every page, but it is a footer link, and a footer link is not an invitation.
Use it *as well* if a site-wide route is wanted; do not use it *instead* and
call the entry done.

### What the entry should say

Optional, experimental, heavier than the site, and leaveable — without reading
as a browser warning. Something in the site's own voice, for example:

> **THE EXPERIENCE LAB** — Sixteen ways of showing what we do, built as
> software rather than described in a case study. It is heavier than this site
> and it is not the shortest route to talking to us. Escape leaves at any point.

Do not add a second call-to-action, a banner, an interstitial or a modal. The
Lab returns visitors to `/` on its own, from its own closing surface.

---

## Reversing it

Delete the two `location /lab/*` blocks, the `COPY lab/` line, and the anchor.
Nothing else in the commercial application references the Lab, because nothing
in the commercial application imports it.

## What to check after applying

- `/` loads with no request whose path contains `/lab/`.
- `/lab/` boots, and `/lab/#/memory` boots directly from a cold load.
- `/lab/fonts/rajdhani-700.woff2` and `/lab/brand/char-fixer.avif` return 200.
- `/sitemap.xml` still returns the sitemap, not the Lab shell.
- A deliberately broken `/lab/` (rename the directory) leaves `/` working.
