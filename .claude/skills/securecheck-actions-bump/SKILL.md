---
name: securecheck-actions-bump
description: Re-pin a third-party GitHub Action to a commit SHA in SecureCheck's action.yml or scan.yml, the way commit 2ceab58 hardened the rest of them. Use when Daniel says "harden SecureCheck", "bump this action", or after a Dependabot PR touches action.yml or scan.yml and bumps an action by version tag instead of SHA.
---

# SecureCheck actions bump

SecureCheck is a security-pipeline product, so it holds itself to the supply-chain
discipline it sells: every third-party GitHub Action in `action.yml` and
`.github/workflows/scan.yml` (and `ci.yml`/`security.yml`) is pinned to a commit SHA, with
the human-readable version kept as a trailing comment. Commit `2ceab58` ("SHA-pin GitHub
Actions to commit SHAs") did this pass once; this skill repeats it whenever an action
changes.

Existing style, exactly as it appears today:

```yaml
- uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
- uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
- uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # 0.35.0
- uses: dtolnay/rust-toolchain@4cda84d5c5c54efe2404f9d843567869ab1699d4 # stable
```

Match that: full 40-character SHA, then ` # <tag-or-branch-as-shown-on-the-release>`.

## 1. Find what changed

```bash
grep -n "uses:" action.yml .github/workflows/*.yml
```

Dependabot bumps these by moving the SHA forward but keeping this same comment style
(check its PR diff), so this skill mostly matters for an action Daniel or you add by hand
with a bare version tag (`@v4`, `@main`) instead of a SHA.

## 2. Resolve the tag to a commit SHA

For each action still pinned by tag or branch:

```bash
gh api repos/<owner>/<repo>/git/refs/tags/<tag> --jq .object.sha
# or, if that tag is itself annotated and points at a tag object, not a commit:
gh api repos/<owner>/<repo>/git/tags/<sha-from-above> --jq .object.sha
```

For `dtolnay/rust-toolchain@stable` (a moving branch, not a version), resolve the branch
tip the same way against `git/refs/heads/stable`, and keep the comment as `# stable` since
that is the real reference being described, not a version number.

## 3. Replace the reference

Edit `action.yml` and the relevant workflow file(s) under `.github/workflows/`, replacing
`owner/repo@<tag>` with `owner/repo@<full-sha> # <tag>`. Keep the comment as whatever the
release is actually called (`v4`, `0.35.0`, `stable`), matching the existing file's style
for that same action if it appears more than once.

## 4. Check nothing was missed

```bash
grep -n "uses:.*@[a-zA-Z]" action.yml .github/workflows/*.yml | grep -vE "@[0-9a-f]{40} #"
```

An empty result means every `uses:` line is SHA-pinned with a trailing comment.

## The v1 tag rule for scan.yml

`scan.yml` is a reusable workflow that other repos call directly:
`uses: w1ck3ds0d4/SecureCheck/.github/workflows/scan.yml@v1` (see README.md). Consumers
pin the floating `v1` tag, not a SHA, because that is how a reusable-workflow caller is
meant to track a stable line. This means **any change to `scan.yml` (including this kind
of action re-pin) does not reach consumers until a new release moves `v1`** - editing the
file on `main` alone changes nothing for anyone pinned at `@v1`. After merging a
`scan.yml` change:

1. Tell Daniel the change is merged but not live for `@v1` consumers yet.
2. He cuts a release and force-moves the `v1` tag on GitHub's side himself (the same
   tag-and-release step CRA-Check's RELEASING.md describes for its own `@v1` consumers).
   Claude does not push tags to this repo's release line.

A change to `action.yml` (the composite action) does not have this delay in the same way,
since `w1ck3ds0d4/SecureCheck@v1` and `w1ck3ds0d4/SecureCheck/.github/workflows/scan.yml@v1`
are two different consumer entry points, but the underlying `@v1` tag is shared, so the
same release-and-move step covers both.

## Traps

- Resolving an annotated tag's SHA (`git/refs/tags/<tag>`) sometimes returns the tag
  object's own SHA, not the commit it points to; if `dotnet build`/CI then fails to find
  the action, re-resolve through `git/tags/<sha>` to get the underlying commit.
- A version-only comment update without the SHA change (or vice versa) leaves the pin
  wrong. Change both together and confirm with the grep in step 4.
- Do not tag or move `v1` yourself. That is Daniel's step on GitHub, same as the
  Marketplace publish step in CRA-Check's release process.
