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
- The reusable workflow (`.github/workflows/scan.yml`) still carries its own copy
  of the scan steps; turning it into a thin wrapper around the composite action
  is still to do.
- `notify.mjs` reads reports from the run's reports directory instead of a
  hardcoded `/tmp` path.
- The em-dash (U+2014) style check no longer fails builds by default. It is a
  personal style rule, not a security control, so it is now opt-in through the
  `style_check` input of the reusable workflow.
