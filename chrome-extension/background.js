/**
 * Antigravity Visual Inspector - Background Service Worker
 * Handles keyboard shortcuts, tab capture, and inspector triggering.
 */

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  if (command === 'toggle-inspector') {
    triggerInspector(tab.id, 'inspect');
  } else if (command === 'capture-screenshot') {
    triggerInspector(tab.id, 'screenshot');
  }
});

// Helper to inject and trigger inspector on a tab
async function triggerInspector(tabId, mode = 'inspect') {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'toggle-inspector', mode });
  } catch (err) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'toggle-inspector', mode }).catch(() => {});
      }, 100);
    } catch (injectErr) {
      console.error('[Antigravity Inspector] Injection failed:', injectErr);
    }
  }
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'trigger-active-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab && tab.id) {
        triggerInspector(tab.id, message.mode || 'inspect');
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }

  if (message.action === 'capture-tab') {
    const windowId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError?.message || 'Failed to capture tab screenshot'
        });
      } else {
        sendResponse({
          success: true,
          dataUrl
        });
      }
    });
    return true; // Keep message port open for async capture
  }
});
