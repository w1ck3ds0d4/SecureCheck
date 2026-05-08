# How it works

SecureCheck is a reusable GitHub Actions workflow you can drop into any repository to get a consistent multi-scanner security scan plus a single, severity-coloured Discord notification on every push and pull request.

## What it does

On every push to your default branch and every pull request against it:

1. Checks out your code at full history depth.
2. Runs three security scanners in parallel-ish steps: gitleaks, Semgrep, and Trivy.
3. Optionally asks Claude Sonnet 4.6 to review the PR diff for exploitable issues.
4. Tallies the findings, builds one Discord embed, and posts it.
5. Uploads the raw JSON output of every scanner as a workflow artifact, kept for 14 days.

You configure it once per consumer repo with a small caller workflow and a webhook secret.

## Key features

- **One reusable workflow, many repos.** Update scanners and rules in `w1ck3ds0d4/SecureCheck` and every consumer picks up the change automatically.
- **Three scanners covering different ground:**
  - `gitleaks` for hardcoded secrets in the working tree and history.
  - `Semgrep` (`auto` ruleset) for pattern-based static analysis.
  - `Trivy` for dependency CVEs and IaC / configuration misconfigurations.
- **Optional Claude review.** When you set `ANTHROPIC_API_KEY`, Claude reviews the PR diff and returns structured findings with severity, file, line, and a one-sentence exploit explanation. When the secret is missing, the step is skipped silently.
- **Single Discord embed per run.** Title, description, severity colour, per-scanner counts, and links to the workflow run and pull request, all in one message.
- **Severity-coloured embed:**
  - Green when all scanners are clean.
  - Yellow when there are findings but no gitleaks hit.
  - Orange when total findings exceed 10.
  - Red whenever gitleaks fires.
- **High-severity Claude findings inlined.** When Claude flags critical or high issues, the first five appear directly in the embed.
- **Pull-request heartbeat.** Every PR run posts an embed, even clean ones, so the reviewer can see the bot did its job.
- **Raw reports archived.** Every run uploads `gitleaks.json`, `semgrep.json`, `trivy.json`, and (when run) `claude.json` as the `security-reports` artifact for 14 days.

## Setup, end to end

### 1. Add the caller workflow

Create `.github/workflows/security.yml` in the repo you want scanned:

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

### 2. Add the Discord webhook secret

In your consumer repo:

```bash
gh secret set DISCORD_WEBHOOK_URL --repo <owner>/<repo>
```

Get the webhook URL from your Discord server: channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL.

### 3. (Optional) Enable Claude review

```bash
gh secret set ANTHROPIC_API_KEY --repo <owner>/<repo>
```

The Claude step only runs on pull requests and only when this secret is set. Pushes skip it to keep API spend down.

### 4. (Optional) Override defaults

```yaml
jobs:
  scan:
    uses: w1ck3ds0d4/SecureCheck/.github/workflows/scan.yml@main
    secrets: inherit
    with:
      node_version: '22'
      python_version: '3.12'
```

Defaults are Node 20 and Python 3.11.

## Reading a notification

Each Discord embed has the same shape:

- **Title:** `[<repo>] PR #<n>` for pull requests, or `[<repo>] push by <actor>` for pushes.
- **Description:** the PR title, or the first line of the commit message.
- **Scanners field:** `Gitleaks`, `Semgrep`, `Trivy`, and either `Claude: <n>` or `Claude: skipped`.
- **Claude high-severity field:** present only when Claude found critical or high issues. Lists up to five with file, line, and a short title.
- **Links field:** workflow run link, plus the PR link on PR runs.
- **Footer:** `All clear` when zero findings, otherwise `<n> findings, review the run for details`.

## When you want the full report

The embed is a summary. For full context, open the workflow run in the consumer repo's Actions tab and download the `security-reports` artifact. It contains the raw JSON output from every scanner that ran (the Claude file is present only when the Claude step ran).

## When something does not work

- **No Discord message.** Check that `DISCORD_WEBHOOK_URL` is set on the consumer repo (organisation-level secrets also work via `secrets: inherit`). The Post step prints `DISCORD_WEBHOOK_URL not set; skipping notification` when missing.
- **No Claude findings on a PR.** Check that `ANTHROPIC_API_KEY` is set and that the event is actually a pull request. The step is hard-skipped on push.
- **Workflow failed.** Scanner failures alone do not fail the run; if the run is red, it is the workflow itself (network, install). Open the run logs.

## License

Dual-licensed under AGPL v3 (`LICENSE`) and a commercial license (`COMMERCIAL.md`). For closed-source or SaaS use without AGPL source-disclosure, email `daniel.svs@outlook.com`.
