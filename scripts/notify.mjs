// Post a single Discord embed summarizing scanner results for one workflow run.
// Posts on every run so each repo's scanner activity is visible in the channel.

import fs from 'node:fs';
import path from 'node:path';

const env = process.env;

if (!env.DISCORD_WEBHOOK_URL) {
  console.log('DISCORD_WEBHOOK_URL not set; nothing to do.');
  process.exit(0);
}

const counts = {
  gitleaks: toInt(env.GITLEAKS_COUNT),
  semgrep: toInt(env.SEMGREP_COUNT),
  trivy: toInt(env.TRIVY_COUNT),
  trivyVuln: toInt(env.TRIVY_VULN),
  trivyMisconfig: toInt(env.TRIVY_MISCONFIG),
  trivyLicense: toInt(env.TRIVY_LICENSE),
  eslint: toInt(env.ESLINT_COUNT),
  ruff: toInt(env.RUFF_COUNT),
  rust: toInt(env.RUST_COUNT),
  dotnet: toInt(env.DOTNET_COUNT),
  lizard: toInt(env.LIZARD_COUNT),
  jscpd: toInt(env.JSCPD_COUNT),
  jscpdLines: toInt(env.JSCPD_DUPLICATED_LINES),
  claude: toInt(env.CLAUDE_COUNT),
};

const durations = {
  gitleaks: toInt(env.GITLEAKS_DURATION),
  semgrep: toInt(env.SEMGREP_DURATION),
  trivy: toInt(env.TRIVY_DURATION),
  eslint: toInt(env.ESLINT_DURATION),
  ruff: toInt(env.RUFF_DURATION),
  rust: toInt(env.RUST_DURATION),
  dotnet: toInt(env.DOTNET_DURATION),
  lizard: toInt(env.LIZARD_DURATION),
  jscpd: toInt(env.JSCPD_DURATION),
  claude: toInt(env.CLAUDE_DURATION),
};

const ran = {
  eslint: env.HAS_JS === 'true' && env.ESLINT_CFG === 'true',
  ruff: env.HAS_PY === 'true',
  rust: env.HAS_RUST === 'true',
  dotnet: env.HAS_DOTNET === 'true',
  claude: env.CLAUDE_ENABLED === 'true',
};

const securityTotal = counts.gitleaks + counts.semgrep + counts.trivy + counts.claude;
const qualityTotal =
  counts.eslint + counts.ruff + counts.rust + counts.dotnet;
const metricsTotal = counts.lizard + counts.jscpd;
const total = securityTotal + qualityTotal + metricsTotal;

const isPR = env.EVENT_NAME === 'pull_request';

// Color: red on gitleaks, orange on many findings, yellow on any, green clean
const color =
  total === 0 ? 0x2ecc71
  : counts.gitleaks > 0 ? 0xe74c3c
  : total > 20 ? 0xe67e22
  : 0xf1c40f;

const severeClaude = readSevereClaudeFindings();
const title = isPR
  ? `[${env.REPO}] PR #${env.PR_NUMBER}`
  : `[${env.REPO}] push by ${env.ACTOR}`;

const description = isPR
  ? env.PR_TITLE || '(no title)'
  : firstLine(env.COMMIT_MESSAGE) || `commit ${(env.COMMIT_SHA || '').slice(0, 7)}`;

const securityLines = [
  `Gitleaks: **${counts.gitleaks}**`,
  `Semgrep: **${counts.semgrep}**`,
  `Trivy: **${counts.trivy}** (vuln **${counts.trivyVuln}** / misconfig **${counts.trivyMisconfig}** / license **${counts.trivyLicense}**)`,
  ran.claude ? `Claude: **${counts.claude}**` : 'Claude: _skipped_',
];

const qualityLines = [
  ran.eslint  ? `ESLint: **${counts.eslint}**` : 'ESLint: _skipped_',
  ran.ruff    ? `ruff: **${counts.ruff}**`     : 'ruff: _skipped_',
  ran.rust    ? `Rust (clippy+fmt): **${counts.rust}**` : 'Rust (clippy+fmt): _skipped_',
  ran.dotnet  ? `dotnet format: **${counts.dotnet}**`   : 'dotnet format: _skipped_',
];

const metricsLines = [
  `Lizard hotspots (CCN >= 15): **${counts.lizard}**`,
  `jscpd clones: **${counts.jscpd}** (duplicated lines: **${counts.jscpdLines}**)`,
];

const fields = [
  { name: 'Security', value: securityLines.join('\n'), inline: false },
  { name: 'Quality',  value: qualityLines.join('\n'),  inline: false },
  { name: 'Metrics',  value: metricsLines.join('\n'),  inline: false },
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

const totalDuration = Object.values(durations).reduce((a, b) => a + b, 0);
const perfLines = [
  `Total scan time: **${formatDuration(totalDuration)}**`,
  topDurations(durations).map(([k, v]) => `\`${k}\`: ${formatDuration(v)}`).join(' · '),
].filter(Boolean);

fields.push({
  name: 'Performance',
  value: perfLines.join('\n'),
  inline: false,
});

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
  : `${total} finding${total === 1 ? '' : 's'} (security ${securityTotal}, quality ${qualityTotal}, metrics ${metricsTotal})`;

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
console.log(`Notified Discord. Security ${securityTotal}, quality ${qualityTotal}, metrics ${metricsTotal} (total ${total}).`);

function toInt(v) {
  const n = parseInt(v ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

function firstLine(s) {
  return (s ?? '').split('\n')[0];
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

function topDurations(d) {
  return Object.entries(d)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
}

function readSevereClaudeFindings() {
  if (env.CLAUDE_ENABLED !== 'true') return [];
  try {
    const reportsDir = env.REPORTS || '/tmp';
    const raw = fs.readFileSync(path.join(reportsDir, 'claude.json'), 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(f => f && (f.severity === 'critical' || f.severity === 'high'));
  } catch {
    return [];
  }
}
