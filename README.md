# 🚀 Antigravity Bridge & Visual Inspector

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-blue.svg)](https://expressjs.com/)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-orange.svg)](https://developer.chrome.com/docs/extensions/)
[![Tests](https://img.shields.io/badge/Tests-7%20Passed-brightgreen.svg)]()

A seamless bridge connecting your local web projects directly to **Google Antigravity IDE**. 

Inspect any DOM element, take **Lightshot-style annotated screenshots** (with arrows, red boxes, freehand pen, and text labels), and send visual feedback directly into your project's active Antigravity chat with an automatic **Plan-Before-Execution protocol**.

---

## 🌟 Key Features

- **📸 Lightshot-Style Screenshot & Markup Tool**:
  - Full-screen high-DPI viewport capture.
  - **Drawing Tools**: Rectangle Boxes (🔲), Directional Arrows (↗️), Freehand Pen (✏️), and Text Notes (🔤).
  - **Color Palette**: Red (`#ef4444`, default), Blue (`#3b82f6`), Green (`#10b981`), Yellow (`#f59e0b`).
  - **Controls**: Undo (<kbd>Cmd + Z</kbd>), Clear, Cancel (<kbd>Esc</kbd>), and Done (<kbd>✓</kbd>).
  - Instant screenshot thumbnail preview in the feedback modal.

- **🎯 DOM Visual Element Inspector**:
  - Hover over any element on the page with real-time bounding box and dimensions.
  - **Disabled Element Support**: Uses a transparent click-trap and hit-testing layer so even `<button disabled>`, `<input disabled>`, or elements with `pointer-events: none` can be inspected without browser suppression.

- **⚡ Automatic Port-to-Workspace Routing**:
  - Inspecting `localhost:5173`, `localhost:5174`, or any port automatically resolves the underlying project directory via OS process tracing (`lsof`) and sends the feedback directly to that project's active Antigravity session!

- **🚨 Mandatory Plan-First Protocol**:
  - Every visual feedback request automatically instructs the Antigravity agent to create an `implementation_plan.md` first and wait for your explicit approval before modifying code.

- **🛡️ Complete Shadow DOM Isolation**:
  - All extension UI and overlays are rendered inside an open Shadow DOM root, ensuring zero CSS collision with your application.

---

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Browser["Google Chrome"]
        EXT["Antigravity Inspector Extension"]
        CANVAS["Annotation Canvas (Lightshot Mode)"]
        INSPECT["DOM Click Trap (Inspect Mode)"]
        EXT --> CANVAS
        EXT --> INSPECT
    end

    subgraph Bridge["Bridge Server (localhost:4000)"]
        SRV["server.js (Express)"]
        ROUTER["Port-to-Workspace Router (lsof)"]
        STORAGE["Disk Storage (brain/screenshots)"]
        SRV --> ROUTER
        SRV --> STORAGE
    end

    subgraph IDE["Google Antigravity IDE"]
        CLI["agentapi CLI"]
        CHAT["Project Chat & Plan Generation"]
        CLI --> CHAT
    end

    CANVAS -- "Base64 Screenshot + Notes" --> SRV
    INSPECT -- "CSS Selector + OuterHTML" --> SRV
    SRV -- "Structured Engineering Prompt" --> CLI
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or later
- **Google Antigravity IDE**: Installed and running on macOS

---

### 2. Install & Start Bridge Server

```bash
# Clone the repository
git clone https://github.com/CodeWithKaramjit/antigravity-bridge.git
cd antigravity-bridge

# Install dependencies
npm install

# Start Bridge Server
npm start
```
The server will start on `http://localhost:4000`. You can visit this URL in your browser to view the active workspaces dashboard.

---

### 3. Install Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `chrome-extension` directory from this repository:
   ```
   /path/to/antigravity-bridge/chrome-extension
   ```
5. The **Antigravity Inspector** icon will appear in your Chrome toolbar.

---

## 🎮 How to Use

### Mode 1: Lightshot Screenshot & Annotation (Recommended)
1. Open your localhost web application (e.g., `http://localhost:5173` or `http://localhost:5174`).
2. Click the extension icon in Chrome toolbar and click **"📸 Screenshot & Annotate"** (or press <kbd>Option + S</kbd>).
3. Draw red boxes around elements to highlight, add arrows to point between components, or write text labels.
4. Click **Done (✓)** in the top floating toolbar.
5. In the modal, review your screenshot preview, type your instructions, and click **"Send to Antigravity"**.
6. Switch to your Antigravity IDE — your marked screenshot and prompt are already waiting in the chat!

### Mode 2: DOM Element Inspector
1. Click the extension icon and click **"🎯 Inspect DOM Element"** (or press <kbd>Option + A</kbd>).
2. Hover over any button, card, header, or disabled control.
3. Click the element to open the feedback modal with the CSS selector and HTML snippet pre-filled.
4. Type your instructions and click **"Send to Antigravity"**.

---

## ⌨️ Keyboard Shortcuts (Mac)

| Shortcut | Action |
| :--- | :--- |
| <kbd>Option + S</kbd> | Launch Screenshot & Annotation Mode |
| <kbd>Option + A</kbd> | Launch DOM Element Inspect Mode |
| <kbd>Cmd + Z</kbd> | Undo last drawn shape (in screenshot mode) |
| <kbd>Escape</kbd> | Exit inspect/screenshot mode or close modal |

---

## 🧪 Testing

Run the automated test suite covering health checks, workspace detection, port-based routing, feedback formatting, and screenshot persistence:

```bash
npm test
```

Sample output:
```
✔ 1. GET /health - Returns bridge status and active conversation
✔ 2. GET / - Serves Bridge Server status dashboard
✔ 3. GET /api/workspaces - Returns detected Antigravity workspaces
✔ 4. GET /health?url=http://localhost:5173 - Accurately routes to Rendosa workspace by port 5173
✔ 5. POST /api/feedback - Validates required instructions (HTTP 400 on empty)
✔ 6. POST /api/feedback - Forwards UI feedback to target project chat with plan requirement
✔ 7. POST /api/feedback - Saves base64 annotated screenshot to disk and forwards to IDE
ℹ pass 7, fail 0
```

---

## 📡 API Reference

### `GET /health`
Returns server status, active project, and open conversation metadata.
- **Query Params**: `url` (optional, e.g. `?url=http://localhost:5174`)

### `GET /api/workspaces`
Returns a grouped list of all detected Antigravity workspace folders and recent activity.

### `POST /api/feedback`
Receives element feedback and screenshots from the extension and forwards to Antigravity IDE.
- **Payload**:
  ```json
  {
    "pageUrl": "http://localhost:5174/auth/login",
    "selector": "button.login-btn",
    "element": "<button class=\"login-btn\" disabled>Sign In</button>",
    "comment": "Change button background to emerald green",
    "screenshot": "data:image/png;base64,..."
  }
  ```

---

## 📄 License

ISC License. Built for seamless AI-assisted web development with Google Antigravity IDE.
