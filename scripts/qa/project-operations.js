async (page) => {
  const BASE = 'http://localhost:5173';
  const log = [];
  const errors = [];

  const ctx = await page.context().browser().newContext();
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));

  const surface = () =>
    p.evaluate(() => ({
      kv: [...document.querySelectorAll('.os-prj__kv div')].map((d) => d.textContent.trim()).join(' | '),
      title: document.querySelector('.os-prj__title')?.textContent?.trim() ?? null,
      notice: document.querySelector('.os-prj__notice')?.textContent?.trim().replace(/\s*UNDERSTOOD$/, '') ?? null,
      alsoSaved: [...document.querySelectorAll('.os-saved li')].map((li) =>
        li.textContent.trim().replace(/\s+/g, ' ').slice(0, 64),
      ),
      danger: [...document.querySelectorAll('.os-prj__danger-row button')].map((b) => b.textContent.trim()),
    }));

  const say = async (cmd, ms = 2400) => {
    const term = p.locator('input').first();
    await term.click();
    await term.fill(cmd);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(ms);
    return p.evaluate(() =>
      [...document.querySelectorAll('.os-cmd__out, .os-term__line, [class*="os-log"]')]
        .slice(-8)
        .map((l) => l.textContent.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .slice(-5)
        .join(' ⏎ '),
    );
  };

  try {
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2600);
    if (!(await p.evaluate(() => !!document.querySelector('.modehost__chrome')))) {
      await ctx.close();
      return { FATAL: '!! MODE NOT LOADED (void)' };
    }
    await say('open system', 1600);

    /* ---- P1 ----------------------------------------------------------- */
    await say('diagnose our conversion is weak and reporting is a mess');
    const p1 = await surface();
    log.push({ step: '1 P1 created', ...p1 });

    /* ---- NEW PROJECT: must not mutate P1, must not claim a save ------- */
    const newReply = await say('new', 2600);
    const afterNew = await surface();
    log.push({
      step: '2 NEW PROJECT',
      newReply,
      SAVED_must_be_NOT_YET: afterNew.kv,
      title: afterNew.title,
      alsoSaved: afterNew.alsoSaved,
      danger: afterNew.danger,
    });

    /* ---- P2 gets its own truth ---------------------------------------- */
    await say('diagnose our churn is high and margin is thin');
    const p2 = await surface();
    log.push({ step: '3 P2 created', ...p2 });

    /* ---- P1 must still hold its own statement ------------------------- */
    const listed = await say('projects', 1800);
    log.push({ step: '4 both listed', listed });

    /* ---- RESUME P1 ----------------------------------------------------- */
    const resumed = await say('resume 2', 2600);
    const afterResume = await surface();
    log.push({ step: '5 resume the older one', resumed, ...afterResume });

    /* ---- TOOL RESET (Simulator START AGAIN) != PROJECT RESET ---------- */
    await p.goto(`${BASE}/#/agency-simulator`);
    await p.waitForTimeout(3000);
    const simLoaded = await p.evaluate(() => !!document.querySelector('.modehost__chrome'));
    let simReset = null;
    if (simLoaded) {
      const again = p.locator('button', { hasText: /START AGAIN|REVISE/ }).first();
      if (await again.count()) {
        await again.click();
        await p.waitForTimeout(1600);
        simReset = 'clicked';
      } else {
        simReset = 'no START AGAIN on this screen';
      }
    }
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2600);
    await say('open system', 1600);
    const afterToolReset = await surface();
    log.push({
      step: '6 tool reset must not touch the project',
      simLoaded,
      simReset,
      ...afterToolReset,
    });

    /* ---- DELETE ONE: two presses, differently worded ------------------ */
    const delBtn = p.locator('.os-prj__danger-row button', { hasText: 'DELETE THIS PROJECT' }).first();
    const hasDelete = (await delBtn.count()) > 0;
    let deleteFlow = null;
    if (hasDelete) {
      await delBtn.click();
      await p.waitForTimeout(500);
      const mid = await surface();
      const forGood = p.locator('.os-prj__danger-row button', { hasText: 'DELETE FOR GOOD' }).first();
      const secondPress = (await forGood.count()) > 0;
      const warn = await p.evaluate(() => document.querySelector('.os-prj__warn')?.textContent?.trim() ?? null);
      /* Back out first — KEEP IT must be a real escape. */
      await p.locator('.os-prj__danger-row button', { hasText: 'KEEP IT' }).first().click();
      await p.waitForTimeout(600);
      const backedOut = await surface();
      /* Now really do it. */
      await delBtn.click();
      await p.waitForTimeout(400);
      await p.locator('.os-prj__danger-row button', { hasText: 'DELETE FOR GOOD' }).first().click();
      await p.waitForTimeout(1800);
      deleteFlow = {
        secondPress,
        warn,
        midButtons: mid.danger,
        backedOutSafely: backedOut.title,
        after: await surface(),
      };
    }
    log.push({ step: '7 DELETE one project', hasDelete, deleteFlow });

    const disk = await p.evaluate(() => {
      const raw = localStorage.getItem('hi-anzy-lab.projects.v1');
      return raw ? JSON.parse(raw).projects.map((x) => (x.excerpt || '').slice(0, 40)) : null;
    });
    log.push({ step: '8 what is left on disk', disk });

    /* ---- CLEAR ALL: separate control, separate wording ---------------- */
    const clearBtn = p.locator('.os-prj__danger-row button', { hasText: 'CLEAR ALL LOCAL DATA' }).first();
    let clearFlow = null;
    if (await clearBtn.count()) {
      await clearBtn.click();
      await p.waitForTimeout(500);
      const warn = await p.evaluate(() => document.querySelector('.os-prj__warn')?.textContent?.trim() ?? null);
      const buttons = (await surface()).danger;
      await p.locator('.os-prj__danger-row button', { hasText: 'CLEAR EVERYTHING' }).first().click();
      await p.waitForTimeout(2000);
      clearFlow = {
        warn,
        buttons,
        after: await surface(),
        disk: await p.evaluate(() => {
          const raw = localStorage.getItem('hi-anzy-lab.projects.v1');
          return raw ? JSON.parse(raw) : null;
        }),
      };
    }
    log.push({ step: '9 CLEAR ALL LOCAL DATA', clearFlow });
  } catch (e) {
    log.push({ THREW: String(e).slice(0, 300) });
  }

  await ctx.close();
  return { log, errors };
}
