# Roadmap

**Status:** release: path to v1.0.0. **Last reviewed:** 2026-09-24.

SecureCheck is a reusable GitHub Actions security pipeline (gitleaks, Semgrep,
Trivy, optional Claude PR review) that consumer repos call from their own
`security.yml`. All the scanning and gating logic already runs in production
across several private repos. "Done" for v1.0.0 means the remaining
documentation and pinning gates are closed and a tagged, Marketplace-listed
release exists.

> How this file is used: Claude Project threads build the first unticked item
> under **Now**, one item per branch and pull request, and tick it in that
> same PR as `- [x] ... (#PR)`. Daniel owns the order and the lists; threads
> never add to Now, Next or Later themselves, they propose under **Ideas**.

## Now (path to v1.0.0)
- [ ] **Document the input matrix**: every `workflow_call`/action input, its
  default, and what it does, in README. Done when: README has a table
  covering every input in `action.yml`.
- [ ] **Document the secret matrix**: every secret the action expects
  (`DISCORD_WEBHOOK_URL`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` scopes) and
  whether it is required. Done when: README lists each one with required/optional.
- [ ] **Consumer install template**: add `examples/security.yml` (minimal) and
  `examples/security-with-claude.yml` (Claude variant), linked from README.
  Done when: both files exist under `examples/` and are linked from README.
- [ ] **Version pinning policy**: document in README/CHANGELOG that consumers
  pin `@v1` for stable or `@main` for latest, and the `v1.0.0`/`v1.0.1`/`v1.1.0`
  tag scheme. Done when: the policy is written down and CHANGELOG has an
  Unreleased section following it.
- [ ] **Consumer smoke fixture**: a `tests/consumer-fixture/` with intentional
  leaks/SAST hits/CVEs, run in this repo's own CI. Done when: `ci.yml` runs the
  action against the fixture and the run is green.
- [ ] **Tag v1.0.0 and list on Marketplace (Daniel)**: cut the tag, publish a
  GitHub release, and complete the Marketplace listing. Done when: `v1.0.0` is
  tagged, a GitHub release exists, and the Marketplace listing is live.

## Next
- [ ] **Update consumer repos to pin `@v1.0.0`**: move private consumers off
  branch/SHA references onto the tag. Done when: at least 5 consumer repos
  reference `@v1.0.0`.
- [ ] **Severity threshold gating**: add a "fail PR if critical findings" mode
  on top of the existing `fail-on` input. Done when: a new input controls this
  and is documented.

## Later
- Additional scanners (osv-scanner, kubesec for k8s manifests)
- Slack/Teams channel posters alongside Discord
- Markdown PR comment with findings, alongside the Discord embed
- Re-run knob to refresh a stale Trivy DB without bumping the workflow version

## Ideas
(empty to start; threads add proposals here)

## Done
- [x] gitleaks, Semgrep `auto`, and Trivy CVE/IaC scanning wired into the
  composite action
- [x] SARIF upload to GitHub code scanning (`upload-sarif` input)
- [x] Configurable severity gate (`fail-on` input)
- [x] Optional Claude Sonnet PR review, gated on `ANTHROPIC_API_KEY`
- [x] Discord severity-coded embed (green/yellow/orange/red) plus PR heartbeat
- [x] Per-scanner JSON artifacts retained 14 days
- [x] Em-dash style check gate
- [x] Third-party actions pinned to commit SHAs (2026-06-13)
