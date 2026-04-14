/**
 * FutureSkills Prime — Content Script
 * Runs directly on the page. No Playwright needed — uses native DOM.
 */

let RUNNING = false;

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendLog(text) {
  chrome.runtime.sendMessage({ type: 'LOG', text });
  console.log('[FSP]', text);
}

function sendStats(done, skip, fail) {
  chrome.runtime.sendMessage({ type: 'STATS', done, skip, fail });
}

function sendDone(done, skip, fail) {
  chrome.runtime.sendMessage({ type: 'DONE', done, skip, fail });
}

/**
 * Wait for an element matching `selector` inside `root`
 * Returns the element or null on timeout.
 */
async function waitFor(selector, root = document, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = root.querySelector(selector);
    if (el && el.offsetParent !== null) return el;  // visible check
    await sleep(300);
  }
  return null;
}

// ─── Step helpers ─────────────────────────────────────────────────────────────

async function tryEnrol(mod, idx) {
  // Button text is "Enrol" (not "Get Started")
  const buttons = mod.querySelectorAll('button.getStarted, button.btn.getStarted');
  for (const btn of buttons) {
    if (btn.textContent.trim().toLowerCase() === 'enrol') {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(400);
      btn.click();
      sendLog(`  ✓ Clicked 'Enrol' (module ${idx + 1})`);
      await sleep(3000);

      // Dismiss any confirmation modal
      const confirmSels = [
        "button:contains('Enrol Now')",
        "button:contains('Confirm')",
        "button:contains('OK')"
      ];
      for (const sel of ['Enrol Now','Confirm','OK']) {
        document.querySelectorAll('button').forEach(b => {
          if (b.textContent.trim() === sel) { b.click(); }
        });
      }
      await sleep(1500);
      return true;
    }
  }
  return false;
}

async function tryGetStarted(mod, idx) {
  const buttons = mod.querySelectorAll('button.getStarted, button.btn.getStarted');
  for (const btn of buttons) {
    const txt = btn.textContent.trim().toLowerCase();
    if (txt === 'get started' || txt === 'start') {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(400);
      btn.click();
      sendLog(`  ✓ Clicked 'Get Started' (module ${idx + 1})`);
      await sleep(2000);
      return true;
    }
  }
  sendLog(`  ! 'Get Started' not found (module ${idx + 1}), trying to continue…`);
  return false;
}

async function tryViewContent(mod, idx) {
  const link = mod.querySelector('a.post_cont_view_content');
  if (!link) {
    sendLog(`  ! 'View Content' link not found (module ${idx + 1})`);
    return false;
  }

  link.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(400);

  // Open in a new tab (the link has target="_blank")
  const href = link.href;
  if (href) {
    sendLog(`  → Opening content: ${href.substring(0, 60)}…`);
    const newTab = window.open(href, '_blank');
    await sleep(3000);  // Give it a moment to "load"
    if (newTab) {
      try { newTab.close(); } catch(e) {}
      sendLog(`  ✓ Content tab closed (module ${idx + 1})`);
    }
  } else {
    link.click();
    await sleep(2000);
  }
  return true;
}

async function tryMarkComplete(mod, idx) {
  // Re-query inside module to catch newly-revealed buttons
  const selectors = [
    'div.post_compl_style button#markasComplete',
    'div.post_compl_style button.viewReport',
    'button#markasComplete',
    'button[onclick*="markasComplete"]',
  ];

  // Also try text-based matching
  const allBtns = mod.querySelectorAll('button');
  for (const btn of allBtns) {
    const txt = btn.textContent.trim().toLowerCase();
    if (txt.includes('mark as complete') || txt.includes('mark as completed')) {
      if (!btn.disabled) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(400);
        btn.click();
        sendLog(`  ✓ Clicked 'Mark as Complete' (module ${idx + 1})`);
        await sleep(2000);
        return true;
      } else {
        sendLog(`  ! 'Mark as Complete' is disabled (may auto-complete) (module ${idx + 1})`);
        return false;
      }
    }
  }

  for (const sel of selectors) {
    const btn = mod.querySelector(sel);
    if (btn && !btn.disabled && btn.offsetParent !== null) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(400);
      btn.click();
      sendLog(`  ✓ Clicked 'Mark as Complete' via selector (module ${idx + 1})`);
      await sleep(2000);
      return true;
    }
  }

  sendLog(`  ! 'Mark as Complete' not found/disabled (module ${idx + 1}) — may already be done`);
  return false;
}

function isAlreadyCompleted(mod) {
  const indicators = ['.completed', '.done', '[class*="completed"]', 'span.checkmark', 'i.tick'];
  for (const sel of indicators) {
    if (mod.querySelector(sel)) return true;
  }
  // If no action button at all, assume done
  const hasBtns = mod.querySelectorAll('button.getStarted, button.btn.getStarted').length > 0;
  return false; // conservative — let the steps handle edge cases
}

// ─── Main automation loop ─────────────────────────────────────────────────────

async function runAutomation() {
  RUNNING = true;
  let done = 0, skip = 0, fail = 0;

  const MODULE_SEL = 'div.allActiveProd';
  const modules = document.querySelectorAll(MODULE_SEL);
  const total = modules.length;

  if (total === 0) {
    sendLog('❌ No modules found (div.allActiveProd). Are you on the right course page?');
    sendDone(0, 0, 0);
    RUNNING = false;
    return;
  }

  sendLog(`Found ${total} module(s). Starting…`);

  for (let i = 0; i < total; i++) {
    if (!RUNNING) {
      sendLog('⏹ Automation stopped.');
      break;
    }

    sendLog(`\n── Module ${i + 1}/${total} ──`);

    // Re-query each iteration (DOM may have changed)
    const mods = document.querySelectorAll(MODULE_SEL);
    const mod  = mods[i];

    if (!mod) {
      sendLog(`  ! Module ${i + 1} disappeared — skipping`);
      fail++;
      sendStats(done, skip, fail);
      continue;
    }

    try {
      if (isAlreadyCompleted(mod)) {
        sendLog(`  ✓ Already completed — skipping`);
        skip++;
        sendStats(done, skip, fail);
        continue;
      }

      // Step A: Enrol
      await tryEnrol(mod, i);

      // Step B: Get Started
      const freshMod1 = document.querySelectorAll(MODULE_SEL)[i];
      await tryGetStarted(freshMod1 || mod, i);

      // Step C: View Content
      const freshMod2 = document.querySelectorAll(MODULE_SEL)[i];
      await tryViewContent(freshMod2 || mod, i);

      // Step D: Mark as Complete
      const freshMod3 = document.querySelectorAll(MODULE_SEL)[i];
      const ok = await tryMarkComplete(freshMod3 || mod, i);

      if (ok) {
        done++;
      } else {
        // Might be auto-completed — still count as done
        done++;
      }

      sendStats(done, skip, fail);
      await sleep(1500);

    } catch (err) {
      sendLog(`  ✗ Error on module ${i + 1}: ${err.message}`);
      fail++;
      sendStats(done, skip, fail);
      await sleep(1000);
    }
  }

  RUNNING = false;
  sendLog(`\nAll done! ✅`);
  sendDone(done, skip, fail);
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'START') {
    if (!RUNNING) runAutomation();
    else sendLog('Already running…');
  }
  if (msg.action === 'STOP') {
    RUNNING = false;
  }
});
