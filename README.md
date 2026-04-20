# SecureCheck

Reusable GitHub Actions workflow that runs a multi-scanner security pipeline on every push and pull request and posts a single, severity-coloured summary to Discord.

---

## Features

- **Centralised scanner stack** - scanners and rules live in one repo; each consumer repo contains a thin caller, so updates propagate without touching every project
- **Gitleaks** - hardcoded secrets in the working tree and history, on every push and PR
- **Semgrep** - pattern-based SAST using the curated `auto` ruleset
- **Trivy** - dependency CVEs and IaC / configuration misconfigurations
- **Optional Claude review** - Claude Sonnet 4.6 reviews the PR diff for logic issues scanners miss; gated on `ANTHROPIC_API_KEY` and skipped silently when the secret is not set
- **Single Discord embed per run** - severity colouring, per-scanner counts, direct links to the workflow run and pull request
- **Pull-request heartbeat** - an embed is posted for every PR run, including clean ones, so reviewers can see the bot executed
- **Silent on clean pushes** - no Discord noise for green `main` commits
- **Archived raw reports** - each run uploads per-scanner JSON as a workflow artifact with 14-day retention

---

## Install

### Prerequisites

- A GitHub repository you want to scan, with Actions enabled
- A Discord channel with an **incoming webhook** (channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL)
- *Optional:* an Anthropic API key if you want the Claude review step to run on pull requests

### Add the caller workflow

Create `.github/workflows/security.yml` in the consumer repo:

```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  scan:
    uses: w1ck3ds0d4/SecureCheck/.github/workflows/scan.yml@main
    secrets: inherit
```

### Configure secrets

Set the webhook secret on the consumer repo:

```bash
gh secret set DISCORD_WEBHOOK_URL --repo <owner>/<repo>
```

### Enable the optional Claude review

Add the Anthropic key to the consumer repo's secrets. The workflow detects the secret at runtime and skips the step when absent, so nothing else needs to change.

```bash
gh secret set ANTHROPIC_API_KEY --repo <owner>/<repo>
```

---

## Usage

### Push to `main`

Scans run, findings are tallied, and the Discord notifier stays silent unless at least one scanner reports something. If anything fires, a single embed is posted with per-scanner counts and a link to the workflow run.

### Pull request

The same scan pipeline runs, and the embed is always posted (green when clean, coloured when not) so the reviewer has a clear signal before approving. The optional Claude review runs only on pull requests; pushes skip it to save API calls.

### Severity colour

| State | Colour |
|---|---|
| All scanners clean | Green |
| Findings, no gitleaks hit | Yellow |
| Many findings (>10 total) | Orange |
| Gitleaks hit | Red |

### Claude review findings

When the optional Claude step runs and reports critical or high severity issues, the first five are inlined in the Discord embed with file, line, and a one-sentence explanation of the exploit path. Lower-severity findings only appear in the run artifact.

### Raw reports

Every run uploads a `security-reports` artifact containing the raw JSON from each scanner (gitleaks, semgrep, trivy, claude) with 14-day retention. Useful when the embed count is non-zero and you want the full picture without re-running locally.

### Overriding defaults

The reusable workflow accepts two optional inputs:

```yaml
jobs:
  scan:
    uses: w1ck3ds0d4/SecureCheck/.github/workflows/scan.yml@main
    secrets: inherit
    with:
      node_version: '22'
      python_version: '3.12'
```

---

## Project Structure

```
SecureCheck/
  .github/
    workflows/
      scan.yml                    Reusable workflow; checkout, scanners, notify, upload
  scripts/
    notify.mjs                    Builds the Discord embed from scanner counts and posts it
    claude-review.mjs             Sends the PR diff to Claude and emits structured findings
  package.json                    @anthropic-ai/sdk dependency for the optional Claude step
  LICENSE                         AGPL v3
  COMMERCIAL.md                   Commercial license terms
```

---

## License

This project is dual-licensed:

- **[AGPL v3](LICENSE)** - free for open-source use. Derivatives and SaaS deployments must release their source under AGPL.
- **[Commercial license](COMMERCIAL.md)** - for proprietary / closed-source use or hosted services that do not want to comply with AGPL source-disclosure requirements. Contact for terms.
