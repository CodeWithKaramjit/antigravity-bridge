/**
 * Antigravity Visual Inspector - Content Script
 * Injected into webpages to provide visual element selection, hover highlighting,
 * and direct feedback dispatch to Antigravity IDE.
 */

(() => {
  'use strict';

  // Toggle if already initialized
  if (window.__antigravityInspectorInitialized) {
    if (window.__antigravityToggleInspector) {
      window.__antigravityToggleInspector();
    }
    return;
  }
  window.__antigravityInspectorInitialized = true;

  const BRIDGE_API_URL = 'http://localhost:4000/api/feedback';
  let isInspectMode = false;
  let hoveredElement = null;
  let selectedElement = null;

  // Root Host Container
  const container = document.createElement('div');
  container.id = 'antigravity-inspector-host';
  document.documentElement.appendChild(container);

  // Shadow DOM to isolate styles completely
  const shadow = container.attachShadow({ mode: 'open' });

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

    /* Full-Screen Click Trap & Hit-Testing Layer */
    .ag-click-trap {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483638;
      background: transparent;
      cursor: crosshair;
      display: none;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Highlighting Border Frame */
    .ag-highlighter {
      position: fixed;
      pointer-events: none;
      z-index: 2147483640;
      border: 2px solid #6366f1;
      background: rgba(99, 102, 241, 0.12);
      border-radius: 4px;
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
      display: none;
      transition: top 0.05s ease, left 0.05s ease, width 0.05s ease, height 0.05s ease;
    }
    .ag-highlighter-badge {
      position: absolute;
      top: -26px;
      left: -2px;
      background: #4f46e5;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }

    /* Floating Status Indicator Banner during Inspect Mode */
    .ag-mode-banner {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #0f172a;
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #f8fafc;
      padding: 8px 18px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      display: none;
      align-items: center;
      gap: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(99, 102, 241, 0.3);
      animation: bannerFadeIn 0.2s ease-out;
    }
    .ag-mode-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulse 1.5s infinite;
    }
    .ag-mode-exit {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ag-mode-exit:hover { background: rgba(255, 255, 255, 0.2); color: #fff; }

    /* Modal Overlay & Card */
    .ag-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(8px);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    .ag-modal-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    .ag-modal {
      background: #0f172a;
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 16px;
      width: 500px;
      max-width: 92vw;
      padding: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.25);
      color: #f8fafc;
      transform: scale(0.96);
      transition: transform 0.2s ease;
    }
    .ag-modal-overlay.open .ag-modal {
      transform: scale(1);
    }
    .ag-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .ag-modal-title {
      font-size: 16px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #f1f5f9;
    }
    .ag-modal-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
    }
    .ag-modal-close:hover { color: #fff; }

    .ag-target-box {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #38bdf8;
      word-break: break-all;
      max-height: 95px;
      overflow-y: auto;
    }
    .ag-target-label {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 600;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .ag-textarea-label {
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 6px;
      display: block;
    }
    .ag-textarea {
      width: 100%;
      height: 110px;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 12px;
      color: #f8fafc;
      font-size: 13px;
      resize: vertical;
      outline: none;
      transition: border-color 0.2s ease;
      margin-bottom: 16px;
    }
    .ag-textarea:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
    }

    .ag-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .ag-btn-cancel {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #94a3b8;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .ag-btn-cancel:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
    .ag-btn-send {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      border: none;
      color: #ffffff;
      padding: 8px 18px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
    }
    .ag-btn-send:hover { background: linear-gradient(135deg, #4f46e5, #4338ca); }
    .ag-btn-send:disabled { opacity: 0.6; cursor: not-allowed; }

    .ag-toast {
      position: fixed;
      top: 24px;
      right: 24px;
      background: #0f172a;
      border: 1px solid #10b981;
      color: #a7f3d0;
      padding: 12px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      display: none;
      z-index: 2147483647;
      animation: toastFade 0.2s ease;
    }
    @keyframes toastFade {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
  `;
  shadow.appendChild(style);

  // Highlighter Element
  const highlighter = document.createElement('div');
  highlighter.className = 'ag-highlighter';
  const highlighterBadge = document.createElement('div');
  highlighterBadge.className = 'ag-highlighter-badge';
  highlighter.appendChild(highlighterBadge);
  shadow.appendChild(highlighter);

  // Full-Screen Click Trap & Hit-Testing Layer
  const clickTrap = document.createElement('div');
  clickTrap.className = 'ag-click-trap';
  shadow.appendChild(clickTrap);

  // Mode Banner
  const modeBanner = document.createElement('div');
  modeBanner.className = 'ag-mode-banner';
  modeBanner.innerHTML = `
    <span class="ag-mode-dot"></span>
    <span>Click any element to comment for Antigravity IDE</span>
    <button class="ag-mode-exit" id="agExitBtn">Esc to exit</button>
  `;
  shadow.appendChild(modeBanner);

  // Modal
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'ag-modal-overlay';
  modalOverlay.innerHTML = `
    <div class="ag-modal">
      <div class="ag-modal-header">
        <div class="ag-modal-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          Antigravity UI Code Reflector
        </div>
        <button class="ag-modal-close" id="agModalClose">&times;</button>
      </div>

      <div class="ag-target-label">Selected Element</div>
      <div class="ag-target-box" id="agTargetPreview">&lt;element&gt;</div>

      <label class="ag-textarea-label" for="agCommentInput">What changes should Antigravity IDE make?</label>
      <textarea
        id="agCommentInput"
        class="ag-textarea"
        placeholder="e.g. Change button color to emerald green, add 12px padding, make corners rounded."
      ></textarea>

      <div class="ag-modal-actions">
        <button class="ag-btn-cancel" id="agBtnCancel">Cancel</button>
        <button class="ag-btn-send" id="agBtnSend">
          <span>Send to Antigravity</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  `;
  shadow.appendChild(modalOverlay);

  // Toast
  const toast = document.createElement('div');
  toast.className = 'ag-toast';
  shadow.appendChild(toast);

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.style.borderColor = isError ? '#f43f5e' : '#10b981';
    toast.style.color = isError ? '#fecdd3' : '#a7f3d0';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 4500);
  }

  // Get CSS Selector
  function getCssSelector(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += '#' + el.id;
        path.unshift(selector);
        break;
      } else {
        let sibling = el;
        let nth = 1;
        while ((sibling = sibling.previousElementSibling)) {
          if (sibling.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(' > ');
  }

  // Temporary document override styles to guarantee disabled elements are hit-testable
  let pageOverrideStyle = null;

  function injectPageOverrideStyles() {
    if (pageOverrideStyle) return;
    try {
      pageOverrideStyle = document.createElement('style');
      pageOverrideStyle.id = 'ag-inspect-overrides';
      pageOverrideStyle.textContent = `
        [disabled], :disabled, [aria-disabled="true"], button, input, select, textarea {
          pointer-events: auto !important;
          cursor: crosshair !important;
        }
      `;
      (document.head || document.documentElement).appendChild(pageOverrideStyle);
    } catch (e) {}
  }

  function removePageOverrideStyles() {
    if (pageOverrideStyle) {
      pageOverrideStyle.remove();
      pageOverrideStyle = null;
    }
  }

  // Hit-Testing: Safely resolves any element under coordinates, including disabled controls
  function resolveElementAtPoint(x, y) {
    clickTrap.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    clickTrap.style.pointerEvents = 'auto';

    if (!el || el === container || container.contains(el) || el === document.documentElement || el === document.body) {
      return null;
    }
    return el;
  }

  // Position and display the highlighter frame around target element
  function highlightElement(el) {
    if (!el) {
      highlighter.style.display = 'none';
      hoveredElement = null;
      return;
    }

    hoveredElement = el;
    const rect = el.getBoundingClientRect();

    highlighter.style.display = 'block';
    highlighter.style.top = `${rect.top}px`;
    highlighter.style.left = `${rect.left}px`;
    highlighter.style.width = `${rect.width}px`;
    highlighter.style.height = `${rect.height}px`;

    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      : '';
    const isDisabled = el.disabled || el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled') === 'true';
    const disabledBadge = isDisabled ? ' [disabled]' : '';

    highlighterBadge.textContent = `${tag}${id}${classes}${disabledBadge} (${Math.round(rect.width)}×${Math.round(rect.height)})`;
  }

  // Toggle Inspector Mode
  function toggleInspectMode(forceState) {
    isInspectMode = forceState !== undefined ? forceState : !isInspectMode;

    if (isInspectMode) {
      injectPageOverrideStyles();
      clickTrap.style.display = 'block';
      modeBanner.style.display = 'flex';
      window.addEventListener('keydown', onKeyDown, true);
    } else {
      removePageOverrideStyles();
      clickTrap.style.display = 'none';
      modeBanner.style.display = 'none';
      highlighter.style.display = 'none';
      hoveredElement = null;
      window.removeEventListener('keydown', onKeyDown, true);
    }
  }
  window.__antigravityToggleInspector = toggleInspectMode;

  // Pointer Move on Click Trap
  clickTrap.addEventListener('pointermove', (e) => {
    if (!isInspectMode) return;
    const el = resolveElementAtPoint(e.clientX, e.clientY);
    highlightElement(el);
  });

  // Click on Click Trap (handles ANY element, including disabled buttons)
  clickTrap.addEventListener('click', (e) => {
    if (!isInspectMode) return;
    e.preventDefault();
    e.stopPropagation();

    const target = resolveElementAtPoint(e.clientX, e.clientY) || hoveredElement;
    if (target) {
      selectedElement = target;
      toggleInspectMode(false);
      openModal(selectedElement);
    }
  });

  // Allow scrolling with mouse wheel while in inspect mode
  clickTrap.addEventListener('wheel', (e) => {
    window.scrollBy({
      top: e.deltaY,
      left: e.deltaX,
      behavior: 'auto'
    });
    setTimeout(() => {
      const el = resolveElementAtPoint(e.clientX, e.clientY);
      highlightElement(el);
    }, 10);
  }, { passive: true });

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      toggleInspectMode(false);
      closeModal();
    }
  }

  function openModal(el) {
    const selector = getCssSelector(el);
    const htmlSnippet = el.outerHTML ? el.outerHTML.slice(0, 300) + (el.outerHTML.length > 300 ? '...' : '') : '';

    shadow.getElementById('agTargetPreview').textContent = `${selector}\n\n${htmlSnippet}`;
    const commentInput = shadow.getElementById('agCommentInput');
    commentInput.value = '';

    modalOverlay.classList.add('open');
    setTimeout(() => commentInput.focus(), 150);
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
  }

  // Submit Feedback to Bridge
  async function submitFeedback() {
    const comment = shadow.getElementById('agCommentInput').value.trim();
    if (!comment) {
      alert('Please enter instructions for Antigravity.');
      return;
    }

    const sendBtn = shadow.getElementById('agBtnSend');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending to IDE...';

    const selector = getCssSelector(selectedElement);
    const elementHtml = selectedElement ? selectedElement.outerHTML.slice(0, 1500) : '';

    try {
      const response = await fetch(BRIDGE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: window.location.href,
          element: elementHtml,
          selector: selector,
          comment: comment
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        closeModal();
        const ws = data.workspaceName ? `(${data.workspaceName}) ` : '';
        showToast(`✓ Visual feedback sent to Antigravity ${ws}chat! Review the plan in your IDE for approval.`);
      } else {
        showToast(`Delivery notice: ${data.message || 'Queued'}`, false);
        closeModal();
      }
    } catch (err) {
      showToast(`Bridge Connection Error: ${err.message}. Is "node server.js" running on port 4000?`, true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        <span>Send to Antigravity</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      `;
    }
  }

  // Listen for messages from background service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle-inspector') {
      toggleInspectMode();
      sendResponse({ status: isInspectMode ? 'activated' : 'deactivated' });
    }
  });

  // Modal event listeners
  shadow.getElementById('agExitBtn').addEventListener('click', () => toggleInspectMode(false));
  shadow.getElementById('agModalClose').addEventListener('click', closeModal);
  shadow.getElementById('agBtnCancel').addEventListener('click', closeModal);
  shadow.getElementById('agBtnSend').addEventListener('click', submitFeedback);

  // Automatically activate when freshly injected
  toggleInspectMode(true);
})();
