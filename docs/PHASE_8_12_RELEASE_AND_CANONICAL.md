# PHASE 8.12C — THE RELEASE CONTRACT, AND THE CANONICAL RE-READ

Two pieces of work that had to happen in this order. First: say what `PRODUCT`
and `STANDALONE` mean here, precisely enough that the answer can be computed
rather than argued. Second: reconcile the Lab's checked-in Agency snapshot with
the repository that is actually canonical now, without copying a website into a
laboratory and without relabelling any history.

Neither is a redesign. Both are about being able to trust what the product says.

---

## 1. WHAT WAS VERIFIED BEFORE ANYTHING CHANGED

| | |
|---|---|
| Repository | `Anzy1512/hi-anzy-experience-lab` |
| Branch / HEAD at start | `phase-8-12-independence` @ `0a79619`, clean |
| `tsc -b --noEmit` | 0 |
| `eslint . --max-warnings 0` | 0 |
| Production build | passes |
| Boot payload | 351,356 B raw · 118,750 B gzip · CSS 42,588 B · 4 modulepreloads |
| Dependencies | 5 runtime + 13 build → 173 packages |
| Registry + maturity guards | silent |
| Canonical sync at start | **DRIFT (exit 2)** — 3 of 4 sources |

The canonical clone was identified by its own remote before it was read, and
`origin/main` was confirmed against the server with `git ls-remote` rather than
trusted from a local fetch. **No write of any kind was made to either commercial
repository** — only `git show`, `rev-parse`, `ls-remote`, `log`, `ls-tree` and
`grep`. Both were verified unchanged afterwards.

---

## 2. THE RELEASE CONTRACT

It lives in `src/system/release.ts`, which extends `maturity.ts` the way
`maturity.ts` extends `registry.ts`: same ids, no duplicated field, no second
maturity model, no new dimension. It classifies the existing eighteen and makes
the classification executable.

### 2.1 The three weights

**RELEASE_BLOCKING — nine dimensions every product owes, always.**

`INPUT` · `TRANSFORMATION` · `OUTPUT` · `LIMITATIONS` · `ERROR_STATES` ·
`LIFECYCLE` · `ACCESSIBILITY` · `RESPONSIVE` · `PRIVACY`

`OPEN` or `UNVERIFIED` on any of these is a release blocker with no appeal.
They are the dimensions on which "it works" and "it is honest" are decided, and
none of them is negotiable against a deadline.

**CONDITIONAL — eight dimensions owed only when the product's own declarations
invoke them.**

`ARTIFACT` · `EXPORT` · `CONTINUE` · `PERSISTENCE` · `RESUME` ·
`STATE_ISOLATION` · `PERFORMANCE` · `DEPENDENCY_ISOLATION`

Where invoked they block exactly as hard as the first nine. What invokes them is
never a judgement made here — it is read from the product's own declarations:

| Dimension | Invoked by |
|---|---|
| `ARTIFACT`, `EXPORT` | `registry.contract.artifact !== null` |
| `CONTINUE` | `registry.contract.continue !== null` |
| `PERSISTENCE`, `RESUME`, `STATE_ISOLATION` | `manifest.persistence === 'PROJECT'` |
| `PERFORMANCE` | everything that is not itself the measuring instrument |
| `DEPENDENCY_ISOLATION` | every product and instrument |

**INFORMATIONAL — one dimension, worth knowing and never blocking for PRODUCT.**

`DEPLOYABILITY`. Inside the Lab a product ships when the Lab ships. Requiring a
separate build target before something may be called finished would make
`PRODUCT` unreachable for a reason with nothing to do with whether the product
works. It is blocking for `STANDALONE`, where it is the entire question.

### 2.2 What a PASS requires

Each dimension carries its evidence sentence in `RELEASE_CONTRACT`. The
non-obvious ones:

- **`ERROR_STATES`** — not "it has a try/catch". Somebody drove it into the
  failure and read what it said.
- **`PRIVACY`** — verified by instrumenting the API, not by reading the source.
- **`LIMITATIONS`** — stated where the result is, not in a document elsewhere.
- **`PERFORMANCE`** — *evidence sufficient for the product's actual workload.*
  A reality that holds a WebGL surface for as long as it is open owes a
  real-hardware reading via `window.__labPerf.record()`. This environment drives
  rAF at roughly 2fps and nothing measured here is a benchmark, so the lifecycle
  evidence cannot stand in. A reality whose workload is text and DOM owes the
  lifecycle evidence instead: no loop outlives the mode, no work continues while
  nothing is on screen. Which realities hold a WebGL surface is recorded in
  `WEBGL_SURFACE`, each entry naming the file that mounts it.

### 2.3 When `N/A` is legitimate, and when it is not

`N/A` is legitimate **only when it is traceable to a declaration** — a `null` in
the registry contract, or `persistence: 'NONE' | 'SESSION'` in the manifest.

`N/A` recorded against a dimension the product's own declarations invoke is
treated as a blocker, not as an exemption. That is the single way this model
could have been quietly defeated, and it would have looked tidy while it
happened, so a dev-time guard in `release.ts` fails on it.

**It caught one on its first run.** X-Ray declared `persistence: 'PROJECT'` and
recorded `RESUME: 'N/A'`. X-Ray imports `getArtifact`, `claim` and `offered` —
three reads and no write; nothing of its own survives the visitor leaving. Its
persistence is now `NONE`, and `PERSISTENCE` / `RESUME` / `STATE_ISOLATION` are
legitimately `N/A`. Its one real gap, that the specimen report cannot reach the
project, is `CONTINUE: OPEN` and is now recorded once instead of three times.

### 2.4 When `UNVERIFIED` and `OPEN` prevent PRODUCT

- `OPEN` on any blocking or invoked dimension → **not PRODUCT.**
- `UNVERIFIED` on any blocking or invoked dimension → **not PRODUCT.**

`UNVERIFIED` is not a softer `PASS`. PRODUCT means demonstrated, and a mechanism
nobody has run is the exact thing this Lab refuses to count as working. That
rule is what keeps Portal at ALPHA with its artifact path written but unproven.

---

## 3. THE STANDALONE CONTRACT

`STANDALONE` is `PRODUCT` plus eight conditions. PRODUCT asks whether the thing
works; STANDALONE asks whether it could be lifted out and still be the same
thing somewhere else.

| | Condition | State across the Lab |
|---|---|---|
| S1 | No sibling implementation import | met by 15 of 16 — Presence is the exception |
| S2 | Shared-platform contract declared: every layer it consumes travels or is named as replaced | met by all 16 (Phase 8.12B) |
| S3 | Product-owned runtime dependencies identified | met by all 16 — `ownedDependencies()` |
| S4 | An independent route / entry point | **open for all** (§11) |
| S5 | An independent build target that has produced a bundle | **open for all** (§11–§14) |
| S6 | State and artifact portability defined | **open for all** |
| S7 | Isolation verified — the extracted bundle carries no Lab-only code, and the Lab's bundle does not grow | **open for all** (§14) |
| S8 | A deployment executed once | **open for all** (§12) |

`PERFORMANCE` is blocking for STANDALONE regardless of workload: a standalone
build is a different bundle on unknown hardware, so the workload argument that
excuses a DOM-only product inside the Lab does not survive extraction.

**`gsap` belongs to no product.** `app/App.tsx` registers the easing vocabulary
and no mode imports `motion/` directly, so it is a shell dependency every
reality inherits and none of them owns. Only the WebGL realities own anything:
`three` and `@react-three/fiber`.

---

## 4. THE CONTRACT APPLIED

Computed by `releaseTable()`, not asserted here. Experiences are excluded: an
experience owes no contract and is not measured against one.

| Reality | Layer | Maturity | Blockers |
|---|---|---|---|
| Agency Simulator | PRODUCT | BETA | `PERFORMANCE: UNVERIFIED` |
| Matter Engine | PRODUCT | BETA | `PERFORMANCE: UNVERIFIED` |
| Director | PRODUCT | BETA | `PERFORMANCE: UNVERIFIED` |
| Performance | INSTRUMENT | ALPHA | `CONTINUE: OPEN` |
| X-Ray | INSTRUMENT | ALPHA | `CONTINUE: OPEN` · `PERFORMANCE: UNVERIFIED` |
| Anzy.OS | PRODUCT | BETA | `PERFORMANCE: UNVERIFIED` · `STATE_ISOLATION: OPEN` |
| Reality Compiler | PRODUCT | BETA | `ERROR_STATES: UNVERIFIED` · `PERFORMANCE: UNVERIFIED` |
| Presence | INSTRUMENT | ALPHA | `PERFORMANCE: UNVERIFIED` · `DEPENDENCY_ISOLATION: OPEN` |
| Portal | PRODUCT | ALPHA | seven `UNVERIFIED` — its artifact path has never been run |

**Nothing meets PRODUCT. Nothing meets STANDALONE.** No maturity was changed to
make progress look better, and none of these was moved up by this phase.

### Strongest PRODUCT candidate

**Agency Simulator, Matter Engine and Director are tied at one blocker each**,
and it is the same blocker: `PERFORMANCE: UNVERIFIED`.

Of the three, **Agency Simulator is closest in practice**, because its single
blocker is the cheapest to close. Its workload is text and DOM — no WebGL
surface — so under §2.2 the evidence it owes is the lifecycle evidence, which
already exists in a form nobody has yet recorded against the dimension. Matter
Engine's is a real-hardware reading on a machine that is not headless. Director
runs an 84s film against `performance.now()` and owes the same.

### Strongest STANDALONE candidate

**Agency Simulator**, and this phase verified it rather than inheriting the
claim from 8.12B:

- **no sibling imports** — confirmed by the parsed dependency graph, which finds
  exactly one sibling coupling in the whole Lab and it is not this one;
- **no WebGL** — `ownedDependencies('agency-simulator')` is empty, so it carries
  neither `three` nor `@react-three/fiber`;
- **its reading is a pure function** of a sentence plus five choices;
- the platform it consumes is the smallest of any product: `RUNTIME`,
  `LIFECYCLE`, `SHELL`, `PROJECT`, `ARTIFACT`, `HANDOFF`, `BRAND`.

Its extraction cost is the `BRAND` snapshot, which has to travel because its
whole output is a mapping onto the canonical taxonomy. That is a file, not an
architecture.

**Not extracted.** S4–S8 are open for everything, and they are §11–§14.

---

## 5. THE CANONICAL RE-READ

### 5.1 Where truth lives now

| Role | Repository | Commit read |
|---|---|---|
| **Agency — canonical** | `Anzy1512/hi-anzy-website-2.0` | `020837893c0af5e7f2e5cda72734b430c955cd37` (`0208378`, 2026-09-23) |
| Previous commercial site — **legacy** | `Anzy1512/hi-anzy-platform` | `eac2282` (2026-09-01), where the snapshot came from |
| Lab | `Anzy1512/hi-anzy-experience-lab` | this repository |

The two commercial repositories have **unrelated histories**: `eac2282` does not
exist in `hi-anzy-website-2.0`. Every comparison below is by content, not by git.

Legacy provenance is retained rather than overwritten:
`PREVIOUSLY_MIRRORED_FROM` in `scripts/canonical-source.mjs` and
`CANONICAL_SOURCE.previously` in `src/content/canonical.ts` both keep
`hi-anzy-platform @ eac2282`, and `provenanceLine()` prints it.

### 5.2 Source comparison

| Source | Lines changed | Verdict |
|---|---|---|
| `frontend/src/data/content.js` | 314 | **DRIFT — adopted where the Lab mirrors it** |
| `frontend/src/data/disciplines.js` | 0 | identical |
| `frontend/src/App.js` | 78 | **DRIFT — route table identical; nothing to adopt** |
| `frontend/src/App.css` | 213 | **DRIFT — brand tokens identical; nothing to adopt** |
| `frontend/src/components/SystemDiagnostic.js` | 0 | identical — byte-for-byte |
| `frontend/src/data/site.js` | new file | **excluded** |

Export-level comparison of `content.js`, parsed rather than eyeballed:

| Export | Result |
|---|---|
| `METHOD_STAGES` | labels and durations **unchanged**; `title`, `page`, `outputs` rewritten on all five |
| `CATEGORIES` | `num`, `slug`, `label`, `title`, `methodStage`, `typical`, `capabilities` **unchanged**; `copy` rewritten on all six |
| `TRUST_PRINCIPLES` | all nine `detail` paragraphs rewritten; names unchanged |
| `INSIGHT_CATEGORIES` | gained a sixth, *Media & Creators* |
| `ORBIT_CATEGORIES` | one `copy` field changed, which the Lab does not mirror |
| `INSIGHT_TOPICS` | **new export** |
| `WHY_HOW_NOW`, `SOMETHINGS_OFF`, `AUDIENCES`, `DIAGNOSTIC_AREAS`, `DIAGNOSTIC_OUTCOMES`, `NETWORK_CATEGORIES_HOME`, `NETWORK_SUBCATS` | unchanged |

**AUDIT → ARCHITECT → BUILD → CONNECT → SCALE is intact** and was never at risk:
the labels did not move.

---

## 6. WHAT WAS ADOPTED

### Content — ADOPT

- **`METHOD`** — all five stages' `title`, `page` and `outputs`. Read by
  nineteen modules: the Compiler's spatial surface, the OS terminal, Director,
  Memory, Time Machine's seven eras, Chaos, After Dark, the Simulator's system
  map and X-Ray.
- **`SERVICES[].copy`** — all six lines.

The canonical voice has shifted from the aphoristic ("Going viral is a lovely
feeling and a poor business model") to the plain ("Help the right people
discover your offer, take the next step and return"). That is the company's
decision about its own words, and the Lab mirrors it rather than preferring the
version it liked.

### Content — TRANSFORM

- **`PRINCIPLES`** — five of canonical's nine, one line each, because a terminal
  cannot print nine paragraphs. The transform is now declared, and two of the
  five names were corrected: `Labelled credit` and `Measured outcome` are not
  principle names in any version of the source. The first was lifted from the
  CONNECT stage's outputs and the second was a paraphrase of `Measurable goals`,
  both printed under a heading reading *HOW THE COMPANY SAYS IT WORKS*. They are
  now `Transparent scope` and `Measurable goals`, with the shorts derived from
  the current canonical detail.

---

## 7. WHAT WAS REFUSED, AND WHY

### Route changes — none adopted

`App.js` drifted by 78 lines and its route table is **identical**: 24 paths,
none added, none removed. The drift is a `RouteErrorBoundary`, a `SiteBackdrop`
and re-indentation — Agency layout implementation the Lab does not have and does
not want. Nothing crossed.

### Design tokens — none adopted, none transformed

`App.css` drifted by 213 lines and **every brand fact is unchanged**:

- all 25 CSS custom properties identical, including `--orange-on-paper:
  #844B0A`, `--orange-on-dark: #FFA94D`, `--signal-on-paper: #A8351A`,
  `--signal-on-dark: #FF7A52`, `--nav-fg: #232A2A` / `#F7F5EE`;
- every `font-family` declaration identical, including the role assignment
  `--font-system: Rajdhani`, `--font-editorial: Newsreader`;
- the six new colour literals belong to `.story-mini-object` — a decorative
  isometric cube on the Agency's own grid.

The Lab's `design-system/tokens.css` already carries those exact values with
canonical named in the comments. **Nothing needed to change, and nothing did.**

`--font-pun: "Amaranth"` remains deliberately not inherited: the Lab has three
voices and the fourth is banned by its own rules.

### `frontend/src/data/site.js` — excluded

A new canonical export carrying a real email address and a real phone number.
The Lab has never published contact details and is not the surface for them.

### `INSIGHT_TOPICS` — read, not mirrored

A new eight-entry taxonomy. Nothing in the Lab reads it, and a mirrored export
with no reader is the dead weight this project already refuses elsewhere.

---

## 8. THREE THINGS THE COMPARISON FOUND WRONG IN THE LAB

None of these was caused by canonical moving. All three were mirrors that had
never been right, and all three survived because **nothing read them** — which
is precisely how they stayed unchecked through two phases of sync checking.

### `POSITION.statement` — an attribution that was not true

`canonical.ts` labelled *"One company. Multiple realities."* as "the company's
own positioning line, as the site states it", and `system/brief.ts` printed it
into every exported brief as **"Hi Anzy's own statement of itself"**.

Searched at `0208378` (canonical source), at `eac2282` (legacy source), and in
`docs/HI_ANZY_DECK_CONTENT.md`. **It appears in none of them.** The only
occurrence anywhere in the Agency repository is inside `frontend/lab/`, which is
a built copy of this product — the Lab reading its own output back and taking it
for a source.

The sentence is good and it stays. The attribution does not. `brief.ts` now says
it is the Experience Lab's own line about the company, which is the truth and
also the right sentence for a section headed WHAT THIS IS NOT.

### `POSITION.questions` — a reduction that reduced nothing

Claimed to be `WHY_HOW_NOW` "reduced to its three questions". Two of the three
were never that export's questions in any version: canonical asks *"What needs
to exist for that change to happen?"* and *"What deserves to happen first?"*.
No consumer. Removed.

### `INSIGHT_CATEGORIES` — five invented values

Held `['Strategy', 'Design', 'Technology', 'Culture', 'Operations']` under a
comment calling it "the knowledge taxonomy". Canonical's taxonomy is named
categories with blurbs — *Business, Unpacked* · *Brand, Decoded* · *Tech,
Without Theatre* · *Growth, With Receipts* · *Things We Noticed* — and six as of
`0208378`. The Lab's five matched neither version at either commit. No consumer.
Removed, and the manifest now records the source as `EXCLUDED` with the reason.

### And one mirror that was correct but dead

`SIGNALS` mirrored `SOMETHINGS_OFF` byte-exactly, under a comment saying *"The
Agency Simulator opens on one of these because that is the real starting
condition: not a brief, a feeling."* The Simulator opens on a free statement and
five constraint questions, and nothing in `src/` ever imported `SIGNALS`. The
values are unchanged in canonical between `eac2282` and `0208378`, so
re-mirroring them is a copy-and-paste on the day something reads them. Removed,
recorded as `EXCLUDED` with that reason.

### And one surface that had become ambiguous

Time Machine printed *"This is the company's own history"* over a record
captured from `hi-anzy-platform`. That was true when there was one commercial
repository. It now names the repository and says plainly that
`hi-anzy-website-2.0` has not been read into the record.

---

## 9. LAB-OWNED vs AGENCY-INHERITED

| Agency defines | Lab defines |
|---|---|
| the method and its five stages | how a method is rendered in space |
| the service and discipline taxonomy | the spatial system, the 3D system |
| positioning, terminology | material behaviour, transitions, cinematic systems |
| typography roles and colour tokens | experimental typographic composition |
| route and page structure, for provenance | every reality's own design |

Explicitly Lab-owned, now marked as such in the source so the mistake in §8 is
not repeated:

- `POSITION.statement` — the Lab's line about the company;
- `eras.SOURCE.blurb` — the Lab's description of the company, consistent with
  canonical and quoted from none of it;
- the abridged `PRINCIPLES` one-liners;
- every `SERVICES[].capabilities` list, which was already a Lab abridgement of
  the canonical capability sets rather than a mirror of them.

---

## 10. VERIFICATION

### Gates

`tsc -b --noEmit` 0 · `eslint .` 0 · production build passes.

### Behaviour

| Check | Result |
|---|---|
| `[registry]` / `[maturity]` / `[release]` guards | **all three silent** |
| All 16 realities enter | phase `active`, chrome present, overflow 0 |
| Same-reality navigation | stays `active`, watchdog silent |
| Lifecycle, ×2 cycles on three modes | hosts 0, videos 0, mode canvases 0 |
| Orientation sheet | opens on all four checked, Escape closes it and leaves the mode active |
| Flow B — Compiler → X-Ray | artifact recorded with limits, `HANDOFF_OFFERED,HANDOFF_ACCEPTED`, X-Ray opens on the same page, survives reload as `PROJECT_RESUMED` |
| Flow C — Matter | recipe artifact with limits, `HANDOFF_OFFERED` via `SEND TO ANZY.OS` |
| Flow D — shell → project → export | statement verbatim, resumed, export valid |
| Page / console errors | zero, everywhere |

**One alarming reading, disproved.** A Presence exit left one canvas on the page
while `hosts` was 0. Its DOM path is
`MAIN.index > SECTION.index__graph > DIV.index__lattice > CANVAS` — the Reality
Index's own lattice, not Presence's. Presence's `DIV.pr-canvas` was gone. Matter
read 0 in the same probe only because the lattice had not mounted yet.

### Visual, at four viewports

1440×900 and 390×844 across the Reality Index, Anzy.OS, Agency Simulator,
Reality Compiler, Matter Engine, Director, Portal, X-Ray and Time Machine;
1920×1080 and 768×1024 targeted at the four surfaces the re-synced copy is
rendered on.

- horizontal overflow **0 px at every viewport on every surface**;
- **no stale string anywhere** — the replaced service copy, the replaced method
  titles and the two invented principle names are gone from the rendered text;
- all six new service lines render in Time Machine's Services view, unclipped;
- the OS terminal prints the corrected principles in its fixed-width column and
  all five method stages with the new titles;
- PERFORMANCE prints `CANONICAL SOURCE 0208378`, no `eac2282`, with its coverage
  counts unchanged at 117 surfaces.

### Accessibility, interaction floor, reduced motion

At 1920, 1440, 768 and 390, over seven surfaces: **zero targets below 24px,
zero between 24 and 32px**, no horizontal scroll. Every project-surface control
measures exactly 32px at every viewport. Under `prefers-reduced-motion: reduce`
the panel, its eight sections and all information are present with **0 elements
animating**, and Escape still leaves to the index with 0 mode hosts.

### Export

Two runs over identical inputs produce files of identical length whose only
differing lines are the six that are per-run by design: `STARTED`,
`LAST CHANGED`, `PROJECT ID`, two history timestamps and `EXPORTED`. Nothing
else differs. The 8.12B byte baseline no longer applies — the footer carries a
different commit and the body carries re-synced copy — so determinism replaces
equality as the check, which is what it should always have been.

### Bundle

| | Before | After | Δ |
|---|---|---|---|
| Boot, 5 files, raw | 351,356 B | 351,356 B | **0** |
| Boot, gzip | 118,750 B | 118,743 B | −7 |
| CSS raw | 42,588 B | 42,588 B | 0 |
| modulepreloads | 4 | 4 | 0 |
| Chunks | 38 | 38 | 0 |
| Dependencies | 5 + 13 | 5 + 13 | 0 |

The entry chunk lost bytes to the deleted exports and the `lab` chunk gained
them from the longer canonical copy; the two offset. Invariants hold:
`three`/R3F unreachable from the boot graph, the document composer in its own
6,890 B chunk and absent from the entry chunk, and **`release.ts` — like
`maturity.ts` — present in no production chunk at all.**

### Canonical sync

```
CANONICAL REPO      Anzy1512/hi-anzy-website-2.0
ORIGIN/MAIN         020837893c0af5e7f2e5cda72734b430c955cd37
SYNCED AGAINST      020837893c0af5e7f2e5cda72734b430c955cd37

frontend/src/data/content.js              MIRROR      CURRENT
frontend/src/data/disciplines.js          MIRROR      CURRENT
frontend/src/App.js                       REFERENCE   CURRENT
frontend/src/App.css                      TRANSFORM   CURRENT

STATUS             CURRENT — every mirrored source matches origin/main.     exit 0
```

The check was **not weakened**. Pointed at the legacy clone it still identifies
it by name and reports DRIFT, which is now the correct answer in that direction.
What a green row means per treatment is written into the script: `MIRROR` means
the values are these values, `REFERENCE` and `TRANSFORM` mean *read and
reconciled at this commit*, not copied.

---

## 11. KNOWN LIMITATIONS

1. **`PERFORMANCE` is `UNVERIFIED` across the Lab** and is the single blocker
   standing between three products and PRODUCT. It needs a person on real
   hardware running `window.__labPerf.record()`. Nothing in this environment can
   close it, and no number from here will be invented to try.
2. **Presence's camera has never been tested on physical hardware.** The
   contract is verified in software with `getUserMedia` instrumented; that is
   not the same claim and is not recorded as one.
3. **The Agency deployment disables the camera for the Lab.** `customHttp.yml`
   applies `Permissions-Policy: camera=(), microphone=(), geolocation=()` to
   `**/*`, and `vercel.json` copies `frontend/lab` to `build/lab` — so the Lab
   as served today is under a policy that blocks Presence's camera path
   entirely. Whether Presence reports that particular refusal honestly among its
   nine camera states **has not been verified**. It is written down rather than
   assumed either way.
4. **One sibling coupling remains**: `presence → matter/ParticleField`, retained
   deliberately with its removal path recorded.
5. **Portal has seven `UNVERIFIED` dimensions** because its artifact path has
   never been run once.
6. **X-Ray and Performance both have `CONTINUE: OPEN`** — each needs one
   artifact-bar handoff, which is product work rather than architecture work.
7. **`canonicalEras.ts` still records the legacy repository's history.** It is
   now named on screen, and re-capturing it from `hi-anzy-website-2.0` is a
   separate decision because it changes what Time Machine displays.
8. **No reality has an independent build, route or deployment.** S4–S8 are open
   for all sixteen.

---

## 12. WHAT REMAINS — §11 TO §14

| § | Work |
|---|---|
| **§11** | Restructure the launcher around Products / Instruments / Experiences. The taxonomy, the families and the index groups all exist; the launcher does not yet express them. |
| **§12** | Define the `lab.hianzy.com` deployment boundary. Now has a concrete prior question: the Lab is currently served as `/lab` from the Agency's own build, under the Agency's CSP and Permissions-Policy. Moving to its own origin changes what Presence can do. |
| **§13** | Define the standalone-product routing and deployment pattern — conditions S4 and S6. |
| **§14** | Verify bundle isolation and lazy loading for a real extraction candidate — conditions S5 and S7. Agency Simulator is the verified candidate. |

Not started, and not to be started without instruction.

---

## 13. VERDICT

**Phase 8.12C is CLOSED.**

The release contract exists, is executable, admits nothing to PRODUCT on today's
evidence, and caught a real inconsistency on its first run. The canonical
snapshot is genuinely reconciled against `hi-anzy-website-2.0 @ 0208378` — the
sources were read, the changes were adopted or refused with reasons, three
untrue mirrors were removed, one false attribution was corrected, and the sync
check is green because the work was done rather than because the check was
relaxed.
