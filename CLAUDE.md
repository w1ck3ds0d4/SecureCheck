# SecureCheck

A reusable GitHub Actions security pipeline: gitleaks (secrets), Semgrep (SAST),
Trivy (CVE + IaC), SARIF upload to code scanning, severity gating, and an
optional Claude Sonnet PR review. Consumer repos call it from their own
`security.yml`. Free and public, on the path to a Marketplace v1.0.0 listing.

## Commands

```bash
npm install
npm test           # node --test "scripts/**/*.test.mjs"
```

There is no build or lint step; the composite action's steps live in
`action.yml` and run directly in the consumer's job.

## Layout

| Path | What it is |
| --- | --- |
| `action.yml` | The composite action: inputs, secrets, and every step |
| `scripts/` | Node scripts the action shells out to (embed, gate, notify, Claude review) |
| `scripts/*.test.mjs` | Tests beside the script they cover |
| `examples/` | Copy-paste consumer workflow templates |
| `.github/workflows/` | This repo's own CI, scan, and reusable security workflow |
| `ROADMAP.md` | v1.0.0 acceptance checklist and milestones |

## Conventions

- Commit format: `(type) lowercase summary` - `feat`, `fix`, `chore`, `docs`,
  `refactor`, `revert`. No trailing period, no body unless needed.
- ASCII hyphens only. No em dashes or en dashes anywhere.
- Feature branch per change set, one PR per branch, squash-merge.
- Third-party actions in `action.yml` and the workflows are pinned to a commit
  SHA with the version as a trailing comment, not a floating tag.
- A new script under `scripts/` gets a `*.test.mjs` beside it.

## Do not read

- `node_modules/` (not committed, but ignore if present locally)
- `package-lock.json`
- Any scanner output under a runner's temp directory (not part of the repo)
