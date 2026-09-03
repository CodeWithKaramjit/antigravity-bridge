#!/usr/bin/env node

/**
 * Registers com.antigravity.bridge as a Chrome Native Messaging Host on macOS.
 * Installs the launcher into ~/.antigravity-bridge/host (outside ~/Downloads)
 * to prevent macOS TCC (Downloads folder sandbox) from blocking Chrome from executing the binary.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const EXTENSION_ID = 'jpphbibdggkjghjhmljpmckdoimgknml';
const NATIVE_HOSTS_DIR = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
const TARGET_JSON_PATH = path.join(NATIVE_HOSTS_DIR, 'com.antigravity.bridge.json');

const PROJECT_DIR = path.resolve(__dirname, '..');
const INSTALL_DIR = path.join(os.homedir(), '.antigravity-bridge/host');
const LAUNCHER_PATH = path.join(INSTALL_DIR, 'native-launcher.sh');

try {
  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  // Write config pointing back to project
  fs.writeFileSync(
    path.join(INSTALL_DIR, 'config.json'),
    JSON.stringify({ projectDir: PROJECT_DIR }, null, 2),
    'utf8'
  );

  // Copy launcher scripts to ~/.antigravity-bridge/host
  fs.copyFileSync(path.join(__dirname, 'native-launcher.sh'), LAUNCHER_PATH);
  fs.copyFileSync(path.join(__dirname, 'native-launcher.js'), path.join(INSTALL_DIR, 'native-launcher.js'));

  fs.chmodSync(LAUNCHER_PATH, 0o755);
  fs.chmodSync(path.join(INSTALL_DIR, 'native-launcher.js'), 0o755);

  const manifest = {
    name: 'com.antigravity.bridge',
    description: 'Antigravity Bridge Server Controller',
    path: LAUNCHER_PATH,
    type: 'stdio',
    allowed_origins: [
      `chrome-extension://${EXTENSION_ID}/`
    ]
  };

  fs.mkdirSync(NATIVE_HOSTS_DIR, { recursive: true });
  fs.writeFileSync(TARGET_JSON_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('✓ Successfully registered Native Messaging Host:');
  console.log(`  Installed Host: ${LAUNCHER_PATH}`);
  console.log(`  Manifest File: ${TARGET_JSON_PATH}`);
  console.log(`  Project Dir: ${PROJECT_DIR}`);
  console.log(`  Allowed Origin: chrome-extension://${EXTENSION_ID}/`);
} catch (err) {
  console.error('Failed to register native messaging host:', err.message);
  process.exit(1);
}
