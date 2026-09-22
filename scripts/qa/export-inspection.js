/*
 * FLOW C driven through whatever the KEEP THIS FORMATION bar actually offers,
 * and a project export taken from a project that HAS artifacts — so the
 * per-artifact fields (MADE BY, CANNOT TELL YOU, the embedded document) are
 * exercised rather than assumed.
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
        artifacts: (rec?.artifacts ?? []).map((a) => `${a.kind}:${(a.title || '').slice(0, 30)}`),
        allHaveLimits: (rec?.artifacts ?? []).every((a) => typeof a.limits === 'string' && a.limits.length > 0),
        history: [...new Set((rec?.history ?? []).map((h) => h.kind))].join(','),
      };
    });

  /* ================= FLOW C ============================================ */
  {
    const { ctx, p, errs, warn } = await fresh();
    const step = [];
    await go(p, 'matter-engine', 4600);
    await p.keyboard.press('3');
    await p.waitForTimeout(1600);
    const f = p.locator('.mx-type__input').first();
    if (await f.count()) {
      await f.click();
      await f.fill('A SYSTEM THAT HOLDS');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2800);
    }
    const keep = bar(p, 'KEEP THIS FORMATION');
    const buttons = await keep.locator('button').allTextContents();
    step.push({ at: 'C1 what the bar offers', buttons: buttons.map((b) => b.trim()) });

    /* Click the handoff button, whatever it is called. */
    const send = keep.locator('.artifact__btn--send').first();
    const hasSend = (await send.count()) > 0;
    if (hasSend) {
      await send.click();
      await p.waitForTimeout(3800);
    }
    step.push({
      at: 'C2 recipe handed on',
      hasSend,
      hash: p.url().split('#')[1] ?? '',
      phase: await p.evaluate(() => document.querySelector('.modehost')?.getAttribute('data-phase')),
      stored: await stored(p),
    });

    await p.reload();
    await p.waitForTimeout(3600);
    await go(p, 'director', 4200);
    step.push({
      at: 'C3 reload -> Director',
      opensOn: await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 320)),
      stored: await stored(p),
    });

    await go(p, 'portal', 4200);
    const cross = p.locator('button', { hasText: /CROSS|GO THROUGH/ }).first();
    if (await cross.count()) {
      await cross.click();
      await p.waitForTimeout(3000);
    }
    step.push({
      at: 'C4 portal',
      notInIt: await p.evaluate(() => /WHAT IS NOT IN IT/i.test(document.body.innerText)),
      stored: await stored(p),
    });
    out.push({ FLOW: 'C', step, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  /* ========== EXPORT of a project that HAS artifacts =================== */
  {
    const { ctx, p, errs, warn } = await fresh();
    const step = [];
    const SAID = 'our conversion is weak, reporting is a mess and handover between teams is broken';

    /* Build a project with a brief artifact through the Simulator. */
    await go(p, 'agency-simulator', 3600);
    const b1 = p.locator('button', { hasText: /STATE THE PROBLEM/ }).first();
    if (await b1.count()) {
      await b1.click();
      await p.waitForTimeout(1600);
    }
    const box = p.locator('#sim-said');
    if (await box.count()) {
      await box.click();
      await box.fill(SAID);
    }
    const b2 = p.locator('button', { hasText: /FRAME IT/ }).first();
    if (await b2.count()) {
      await b2.click();
      await p.waitForTimeout(2200);
    }
    for (let i = 0; i < 6; i++) {
      const o = p.locator('.sim-ask button');
      if (!(await o.count())) break;
      await o.nth(Math.min(1, (await o.count()) - 1)).click();
      await p.waitForTimeout(900);
    }
    await p.waitForTimeout(1400);
    const b3 = p.locator('button', { hasText: /PRODUCE THE BRIEF/ }).first();
    if (await b3.count()) {
      await b3.click();
      await p.waitForTimeout(2800);
    }
    const b4 = p.locator('button', { hasText: /SEND TO ANZY\.OS/ }).first();
    if (await b4.count()) {
      await b4.click();
      await p.waitForTimeout(2600);
    }
    await say(p, 'open system', 2200);
    step.push({ at: 'E1 project with a brief', stored: await stored(p) });

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
        const sec = (n) => (text.split(`## ${n}`)[1] || '').split('\n## ')[0].trim();
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
          perArtifact: {
            type: /- \*\*TYPE\*\*/.test(text),
            madeBy: /- \*\*MADE BY\*\*/.test(text),
            madeAt: /- \*\*MADE AT\*\*/.test(text),
            cannotTellYou: /- \*\*CANNOT TELL YOU\*\*/.test(text),
            embeddedDocument: /<details>/.test(text),
          },
          constraintsBlock: sec('CONSTRAINTS STATED').slice(0, 320),
          madeBlock: sec('WHAT WAS MADE').slice(0, 420),
          unknownsBlock: sec('WHAT IS STILL UNKNOWN').slice(0, 320),
          historyLineCount: sec('HOW IT GOT HERE').split('\n').filter(Boolean).length,
          leaks: {
            cloud: /cloud|synced to (your )?account|on our server|encrypt/i.test(text),
            fabricated: /testimonial|award|our client [A-Z]|% uplift|case study result/i.test(text),
          },
        };
      } else exported = { NO_DOWNLOAD: true };
    }
    step.push({ at: 'E2 PROJECT export with artifacts', exported });

    /* And the JSON half, so the machine-readable copy is checked too. */
    let json = { NO_JSON: true };
    if (await whole.count()) {
      const dl2 = p.waitForEvent('download', { timeout: 12000 }).catch(() => null);
      await whole.locator('.artifact__btn', { hasText: /DOWNLOAD \.JSON/ }).first().click();
      const d2 = await dl2;
      if (d2) {
        const s2 = await d2.createReadStream();
        let t2 = '';
        for await (const c of s2) t2 += c.toString('utf8');
        const o = JSON.parse(t2);
        json = {
          filename: d2.suggestedFilename(),
          bytes: t2.length,
          schemaVersion: o.schemaVersion,
          storage: o.storage,
          binary: o.binary,
          canonicalSource: o.canonicalSource,
          projectKeys: Object.keys(o.project ?? {}),
          derivedTitle: o.project?.derivedTitle,
          constraintCount: (o.constraints ?? []).length,
          artifactCount: (o.artifacts ?? []).length,
          artifactKeys: Object.keys((o.artifacts ?? [])[0] ?? {}),
          artifactHasLimits: !!(o.artifacts ?? [])[0]?.limits,
          artifactHasDocument: !!(o.artifacts ?? [])[0]?.document,
          historyCount: (o.history ?? []).length,
        };
      }
    }
    step.push({ at: 'E3 JSON export', json });

    out.push({ FLOW: 'EXPORT', step, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  return out;
}
