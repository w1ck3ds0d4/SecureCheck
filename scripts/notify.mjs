// Post a single Discord embed summarizing scanner results for one workflow run.
// Posts on every run so each repo's scanner activity is visible in the channel.

import fs from 'node:fs';

const env = process.env;

if (!env.DISCORD_WEBHOOK_URL) {
  console.log('DISCORD_WEBHOOK_URL not set; nothing to do.');
  process.exit(0);
}

const counts = {
  gitleaks: toInt(env.GITLEAKS_COUNT),
  semgrep: toInt(env.SEMGREP_COUNT),
  trivy: toInt(env.TRIVY_COUNT),
  claude: toInt(env.CLAUDE_COUNT),
};

const total = counts.gitleaks + counts.semgrep + counts.trivy + counts.claude;
const isPR = env.EVENT_NAME === 'pull_request';
const claudeRan = env.CLAUDE_ENABLED === 'true';

const color =
  total === 0 ? 0x2ecc71
  : counts.gitleaks > 0 ? 0xe74c3c
  : total > 10 ? 0xe67e22
  : 0xf1c40f;

const severeClaude = readSevereClaudeFindings();
const title = isPR
  ? `[${env.REPO}] PR #${env.PR_NUMBER}`
  : `[${env.REPO}] push by ${env.ACTOR}`;

const description = isPR
  ? env.PR_TITLE || '(no title)'
  : firstLine(env.COMMIT_MESSAGE) || `commit ${(env.COMMIT_SHA || '').slice(0, 7)}`;

const fieldLines = [
  `Gitleaks: **${counts.gitleaks}**`,
  `Semgrep: **${counts.semgrep}**`,
  `Trivy: **${counts.trivy}**`,
  claudeRan ? `Claude: **${counts.claude}**` : 'Claude: _skipped_',
];

const fields = [
  { name: 'Scanners', value: fieldLines.join('\n'), inline: false },
];

if (severeClaude.length > 0) {
  fields.push({
    name: 'Claude high-severity',
    value: severeClaude
      .slice(0, 5)
      .map(f => `- \`${f.file ?? '?'}\`${f.line ? `:${f.line}` : ''} - ${f.title}`)
      .join('\n'),
    inline: false,
  });
}

fields.push({
  name: 'Links',
  value: [
    `[Workflow run](${env.RUN_URL})`,
    isPR && env.PR_URL ? `[Pull request](${env.PR_URL})` : null,
  ].filter(Boolean).join(' · '),
  inline: false,
});

const footer = total === 0
  ? 'All clear'
  : `${total} finding${total === 1 ? '' : 's'} - review the run for details`;

const embed = {
  title: title.slice(0, 256),
  description: description.slice(0, 2048),
  color,
  url: env.RUN_URL,
  fields,
  footer: { text: footer },
  timestamp: new Date().toISOString(),
};

const payload = {
  username: 'Security Scanner',
  embeds: [embed],
};

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
console.log(`Notified Discord. Total findings: ${total}.`);

function toInt(v) {
  const n = parseInt(v ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

function firstLine(s) {
  return (s ?? '').split('\n')[0];
}

function readSevereClaudeFindings() {
  if (env.CLAUDE_ENABLED !== 'true') return [];
  try {
    const raw = fs.readFileSync('/tmp/claude.json', 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(f => f && (f.severity === 'critical' || f.severity === 'high'));
  } catch {
    return [];
  }
}
