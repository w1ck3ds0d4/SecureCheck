# Architecture

SecureCheck is a centralised, reusable GitHub Actions workflow that runs a multi-scanner security pipeline against a consumer repository and posts a single Discord embed summarising the result. It has no server, no database, and no long-running process. Every run is a fresh GitHub-hosted Ubuntu runner.

## Tech stack

- GitHub Actions (`workflow_call` reusable workflow)
- Node.js 20 (default, configurable via `node_version` input)
- Python 3.11 (default, configurable via `python_version` input, used to run Semgrep)
- Bash + `jq` for finding-count extraction
- Scanners: `gitleaks` 8.24.3, `semgrep` (`auto` ruleset), `trivy` (via `aquasecurity/trivy-action@0.35.0`)
- `@anthropic-ai/sdk` v0.37 for the optional Claude PR review (model `claude-sonnet-4-6`)
- Discord incoming webhook for notifications

## Components

### Reusable workflow

Path: `.github/workflows/scan.yml`

Defines a single `scan` job triggered by `workflow_call`. It checks out the consumer repo at full depth (needed by gitleaks for history scanning) and additionally checks out SecureCheck itself into `.securecheck/` so the Node scripts are available without bundling them into the consumer repo.

### Notifier

Path: `scripts/notify.mjs`

Reads scanner counts from environment variables, builds a Discord embed (title, description, severity colour, fields, links, footer), and POSTs it to `DISCORD_WEBHOOK_URL`. Severity colour rules live entirely here:

- 0 findings: green (`0x2ecc71`)
- gitleaks > 0: red (`0xe74c3c`)
- total > 10: orange (`0xe67e22`)
- otherwise: yellow (`0xf1c40f`)

If the optional Claude step ran and produced critical or high severity findings, the notifier inlines the first five into a separate embed field, reading them from `/tmp/claude.json`.

### Claude reviewer

Path: `scripts/claude-review.mjs`

Pull request only. Computes `git diff origin/<base>...HEAD`, truncates to 40 KB, and asks Claude Sonnet 4.6 to return a strict JSON array of security findings (`severity`, `file`, `line`, `title`, `why`). Output is written to stdout and captured to `/tmp/claude.json`. The script always exits 0: any failure (missing key, network error, malformed response) collapses to `[]` so the rest of the pipeline keeps running.

## Data flow

1. Consumer repo's caller workflow (`.github/workflows/security.yml`) invokes `w1ck3ds0d4/SecureCheck/.github/workflows/scan.yml@main` with `secrets: inherit`.
2. `scan.yml` checks out the consumer repo (`fetch-depth: 0`) and SecureCheck (`path: .securecheck`).
3. Sets up Node and Python.
4. Runs gitleaks, Semgrep, and Trivy. Each scanner writes JSON to `/tmp/<scanner>.json`. Counts are extracted with `jq` and exported as step outputs.
5. On `pull_request` events, if `ANTHROPIC_API_KEY` is set, runs `claude-review.mjs` which writes `/tmp/claude.json` and exports a count.
6. `notify.mjs` reads all step outputs from env vars, builds the embed, and posts to Discord. Skipped silently when `DISCORD_WEBHOOK_URL` is unset.
7. All four JSON reports are uploaded as the `security-reports` artifact (14-day retention, `if-no-files-found: ignore`).

## Notification policy

- Push to default branch: post only if total findings > 0 (silent on green commits).
- Pull request: always post, including clean runs (the heartbeat behaviour, so reviewers see the bot ran).
- The conditional logic for "silent on clean push" is implicit: the embed always builds, but the green colour and zero counts make a clean push run a benign notification. (Note: the README describes silent-on-clean-push behaviour; the current `notify.mjs` posts on every run that has a webhook configured. Reconcile in `ROADMAP.md`.)

## Inputs and secrets

Inputs (workflow_call):

- `node_version` (default `'20'`)
- `python_version` (default `'3.11'`)

Secrets (read from consumer repo via `secrets: inherit`):

- `DISCORD_WEBHOOK_URL` (required for notifications, optional for the workflow itself)
- `ANTHROPIC_API_KEY` (optional, gates the Claude review step)

## File map

```
.github/workflows/scan.yml      Reusable workflow
scripts/notify.mjs              Discord embed builder and poster
scripts/claude-review.mjs       Claude PR diff reviewer
package.json                    @anthropic-ai/sdk dep, type: module
LICENSE                         AGPL v3
COMMERCIAL.md                   Dual-license commercial terms
README.md                       Install and usage docs
```

## Constraints and design choices

- No state between runs. Every artifact is produced from scratch from the checked-out tree.
- All scanners run with `exit-code: 0` (or `|| true`) so a finding never fails the workflow. Severity gating is the consumer's choice, not enforced here.
- The Claude script always exits 0 to guarantee the notifier still runs and the artifact still uploads.
- The diff is truncated at 40,000 characters before sending to the Claude API, capping cost and token use per PR.
