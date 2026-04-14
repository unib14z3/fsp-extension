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

  chrome.tabs.sendMessage(tab.id, { action: 'START' });
});

stopBtn.addEventListener('click', async () => {
  const tab = await getActiveTab();
  chrome.tabs.sendMessage(tab.id, { action: 'STOP' });
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
