/**
 * Antigravity Visual Inspector - Popup Controller
 * Checks Bridge Server health, auto-detects active workspace by tab port,
 * and triggers inspection or screenshot mode on the active tab.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Mini XSS-safe HTML escaper for error messages
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

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
  const ideInstalledLabel = document.getElementById('ideInstalledLabel');
  const ideInstalledBadge = document.getElementById('ideInstalledBadge');
  const ideOpenLabel = document.getElementById('ideOpenLabel');
  const ideOpenBadge = document.getElementById('ideOpenBadge');

  let bridgeOnline = false;
  let ideOpen = false;

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
        }
      } catch (e) {
        tabHostname = currentTabUrl.slice(0, 20);
      }
    }
  } catch (e) {}

  // ─── Update tab info immediately in UI ───
  const isLocalDomain = tabHostname && (
    tabHostname.endsWith('.test') ||
    tabHostname.endsWith('.local') ||
    tabHostname.endsWith('.site') ||
    tabHostname.endsWith('.dev') ||
    tabHostname.includes('localhost')
  );

  if (tabHost) {
    tabHost.textContent = tabHostname || 'Internal Page';
    tabHost.title = currentTabUrl;
  }
  if (tabPortBadge) {
    if (tabPort) {
      tabPortBadge.textContent = `Port ${tabPort}`;
      tabPortBadge.title = `Auto-detected web server port: ${tabPort}`;
    } else if (isLocalDomain) {
      tabPortBadge.textContent = 'Local Domain';
      tabPortBadge.title = `Local development domain: ${tabHostname}`;
    } else {
      tabPortBadge.textContent = 'Web App';
    }
  }
  if (warnTabPort) {
    warnTabPort.textContent = tabPort ? `:${tabPort}` : (tabHostname || 'your web app');
  }

  // Check if current tab is a restricted browser internal page
  const isInternal = currentTabUrl.startsWith('chrome://') ||
    currentTabUrl.startsWith('chrome-extension://') ||
    currentTabUrl.startsWith('devtools://') ||
    currentTabUrl.startsWith('edge://') ||
    currentTabUrl.startsWith('about:');

  function setBadge(el, ok, onText, offText) {
    if (!el) return;
    el.textContent = ok ? onText : offText;
    el.classList.remove('badge-ok', 'badge-off');
    el.classList.add(ok ? 'badge-ok' : 'badge-off');
  }

  function renderIdeStatus(status) {
    const installed = !!(status && status.installed);
    ideOpen = installed && !!(status && status.open);
    if (ideInstalledLabel) {
      ideInstalledLabel.textContent = installed ? 'Installed' : 'Not installed';
    }
    setBadge(ideInstalledBadge, installed, 'Yes', 'No');
    if (ideOpenLabel) {
      ideOpenLabel.textContent = ideOpen ? 'Open' : 'Not open';
    }
    setBadge(ideOpenBadge, ideOpen, 'Open', 'Closed');
    applyInspectEnabled();
  }

  function applyInspectEnabled() {
    const allow = bridgeOnline && ideOpen && !isInternal;
    if (btnInspect) btnInspect.disabled = !allow;
    if (btnScreenshot) btnScreenshot.disabled = !allow;
  }

  function queryNativeIdeStatus() {
    return new Promise((resolve) => {
      if (typeof chrome.runtime?.sendNativeMessage !== 'function') {
        resolve(null);
        return;
      }
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 1500);
      try {
        chrome.runtime.sendNativeMessage('com.antigravity.bridge', { action: 'ide-status' }, (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError || !response || typeof response.installed !== 'boolean') {
            finish(null);
            return;
          }
          finish({ installed: response.installed, open: !!response.open });
        });
      } catch (e) {
        clearTimeout(timer);
        finish(null);
      }
    });
  }

  // ─── UI State Helpers ───
  function setOnlineUI(data) {
    bridgeOnline = true;
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Bridge Connected';
    if (statusBanner) {
      statusBanner.classList.remove('is-offline');
      statusBanner.classList.add('is-online');
    }
    offlineWarning.style.display = 'none';
    if (btnStopBridge) btnStopBridge.style.display = 'inline-block';
    applyInspectEnabled();

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
    bridgeOnline = false;
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Bridge Offline';
    if (statusBanner) {
      statusBanner.classList.remove('is-online');
      statusBanner.classList.add('is-offline');
    }
    applyInspectEnabled();
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
    applyInspectEnabled();
  }

  // ─── Bridge Health Check ───
  async function checkBridgeHealth() {
    setCheckingUI();

    try {
      const healthUrl = currentTabUrl
        ? `http://127.0.0.1:4000/health?url=${encodeURIComponent(currentTabUrl)}`
        : 'http://127.0.0.1:4000/health';

      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        setOnlineUI(data);
        return data;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setOfflineUI();
      return null;
    }
  }

  // Helper for progressive polling until server comes online
  async function pollUntilOnline(maxRetries = 5, delayMs = 300) {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, delayMs));
      const data = await checkBridgeHealth();
      if (data) return true;
    }
    return false;
  }

  const [nativeIde, healthData] = await Promise.all([
    queryNativeIdeStatus(),
    checkBridgeHealth()
  ]);
  const fromHealth = healthData && healthData.antigravity && typeof healthData.antigravity.installed === 'boolean'
    ? healthData.antigravity
    : null;
  renderIdeStatus({
    installed: !!(fromHealth && fromHealth.installed) || !!(nativeIde && nativeIde.installed),
    open: !!(fromHealth && fromHealth.open) || !!(nativeIde && nativeIde.open)
  });

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
                warnHelpMsg.innerHTML = `⚠️ <b>Notice:</b> ${esc(chrome.runtime.lastError.message)}<br>Agar first time hai toh <b>chrome://extensions</b> par <b>Reload (↻)</b> karein, ya folder me <b>Start Bridge.command</b> chalayein.`;
                warnHelpMsg.style.display = 'block';
              }
            }
          });
        } catch (err) {
          console.error('[Bridge Launcher] Error:', err);
          if (warnHelpMsg) {
            warnHelpMsg.innerHTML = `⚠️ <b>Error:</b> ${esc(err.message)}. Please reload extension at <b>chrome://extensions</b>.`;
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
        await fetch('http://127.0.0.1:4000/api/stop', {
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
