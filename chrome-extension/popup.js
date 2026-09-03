/**
 * Antigravity Visual Inspector - Popup Controller
 * Checks Bridge Server health, auto-detects active workspace by tab port,
 * and triggers inspection or screenshot mode on the active tab.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusBanner = document.getElementById('statusBanner');
  const btnInspect = document.getElementById('btnInspect');
  const btnScreenshot = document.getElementById('btnScreenshot');
  const offlineWarning = document.getElementById('offlineWarning');
  const workspaceRow = document.getElementById('workspaceRow');
  const targetWorkspaceBadge = document.getElementById('targetWorkspaceBadge');
  const matchBadge = document.getElementById('matchBadge');
  const tabHost = document.getElementById('tabHost');
  const tabPortBadge = document.getElementById('tabPortBadge');
  const warnTabPort = document.getElementById('warnTabPort');
  const btnStartBridge = document.getElementById('btnStartBridge');
  const btnStopBridge = document.getElementById('btnStopBridge');
  const startBtnText = document.getElementById('startBtnText');
  const warnHelpMsg = document.getElementById('warnHelpMsg');

  // ─── Detect current tab URL to extract port and map to workspace ───
  let currentTabUrl = '';
  let tabPort = '';
  let tabHostname = '';

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url) {
      currentTabUrl = tabs[0].url;
      try {
        const u = new URL(currentTabUrl);
        tabHostname = u.host || u.hostname;
        if (u.port) {
          tabPort = u.port;
        } else if (u.protocol === 'http:') {
          tabPort = '80';
        } else if (u.protocol === 'https:') {
          tabPort = '443';
        }
      } catch (e) {
        tabHostname = currentTabUrl.slice(0, 20);
      }
    }
  } catch (e) {}

  // ─── Update tab info immediately in UI ───
  if (tabHost) {
    tabHost.textContent = tabHostname || 'Internal Page';
    tabHost.title = currentTabUrl;
  }
  if (tabPortBadge) {
    if (tabPort) {
      tabPortBadge.textContent = `Port ${tabPort}`;
      tabPortBadge.title = `Auto-detected web server port: ${tabPort}`;
    } else {
      tabPortBadge.textContent = 'No Port';
    }
  }
  if (warnTabPort) {
    warnTabPort.textContent = tabPort ? `:${tabPort}` : 'your web app';
  }

  // Check if current tab is a restricted browser internal page
  const isInternal = currentTabUrl.startsWith('chrome://') ||
    currentTabUrl.startsWith('chrome-extension://') ||
    currentTabUrl.startsWith('devtools://') ||
    currentTabUrl.startsWith('edge://') ||
    currentTabUrl.startsWith('about:');

  // ─── UI State Helpers ───
  function setOnlineUI(data) {
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Bridge Connected';
    if (statusBanner) {
      statusBanner.classList.remove('is-offline');
      statusBanner.classList.add('is-online');
    }
    offlineWarning.style.display = 'none';
    if (btnStopBridge) btnStopBridge.style.display = 'inline-block';

    if (isInternal) {
      btnInspect.disabled = true;
      if (btnScreenshot) btnScreenshot.disabled = true;
    } else {
      btnInspect.disabled = false;
      if (btnScreenshot) btnScreenshot.disabled = false;
    }

    if (data && data.activeWorkspace && workspaceRow && targetWorkspaceBadge) {
      workspaceRow.style.display = 'flex';
      targetWorkspaceBadge.textContent = data.activeWorkspace;
      targetWorkspaceBadge.title = `Path: ${data.activeWorkspacePath || 'N/A'} (Conversation: ${data.activeConversationId || 'auto'})`;
      if (matchBadge) {
        matchBadge.textContent = data.matchedBy ? `via ${data.matchedBy}` : 'Auto-linked';
      }
    }
    if (warnHelpMsg) warnHelpMsg.style.display = 'none';
  }

  function setOfflineUI() {
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Bridge Offline';
    if (statusBanner) {
      statusBanner.classList.remove('is-online');
      statusBanner.classList.add('is-offline');
    }
    btnInspect.disabled = true;
    if (btnScreenshot) btnScreenshot.disabled = true;
    offlineWarning.style.display = 'block';
    if (workspaceRow) workspaceRow.style.display = 'none';
    if (btnStopBridge) btnStopBridge.style.display = 'none';
  }

  function setCheckingUI() {
    statusDot.className = 'status-dot checking';
    statusText.textContent = 'Checking Bridge…';
    if (statusBanner) {
      statusBanner.classList.remove('is-online', 'is-offline');
    }
    btnInspect.disabled = true;
    if (btnScreenshot) btnScreenshot.disabled = true;
  }

  // ─── Bridge Health Check ───
  async function checkBridgeHealth() {
    setCheckingUI();

    try {
      const healthUrl = currentTabUrl
        ? `http://localhost:4000/health?url=${encodeURIComponent(currentTabUrl)}`
        : 'http://localhost:4000/health';

      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(600) });
      if (res.ok) {
        const data = await res.json();
        setOnlineUI(data);
        return true;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      setOfflineUI();
      return false;
    }
  }

  // Helper for progressive polling until server comes online
  async function pollUntilOnline(maxRetries = 5, delayMs = 300) {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, delayMs));
      const ok = await checkBridgeHealth();
      if (ok) return true;
    }
    return false;
  }

  await checkBridgeHealth();

  // ─── 1-Click Start Bridge Server via Native Messaging ───
  if (btnStartBridge) {
    btnStartBridge.addEventListener('click', async () => {
      btnStartBridge.disabled = true;
      btnStartBridge.classList.add('is-loading');
      if (startBtnText) startBtnText.textContent = 'Starting…';
      if (warnHelpMsg) warnHelpMsg.style.display = 'none';

      if (typeof chrome.runtime?.sendNativeMessage === 'function') {
        try {
          chrome.runtime.sendNativeMessage('com.antigravity.bridge', { action: 'start' }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[Bridge Launcher] Native messaging notice:', chrome.runtime.lastError.message);
              if (warnHelpMsg) {
                warnHelpMsg.innerHTML = `⚠️ <b>Notice:</b> ${chrome.runtime.lastError.message}<br>Agar first time hai toh <b>chrome://extensions</b> par <b>Reload (↻)</b> karein, ya folder me <b>Start Bridge.command</b> chalayein.`;
                warnHelpMsg.style.display = 'block';
              }
            }
          });
        } catch (err) {
          console.error('[Bridge Launcher] Error:', err);
          if (warnHelpMsg) {
            warnHelpMsg.innerHTML = `⚠️ <b>Error:</b> ${err.message}. Please reload extension at <b>chrome://extensions</b>.`;
            warnHelpMsg.style.display = 'block';
          }
        }
      } else {
        if (warnHelpMsg) {
          warnHelpMsg.innerHTML = `⚠️ <b>Ek baar Reload zaroori hai:</b><br>
          Chrome ne naya <i>nativeMessaging</i> permission abhi tak load nahi kiya hai.<br>
          1. Chrome me <b>chrome://extensions</b> kholein.<br>
          2. <b>Antigravity Visual Inspector</b> card par <b>Reload (↻)</b> dabayein.<br>
          <i>(Ya phir project folder me <b>Start Bridge.command</b> double-click karein)</i>`;
          warnHelpMsg.style.display = 'block';
        }
      }

      // Progressive multi-interval health polling
      await pollUntilOnline(5, 300);
      btnStartBridge.disabled = false;
      btnStartBridge.classList.remove('is-loading');
      if (startBtnText) startBtnText.textContent = 'Start Bridge Server';
    });
  }

  // ─── 1-Click Stop Bridge Server ───
  if (btnStopBridge) {
    btnStopBridge.addEventListener('click', async () => {
      btnStopBridge.disabled = true;
      btnStopBridge.textContent = 'Stopping…';

      // 1. Direct HTTP stop call to server (instant & guaranteed)
      try {
        await fetch('http://localhost:4000/api/stop', {
          method: 'POST',
          signal: AbortSignal.timeout(500)
        });
      } catch (e) {}

      // 2. Also trigger native messaging stop as backup
      try {
        if (typeof chrome.runtime?.sendNativeMessage === 'function') {
          chrome.runtime.sendNativeMessage('com.antigravity.bridge', { action: 'stop' }, () => {});
        }
      } catch (e) {}

      // 3. Immediately switch UI to offline state so Start button appears instantly
      setOfflineUI();
      if (btnStopBridge) {
        btnStopBridge.disabled = false;
        btnStopBridge.textContent = 'Stop';
      }
      if (btnStartBridge) {
        btnStartBridge.disabled = false;
        btnStartBridge.classList.remove('is-loading');
        if (startBtnText) startBtnText.textContent = 'Start Bridge Server';
      }
    });
  }

  // ─── Trigger screenshot mode ───
  if (btnScreenshot) {
    btnScreenshot.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'trigger-active-tab', mode: 'screenshot' }, () => {
        window.close();
      });
    });
  }

  // ─── Trigger DOM inspect mode ───
  btnInspect.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'trigger-active-tab', mode: 'inspect' }, () => {
      window.close();
    });
  });
});
