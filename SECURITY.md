# Security

SecureCheck runs as a reusable GitHub Actions workflow inside other people's repositories and reaches out to two third-party services (Discord and, optionally, Anthropic). Its security posture is therefore both about hardening this workflow and about being a well-behaved guest in consumer repos.

## Current posture

### Permissions

The reusable workflow declares the minimum permissions it needs at the top of `.github/workflows/scan.yml`:

```yaml
permissions:
  contents: read
```

No write permissions are requested. The workflow does not push commits, edit PRs, or post comments. All output goes to Discord and to a workflow artifact.

### Secrets handling

Two secrets flow through the pipeline:

- `DISCORD_WEBHOOK_URL`: read at the Post step only. Never logged. The script `scripts/notify.mjs` checks for absence and exits early.
- `ANTHROPIC_API_KEY`: read at the Claude step only. The workflow short-circuits with a printed "skipping" line when the value is empty, before invoking `npm install` or the Node script. The key is passed via `env:` to the script and read once with `process.env.ANTHROPIC_API_KEY`.

Neither secret is written to disk or to step outputs.

### Scanner output handling

- Gitleaks runs with `--redact` so any matched secrets are masked in the JSON report.
- Each scanner writes to `/tmp/<scanner>.json` on the runner. Counts are extracted with `jq`. The raw reports are uploaded as a workflow artifact with 14-day retention and `if-no-files-found: ignore`.
- Artifacts inherit the consumer repo's default access controls. Anyone who can read the consumer repo's Actions tab can download the reports.

### Network egress

Outbound traffic during a run:

- GitHub (checkout, action downloads, artifact upload)
- `https://github.com/gitleaks/gitleaks/releases/...` (gitleaks binary)
- PyPI (Semgrep install via `pip`)
- Trivy database mirror (handled by the Trivy action)
- npm registry (only when the Claude step runs, to install `@anthropic-ai/sdk`)
- `https://api.anthropic.com/` (only when the Claude step runs)
- `https://discord.com/api/webhooks/...` (Discord webhook host)

### Failure modes are non-fatal

Every scanner is invoked with `exit-code: 0` or `|| true` so a finding does not fail the run. The Claude step always exits 0 even on API failure, returning `[]` instead. The notifier exits 0 when the webhook is missing. This keeps the artifact upload step reachable regardless of upstream issues.

## Threat model

### What an attacker on a malicious PR can do

The workflow runs on `pull_request`, which on public repos uses the default `pull_request` event (not `pull_request_target`). This means the workflow checks out the PR branch but runs with the base branch's secrets restricted to the same scope. Since this workflow declares `contents: read` and no write tokens, a PR cannot use it to push code or comment on issues.

A PR can still:

- Add a malicious file that one of the scanners executes (Semgrep does not execute code, Trivy does not execute code, gitleaks does not execute code, but the consumer's other steps might).
- Submit a giant diff that consumes the Claude API budget. This is mitigated by the 40,000-character cap in `scripts/claude-review.mjs` and by the per-account rate limits Anthropic enforces.
- Cause noisy Discord notifications. This is just noise, not a security issue.

### What the workflow cannot do

- Read or modify the consumer's secrets beyond `DISCORD_WEBHOOK_URL` and `ANTHROPIC_API_KEY`.
- Persist anything between runs.
- Send data to anywhere other than the third-party endpoints listed above.

### What a compromised SecureCheck repo could do

If this repo were compromised and a consumer pinned to `@main` (as the README suggests), the attacker could exfiltrate the two secrets in the consumer's repo by editing the workflow or scripts. This is the standard reusable-workflow trust model. Consumers who care should pin to a specific commit SHA in their `uses:` line.

## Known weaknesses

- Third-party actions are pinned to major version (`@v6`) rather than commit SHAs. Tag movement is therefore a possible vector.
- `package.json` declares `@anthropic-ai/sdk` with a caret range and there is no committed `package-lock.json`. The Claude step does an unpinned `npm install` at runtime.
- The diff fed to Claude is sent verbatim. Diffs can contain accidentally committed secrets. Anthropic's data policy applies; consumers who treat their code as confidential should review that before enabling the optional step.
- Gitleaks output is redacted, but Semgrep, Trivy, and Claude outputs are not. Anyone with artifact-download access on the consumer repo sees those raw reports.

## Reporting a vulnerability

Email `daniel.svs@outlook.com`. Please do not file a public GitHub issue for security reports. Include:

- A short description of the issue.
- The minimum repro (workflow snippet, malicious input, or attack scenario).
- Your assessment of impact.

A response typically follows within a few business days.

## Disclosure policy

Coordinated disclosure. Once a fix is available and consumers have had a reasonable window to update (or pin past the bad commit), the issue is documented in the changelog or release notes.
