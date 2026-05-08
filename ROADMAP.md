# Roadmap

SecureCheck is small on purpose. The roadmap focuses on closing gaps between the documented behaviour, the actual workflow, and the scanners' capabilities. No timeline is committed; items are listed in rough priority order.

## Known gaps

### Silent-on-clean-push is not enforced

`README.md` states "Silent on clean pushes, no Discord noise for green main commits." The current `scripts/notify.mjs` posts an embed on every run when `DISCORD_WEBHOOK_URL` is set, regardless of `EVENT_NAME` or total findings. The expected behaviour can be implemented either in:

- `notify.mjs` (early `process.exit(0)` when `total === 0 && EVENT_NAME !== 'pull_request'`), or
- `.github/workflows/scan.yml` (gate the Post step on `event_name == 'pull_request' || total > 0`).

The script-level option keeps the workflow file simpler and is the smaller change.

### Pinning and supply-chain hardening

The reusable workflow uses major-version float on third-party actions:

- `actions/checkout@v6`
- `actions/setup-node@v6`
- `actions/setup-python@v6`
- `aquasecurity/trivy-action@0.35.0` (already pinned)
- `actions/upload-artifact@v4`

Floating to `@v6` is convenient but exposes the pipeline to upstream tag movement. A future hardening pass should pin to commit SHAs and document an upgrade procedure.

`@anthropic-ai/sdk` is declared with caret range `^0.37.0` in `package.json` and installed at runtime via `npm install` inside the workflow. There is no `package-lock.json` committed, so the resolved version is not reproducible.

### Action versions

- `aquasecurity/trivy-action@0.35.0` is older than the current available release. Bump and re-test.
- `gitleaks` version is hard-coded as `8.24.3` in the workflow env. Track a periodic bump.

## Near-term improvements

- Add a `package-lock.json` so the Claude step installs deterministically, then switch the install step to `npm ci`.
- Pin GitHub-hosted actions to commit SHAs.
- Add a `severity_threshold` input that lets a consumer fail the run when, for example, gitleaks count > 0 or total findings exceed N. Currently the workflow never fails on findings.
- Cache the Semgrep ruleset between runs to cut cold-start time.
- Add a smoke test workflow inside this repo that runs `scan.yml` against itself on PR.

## Medium-term ideas

- Optional SARIF upload so findings show up in the consumer repo's GitHub Security tab in addition to Discord.
- Per-scanner enable flags as workflow inputs (some consumers do not want Trivy IaC scans, for example).
- Allow the Claude reviewer to accept a custom system prompt via input, so consumer repos can tune it without forking SecureCheck.
- Slack notifier as a sibling to `notify.mjs`, selected via a `notifier` input.
- Configurable retention days for the artifact (currently fixed at 14).

## Long-term ideas

- Historical finding store. A small JSON ledger written to a separate branch or to a Gist, so the embed can show "5 new, 2 fixed since last scan" instead of just totals.
- Optional Anthropic-managed agent invocation so the reviewer can read multiple files, not just the diff. Cost gating would be required.

## Out of scope

- Hosted SaaS, a web UI, or a dashboard. SecureCheck is intentionally a thin reusable workflow.
- Replacing any of the three primary scanners. Adding more is fine; the three current ones stay.
- Bundling the Node scripts as a published GitHub Action under `action.yml`. The `workflow_call` model is preferred because it gives consumers full visibility into every step.

## Open questions

- Should the optional Claude review run on push as well, gated by some heuristic, or stay PR-only? Currently PR-only saves API spend but loses signal on direct pushes to `main`.
- Is the 40,000-character diff truncation the right cap? Larger diffs silently drop content.
