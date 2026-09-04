/**
 * Antigravity Visual Inspector - Content Script
 * Injected into webpages to provide:
 * 1. DOM Visual element selection & inspection (with disabled element support)
 * 2. Lightshot-style Screenshot Capture & Markup tool (Rectangle, Arrow, Pen, Text)
 * 3. Direct feedback dispatch with annotated screenshots to Antigravity IDE
 */

(() => {
  'use strict';

  // Clean up any existing inspector host and styles from previous versions
  if (window.__antigravityCleanup) {
    try { window.__antigravityCleanup(); } catch (e) {}
  }
  const oldHost = document.getElementById('antigravity-inspector-host');
  if (oldHost) {
    try { oldHost.remove(); } catch (e) {}
  }
  const oldOverrides = document.getElementById('ag-inspect-overrides');
  if (oldOverrides) {
    try { oldOverrides.remove(); } catch (e) {}
  }
  window.__antigravityInspectorInitialized = true;

  const BRIDGE_API_URL = 'http://localhost:4000/api/feedback';
  let isInspectMode = false;
  let isScreenshotMode = false;
  let hoveredElement = null;
  let selectedElement = null;
  let currentScreenshotDataUrl = null;

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
      gap: 12px;
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
    .ag-banner-action-btn {
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.5);
      color: #38bdf8;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .ag-banner-action-btn:hover {
      background: rgba(99, 102, 241, 0.4);
      color: #ffffff;
    }
    .ag-mode-exit {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #cbd5e1;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ag-mode-exit:hover { background: rgba(255, 255, 255, 0.2); color: #fff; }

    /* Screenshot Annotation Overlay & Canvas */
    .ag-screenshot-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483643;
      display: none;
      user-select: none;
      -webkit-user-select: none;
      background: #000;
    }
    .ag-screenshot-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      cursor: crosshair;
      display: block;
    }

    /* In-Place Inline Text Annotation Input */
    .ag-inline-text-input {
      position: absolute;
      background: rgba(15, 23, 42, 0.85);
      border: 1.5px dashed rgba(255, 255, 255, 0.75);
      border-radius: 6px;
      outline: none;
      font-weight: 700;
      font-size: 15px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 5px 9px;
      margin: 0;
      min-width: 140px;
      max-width: 380px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 10px rgba(99, 102, 241, 0.3);
      z-index: 2147483647;
      line-height: 1.4;
      resize: none;
      overflow: hidden;
      box-sizing: border-box;
      caret-color: #ffffff;
      white-space: pre-wrap;
      word-break: break-word;
      transition: border-color 0.15s ease;
    }
    .ag-inline-text-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.4);
    }

    /* Floating Annotation Toolbar (Lightshot Style) */
    .ag-annotation-toolbar {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #0f172a;
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 9999px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(99, 102, 241, 0.25);
      animation: bannerFadeIn 0.2s ease-out;
    }
    .ag-tool-btn {
      background: transparent;
      border: 1px solid transparent;
      color: #94a3b8;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.15s ease;
    }
    .ag-tool-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #f8fafc;
    }
    .ag-tool-btn.active {
      background: rgba(99, 102, 241, 0.25);
      border-color: #6366f1;
      color: #38bdf8;
    }
    .ag-toolbar-sep {
      width: 1px;
      height: 20px;
      background: rgba(255, 255, 255, 0.15);
      margin: 0 2px;
    }
    .ag-color-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid transparent;
      transition: transform 0.15s ease;
    }
    .ag-color-dot:hover { transform: scale(1.15); }
    .ag-color-dot.active { border-color: #ffffff; box-shadow: 0 0 8px rgba(255, 255, 255, 0.9); }
    .ag-done-btn {
      background: linear-gradient(135deg, #10b981, #059669);
      border: none;
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 10px rgba(16, 185, 129, 0.4);
      transition: all 0.15s ease;
    }
    .ag-done-btn:hover {
      background: linear-gradient(135deg, #059669, #047857);
      transform: translateY(-1px);
    }

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
      width: 520px;
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

    .ag-target-label {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }
    .ag-target-box {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px 12px;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: #38bdf8;
      margin-bottom: 16px;
      max-height: 90px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .ag-screenshot-preview-box {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(99, 102, 241, 0.3);
      background: #020617;
      max-height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }
    .ag-screenshot-preview-box img {
      max-width: 100%;
      max-height: 180px;
      object-fit: contain;
      display: block;
    }

    .ag-textarea-label {
      font-size: 12px;
      font-weight: 600;
      color: #e2e8f0;
      margin-bottom: 6px;
      display: block;
    }
    .ag-textarea {
      width: 100%;
      height: 95px;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #f8fafc;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.4;
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
    @keyframes bannerFadeIn {
      from { opacity: 0; transform: translate(-50%, -10px); }
      to { opacity: 1; transform: translate(-50%, 0); }
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
    <span>Click any element to comment</span>
    <button class="ag-banner-action-btn" id="agSwitchToScreenshot">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
      Screenshot &amp; Mark
    </button>
    <button class="ag-mode-exit" id="agExitBtn">Esc to exit</button>
  `;
  shadow.appendChild(modeBanner);

  // Screenshot Annotation Overlay & Toolbar
  const screenshotOverlay = document.createElement('div');
  screenshotOverlay.className = 'ag-screenshot-overlay';

  const screenshotCanvas = document.createElement('canvas');
  screenshotCanvas.className = 'ag-screenshot-canvas';
  screenshotOverlay.appendChild(screenshotCanvas);

  const annotationToolbar = document.createElement('div');
  annotationToolbar.className = 'ag-annotation-toolbar';
  annotationToolbar.innerHTML = `
    <button class="ag-tool-btn active" data-tool="rect" title="Rectangle Box (R)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      </svg>
    </button>
    <button class="ag-tool-btn" data-tool="arrow" title="Arrow (A)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="19" x2="19" y2="5"></line>
        <polyline points="12 5 19 5 19 12"></polyline>
      </svg>
    </button>
    <button class="ag-tool-btn" data-tool="pen" title="Freehand Pen (P)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
      </svg>
    </button>
    <button class="ag-tool-btn" data-tool="text" title="Text Label (T)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 7 4 4 20 4 20 7"></polyline>
        <line x1="9" y1="20" x2="15" y2="20"></line>
        <line x1="12" y1="4" x2="12" y2="20"></line>
      </svg>
    </button>
    <div class="ag-toolbar-sep"></div>
    <div class="ag-color-dot active" data-color="#ef4444" style="background: #ef4444;" title="Red"></div>
    <div class="ag-color-dot" data-color="#3b82f6" style="background: #3b82f6;" title="Blue"></div>
    <div class="ag-color-dot" data-color="#10b981" style="background: #10b981;" title="Green"></div>
    <div class="ag-color-dot" data-color="#f59e0b" style="background: #f59e0b;" title="Yellow"></div>
    <div class="ag-toolbar-sep"></div>
    <button class="ag-tool-btn" id="agBtnUndo" title="Undo (Cmd/Ctrl + Z)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v6h6"></path>
        <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"></path>
      </svg>
    </button>
    <button class="ag-tool-btn" id="agBtnClear" title="Clear All Markings">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
    <button class="ag-tool-btn" id="agBtnCancelScreenshot" title="Exit (Esc)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <button class="ag-done-btn" id="agBtnDoneScreenshot">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Done
    </button>
  `;
  screenshotOverlay.appendChild(annotationToolbar);
  shadow.appendChild(screenshotOverlay);

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

      <!-- Target DOM Element Preview (in element inspect mode) -->
      <div id="agTargetSection">
        <div class="ag-target-label">Selected Element</div>
        <div class="ag-target-box" id="agTargetPreview">&lt;element&gt;</div>
      </div>

      <!-- Screenshot Preview Card (in screenshot mode) -->
      <div id="agScreenshotSection" style="display: none;">
        <div class="ag-target-label">Annotated Screenshot</div>
        <div class="ag-screenshot-preview-box">
          <img id="agScreenshotThumb" alt="Annotated Screenshot Preview" />
        </div>
      </div>

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

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.style.borderColor = isError ? '#f43f5e' : '#10b981';
    toast.style.color = isError ? '#fecdd3' : '#a7f3d0';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 4500);
  }

  // CSS Selector Generator
  function getCssSelector(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += `#${el.id}`;
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

  // Toggle DOM Inspector Mode
  function toggleInspectMode(forceState) {
    isInspectMode = forceState !== undefined ? forceState : !isInspectMode;

    if (isInspectMode) {
      if (isScreenshotMode) exitScreenshotMode();
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
      currentScreenshotDataUrl = null;
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

  /* ==========================================================================
     LIGHTSHOT-STYLE SCREENSHOT & ANNOTATION ENGINE
     ========================================================================== */

  let screenshotBgImage = null;
  let shapes = [];
  let currentTool = 'rect'; // 'rect', 'arrow', 'pen', 'text'
  let currentColor = '#ef4444'; // Red default
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentPoints = [];
  let dpr = window.devicePixelRatio || 1;

  async function startScreenshotMode() {
    if (isInspectMode) toggleInspectMode(false);
    isScreenshotMode = true;

    // Guard against extension context invalidation (e.g. extension reloaded in chrome://extensions)
    if (!chrome.runtime?.id) {
      showToast('Extension was reloaded. Please refresh this webpage to reconnect inspector.', true);
      exitScreenshotMode();
      return;
    }

    try {
      chrome.runtime.sendMessage({ action: 'capture-tab' }, (response) => {
        if (chrome.runtime?.lastError) {
          showToast(`Capture notice: ${chrome.runtime.lastError.message}`, true);
          exitScreenshotMode();
          return;
        }
        if (!response || !response.success || !response.dataUrl) {
          showToast(`Screenshot capture failed: ${response?.error || 'Unknown error'}`, true);
          exitScreenshotMode();
          return;
        }

      screenshotBgImage = new Image();
      screenshotBgImage.onload = () => {
        dpr = window.devicePixelRatio || 1;
        screenshotCanvas.width = window.innerWidth * dpr;
        screenshotCanvas.height = window.innerHeight * dpr;
        screenshotCanvas.style.width = `${window.innerWidth}px`;
        screenshotCanvas.style.height = `${window.innerHeight}px`;

        shapes = [];
        redrawCanvas();
        screenshotOverlay.style.display = 'block';
        window.addEventListener('keydown', onKeyDown, true);
      };
      screenshotBgImage.src = response.dataUrl;
    });
  } catch (err) {
    showToast('Extension was reloaded. Please refresh this page to re-attach inspector.', true);
    exitScreenshotMode();
  }
}

  let activeTextInput = null;

  function commitActiveTextInput() {
    if (!activeTextInput) return;
    const input = activeTextInput;
    const val = input.value.trim();
    const x = parseFloat(input.dataset.canvasX);
    const y = parseFloat(input.dataset.canvasY);
    const color = input.dataset.color || currentColor;

    activeTextInput = null;
    input.remove();

    if (val) {
      shapes.push({
        type: 'text',
        text: val,
        x: x,
        y: y,
        color: color
      });
      redrawCanvas();
    }
  }

  function cancelActiveTextInput() {
    if (!activeTextInput) return;
    const input = activeTextInput;
    activeTextInput = null;
    input.remove();
  }

  function exitScreenshotMode() {
    cancelActiveTextInput();
    isScreenshotMode = false;
    screenshotOverlay.style.display = 'none';
    shapes = [];
    isDrawing = false;
    window.removeEventListener('keydown', onKeyDown, true);
  }

  // Draw arrow with sharp arrowhead
  function drawArrow(ctx, x1, y1, x2, y2, color, lineWidth) {
    const headLength = 16 * dpr;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Main line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw rectangle with clean stroke
  function drawRect(ctx, x1, y1, x2, y2, color, lineWidth) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.restore();
  }

  // Draw freehand stroke
  function drawPen(ctx, points, color, lineWidth) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw text label
  function drawText(ctx, x, y, text, color) {
    if (!text) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `bold ${16 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'top';

    // High-contrast text shadow for perfect readability on both light and dark pages
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4 * dpr;
    ctx.shadowOffsetX = 1 * dpr;
    ctx.shadowOffsetY = 1 * dpr;

    const lines = text.split('\n');
    const lineHeight = 20 * dpr;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + (i * lineHeight));
    }
    ctx.restore();
  }

  // Redraw all shapes on canvas
  function redrawCanvas(previewX, previewY) {
    const ctx = screenshotCanvas.getContext('2d');
    ctx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);

    // Draw background screenshot image
    if (screenshotBgImage) {
      ctx.drawImage(screenshotBgImage, 0, 0, screenshotCanvas.width, screenshotCanvas.height);
    }

    const defaultLineWidth = 3.5 * dpr;

    // Draw persisted shapes
    for (const shape of shapes) {
      if (shape.type === 'rect') {
        drawRect(ctx, shape.x1, shape.y1, shape.x2, shape.y2, shape.color, shape.lineWidth || defaultLineWidth);
      } else if (shape.type === 'arrow') {
        drawArrow(ctx, shape.x1, shape.y1, shape.x2, shape.y2, shape.color, shape.lineWidth || defaultLineWidth);
      } else if (shape.type === 'pen') {
        drawPen(ctx, shape.points, shape.color, shape.lineWidth || defaultLineWidth);
      } else if (shape.type === 'text') {
        drawText(ctx, shape.x, shape.y, shape.text, shape.color);
      }
    }

    // Draw live preview shape currently being dragged
    if (isDrawing && previewX !== undefined && previewY !== undefined) {
      if (currentTool === 'rect') {
        drawRect(ctx, startX, startY, previewX, previewY, currentColor, defaultLineWidth);
      } else if (currentTool === 'arrow') {
        drawArrow(ctx, startX, startY, previewX, previewY, currentColor, defaultLineWidth);
      } else if (currentTool === 'pen') {
        drawPen(ctx, currentPoints, currentColor, defaultLineWidth);
      }
    }
  }

  // Pointer Events on Annotation Canvas
  screenshotCanvas.addEventListener('pointerdown', (e) => {
    if (!isScreenshotMode) return;
    dpr = window.devicePixelRatio || 1;
    startX = e.clientX * dpr;
    startY = e.clientY * dpr;

    if (currentTool === 'text') {
      if (activeTextInput) {
        commitActiveTextInput();
      }

      const input = document.createElement('textarea');
      input.className = 'ag-inline-text-input';
      input.style.left = `${e.clientX}px`;
      input.style.top = `${e.clientY}px`;
      input.style.color = currentColor;
      input.placeholder = 'Type note here... (Enter to finish)';
      input.rows = 1;

      input.dataset.canvasX = startX;
      input.dataset.canvasY = startY;
      input.dataset.color = currentColor;

      screenshotOverlay.appendChild(input);
      activeTextInput = input;

      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
      });

      input.addEventListener('keydown', (ke) => {
        ke.stopPropagation();
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          commitActiveTextInput();
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          cancelActiveTextInput();
        }
      });

      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (activeTextInput === input) {
            commitActiveTextInput();
          }
        }, 120);
      });

      setTimeout(() => {
        input.focus();
      }, 10);

      return;
    }

    isDrawing = true;
    if (currentTool === 'pen') {
      currentPoints = [{ x: startX, y: startY }];
    }
  });

  screenshotCanvas.addEventListener('pointermove', (e) => {
    if (!isScreenshotMode || !isDrawing) return;
    const currX = e.clientX * dpr;
    const currY = e.clientY * dpr;

    if (currentTool === 'pen') {
      currentPoints.push({ x: currX, y: currY });
    }
    redrawCanvas(currX, currY);
  });

  screenshotCanvas.addEventListener('pointerup', (e) => {
    if (!isScreenshotMode || !isDrawing) return;
    isDrawing = false;
    const currX = e.clientX * dpr;
    const currY = e.clientY * dpr;
    const defaultLineWidth = 3.5 * dpr;

    if (currentTool === 'rect') {
      if (Math.abs(currX - startX) > 4 || Math.abs(currY - startY) > 4) {
        shapes.push({
          type: 'rect',
          color: currentColor,
          x1: startX,
          y1: startY,
          x2: currX,
          y2: currY,
          lineWidth: defaultLineWidth
        });
      }
    } else if (currentTool === 'arrow') {
      if (Math.abs(currX - startX) > 6 || Math.abs(currY - startY) > 6) {
        shapes.push({
          type: 'arrow',
          color: currentColor,
          x1: startX,
          y1: startY,
          x2: currX,
          y2: currY,
          lineWidth: defaultLineWidth
        });
      }
    } else if (currentTool === 'pen') {
      if (currentPoints.length > 1) {
        shapes.push({
          type: 'pen',
          color: currentColor,
          points: [...currentPoints],
          lineWidth: defaultLineWidth
        });
      }
    }

    redrawCanvas();
  });

  // Annotation Toolbar Events
  annotationToolbar.querySelectorAll('.ag-tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      commitActiveTextInput();
      annotationToolbar.querySelectorAll('.ag-tool-btn[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTool = btn.getAttribute('data-tool');
      screenshotCanvas.style.cursor = currentTool === 'text' ? 'text' : 'crosshair';
    });
  });

  annotationToolbar.querySelectorAll('.ag-color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      annotationToolbar.querySelectorAll('.ag-color-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      currentColor = dot.getAttribute('data-color');
      if (activeTextInput) {
        activeTextInput.style.color = currentColor;
        activeTextInput.dataset.color = currentColor;
      }
    });
  });

  // Undo
  shadow.getElementById('agBtnUndo').addEventListener('click', () => {
    if (activeTextInput) {
      cancelActiveTextInput();
      return;
    }
    if (shapes.length > 0) {
      shapes.pop();
      redrawCanvas();
    }
  });

  // Clear
  shadow.getElementById('agBtnClear').addEventListener('click', () => {
    cancelActiveTextInput();
    if (shapes.length > 0) {
      shapes = [];
      redrawCanvas();
    }
  });

  // Cancel Screenshot
  shadow.getElementById('agBtnCancelScreenshot').addEventListener('click', exitScreenshotMode);

  // Done Marking -> Open Feedback Modal with Screenshot
  shadow.getElementById('agBtnDoneScreenshot').addEventListener('click', () => {
    commitActiveTextInput();
    currentScreenshotDataUrl = screenshotCanvas.toDataURL('image/png');
    exitScreenshotMode();
    selectedElement = null;
    openModalWithScreenshot(currentScreenshotDataUrl);
  });

  // Switch to screenshot mode from inspect banner
  shadow.getElementById('agSwitchToScreenshot').addEventListener('click', () => {
    toggleInspectMode(false);
    startScreenshotMode();
  });

  function onKeyDown(e) {
    const focusedEl = shadow.activeElement || document.activeElement;
    if (activeTextInput && (activeTextInput === focusedEl || activeTextInput.contains(focusedEl))) {
      return;
    }
    if (e.key === 'Escape') {
      if (activeTextInput) {
        cancelActiveTextInput();
        return;
      }
      if (isScreenshotMode) exitScreenshotMode();
      if (isInspectMode) toggleInspectMode(false);
      closeModal();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && isScreenshotMode) {
      e.preventDefault();
      if (activeTextInput) {
        cancelActiveTextInput();
        return;
      }
      if (shapes.length > 0) {
        shapes.pop();
        redrawCanvas();
      }
    }
  }

  // Open Modal for Element Inspection
  function openModal(el) {
    const selector = getCssSelector(el);
    const htmlSnippet = el.outerHTML ? el.outerHTML.slice(0, 300) + (el.outerHTML.length > 300 ? '...' : '') : '';

    shadow.getElementById('agTargetSection').style.display = 'block';
    shadow.getElementById('agScreenshotSection').style.display = 'none';
    shadow.getElementById('agTargetPreview').textContent = `${selector}\n\n${htmlSnippet}`;

    const commentInput = shadow.getElementById('agCommentInput');
    commentInput.value = '';
    commentInput.placeholder = 'e.g. Change button color to emerald green, add 12px padding, make corners rounded.';

    modalOverlay.classList.add('open');
    setTimeout(() => commentInput.focus(), 150);
  }

  // Open Modal for Screenshot & Annotations
  function openModalWithScreenshot(dataUrl) {
    shadow.getElementById('agTargetSection').style.display = 'none';
    shadow.getElementById('agScreenshotSection').style.display = 'block';
    shadow.getElementById('agScreenshotThumb').src = dataUrl;

    const commentInput = shadow.getElementById('agCommentInput');
    commentInput.value = '';
    commentInput.placeholder = 'Describe the changes marked in your screenshot (e.g. Move logo to left, update input border color)...';

    modalOverlay.classList.add('open');
    setTimeout(() => commentInput.focus(), 150);
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
    currentScreenshotDataUrl = null;
  }

  // Submit Feedback to Bridge Server
  async function submitFeedback() {
    const comment = shadow.getElementById('agCommentInput').value.trim();
    if (!comment) {
      alert('Please enter instructions for Antigravity.');
      return;
    }

    const sendBtn = shadow.getElementById('agBtnSend');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending to IDE...';

    const selector = selectedElement ? getCssSelector(selectedElement) : '';
    const elementHtml = selectedElement ? selectedElement.outerHTML.slice(0, 1500) : '';

    try {
      const response = await fetch(BRIDGE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: window.location.href,
          element: elementHtml,
          selector: selector,
          comment: comment,
          screenshot: currentScreenshotDataUrl || undefined
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        closeModal();
        const ws = data.workspaceName ? `(${data.workspaceName}) ` : '';
        const imgNotice = data.savedScreenshotPath ? 'with annotated screenshot ' : '';
        showToast(`✓ Visual feedback ${imgNotice}sent to Antigravity ${ws}chat! Review the plan in your IDE for approval.`);
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
    if (request.action === 'ping-version') {
      sendResponse({ status: 'ok', version: '2.0.2' });
      return true;
    }
    if (request.action === 'toggle-inspector') {
      if (request.mode === 'screenshot') {
        startScreenshotMode();
        sendResponse({ status: 'screenshot_mode_activated', version: '2.0.2' });
      } else {
        toggleInspectMode();
        sendResponse({ status: isInspectMode ? 'activated' : 'deactivated', version: '2.0.2' });
      }
      return true;
    }
  });

  // Modal event listeners
  shadow.getElementById('agExitBtn').addEventListener('click', () => toggleInspectMode(false));
  shadow.getElementById('agModalClose').addEventListener('click', closeModal);
  shadow.getElementById('agBtnCancel').addEventListener('click', closeModal);
  shadow.getElementById('agBtnSend').addEventListener('click', submitFeedback);

  // Global cleanup registration for hot-reloads
  window.__antigravityCleanup = () => {
    try { container.remove(); } catch (e) {}
    try { removePageOverrideStyles(); } catch (e) {}
    window.removeEventListener('keydown', onKeyDown, true);
  };
})();
