/**
 * Antigravity Visual Inspector Widget
 * Allows users to hover, select any element on any webpage, add feedback,
 * and send it directly to Antigravity IDE to trigger automatic code updates.
 */

(() => {
  'use strict';

  // Prevent multiple injections
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

  // Create isolated container
  const container = document.createElement('div');
  container.id = 'ag-inspector-root';
  document.body.appendChild(container);

  // Attach Shadow DOM to prevent CSS collision
  const shadow = container.attachShadow({ mode: 'open' });

  // Stylesheet
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    /* Floating Activation Badge */
    .ag-badge {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 18px;
      border-radius: 9999px;
      border: 1px solid rgba(99, 102, 241, 0.4);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px rgba(99, 102, 241, 0.3);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s ease;
      user-select: none;
    }
    .ag-badge:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 24px rgba(99, 102, 241, 0.5);
      background: #1e1b4b;
      border-color: #6366f1;
    }
    .ag-badge.active {
      background: #4338ca;
      border-color: #818cf8;
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.8);
    }
    .ag-badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }
    .ag-badge.active .ag-badge-dot {
      background: #f43f5e;
      box-shadow: 0 0 8px #f43f5e;
    }

    /* Inspection Highlighter Box */
    .ag-highlighter {
      position: fixed;
      pointer-events: none;
      z-index: 2147483640;
      border: 2px solid #6366f1;
      background: rgba(99, 102, 241, 0.15);
      border-radius: 4px;
      transition: all 0.05s ease;
      display: none;
    }
    .ag-highlighter-label {
      position: absolute;
      top: -26px;
      left: -2px;
      background: #4f46e5;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      font-family: monospace;
      padding: 2px 8px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    /* Feedback Modal */
    .ag-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
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
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 16px;
      width: 480px;
      max-width: 90vw;
      padding: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(99, 102, 241, 0.2);
      color: #f8fafc;
      transform: scale(0.95);
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
      color: #e2e8f0;
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
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-family: monospace;
      font-size: 12px;
      color: #38bdf8;
      word-break: break-all;
      max-height: 90px;
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

    .ag-status-toast {
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
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      display: none;
      z-index: 2147483647;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  shadow.appendChild(style);

  // Highlighting Frame
  const highlighter = document.createElement('div');
  highlighter.className = 'ag-highlighter';
  const highlighterLabel = document.createElement('div');
  highlighterLabel.className = 'ag-highlighter-label';
  highlighter.appendChild(highlighterLabel);
  shadow.appendChild(highlighter);

  // Floating Activation Badge
  const badge = document.createElement('div');
  badge.className = 'ag-badge';
  badge.innerHTML = `
    <span class="ag-badge-dot"></span>
    <span id="ag-badge-text">Inspect for Antigravity</span>
  `;
  shadow.appendChild(badge);

  // Feedback Modal
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
      <div class="ag-target-box" id="agTargetPreview">&lt;button&gt;</div>

      <label class="ag-textarea-label" for="agCommentInput">What changes should Antigravity IDE make?</label>
      <textarea
        id="agCommentInput"
        class="ag-textarea"
        placeholder="e.g. Change button color to cyber cyan, add 8px padding, make corners rounded, and adjust hover glow."
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
  toast.className = 'ag-status-toast';
  shadow.appendChild(toast);

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.style.borderColor = isError ? '#f43f5e' : '#10b981';
    toast.style.color = isError ? '#fecdd3' : '#a7f3d0';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  }

  // Helper to generate CSS selector for element
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

  // Toggle Inspect Mode
  function toggleInspectMode(forceState) {
    isInspectMode = forceState !== undefined ? forceState : !isInspectMode;
    const badgeText = shadow.getElementById('ag-badge-text');

    if (isInspectMode) {
      badge.classList.add('active');
      badgeText.textContent = 'Click an element to edit (Esc to exit)';
      document.addEventListener('mouseover', onMouseOver, true);
      document.addEventListener('click', onElementClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    } else {
      badge.classList.remove('active');
      badgeText.textContent = 'Inspect for Antigravity';
      highlighter.style.display = 'none';
      hoveredElement = null;
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('click', onElementClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    }
  }
  window.__antigravityToggleInspector = toggleInspectMode;

  function onMouseOver(e) {
    if (!isInspectMode) return;
    // Don't inspect inspector's own elements
    if (container.contains(e.target) || e.target === container) return;

    hoveredElement = e.target;
    const rect = hoveredElement.getBoundingClientRect();

    highlighter.style.display = 'block';
    highlighter.style.top = `${rect.top}px`;
    highlighter.style.left = `${rect.left}px`;
    highlighter.style.width = `${rect.width}px`;
    highlighter.style.height = `${rect.height}px`;

    const tag = hoveredElement.tagName.toLowerCase();
    const id = hoveredElement.id ? `#${hoveredElement.id}` : '';
    const classes = hoveredElement.className && typeof hoveredElement.className === 'string'
      ? '.' + hoveredElement.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    highlighterLabel.textContent = `${tag}${id}${classes} (${Math.round(rect.width)}×${Math.round(rect.height)})`;
  }

  function onElementClick(e) {
    if (!isInspectMode) return;
    if (container.contains(e.target) || e.target === container) return;

    e.preventDefault();
    e.stopPropagation();

    selectedElement = e.target;
    toggleInspectMode(false); // Stop inspecting
    openModal(selectedElement);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      toggleInspectMode(false);
      closeModal();
    }
  }

  function openModal(el) {
    const selector = getCssSelector(el);
    const htmlSnippet = el.outerHTML ? el.outerHTML.slice(0, 250) + (el.outerHTML.length > 250 ? '...' : '') : '';
    
    shadow.getElementById('agTargetPreview').textContent = `${selector}\n\n${htmlSnippet}`;
    const commentInput = shadow.getElementById('agCommentInput');
    commentInput.value = '';
    
    modalOverlay.classList.add('open');
    setTimeout(() => commentInput.focus(), 150);
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
  }

  // Send Feedback to Bridge Server
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
    const elementHtml = selectedElement ? selectedElement.outerHTML.slice(0, 1000) : '';

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
        showToast('✓ Instructions sent to Antigravity IDE! Check IDE for changes.');
      } else {
        showToast(`Failed: ${data.error || 'Server error'}`, true);
      }
    } catch (err) {
      showToast(`Bridge Connection Failed: ${err.message}. Is server running on port 4000?`, true);
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

  // Event Listeners inside Shadow DOM
  badge.addEventListener('click', () => toggleInspectMode());
  shadow.getElementById('agModalClose').addEventListener('click', closeModal);
  shadow.getElementById('agBtnCancel').addEventListener('click', closeModal);
  shadow.getElementById('agBtnSend').addEventListener('click', submitFeedback);

  console.log('%c[Antigravity]%c Visual UI Inspector loaded. Click the badge in bottom-right to inspect.', 'background: #6366f1; color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #818cf8;');
})();
