# SecureCheck v1 Roadmap

## What v1 is

A reusable GitHub Actions workflow that consumer repos call from their own
`security.yml`. Runs gitleaks (secrets in history), Semgrep (SAST with
`auto` ruleset), Trivy (CVE + IaC), and an optional Claude Sonnet code review
on PRs. Posts a severity-coloured Discord embed and uploads raw scanner
output as artifacts.

## Current state

Workflow is in production and consumed by DA-Task-Alert, RS3-Companion,
GlassVault, GlassVault.tools, and others. Gitleaks 8.24.3, Semgrep `auto`,
Trivy, Claude Sonnet step (gated on `ANTHROPIC_API_KEY`). Discord severity
coding (green clean / yellow findings / orange many findings / red gitleaks
hit). Per-scanner JSON artifacts retained 14 days. PR heartbeat posts even
when green. Silent on clean pushes to main.

## v1 acceptance criteria

- [x] gitleaks scanner with current pinned version
- [x] Semgrep `auto` ruleset
- [x] Trivy CVE + IaC scan
- [x] Optional Claude Sonnet PR review
- [x] Discord severity coding
- [x] Per-scanner JSON artifact upload (14-day retention)
- [x] PR heartbeat posts on green PRs
- [x] Silent on clean main pushes
- [x] Em-dash style check gate
- [x] Gitleaks fails on intro
- [ ] Documented input matrix (every input the workflow accepts + default + meaning)
- [ ] Documented secret matrix (every secret the workflow expects + where it's used)
- [ ] Consumer install template (`.github/workflows/security.yml` example with placeholders)
- [ ] Version pinning policy + changelog
- [ ] Smoke test consumer: a `tests/consumer-fixture` repo or scratch run validating each scanner produces output as expected
- [ ] Tag `v1.0.0` once the input + secret matrices and consumer template are in tree

## Milestones to v1

### M1. Input + secret matrix (S)

- [ ] Document every `workflow_call` input in README (name, type, default, meaning)
- [ ] Document every secret expected (`DISCORD_WEBHOOK_URL`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` scopes)
- [ ] Note which inputs / secrets are optional vs required

**Acceptance:** a consumer can wire the workflow without reading the YAML.

### M2. Consumer install template (S)

- [ ] Add `examples/security.yml` showing the minimal caller
- [ ] Add `examples/security-with-claude.yml` showing the Claude variant
- [ ] Link both from README

**Acceptance:** copy-paste from `examples/` gets a new consumer to green in 5 minutes.

### M3. Versioning + changelog (S)

- [ ] Add CHANGELOG.md
- [ ] Document version pinning policy: consumers reference `@v1` for stable, `@main` for latest
- [ ] Tag policy: `v1.0.0`, `v1.0.1` for patches, `v1.1.0` for additive features, `v2.0.0` for breaking changes

**Acceptance:** consumers know exactly which tag to pin and what they get.

### M4. Smoke fixture (S/M)

- [ ] A `tests/consumer-fixture/` scratch dir with intentional leaks / SAST hits / Trivy CVEs
- [ ] CI on the SecureCheck repo runs the workflow against the fixture and asserts expected severities
- [ ] Document how to run it locally with `act` (or note that it requires GitHub Actions)

**Acceptance:** changes to the workflow can't ship without proving all scanners still fire.

### M5. Tag v1.0.0 (S)

- [ ] README polish
- [ ] Tag `v1.0.0`
- [ ] Update consumer repos one-by-one to pin `@v1.0.0`

**Acceptance:** at least 5 consumer repos pin the v1.0.0 tag.

## Beyond v1 (post-1.0 polish)

- Additional scanners (e.g., `osv-scanner`, `kubesec` for k8s manifests)
- Slack / Teams channel posters alongside Discord
- Markdown PR comment with findings (alongside Discord embed)
- Severity threshold gating ("fail PR if critical findings")
- Re-run knob to refresh stale Trivy DB without bumping the workflow version

## Out of scope for v1

- Hosting a SaaS edition (it's a GitHub-native workflow)
- Replacing any of the underlying scanners (they're best-of-class for the niche)
- Container image building / publishing (consumer's responsibility)
