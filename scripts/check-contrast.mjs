#!/usr/bin/env node
/**
 * CONTRAST AUDIT — development only. No runtime dependency, no build step.
 *
 *   node scripts/check-contrast.mjs          fail the run if any AA pair fails
 *   node scripts/check-contrast.mjs --all    print every pair, passing included
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Phase 6 shipped a `--figure-faint` at 4.29:1 and nobody noticed until a human
 * squinted at a tagline. Phase 8.6 E adds forty-odd semantic colour tokens
 * across three materials, which is roughly a hundred and fifty new pairs — far
 * past the point where reading them off a screen is a control.
 *
 * So the tokens are parsed out of the stylesheet itself rather than restated
 * here. A pair that is renamed or re-pointed is re-measured on the next run; a
 * table of expected values copied into this file would agree with the design
 * system exactly until the first edit, which is the failure mode of every
 * hand-maintained audit.
 *
 * ── WHAT COUNTS AS A FAILURE ────────────────────────────────────────────────
 *
 * Only INFORMATION-BEARING pairs. A rule, a wash and a screen dot are not text
 * and are not held to a text ratio — they are listed under DECORATIVE with
 * their measured value so the number is on the record, and they do not fail the
 * run. Everything a visitor has to READ is checked at AA: 4.5:1 for normal
 * text, 3:1 for large text (>=24px, or >=18.66px bold) and for UI boundaries
 * that carry state.
 */
import { readFileSync } from 'node:fs';

const ALL = process.argv.includes('--all');
const SRC = 'src/design-system/tokens.css';
const css = readFileSync(SRC, 'utf8');

/* -------------------------------------------------------------------------- */
/* PARSE — pull each material's declared block out of the real stylesheet      */
/* -------------------------------------------------------------------------- */

/**
 * Strip comments first: they contain hex values that are prose, not tokens.
 * Line endings are normalised to \n too — this checkout is CRLF, and a literal
 * multi-line selector below would otherwise fail to match a \r\n it was never
 * written to expect.
 */
const bare = css.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Collect `--name: value;` pairs from the block that follows a selector.
 * Brace-counting rather than a lazy `[^}]*` match, so a nested rule inside a
 * block cannot truncate it silently.
 */
function block(selector, from = 0) {
  const at = bare.indexOf(selector, from);
  if (at < 0) throw new Error(`selector not found in ${SRC}: ${selector}`);
  let i = bare.indexOf('{', at);
  let depth = 0;
  const start = i + 1;
  for (; i < bare.length; i++) {
    if (bare[i] === '{') depth++;
    else if (bare[i] === '}' && --depth === 0) break;
  }
  const body = bare.slice(start, i);
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/* Two separate :root rules exist and both matter: the first declares the raw
   palette (--c-*), the second the paper material's semantic layer. Merging in
   document order is what the cascade does, so it is what this does. */
const palette = block(':root');
const paperBlock = block(':root,\n[data-material=\'paper\']');
const inkBlock = block('[data-material=\'ink\']');
const bpBlock = block('[data-material=\'blueprint\']');

const PAPER = { ...palette, ...paperBlock };
const INK = { ...PAPER, ...inkBlock };
const BLUEPRINT = { ...PAPER, ...bpBlock };

/* -------------------------------------------------------------------------- */
/* RESOLVE + COLOUR MATHS                                                      */
/* -------------------------------------------------------------------------- */

/** Follow var() chains inside one material's scope. */
function resolve(scope, value, seen = 0) {
  if (seen > 24) throw new Error(`var() cycle at ${value}`);
  const v = String(value).trim();
  const m = /^var\((--[a-z0-9-]+)\)$/i.exec(v);
  if (m) {
    const next = scope[m[1]];
    if (next === undefined) throw new Error(`undefined token ${m[1]}`);
    return resolve(scope, next, seen + 1);
  }
  return v;
}

function parse(c) {
  let s = String(c).trim();
  if (s.startsWith('#')) {
    if (s.length === 4) s = '#' + [...s.slice(1)].map((ch) => ch + ch).join('');
    return [
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
      1,
    ];
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  if (s === 'transparent') return [0, 0, 0, 0];
  throw new Error(`cannot parse colour: ${c}`);
}

/** Composite a translucent foreground over an opaque ground. */
function over(fg, bg) {
  const [r, g, b, a] = fg;
  if (a >= 1) return [r, g, b, 1];
  return [
    Math.round(r * a + bg[0] * (1 - a)),
    Math.round(g * a + bg[1] * (1 - a)),
    Math.round(b * a + bg[2] * (1 - a)),
    1,
  ];
}

function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * CIE76 ΔE, for the one question a contrast ratio cannot answer: are these two
 * colours TELLABLE APART?
 *
 * The provenance registers need that and not contrast. AA caps a readable
 * colour on the paper stock at L 0.109 and the ink sits at L 0.022, so the
 * entire readable band is 2.2:1 wide; split between five registers that is
 * 1.22:1 a step, which is nothing. Two of them therefore have to differ by hue
 * rather than by value, and a luminance ratio scores a grey and an amber of the
 * same lightness as identical when a reader would never confuse them.
 *
 * D65, the 2° observer, and CIE76 rather than CIEDE2000 — this is a floor test
 * on five deliberately chosen values, not a colour-difference engine, and the
 * simpler formula is the conservative one at these separations.
 */
function toLab([r, g, b]) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  const A = toLab(a);
  const B = toLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/* -------------------------------------------------------------------------- */
/* THE PAIRS                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `need` is the AA threshold this pair is actually held to.
 *   4.5  normal text
 *   3.0  large text (>=24px / >=18.66px bold) and stateful UI boundaries
 *   0    decorative — measured and printed, never a failure
 */
const TEXT_ON = (ground) => [
  ['--text', ground, 4.5],
  ['--text-secondary', ground, 4.5],
  ['--text-muted', ground, 4.5],
  ['--text-faint', ground, 0],
  ['--signal-text', ground, 4.5],
  ['--signal-hot-text', ground, 4.5],
  ['--signal-mid', ground, 3],
  ['--signal', ground, 0],
  ['--signal-hot', ground, 0],
  ['--registration', ground, 4.5],
  ['--focus', ground, 3],
  ['--halftone', ground, 4.5],
  ['--halftone-tone', ground, 0],
  ['--halftone-pale', ground, 0],
  ['--prov-sourced', ground, 4.5],
  ['--prov-measured', ground, 4.5],
  ['--prov-derived', ground, 4.5],
  ['--prov-unknown', ground, 4.5],
  ['--prov-recommend', ground, 4.5],
  ['--state-ok', ground, 4.5],
  ['--state-active-text', ground, 4.5],
  ['--state-warning', ground, 4.5],
  ['--state-failure', ground, 4.5],
  ['--state-unknown', ground, 4.5],
  ['--state-info', ground, 4.5],
  ['--state-inactive', ground, 4.5],
  ['--state-inactive-mark', ground, 0],
  ['--state-active', ground, 0],
  ['--rule', ground, 0],
  ['--rule-faint', ground, 0],
  ['--screen-dot', ground, 0],
];

/**
 * Each surface, and the floor the text on it is held to.
 *
 * --surface-aged is a STRUCTURE band — full-bleed, behind headings and rules,
 * which is the only way canonical uses its equivalent. It is held to 3:1, and
 * that is a real constraint rather than a waiver: canonical's own rust-on-paper
 * clears 4.5 on the stock by 0.13 and on nothing darker, so small rust text
 * belongs on the stock, the scrap and the card. Encoded here so the next person
 * to put a 10px label on the band finds out from a failing run, not from a user.
 */
const SURFACES = [
  ['--surface', 4.5],
  ['--surface-raised', 4.5],
  ['--surface-card', 4.5],
  ['--surface-aged', 3],
];

const MATERIALS = [
  ['PAPER', PAPER],
  ['INK', INK],
  ['BLUEPRINT', BLUEPRINT],
];

let failures = 0;
let checked = 0;
let decorative = 0;

for (const [name, scope] of MATERIALS) {
  console.log(`\n${'='.repeat(74)}\nMATERIAL ${name}\n${'='.repeat(74)}`);

  /* Every text register against every surface in that material's ladder. A
     token that passes on the stock and fails on a raised tile is a real bug —
     the Lab puts labels on both. */
  for (const [surfaceToken, cap] of SURFACES) {
    const groundHex = resolve(scope, scope[surfaceToken]);
    const ground = parse(groundHex);
    console.log(
      `\n  ON ${surfaceToken}  ${groundHex}${cap < 4.5 ? `   [structure band — text held to ${cap}:1]` : ''}`,
    );
    for (const [token, , baseNeed] of TEXT_ON(surfaceToken)) {
      if (scope[token] === undefined) continue;
      const need = baseNeed === 0 ? 0 : Math.min(baseNeed, cap);
      const raw = resolve(scope, scope[token]);
      const fg = over(parse(raw), ground);
      const r = ratio(fg, ground);
      const ok = need === 0 || r >= need;
      if (need === 0) decorative++;
      else {
        checked++;
        if (!ok) failures++;
      }
      const verdict = need === 0 ? 'DECORATIVE' : ok ? 'PASS' : 'FAIL';
      if (ALL || !ok || need === 0) {
        const flag = verdict === 'FAIL' ? ' <<<<<<' : '';
        console.log(
          `    ${r.toFixed(2).padStart(6)}:1  need ${String(need).padEnd(4)} ${verdict.padEnd(11)} ${token.padEnd(22)} ${raw}${flag}`,
        );
      }
    }
  }

  /* The inset panel is the opposite material and carries its own type. */
  const panel = parse(resolve(scope, scope['--panel']));
  for (const t of ['--panel-figure', '--panel-rule']) {
    const raw = resolve(scope, scope[t]);
    const r = ratio(over(parse(raw), panel), panel);
    /* --panel-rule is a divider between blocks of content, not a boundary that
       carries state, so 1.4.11 does not reach it and neither does a text ratio.
       Measured and printed; never a failure. */
    const need = t === '--panel-rule' ? 0 : 4.5;
    if (need === 0) decorative++;
    else checked++;
    const ok = need === 0 || r >= need;
    if (!ok) failures++;
    if (ALL || !ok || need === 0) {
      const verdict = need === 0 ? 'DECORATIVE' : ok ? 'PASS' : 'FAIL';
      console.log(
        `\n  ON --panel ${resolve(scope, scope['--panel'])}\n    ${r.toFixed(2).padStart(6)}:1  need ${String(need).padEnd(4)} ${verdict.padEnd(11)} ${t}  ${raw}${ok ? '' : ' <<<<<<'}`,
      );
    }
  }

  /* Type printed ON a brand fill, which is the other direction and is where a
     signal colour normally goes wrong. */
  /*
   * The rust plate is held to 3:1, not 4.5, and that is canonical's own
   * constraint rather than a concession made here: the site sets
   * --destructive-foreground to its lifted stock over --destructive, which
   * measures 3.61:1. Nothing bone-coloured and nothing ink-coloured clears 4.5
   * on #E54A25 — ink is 3.72 — because the fill is too mid-toned to carry small
   * type in either direction. So a rust fill in this Lab carries LARGE or BOLD
   * labels only, and the orange fill, which does clear 4.5 against ink, carries
   * the small ones.
   */
  for (const [txt, fill, need] of [
    ['--text-on-signal', '--signal', 4.5],
    ['--text-on-signal-hot', '--signal-hot', 3],
  ]) {
    const bg = parse(resolve(scope, scope[fill]));
    const raw = resolve(scope, scope[txt]);
    const r = ratio(over(parse(raw), bg), bg);
    checked++;
    const ok = r >= need;
    if (!ok) failures++;
    if (ALL || !ok) {
      console.log(
        `    ${r.toFixed(2).padStart(6)}:1  need ${String(need).padEnd(4)} ${ok ? 'PASS' : 'FAIL'}        ${txt} on ${fill}${ok ? '' : ' <<<<<<'}`,
      );
    }
  }

  /* PROVENANCE MUST BE DISTINGUISHABLE FROM ITS NEIGHBOURS.
     Passing contrast against the ground is not the requirement the brief set —
     "canonical source, measured DOM, derived conclusion and UNKNOWN should be
     perceptually distinguishable" is about telling them apart from EACH OTHER. */
  /*
   * WHICH PAIRS ACTUALLY HAVE TO BE TOLD APART.
   *
   * Not all ten. Two documents exist and they draw from disjoint vocabularies:
   *
   *   a brief          FACT / DERIVED / UNKNOWN / RECOMMENDATION
   *                    (system/diagnose.ts and system/brief.ts — no MEASURED)
   *   a specimen report SOURCED / MEASURED
   *                    (X-Ray — no DERIVED, no RECOMMENDATION)
   *
   * So MEASURED never shares a page with DERIVED, and holding those two to a
   * separation floor would be inventing a requirement in order to fail it. The
   * seven pairs that CAN co-occur are held to ΔE 18; the three that cannot are
   * printed with their measured distance and the reason, because a number that
   * is not a failure is still worth being able to see.
   *
   * The floor is 18 and not higher because the space genuinely is not there.
   * Measured on the paper stock: AA caps a readable value at L* 39, the ink
   * sits at L* 16, and canonical supplies exactly two chromatic accents in
   * between. Four separated registers fit. Five do not, on either material,
   * and no arrangement of the company's own colours changes that — which is
   * why the fifth is carried by voice (mono, reserved for measured values) and
   * by mark (solid, hollow, rule) rather than by hue.
   */
  const CO_OCCURS = [
    ['--prov-sourced', '--prov-derived'],
    ['--prov-sourced', '--prov-unknown'],
    ['--prov-sourced', '--prov-recommend'],
    ['--prov-derived', '--prov-unknown'],
    ['--prov-derived', '--prov-recommend'],
    ['--prov-unknown', '--prov-recommend'],
    ['--prov-sourced', '--prov-measured'],
  ];
  const APART = [
    ['--prov-measured', '--prov-derived'],
    ['--prov-measured', '--prov-unknown'],
    ['--prov-measured', '--prov-recommend'],
  ];
  const dist = (a, b) =>
    deltaE(parse(resolve(scope, scope[a])), parse(resolve(scope, scope[b])));

  console.log('\n  PROVENANCE SEPARATION — CIE76 ΔE, floor 18 for pairs that co-occur');
  let worst = { d: Infinity, a: '', b: '' };
  for (const [a, b] of CO_OCCURS) {
    const d = dist(a, b);
    if (d < worst.d) worst = { d, a, b };
    checked++;
    if (d < 18) {
      failures++;
      console.log(`    ΔE ${d.toFixed(1).padStart(5)}  FAIL   ${a} vs ${b}   <<<<<<`);
    }
  }
  console.log(
    `    closest co-occurring pair  ΔE ${worst.d.toFixed(1)}  ${worst.a} vs ${worst.b}`,
  );
  for (const [a, b] of APART) {
    console.log(
      `    ΔE ${dist(a, b).toFixed(1).padStart(5)}  NOT HELD — never on the same page   ${a} vs ${b}`,
    );
  }
}

console.log(`\n${'='.repeat(74)}`);
console.log(`CHECKED      ${checked} information-bearing pairs`);
console.log(`DECORATIVE   ${decorative} measured, not held to a text ratio`);
console.log(failures ? `FAILURES     ${failures}` : 'FAILURES     none — every information-bearing pair clears AA.');
process.exit(failures ? 1 : 0);
