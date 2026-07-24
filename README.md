# SecureCheck

GitHub **composite action** (and reusable workflow) that runs a multi-scanner security pipeline on every push and pull request: it uploads results to GitHub code scanning as SARIF, can fail the build on a severity threshold, and optionally posts a severity-coloured summary to Discord and runs an AI review of the PR diff.

---

## Features

- **Usable as a Marketplace action or a reusable workflow** - drop in a single `- uses: w1ck3ds0d4/SecureCheck@v1` step, or call the reusable workflow
- **SARIF + GitHub code scanning** - Gitleaks, Semgrep and Trivy findings upload to the Security tab and appear as inline PR annotations
- **Severity gate** - `fail-on` blocks merges at a chosen threshold (low/medium/high/critical); detected secrets always count as critical
- **Centralised scanner stack** - scanners and rules live in one repo; each consumer repo contains a thin caller, so updates propagate without touching every project
- **Gitleaks** - hardcoded secrets in the working tree and history, on every push and PR
- **Semgrep** - pattern-based SAST using the curated `auto` ruleset
- **Trivy** - dependency CVEs, IaC / configuration misconfigurations, **plus license findings** (vuln / misconfig / license counts surface separately)
- **Per-language quality linters (auto-detected)** - ESLint (JS/TS, when an eslint config exists), ruff lint + format check (Python), `cargo fmt --check` + `cargo clippy -D warnings` (Rust), `dotnet format --verify-no-changes` (.NET). Skipped silently when the language isn't present
- **Complexity hotspots** - `lizard` flags functions with cyclomatic complexity >= 15
- **Duplication detection** - `jscpd` reports duplicated code blocks across the repo
- **Performance signals** - each scanner stage is timed; the embed surfaces total scan time plus the 3 slowest stages
- **Optional Claude review** - Claude Sonnet reviews the PR diff for logic issues scanners miss; gated on `ANTHROPIC_API_KEY` and skipped silently when the secret is not set
- **Single Discord embed per run** - severity colouring, per-scanner + per-linter + metrics + performance sections, direct links to the workflow run and pull request
- **Pull-request heartbeat** - an embed is posted for every PR run, including clean ones, so reviewers can see the bot executed
- **Silent on clean pushes** - no Discord noise for green `main` commits
- **Archived raw reports** - each run uploads per-scanner JSON (security + quality + metrics) as a workflow artifact with 14-day retention

---

## Install

### Prerequisites

- A GitHub repository you want to scan, with Actions enabled
- A Discord channel with an **incoming webhook** (channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL)
- *Optional:* an Anthropic API key if you want the Claude review step to run on pull requests

### Add the workflow

Create `.github/workflows/security.yml` in the consumer repo. Recommended (composite action):

```yaml
name: Security

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  security-events: write   # required to upload SARIF to code scanning

jobs:
  securecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0     # full history for gitleaks + PR diff
      - uses: w1ck3ds0d4/SecureCheck@main   # pin to a release tag for production
        with:
          fail-on: high
```

Prefer to have the whole job managed for you? Use the reusable workflow instead:

```yaml
permissions:
  contents: read
  security-events: write

jobs:
  securecheck:
    uses: w1ck3ds0d4/SecureCheck/.github/workflows/scan.yml@main
    with:
      fail-on: high
    secrets: inherit
```

More copy-paste templates live in [`examples/`](examples/).

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

### Failure gate

By default SecureCheck reports without failing (`fail-on: none`). Set `fail-on` to `low`, `medium`, `high`, or `critical` to fail the run (and block the merge) when a finding meets or exceeds that severity. Detected secrets always count as critical. A findings-by-severity table is written to the job summary.

### Code scanning (SARIF)

Gitleaks, Semgrep, and Trivy results upload to GitHub code scanning, so findings appear in the repo's **Security** tab and as inline annotations on the pull request. This needs `security-events: write` in the calling job (already set in the reusable workflow and the examples). Set `upload-sarif: false` to disable.

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

### Inputs

| Input | Default | Description |
|---|---|---|
| `fail-on` | `none` | Minimum severity that fails the build: `none`, `low`, `medium`, `high`, `critical`. Secrets always count as critical. |
| `upload-sarif` | `true` | Upload SARIF to GitHub code scanning (needs `security-events: write`). |
| `run-claude` | `auto` | Optional Claude PR review: `auto` (PRs with a key), `true`, or `false`. |
| `node-version` | `20` | Node.js version for JS/TS tooling. |
| `python-version` | `3.11` | Python version for Semgrep / ruff / lizard. |
| `dotnet-version` | `10.0.x` | .NET SDK version (only used when a .NET project is detected). |
| `gitleaks-version` | `8.24.3` | Pinned Gitleaks release. |
| `anthropic-api-key` | `''` | Enables the Claude review when set. Pass `${{ secrets.ANTHROPIC_API_KEY }}`. |
| `discord-webhook` | `''` | Enables Discord notifications when set. Pass `${{ secrets.DISCORD_WEBHOOK_URL }}`. |

For the **reusable workflow**, pass the API key and webhook as repository secrets (`ANTHROPIC_API_KEY`, `DISCORD_WEBHOOK_URL`) together with `secrets: inherit`, rather than as `with:` inputs.

---

## Project Structure

```
SecureCheck/
  action.yml                    Composite action (primary entry point; Marketplace-ready)
  .github/
    workflows/
      scan.yml                  Reusable workflow wrapper around the action
    dependabot.yml              Keeps action + npm versions current
  scripts/
    notify.mjs                  Builds the Discord embed from scanner counts and posts it
    claude-review.mjs           Sends the PR diff to Claude and emits structured findings
    gate.mjs                    Buckets findings by severity and enforces fail-on
  examples/                     Copy-paste consumer workflows
  package.json                  @anthropic-ai/sdk dependency for the optional Claude step
  CHANGELOG.md
  LICENSE                       AGPL v3
  COMMERCIAL.md                 Commercial license terms
```

---

## License

This project is dual-licensed:

- [AGPL v3](LICENSE) - free for open-source use. Derivatives and SaaS deployments must release their source under AGPL.
- [Commercial license](COMMERCIAL.md) - for proprietary / closed-source use or hosted services that do not want to comply with AGPL source-disclosure requirements. Contact for terms.
