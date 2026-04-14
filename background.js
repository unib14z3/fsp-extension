chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action !== 'OPEN_AND_CLOSE_TAB' || !msg?.url) return;

  chrome.tabs.create({ url: msg.url, active: false }, (tab) => {
    if (chrome.runtime.lastError || !tab?.id) {
      sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'Failed to create tab' });
      return;
    }

    chrome.tabs.remove(tab.id, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
  });

  return true;
});
