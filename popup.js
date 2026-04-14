const startBtn   = document.getElementById('startBtn');
const stopBtn    = document.getElementById('stopBtn');
const statusBox  = document.getElementById('statusBox');
const badge      = document.getElementById('badge');
const doneCount  = document.getElementById('doneCount');
const skipCount  = document.getElementById('skipCount');
const failCount  = document.getElementById('failCount');

let isRunning = false;

function setBadge(state) {
  badge.className = 'badge ' + state;
  const labels = { idle: 'Idle', running: 'Running…', done: 'Done', error: 'Error' };
  badge.textContent = labels[state] || state;
}

function log(msg) {
  const ts = new Date().toLocaleTimeString('en-IN', { hour12: false });
  statusBox.textContent += `[${ts}] ${msg}\n`;
  statusBox.scrollTop = statusBox.scrollHeight;
}

function clearLog() {
  statusBox.textContent = '';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendMessageToTab(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, () => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || '';
        if (msg.includes('The message port closed before a response was received')) {
          resolve();
          return;
        }
        reject(new Error(msg));
        return;
      }
      resolve();
    });
  });
}

async function ensureContentScript(tabId) {
  try {
    await sendMessageToTab(tabId, { action: 'PING' });
    return;
  } catch (err) {
    if (!err.message.includes('Receiving end does not exist')) throw err;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content_script.js']
  });
}

startBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (!tab || !tab.url.includes('futureskillsprime.in')) {
    log('❌ Please navigate to a FutureSkills Prime course page first.');
    setBadge('error');
    return;
  }

  clearLog();
  isRunning = true;
  doneCount.textContent = '0';
  skipCount.textContent = '0';
  failCount.textContent = '0';
  startBtn.style.display = 'none';
  stopBtn.style.display  = 'block';
  setBadge('running');
  log('Starting automation…');

  try {
    await ensureContentScript(tab.id);
    await sendMessageToTab(tab.id, { action: 'START' });
  } catch (err) {
    isRunning = false;
    startBtn.style.display = 'block';
    stopBtn.style.display  = 'none';
    setBadge('error');
    log(`❌ Failed to start: ${err.message}`);
  }
});

stopBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  try {
    await sendMessageToTab(tab.id, { action: 'STOP' });
  } catch (_) {}
  isRunning = false;
  startBtn.style.display = 'block';
  stopBtn.style.display  = 'none';
  setBadge('idle');
  log('⏹ Stopped by user.');
});

// Listen for progress messages from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LOG')    log(msg.text);
  if (msg.type === 'STATS') {
    doneCount.textContent = msg.done;
    skipCount.textContent = msg.skip;
    failCount.textContent = msg.fail;
  }
  if (msg.type === 'DONE') {
    isRunning = false;
    startBtn.style.display = 'block';
    stopBtn.style.display  = 'none';
    setBadge('done');
    log(`✅ Finished! Done: ${msg.done} | Skipped: ${msg.skip} | Failed: ${msg.fail}`);
    doneCount.textContent = msg.done;
    skipCount.textContent = msg.skip;
    failCount.textContent = msg.fail;
  }
});
