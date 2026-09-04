const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLsAddressFromEnvText,
  parseCsrfTokenFromCommand,
  listIdePidsFromPsTable,
  parseLsofListenOutput,
  listListenCandidates,
  collectLsCandidates,
  resolveCsrfToken,
  resolveLsAddress,
  sanitizeFeedbackTitle,
  buildAgentApiEnv,
  LS_ENV_KEY,
  CSRF_ENV_KEY
} = require('../lib/agentapi-env');

describe('agentapi-env', () => {
  test('parseLsAddressFromEnvText reads only the LS key', () => {
    const text = 'PATH=/usr/bin ANTIGRAVITY_LS_ADDRESS=127.0.0.1:4123 HOME=/Users/me';
    assert.equal(parseLsAddressFromEnvText(text), '127.0.0.1:4123');
    assert.equal(parseLsAddressFromEnvText(''), null);
    assert.equal(parseLsAddressFromEnvText('HOME=/tmp'), null);
  });

  test('parseCsrfTokenFromCommand extracts token', () => {
    const cmd = '/path/language_server_macos_arm --csrf_token 824c1a15-3141-45a8-bdcd-30dc9892df75 --port 1234';
    assert.equal(parseCsrfTokenFromCommand(cmd), '824c1a15-3141-45a8-bdcd-30dc9892df75');
    assert.equal(parseCsrfTokenFromCommand('node server.js'), null);
    assert.equal(parseCsrfTokenFromCommand(''), null);
  });

  test('listIdePidsFromPsTable prioritizes main LS over worker LS and other IDE processes', () => {
    const table = [
      '  11 /Applications/Antigravity IDE.app/Contents/MacOS/Antigravity IDE Helper',
      '  22 /Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm --enable_lsp --csrf_token worker-token',
      '  33 /Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm --csrf_token main-token',
      '  44 node /tmp/antigravity-bridge/server.js',
      '  55 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].join('\n');
    // Main LS (pid 33) should come first, then worker LS (pid 22), then other IDE process (pid 11)
    assert.deepEqual(listIdePidsFromPsTable(table), ['33', '22', '11']);
  });

  test('resolveCsrfToken prefers process env', () => {
    const token = resolveCsrfToken({
      env: { [CSRF_ENV_KEY]: 'test-token-123' },
      psTable: '  11 language_server --csrf_token other-token'
    });
    assert.equal(token, 'test-token-123');
  });

  test('resolveCsrfToken extracts main language server token from psTable', () => {
    const table = [
      '  11 /Applications/Antigravity IDE.app/Contents/MacOS/Antigravity IDE Helper',
      '  22 /Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm --enable_lsp --csrf_token worker-token',
      '  33 /Applications/Antigravity IDE.app/Contents/Resources/app/extensions/antigravity/bin/language_server_macos_arm --csrf_token main-token'
    ].join('\n');
    const token = resolveCsrfToken({ env: {}, psTable: table });
    assert.equal(token, 'main-token');
  });

  test('resolveLsAddress prefers process env', () => {
    const address = resolveLsAddress({
      env: { ANTIGRAVITY_LS_ADDRESS: '10.0.0.1:1' },
      idePids: ['99'],
      readPidEnv: () => {
        throw new Error('should not read pid env');
      }
    });
    assert.equal(address, '10.0.0.1:1');
  });

  test('resolveLsAddress returns null when no env and no ide pids', () => {
    assert.equal(resolveLsAddress({ env: {}, idePids: [] }), null);
  });

  test('resolveLsAddress reads address from ide pid env text', () => {
    const address = resolveLsAddress({
      env: {},
      idePids: ['11'],
      readPidEnv: (pid) => {
        assert.equal(pid, '11');
        return `OTHER=1 ${LS_ENV_KEY}=127.0.0.1:5555`;
      }
    });
    assert.equal(address, '127.0.0.1:5555');
  });

  test('parseLsofListenOutput keeps loopback TCP (sorted desc) and unix sockets', () => {
    const text = [
      'p11',
      'n127.0.0.1:4123',
      'n[::1]:4124',
      'n*:4000',
      'n/tmp/antigravity.sock'
    ].join('\n');
    assert.deepEqual(parseLsofListenOutput(text), [
      '127.0.0.1:4124',
      '127.0.0.1:4123',
      '/tmp/antigravity.sock'
    ]);
  });

  test('listListenCandidates uses injected lsof reader', () => {
    const found = listListenCandidates({
      idePids: ['11'],
      readPidListen: (pid) => {
        assert.equal(pid, '11');
        return 'p11\nn127.0.0.1:7777\n';
      }
    });
    assert.deepEqual(found, ['127.0.0.1:7777']);
  });

  test('collectLsCandidates prefers env then listen ports', () => {
    const fromEnv = collectLsCandidates({
      env: { ANTIGRAVITY_LS_ADDRESS: '10.0.0.1:1' },
      listenCandidates: ['127.0.0.1:2']
    });
    assert.deepEqual(fromEnv, ['10.0.0.1:1', '127.0.0.1:2']);
    assert.deepEqual(collectLsCandidates({
      env: {},
      idePids: [],
      listenCandidates: ['127.0.0.1:2']
    }), ['127.0.0.1:2']);
  });

  test('sanitizeFeedbackTitle and buildAgentApiEnv with string candidate and token', () => {
    assert.equal(sanitizeFeedbackTitle('UI Feedback: a > b'), 'UI-Feedback-a-b');
    const env = buildAgentApiEnv('127.0.0.1:9', { PATH: '/bin' }, {
      env: { [CSRF_ENV_KEY]: 'token-abc' }
    });
    assert.equal(env.ANTIGRAVITY_LS_ADDRESS, '127.0.0.1:9');
    assert.equal(env.ANTIGRAVITY_CSRF_TOKEN, 'token-abc');
    assert.equal(env.PATH, '/bin');
  });

  test('buildAgentApiEnv with candidate object containing csrfToken', () => {
    const env = buildAgentApiEnv({ address: '127.0.0.1:49177', csrfToken: 'custom-csrf' }, { PATH: '/bin' });
    assert.equal(env.ANTIGRAVITY_LS_ADDRESS, '127.0.0.1:49177');
    assert.equal(env.ANTIGRAVITY_CSRF_TOKEN, 'custom-csrf');
  });
});
