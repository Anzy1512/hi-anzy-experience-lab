/*
 * PHASE 8.12C — PASS H. Visual + content regression for the canonical re-sync.
 *
 * The adopted copy is LONGER than what it replaced almost everywhere: the six
 * service lines grew by 20-30 characters each and every method title and page
 * line was rewritten. Time Machine renders both across seven era interfaces,
 * Anzy.OS prints them in a fixed-width terminal, and the Compiler puts the
 * method on a spatial surface. Compilation says nothing about any of that.
 *
 * So this asks three things per surface: does the new text appear, does the
 * page overflow, and is any element carrying that text clipped by its own box.
 */
async (page) => {
  const BASE = 'http://localhost:5173';
  const out = {};

  const NEW_COPY = [
    'Understand the constraint before choosing where to invest.',
    'Bring your story to relevant audiences through creators, media and live experiences.',
    'Connect websites, data and workflows so your team can spend less time moving information.',
  ];
  const NEW_METHOD = ['Understand what needs to change.', 'Measure, learn and improve.'];
  const GONE = [
    'Attention is useful. What happens after attention pays the bills.',
    'Turn the mess into a map.',
    'Labelled credit',
    'Measured outcome',
  ];

  const fresh = async (w, h) => {
    const ctx = await page.context().browser().newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    const cons = [];
    p.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 180)); });
    return { ctx, p, errs, cons };
  };

  /* Anything whose own content is wider or taller than its box, restricted to
     elements that actually carry text, so a canvas or a masked rule does not
     register as a clip. */
  const clipped = () => [...document.querySelectorAll('body *')]
    .filter((el) => {
      const t = (el.textContent || '').trim();
      if (!t || t.length < 12) return false;
      if (el.children.length > 2) return false;
      const s = getComputedStyle(el);
      if (s.overflow === 'visible' && s.overflowX === 'visible' && s.overflowY === 'visible') return false;
      if (s.textOverflow === 'ellipsis') return false;
      return el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2;
    })
    .slice(0, 6)
    .map((el) => (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName)
      + ' :: ' + (el.textContent || '').trim().slice(0, 70));

  const survey = async (p) => p.evaluate((args) => {
    const body = document.body.innerText;
    return {
      overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      newCopySeen: args.newCopy.filter((s) => body.indexOf(s) > -1),
      newMethodSeen: args.newMethod.filter((s) => body.indexOf(s) > -1),
      staleSeen: args.gone.filter((s) => body.indexOf(s) > -1),
      clipped: (0, eval)('(' + args.clippedSrc + ')')(),
    };
  }, { newCopy: NEW_COPY, newMethod: NEW_METHOD, gone: GONE, clippedSrc: clipped.toString() });

  const SURFACES = [
    ['index', '#index'],
    ['anzy-os', '#/anzy-os'],
    ['agency-simulator', '#/agency-simulator'],
    ['reality-compiler', '#/reality-compiler'],
    ['matter-engine', '#/matter-engine'],
    ['director', '#/director'],
    ['portal', '#/portal'],
    ['x-ray', '#/x-ray'],
    ['time-machine', '#/time-machine'],
  ];

  for (const [w, h, tag] of [[1440, 900, 'w1440'], [390, 844, 'w390'], [1920, 1080, 'w1920'], [768, 1024, 'w768']]) {
    const { ctx, p, errs, cons } = await fresh(w, h);
    const rows = {};
    /* 1920 and 768 are targeted: only the surfaces the re-synced copy is
       actually rendered on, per the brief's "any changed responsive surface". */
    const list = (tag === 'w1920' || tag === 'w768')
      ? SURFACES.filter(([id]) => ['anzy-os', 'time-machine', 'agency-simulator', 'reality-compiler'].indexOf(id) > -1)
      : SURFACES;
    for (const [id, hash] of list) {
      await p.goto(BASE + '/' + hash);
      await p.waitForTimeout(id === 'index' ? 2600 : 3400);
      rows[id] = await survey(p);
    }
    out[tag] = { rows, pageErrors: errs, consoleErrors: cons };
    await ctx.close();
  }

  /* ---- The OS terminal, which prints the corrected principles --------- */
  {
    const { ctx, p, errs } = await fresh(1440, 900);
    await p.goto(BASE + '/#/anzy-os');
    await p.waitForTimeout(3600);
    const type = async (cmd) => {
      const input = p.locator('input, [contenteditable="true"]').first();
      await input.click();
      await input.fill('');
      await p.keyboard.type(cmd);
      await p.keyboard.press('Enter');
      await p.waitForTimeout(900);
      return p.evaluate(() => document.body.innerText.slice(-1400));
    };
    out.osTerminal = {
      principles: await type('principles'),
      method: await type('method'),
    };
    out.osTerminal.pageErrors = errs;
    await ctx.close();
  }

  /* ---- PERFORMANCE prints the canonical commit and the coverage counts - */
  {
    const { ctx, p, errs } = await fresh(1440, 900);
    await p.goto(BASE + '/#/performance');
    await p.waitForTimeout(4200);
    out.performance = await p.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/CANONICAL[\s\S]{0,120}/);
      const c = t.match(/[0-9]+\s*ROUTES[\s\S]{0,90}/);
      return {
        canonicalLine: m ? m[0].replace(/\n+/g, ' | ').slice(0, 160) : null,
        coverageLine: c ? c[0].replace(/\n+/g, ' | ').slice(0, 160) : null,
        mentions0208378: t.indexOf('0208378') > -1,
        mentionsEac2282: t.indexOf('eac2282') > -1,
      };
    });
    out.performance.pageErrors = errs;
    await ctx.close();
  }

  return out;
}
