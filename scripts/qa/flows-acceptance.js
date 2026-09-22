/*
 * FLOWS B, C, D — driven through each product's real controls — plus the
 * project export, this time scoped to the bar labelled THE WHOLE PROJECT
 * rather than whichever artifact bar happened to be first in the document.
 */
async (page) => {
  const BASE = 'http://localhost:5173';
  const out = [];

  const fresh = async () => {
    const ctx = await page.context().browser().newContext();
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    const warn = [];
    p.on('console', (m) => {
      if (m.type() === 'error' || /did not report ready/.test(m.text())) warn.push(m.text().slice(0, 140));
    });
    return { ctx, p, errs, warn };
  };

  const go = async (p, id, ms = 3400) => {
    await p.goto(`${BASE}/#/${id}`);
    await p.waitForTimeout(ms);
    return p.evaluate(() => !!document.querySelector('.modehost__chrome'));
  };

  const click = async (p, rx, ms = 2000) => {
    const b = p.locator('button', { hasText: rx }).first();
    if (!(await b.count())) return false;
    await b.click();
    await p.waitForTimeout(ms);
    return true;
  };

  const say = async (p, cmd, ms = 2400) => {
    const t = p.locator('.os-cmd__input').first();
    try {
      await t.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      return 'NO TERMINAL';
    }
    await t.click();
    await t.fill(cmd);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(ms);
    return 'ok';
  };

  /* An artifact bar, addressed by the label printed on it. */
  const bar = (p, label) =>
    p.locator('.artifact').filter({ has: p.locator('.artifact__label', { hasText: label }) });

  const stored = (p) =>
    p.evaluate(async () => {
      const raw = localStorage.getItem('hi-anzy-lab.projects.v1');
      if (!raw) return { NOTHING_STORED: true };
      const idx = JSON.parse(raw);
      const db = await new Promise((r) => {
        const q = indexedDB.open('hi-anzy-lab', 1);
        q.onsuccess = () => r(q.result);
        q.onerror = () => r(null);
      });
      if (!db) return { NO_DB: true };
      const rec = await new Promise((r) => {
        const q = db.transaction('projects', 'readonly').objectStore('projects').get(idx.last);
        q.onsuccess = () => r(q.result);
        q.onerror = () => r(null);
      });
      db.close();
      return {
        rows: idx.projects.length,
        statement: (rec?.statement ?? '').slice(0, 44),
        constraints: (rec?.constraints ?? []).length,
        artifacts: (rec?.artifacts ?? []).map((a) => `${a.kind}:${(a.title || '').slice(0, 28)}`),
        allHaveLimits: (rec?.artifacts ?? []).every((a) => typeof a.limits === 'string' && a.limits.length > 0),
        history: [...new Set((rec?.history ?? []).map((h) => h.kind))].join(','),
      };
    });

  /* ================= FLOW B ============================================ */
  {
    const { ctx, p, errs, warn } = await fresh();
    const step = [];
    await go(p, 'reality-compiler', 5200);
    /* Scroll until the manifest bar appears rather than a fixed count. */
    let sawManifest = false;
    for (let i = 0; i < 16 && !sawManifest; i++) {
      await p.mouse.move(640, 460);
      await p.mouse.wheel(0, 1400);
      await p.waitForTimeout(1500);
      sawManifest = (await bar(p, 'THE TRANSFORMATION MANIFEST').count()) > 0;
    }
    step.push({ at: 'B1 compiler reached manifest', sawManifest, stored: await stored(p) });

    const inspect = p.locator('button', { hasText: /INSPECT LIVE IN X-RAY/ }).first();
    const hasInspect = (await inspect.count()) > 0;
    if (hasInspect) {
      await inspect.click();
      await p.waitForTimeout(4000);
    }
    step.push({
      at: 'B2 INSPECT LIVE IN X-RAY',
      hasInspect,
      hash: p.url().split('#')[1] ?? '',
      phase: await p.evaluate(() => document.querySelector('.modehost')?.getAttribute('data-phase')),
      stored: await stored(p),
    });

    const xraySays = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
    step.push({ at: 'B3 x-ray surface', opensOn: xraySays });

    await p.reload();
    await p.waitForTimeout(3600);
    await go(p, 'anzy-os');
    await say(p, 'open system', 1800);
    step.push({
      at: 'B4 reload -> SYSTEM.app',
      kv: await p.evaluate(() => [...document.querySelectorAll('.os-prj__kv div')].map((d) => d.textContent.trim()).join(' | ')),
      stored: await stored(p),
    });
    out.push({ FLOW: 'B', step, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  /* ================= FLOW C ============================================ */
  {
    const { ctx, p, errs, warn } = await fresh();
    const step = [];
    await go(p, 'matter-engine', 4600);
    /* TYPE is the state that carries a phrase; keys 1–6 select states. */
    await p.keyboard.press('3');
    await p.waitForTimeout(1600);
    const fields = await p.evaluate(() =>
      [...document.querySelectorAll('input, textarea')].map((el) => ({
        tag: el.tagName,
        cls: el.className.slice(0, 50),
        ph: el.placeholder ?? '',
      })),
    );
    const f = p.locator('input[type="text"], textarea').first();
    let typedIt = false;
    if (await f.count()) {
      await f.click();
      await f.fill('A SYSTEM THAT HOLDS');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2600);
      typedIt = true;
    }
    const keepBar = await bar(p, 'KEEP THIS FORMATION').count();
    step.push({ at: 'C1 matter TYPE + phrase', fields, typedIt, keepBarPresent: keepBar > 0, stored: await stored(p) });

    const sent = await click(p, /SEND TO DIRECTOR/, 3600);
    step.push({
      at: 'C2 recipe -> Director',
      sent,
      hash: p.url().split('#')[1] ?? '',
      phase: await p.evaluate(() => document.querySelector('.modehost')?.getAttribute('data-phase')),
      stored: await stored(p),
    });

    await p.reload();
    await p.waitForTimeout(3600);
    await go(p, 'director', 4200);
    step.push({
      at: 'C3 reload -> Director',
      opensOn: await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)),
      stored: await stored(p),
    });

    await go(p, 'portal', 4200);
    await click(p, /CROSS|GO THROUGH/, 3000);
    step.push({
      at: 'C4 portal',
      notInIt: await p.evaluate(() => /WHAT IS NOT IN IT/i.test(document.body.innerText)),
      stored: await stored(p),
    });
    out.push({ FLOW: 'C', step, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  /* ================= FLOW D + PROJECT EXPORT =========================== */
  {
    const { ctx, p, errs, warn } = await fresh();
    const step = [];
    await go(p, 'anzy-os');
    const SAID = 'our margin is thin, churn is high and automation is missing';
    await say(p, `diagnose ${SAID}`, 2800);
    await say(p, 'open system', 2000);
    step.push({ at: 'D1 terminal project', stored: await stored(p) });

    /* Make a real artifact from the shell's own brief bar. */
    const briefBar = bar(p, 'SYSTEM BRIEF');
    const briefBarCount = await briefBar.count();
    const labels = await p.evaluate(() => [...document.querySelectorAll('.artifact__label')].map((l) => l.textContent.trim()));
    let madeArtifact = false;
    if (briefBarCount) {
      const send = briefBar.locator('.artifact__btn', { hasText: /SEND TO|DOWNLOAD \.MD/ }).first();
      if (await send.count()) {
        await send.click();
        await p.waitForTimeout(2600);
        madeArtifact = true;
      }
    }
    step.push({ at: 'D2 artifact from the shell', labels, madeArtifact, stored: await stored(p) });

    await p.reload();
    await p.waitForTimeout(3600);
    await say(p, 'open system', 2000);
    step.push({ at: 'D3 reload -> SYSTEM.app', stored: await stored(p) });

    /* ---- THE PROJECT EXPORT, scoped to its own bar ------------------- */
    let exported = { NO_PROJECT_BAR: true };
    const whole = bar(p, 'THE WHOLE PROJECT');
    if (await whole.count()) {
      const dl = p.waitForEvent('download', { timeout: 12000 }).catch(() => null);
      await whole.locator('.artifact__btn', { hasText: /DOWNLOAD \.MD/ }).first().click();
      const d = await dl;
      if (d) {
        const stream = await d.createReadStream();
        let text = '';
        for await (const chunk of stream) text += chunk.toString('utf8');
        const h2 = text.split('\n').filter((l) => /^## /.test(l));
        const sec = (name) => (text.split(`## ${name}`)[1] || '').split('\n## ')[0].trim();
        exported = {
          filename: d.suggestedFilename(),
          bytes: text.length,
          headings: text.split('\n').filter((l) => /^#{1,3} /.test(l)),
          duplicateSections: h2.length !== new Set(h2).size,
          hasProjectId: /\*\*PROJECT ID\*\*/.test(text),
          hasStatus: /\*\*STATUS\*\*/.test(text),
          hasSchema: /\*\*SCHEMA\*\*/.test(text),
          hasCanonicalSource: /\*\*CANONICAL SOURCE\*\*/.test(text),
          statementVerbatim: text.includes(SAID),
          limitsPresent: /\*\*CANNOT TELL YOU\*\*/.test(text),
          madeBy: /\*\*MADE BY\*\*/.test(text),
          constraints: sec('CONSTRAINTS STATED').slice(0, 200),
          made: sec('WHAT WAS MADE').slice(0, 260),
          unknowns: sec('WHAT IS STILL UNKNOWN').slice(0, 300),
          historyLineCount: sec('HOW IT GOT HERE').split('\n').filter(Boolean).length,
          notClause: sec('WHAT THIS FILE IS NOT').slice(0, 460),
          leaks: {
            cloud: /cloud|synced to (your )?account|on our server|encrypt/i.test(text),
            fabricated: /testimonial|award|our client [A-Z]|% uplift|case study result/i.test(text),
          },
          head: text.slice(0, 260),
        };
      } else exported = { NO_DOWNLOAD: true };
    }
    step.push({ at: 'D4 PROJECT export', exported });

    out.push({ FLOW: 'D', step, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  return out;
}
