# QA DRIVERS — PHASE 8.10

Nine scripts that each prove one contract this product has committed to. They
are kept because they were expensive to write and cheap to re-run: every one of
them found something, and several of them describe behaviour that has no other
executable record.

## What these files are

Each file is **one bare `async (page) => { … }` expression**. They are not
standalone Node programs and `node scripts/qa/x.js` will not run them. They are
driver snippets for a Playwright page handle, fed to the Playwright MCP server's
`browser_run_code_unsafe` tool via its `filename` argument.

Two constraints follow from that, and breaking either produces a confusing
parse error rather than a useful one:

- the file contains exactly one expression, with **no trailing semicolon** and
  no `import` / `export`;
- the path must sit inside this repository.

## Running them

Start the dev server through the project's own launcher (never `npm run dev`
from a tool shell — see CLAUDE.md), then point the driver at it:

```bash
npm run dev
```

Each script assumes `http://localhost:5173` and opens its own browser context
per case, so storage starts empty and is discarded afterwards. Nothing here
writes to the repository.

## The nine

| Script | What it proves |
|---|---|
| `storage-failure-matrix-a.js` | A future schema version in the **index** is refused by name, and the stored bytes are left untouched. A future version in a **project body** is refused without touching its neighbours. A corrupt (truncated, non-JSON) index is survived and the bodies behind it are recovered. |
| `storage-failure-matrix-b.js` | An index row with **no body** reports honestly and keeps the row. A **duplicate project id** is resolved out loud, newest wins, and the file on disk is not rewritten. **localStorage refused** and **IndexedDB absent** both leave a working Lab that never claims a save. |
| `storage-refusal-retest.js` | The regression guard for the worst defect this phase found: with a version-99 index present, making a project, asking to save and starting a new one must leave the stored bytes **byte-identical**, including fields this build has never heard of. |
| `multi-tab-contract.js` | Two real tabs on one origin. Last write wins; both tabs are told by name when the other moves; deleting a project the other tab has open tells that tab it can save it back — and it can. |
| `project-operations.js` | NEW PROJECT does not mutate the previous one and does not claim a save. RESUME restores the older project intact. The four destructive operations stay four, each with its own second wording. |
| `mode-lifecycle.js` | Re-entering the reality already open does **not** restart it (the watchdog defect). Enter → exit → re-enter → Escape leaves RAF subscribers, canvases, videos and mode hosts at zero. |
| `flows-acceptance.js` | Flows B, C and D end to end, including the reload in the middle, driven through each product's real controls. |
| `export-inspection.js` | Flow C, plus the project export **read back as a document** — every section, the per-artifact limits line, and the absence of any cloud or fabricated-proof wording. |
| `viewport-accessibility.js` | Flow D, then overflow and target sizes measured at 1920×1080, 1440×900, 768×1024 and 390×844, then reduced motion. |

## Reading the results

They return data, not assertions. That is deliberate: a script that returns
`{pass: true}` hides the one number somebody needs six months later. Two habits
matter when reading them:

- **`!! MODE NOT LOADED (void)`** means the dev server died mid-run. Every probe
  will look clean when nothing is on screen, so each script checks for
  `.modehost__chrome` before believing its own output.
- A control measured between **24 and 32 px** clears WCAG 2.5.8 AA and fails
  this project's own 32 px baseline. Those are reported, not silently passed —
  see the known-limitations section of `docs/PHASE_8_10_PROJECT_MEMORY.md`.
