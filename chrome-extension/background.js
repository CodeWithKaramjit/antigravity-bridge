/**
 * Antigravity Visual Inspector - Background Service Worker
 * Handles keyboard shortcuts, tab capture, and inspector triggering.
 */

// Restricted internal browser URLs where Chrome prohibits content script execution
function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('devtools://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:')
  );
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || isRestrictedUrl(tab.url)) return;

  if (command === 'toggle-inspector') {
    triggerInspector(tab.id, 'inspect');
  } else if (command === 'capture-screenshot') {
    triggerInspector(tab.id, 'screenshot');
  }
});

const EXTENSION_VERSION = '2.0.2';

// Helper to inject and trigger inspector on a tab
async function triggerInspector(tabId, mode = 'inspect') {
  // Guard against internal browser pages
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && isRestrictedUrl(tab.url)) {
      return;
    }
  } catch (e) {}

  let needsInjection = false;
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'ping-version' });
    if (!res || res.version !== EXTENSION_VERSION) {
      needsInjection = true;
    }
  } catch (err) {
    needsInjection = true;
  }

  if (needsInjection) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      // Small delay to allow shadow DOM mount
      await new Promise(r => setTimeout(r, 60));
    } catch (injectErr) {
      if (injectErr.message?.includes('Cannot access a chrome://') || injectErr.message?.includes('cannot be scripted')) {
        return; // Normal Chrome security boundary
      }
      console.warn('[Antigravity Inspector] Injection notice:', injectErr.message);
      return;
    }
  }

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'toggle-inspector', mode });
  } catch (e) {
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'toggle-inspector', mode }).catch(() => {});
    }, 120);
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
