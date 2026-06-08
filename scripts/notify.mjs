// Post a single Discord embed summarizing scanner results for one workflow run.
// Posts on every run so each repo's scanner activity is visible in the channel.
//
// This is the thin side-effecting entry point: it reads the env bag and the Claude
// findings file, builds the payload via the pure logic in ./embed.mjs, and POSTs it.
// All the formatting lives in embed.mjs so it can be unit-tested without a network
// call. See scripts/embed.test.mjs.

import fs from 'node:fs';
import { buildPayload, summaryLine } from './embed.mjs';

const env = process.env;

if (!env.DISCORD_WEBHOOK_URL) {
  console.log('DISCORD_WEBHOOK_URL not set; nothing to do.');
  process.exit(0);
}

const severeClaude = readSevereClaudeFindings(env);
const payload = buildPayload(env, { severeClaude });

const res = await fetch(env.DISCORD_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`Discord webhook failed: ${res.status} ${body}`);
  process.exit(1);
}
console.log(`Notified Discord. ${summaryLine(env)}`);

/** Read and filter the optional Claude review output to critical/high findings. */
function readSevereClaudeFindings(e) {
  if (e.CLAUDE_ENABLED !== 'true') return [];
  try {
    const raw = fs.readFileSync('/tmp/claude.json', 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(f => f && (f.severity === 'critical' || f.severity === 'high'));
  } catch {
    return [];
  }
}
