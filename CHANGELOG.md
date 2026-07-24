# Changelog

All notable changes to SecureCheck are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
semantic versioning.

## [Unreleased]

### Added
- Composite action (`action.yml`) so SecureCheck can be used as
  `- uses: w1ck3ds0d4/SecureCheck@<ref>` and listed on the GitHub Marketplace.
- SARIF output from Gitleaks, Semgrep and Trivy, uploaded to GitHub code
  scanning (Security tab plus inline PR annotations). Requires the calling job
  to grant `security-events: write`.
- Configurable severity gate via the `fail-on` input
  (`none` | `low` | `medium` | `high` | `critical`). Detected secrets are always
  treated as critical.
- Caching for pip, npm and the Trivy database, and a `concurrency` group (in the
  reusable workflow) to cancel superseded runs.
- `gitleaks-version` input to pin the Gitleaks release.
- Findings-by-severity summary written to the job summary.
- Example consumer workflows under `examples/`.
- Dependabot configuration to keep pinned action versions current.

### Changed
- The reusable workflow (`.github/workflows/scan.yml`) is now a thin wrapper that
  calls the composite action, so the scan logic lives in a single place.
- `notify.mjs` reads reports from the run's reports directory instead of a
  hardcoded `/tmp` path.

### Removed
- The em-dash (U+2014) style check that previously failed builds. It was a
  personal style rule, not a security control.
