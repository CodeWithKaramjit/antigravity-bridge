/**
 * Antigravity Visual Inspector - Background Service Worker
 * Listens for keyboard shortcuts (Option + A on Mac / Alt + A) and action triggers.
 */

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-inspector') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      triggerInspector(tab.id);
    }
  }
});

// Helper to inject and toggle inspector on a tab
async function triggerInspector(tabId) {
  try {
    // Attempt sending toggle message if content script is already loaded
    await chrome.tabs.sendMessage(tabId, { action: 'toggle-inspector' });
  } catch (err) {
    // Content script not loaded yet; inject content.js dynamically
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      // Give script a moment to register listeners
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'toggle-inspector' }).catch(() => {});
      }, 80);
    } catch (injectErr) {
      console.error('[Antigravity Inspector] Injection failed:', injectErr);
    }
  }
}

// Allow popup or external messages to trigger inspector
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'trigger-active-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab && tab.id) {
        triggerInspector(tab.id);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true; // Keep message channel open for async response
  }
});
