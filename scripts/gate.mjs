// Severity gate: read the SARIF/JSON reports produced by the scanners, bucket
// findings by severity, and exit non-zero when a finding meets or exceeds the
// configured `fail-on` threshold. Detected secrets are always treated as critical.
//
// Env:
//   FAIL_ON  none | low | medium | high | critical   (default: none)
//   REPORTS  directory containing gitleaks.sarif, semgrep.sarif, trivy.json
//
// Exit code 0 = pass, 1 = gate tripped.

import fs from 'node:fs';
import path from 'node:path';

const REPORTS = process.env.REPORTS || '/tmp';
const failOn = (process.env.FAIL_ON || 'none').toLowerCase();

const RANK = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const buckets = { critical: 0, high: 0, medium: 0, low: 0 };

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPORTS, file), 'utf8'));
  } catch {
    return null;
  }
}

// Gitleaks: any secret is critical.
const gitleaks = readJson('gitleaks.sarif');
let secrets = 0;
if (gitleaks?.runs) {
  for (const run of gitleaks.runs) secrets += run.results?.length ?? 0;
}
buckets.critical += secrets;

// Semgrep SARIF: map level -> severity.
const semgrep = readJson('semgrep.sarif');
if (semgrep?.runs) {
  for (const run of semgrep.runs) {
    for (const res of run.results ?? []) {
      const level = res.level ?? 'warning';
      if (level === 'error') buckets.high++;
      else if (level === 'warning') buckets.medium++;
      else buckets.low++;
    }
  }
}

// Trivy JSON: vulnerabilities, misconfigurations and licenses carry a Severity.
const trivy = readJson('trivy.json');
function bump(sev) {
  const key = String(sev || '').toLowerCase();
  if (key in buckets) buckets[key]++;
}
if (trivy?.Results) {
  for (const result of trivy.Results) {
    for (const v of result.Vulnerabilities ?? []) bump(v.Severity);
    for (const m of result.Misconfigurations ?? []) bump(m.Severity);
    for (const l of result.Licenses ?? []) bump(l.Severity);
  }
}

const maxSeverity =
  buckets.critical > 0 ? 4 : buckets.high > 0 ? 3 : buckets.medium > 0 ? 2 : buckets.low > 0 ? 1 : 0;
const threshold = RANK[failOn] ?? 0;

const line = `Severity counts -> critical: ${buckets.critical}, high: ${buckets.high}, medium: ${buckets.medium}, low: ${buckets.low}`;
console.log(line);

// Job summary (best effort).
if (process.env.GITHUB_STEP_SUMMARY) {
  const tripped = threshold !== 0 && maxSeverity >= threshold;
  const summary = [
    '## SecureCheck',
    '',
    '| Severity | Count |',
    '| --- | --- |',
    `| Critical | ${buckets.critical} |`,
    `| High | ${buckets.high} |`,
    `| Medium | ${buckets.medium} |`,
    `| Low | ${buckets.low} |`,
    '',
    `Gate: \`fail-on=${failOn}\` -> ${tripped ? 'FAILED' : 'passed'}`,
    '',
  ].join('\n');
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch {
    /* ignore */
  }
}

if (threshold === 0) {
  console.log('fail-on=none; reporting only, not gating the build.');
  process.exit(0);
}

if (maxSeverity >= threshold) {
  console.error(`Gate FAILED: found a finding at or above "${failOn}" severity.`);
  if (secrets > 0) console.error(`  ${secrets} secret(s) detected (always critical).`);
  process.exit(1);
}

console.log(`Gate passed: nothing at or above "${failOn}" severity.`);
process.exit(0);
