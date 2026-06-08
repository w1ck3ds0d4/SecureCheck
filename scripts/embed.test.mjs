// Unit tests for the pure Discord-embed logic in embed.mjs. No network, no real
// workflow run. Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toInt,
  firstLine,
  formatDuration,
  topDurations,
  readCounts,
  totals,
  pickColor,
  buildEmbed,
  buildPayload,
  summaryLine,
} from './embed.mjs';

const TS = '2026-06-08T12:00:00.000Z';

// A clean push env with every count at 0 and nothing optional enabled.
function cleanEnv(overrides = {}) {
  return {
    EVENT_NAME: 'push',
    REPO: 'acme/widget',
    ACTOR: 'alice',
    COMMIT_MESSAGE: 'fix: tidy up\n\nbody',
    COMMIT_SHA: 'abcdef1234567',
    RUN_URL: 'https://github.com/acme/widget/actions/runs/1',
    ...overrides,
  };
}

function fieldNamed(embed, name) {
  return embed.fields.find(f => f.name === name);
}

test('toInt parses, defaults, and rejects garbage', () => {
  assert.equal(toInt('5'), 5);
  assert.equal(toInt(undefined), 0);
  assert.equal(toInt('nope'), 0);
  assert.equal(toInt(''), 0);
});

test('firstLine returns the first line only', () => {
  assert.equal(firstLine('a\nb\nc'), 'a');
  assert.equal(firstLine(undefined), '');
});

test('formatDuration formats seconds and minutes', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(59), '59s');
  assert.equal(formatDuration(60), '1m00s');
  assert.equal(formatDuration(125), '2m05s');
});

test('topDurations returns the 3 slowest non-zero stages, descending', () => {
  const top = topDurations({ a: 10, b: 0, c: 30, d: 5, e: 20 });
  assert.deepEqual(top.map(([k]) => k), ['c', 'e', 'a']);
});

test('totals computes the security/quality/metrics subtotals', () => {
  const counts = readCounts({
    GITLEAKS_COUNT: '1', SEMGREP_COUNT: '2', TRIVY_COUNT: '3', CLAUDE_COUNT: '4',
    ESLINT_COUNT: '5', RUFF_COUNT: '6', RUST_COUNT: '7', DOTNET_COUNT: '8',
    LIZARD_COUNT: '9', JSCPD_COUNT: '10',
  });
  const t = totals(counts);
  assert.equal(t.securityTotal, 1 + 2 + 3 + 4);
  assert.equal(t.qualityTotal, 5 + 6 + 7 + 8);
  assert.equal(t.metricsTotal, 9 + 10);
  assert.equal(t.total, 55);
});

test('pickColor: clean=green, gitleaks=red, >20=orange, else yellow', () => {
  assert.equal(pickColor(0, { gitleaks: 0 }), 0x2ecc71);
  assert.equal(pickColor(3, { gitleaks: 1 }), 0xe74c3c);   // gitleaks beats everything
  assert.equal(pickColor(25, { gitleaks: 0 }), 0xe67e22);  // many findings
  assert.equal(pickColor(4, { gitleaks: 0 }), 0xf1c40f);   // some findings
});

test('clean push embed is green, "All clear", and marks optional stages skipped', () => {
  const embed = buildEmbed(cleanEnv(), { timestamp: TS });
  assert.equal(embed.color, 0x2ecc71);
  assert.equal(embed.footer.text, 'All clear');
  assert.equal(embed.title, '[acme/widget] push by alice');
  assert.equal(embed.description, 'fix: tidy up');           // first line only
  assert.equal(embed.timestamp, TS);
  assert.match(fieldNamed(embed, 'Quality').value, /ESLint: _skipped_/);
  assert.match(fieldNamed(embed, 'Security').value, /Claude: _skipped_/);
  // a clean push has no PR link
  assert.equal(fieldNamed(embed, 'Links').value, '[Workflow run](https://github.com/acme/widget/actions/runs/1)');
});

test('a gitleaks hit turns the embed red and the footer plural-aware', () => {
  const embed = buildEmbed(cleanEnv({ GITLEAKS_COUNT: '1' }), { timestamp: TS });
  assert.equal(embed.color, 0xe74c3c);
  assert.equal(embed.footer.text, '1 finding (security 1, quality 0, metrics 0)');
});

test('more than 20 findings (no gitleaks) is orange', () => {
  const embed = buildEmbed(cleanEnv({ SEMGREP_COUNT: '25' }), { timestamp: TS });
  assert.equal(embed.color, 0xe67e22);
  assert.match(embed.footer.text, /^25 findings/);
});

test('PR embed uses the PR title, number, and adds a PR link', () => {
  const env = cleanEnv({
    EVENT_NAME: 'pull_request',
    PR_NUMBER: '42',
    PR_TITLE: 'Add rate limiting',
    PR_URL: 'https://github.com/acme/widget/pull/42',
  });
  const embed = buildEmbed(env, { timestamp: TS });
  assert.equal(embed.title, '[acme/widget] PR #42');
  assert.equal(embed.description, 'Add rate limiting');
  assert.match(fieldNamed(embed, 'Links').value, /\[Pull request\]\(https:\/\/github\.com\/acme\/widget\/pull\/42\)/);
});

test('enabled optional stages show counts instead of skipped', () => {
  const env = cleanEnv({
    HAS_JS: 'true', ESLINT_CFG: 'true', ESLINT_COUNT: '3',
    HAS_PY: 'true', RUFF_COUNT: '1',
    CLAUDE_ENABLED: 'true', CLAUDE_COUNT: '2',
  });
  const embed = buildEmbed(env, { timestamp: TS });
  assert.match(fieldNamed(embed, 'Quality').value, /ESLint: \*\*3\*\*/);
  assert.match(fieldNamed(embed, 'Quality').value, /ruff: \*\*1\*\*/);
  assert.match(fieldNamed(embed, 'Security').value, /Claude: \*\*2\*\*/);
});

test('severe Claude findings are inlined, capped at 5, with file:line', () => {
  const severeClaude = Array.from({ length: 7 }, (_, i) => ({
    file: `src/f${i}.ts`, line: i + 1, title: `issue ${i}`, severity: 'high',
  }));
  const embed = buildEmbed(cleanEnv(), { severeClaude, timestamp: TS });
  const field = fieldNamed(embed, 'Claude high-severity');
  assert.ok(field, 'expected a Claude high-severity field');
  assert.equal(field.value.split('\n').length, 5);          // capped at 5
  assert.match(field.value, /`src\/f0\.ts`:1 - issue 0/);
});

test('no Claude field when there are no severe findings', () => {
  const embed = buildEmbed(cleanEnv(), { severeClaude: [], timestamp: TS });
  assert.equal(fieldNamed(embed, 'Claude high-severity'), undefined);
});

test('performance field surfaces total time and the slowest stages', () => {
  const env = cleanEnv({ GITLEAKS_DURATION: '10', TRIVY_DURATION: '90', SEMGREP_DURATION: '30' });
  const embed = buildEmbed(env, { timestamp: TS });
  const perf = fieldNamed(embed, 'Performance').value;
  assert.match(perf, /Total scan time: \*\*2m10s\*\*/);     // 130s
  assert.match(perf, /`trivy`: 1m30s/);
});

test('buildPayload wraps a single embed under the bot username', () => {
  const payload = buildPayload(cleanEnv(), { timestamp: TS });
  assert.equal(payload.username, 'Security Scanner');
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].footer.text, 'All clear');
});

test('summaryLine reports the subtotals for stdout', () => {
  const env = cleanEnv({ GITLEAKS_COUNT: '1', ESLINT_COUNT: '2', LIZARD_COUNT: '3' });
  assert.equal(summaryLine(env), 'Security 1, quality 2, metrics 3 (total 6).');
});
