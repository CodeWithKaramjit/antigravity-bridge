/**
 * Antigravity Visual Inspector - Popup Controller
 * Checks Bridge Server health, auto-detects active workspace by tab port,
 * and triggers inspection or screenshot mode on the active tab.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const btnInspect = document.getElementById('btnInspect');
  const btnScreenshot = document.getElementById('btnScreenshot');
  const offlineWarning = document.getElementById('offlineWarning');
  const workspaceRow = document.getElementById('workspaceRow');
  const targetWorkspaceBadge = document.getElementById('targetWorkspaceBadge');

  // Detect current tab URL to enable accurate port-to-workspace mapping
  let currentTabUrl = '';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      currentTabUrl = tabs[0].url || '';
    }
  } catch (e) {}

  // Check Bridge Server Health
  try {
    const healthUrl = currentTabUrl
      ? `http://localhost:4000/health?url=${encodeURIComponent(currentTabUrl)}`
      : 'http://localhost:4000/health';

    const res = await fetch(healthUrl);
    if (res.ok) {
      const data = await res.json();
      statusDot.className = 'dot online';
      statusText.textContent = 'Bridge Connected';
      btnInspect.disabled = false;
      if (btnScreenshot) btnScreenshot.disabled = false;
      offlineWarning.style.display = 'none';

      if (data.activeWorkspace && workspaceRow && targetWorkspaceBadge) {
        workspaceRow.style.display = 'flex';
        targetWorkspaceBadge.textContent = data.activeWorkspace;
        targetWorkspaceBadge.title = `Path: ${data.activeWorkspacePath || 'N/A'} (Conversation: ${data.activeConversationId || 'auto'})`;
      }
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    statusDot.className = 'dot offline';
    statusText.textContent = 'Bridge Offline';
    btnInspect.disabled = true;
    if (btnScreenshot) btnScreenshot.disabled = true;
    offlineWarning.style.display = 'block';
    if (workspaceRow) workspaceRow.style.display = 'none';
  }

  // Trigger screenshot mode
  if (btnScreenshot) {
    btnScreenshot.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'trigger-active-tab', mode: 'screenshot' }, () => {
        window.close();
      });
    });
  }

  // Trigger DOM inspect mode
  btnInspect.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'trigger-active-tab', mode: 'inspect' }, () => {
      window.close();
    });
  });
});
