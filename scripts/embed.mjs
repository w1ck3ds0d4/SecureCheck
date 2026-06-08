// Pure embed-building logic for the SecureCheck Discord notifier.
//
// Everything here is a side-effect-free function of its inputs (the workflow's env
// bag plus the parsed Claude findings), so it can be unit-tested under `node --test`
// without a network call or a real workflow run. `notify.mjs` is the thin entry
// point that reads env, reads the Claude file, builds the payload here, and POSTs it.

/** Parse an env value to a non-negative-ish integer, defaulting to 0. */
export function toInt(v) {
  const n = parseInt(v ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

/** First line of a (possibly multi-line) string. */
export function firstLine(s) {
  return (s ?? '').split('\n')[0];
}

/** Human-readable duration: seconds, or `MmSSs` past a minute. */
export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

/** The 3 slowest non-zero scanner stages, descending. */
export function topDurations(d) {
  return Object.entries(d)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
}

/** Per-scanner finding counts read from the env bag. */
export function readCounts(env) {
  return {
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
}

/** Per-stage durations (seconds) read from the env bag. */
export function readDurations(env) {
  return {
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
}

/** Which optional stages actually ran (drives "skipped" vs a count). */
export function readRan(env) {
  return {
    eslint: env.HAS_JS === 'true' && env.ESLINT_CFG === 'true',
    ruff: env.HAS_PY === 'true',
    rust: env.HAS_RUST === 'true',
    dotnet: env.HAS_DOTNET === 'true',
    claude: env.CLAUDE_ENABLED === 'true',
  };
}

/** Security / quality / metrics subtotals and the grand total. */
export function totals(counts) {
  const securityTotal = counts.gitleaks + counts.semgrep + counts.trivy + counts.claude;
  const qualityTotal = counts.eslint + counts.ruff + counts.rust + counts.dotnet;
  const metricsTotal = counts.lizard + counts.jscpd;
  return { securityTotal, qualityTotal, metricsTotal, total: securityTotal + qualityTotal + metricsTotal };
}

/** Embed colour: red on a gitleaks hit, orange on many findings, yellow on any, green when clean. */
export function pickColor(total, counts) {
  return total === 0 ? 0x2ecc71
    : counts.gitleaks > 0 ? 0xe74c3c
    : total > 20 ? 0xe67e22
    : 0xf1c40f;
}

/** Build the Discord embed object from the env bag and the severe Claude findings. */
export function buildEmbed(env, { severeClaude = [], timestamp } = {}) {
  const counts = readCounts(env);
  const durations = readDurations(env);
  const ran = readRan(env);
  const { securityTotal, qualityTotal, metricsTotal, total } = totals(counts);

  const isPR = env.EVENT_NAME === 'pull_request';
  const color = pickColor(total, counts);

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
    ran.eslint ? `ESLint: **${counts.eslint}**` : 'ESLint: _skipped_',
    ran.ruff ? `ruff: **${counts.ruff}**` : 'ruff: _skipped_',
    ran.rust ? `Rust (clippy+fmt): **${counts.rust}**` : 'Rust (clippy+fmt): _skipped_',
    ran.dotnet ? `dotnet format: **${counts.dotnet}**` : 'dotnet format: _skipped_',
  ];

  const metricsLines = [
    `Lizard hotspots (CCN >= 15): **${counts.lizard}**`,
    `jscpd clones: **${counts.jscpd}** (duplicated lines: **${counts.jscpdLines}**)`,
  ];

  const fields = [
    { name: 'Security', value: securityLines.join('\n'), inline: false },
    { name: 'Quality', value: qualityLines.join('\n'), inline: false },
    { name: 'Metrics', value: metricsLines.join('\n'), inline: false },
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

  fields.push({ name: 'Performance', value: perfLines.join('\n'), inline: false });

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

  return {
    title: title.slice(0, 256),
    description: description.slice(0, 2048),
    color,
    url: env.RUN_URL,
    fields,
    footer: { text: footer },
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

/** The full Discord webhook payload (username + the single embed). */
export function buildPayload(env, opts = {}) {
  return {
    username: 'Security Scanner',
    embeds: [buildEmbed(env, opts)],
  };
}

/** One-line summary used for the notifier's stdout log. */
export function summaryLine(env) {
  const { securityTotal, qualityTotal, metricsTotal, total } = totals(readCounts(env));
  return `Security ${securityTotal}, quality ${qualityTotal}, metrics ${metricsTotal} (total ${total}).`;
}
