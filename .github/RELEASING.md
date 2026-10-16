# CI and npm releases

Every branch push and pull request runs the existing quality gate on Node.js 22 and 24: formatting, ESLint, TypeScript, the release bundle, and tests. CI also checks the package, lockfile, Release Please manifest, both changelogs, and both README release versions, and previews the npm package contents.

Merging a Release Please release PR creates a stable `vX.Y.Z` tag and a GitHub Release, then explicitly starts `publish-npm.yml` from that tag. The tagged commit must be on `main`; all release versions must agree. The workflow repeats the quality gate, builds a tarball, and uploads it with a checksum. A separate job verifies and publishes that exact tarball using npm OIDC authentication and provenance. Manually pushed stable tags also start the same publish workflow.

Ordinary code pushes do not publish a package. Existing npm versions cannot be overwritten. Prerelease tags are not supported by this workflow.

## PR previews and review bots

These integrations are independent of stable npm publishing:

| Integration                                                                 | Purpose                                                                                  | Configuration                                                                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new)                 | A preview package and one updated PR comment with an `npx` command pinned to the commit. | `preview-package.yml`; install the [GitHub App](https://github.com/apps/pkg-pr-new) for this repository.                                 |
| [CodeRabbit](https://docs.coderabbit.ai/reference/configuration)            | Automatic Chinese-language PR reviews; draft PRs are skipped.                            | `.coderabbit.yaml`; install the [GitHub App](https://github.com/apps/coderabbitai). No automatic approval, fixes, or merging is enabled. |
| GitHub Actions bundle-size comment                                          | Before/after raw and gzip sizes for the single minified `dist/index.js` entry.           | `bundle-analysis.yml`, `bundle-comment.yml`, and `scripts/bundle-size.ts`.                                                               |
| [Codecov Bundle Analysis](https://docs.codecov.com/docs/rollup-quick-start) | Module/asset breakdowns, a dashboard, and PR bundle reports. This is not test coverage.  | `codecov.yml`, the opt-in Rollup plugin, and the [GitHub App](https://github.com/apps/codecov).                                          |

Preview and bundle workflows run for `main` pushes and non-draft PRs targeting `main`, only in `yunfeizhu/mcp-mail-server`. Previews run the quality gate first, use a distinct `0.0.0-preview-<sha>` version, and are uploaded to **pkg.pr.new, not npm**. They do not change repository versions or create stable releases. Preview URLs are unreviewed development builds: use a test mailbox, not production credentials. CodeRabbit availability and limits depend on the account's plan; these files do not purchase a subscription.

Codecov authentication is scoped to the event, without storing `CODECOV_TOKEN` or using npm credentials:

- Public PRs use the official [temporary tokenless branch convention](https://docs.codecov.com/docs/codecov-tokens#commits-on-unprotected-branches): `pr<PR number>:<head branch>`, with the exact head commit and PR number. This changes only Codecov metadata, not GitHub branches. PR builds have no secrets or OIDC permission; account-level token authentication remains enabled.
- `bundle-baseline.yml` runs only for trusted `main` pushes and uses the official SDK's GitHub OIDC authentication. Only that baseline job requests `id-token: write`; it cannot be dispatched for a PR or arbitrary branch. The npm publishing workflow is unchanged.

`CODECOV_BUNDLE_ANALYSIS=true` makes the official Rollup plugin emit offline statistics. The dedicated workflows then call `npm run bundle:upload`; `scripts/upload-codecov.ts` validates the event and calls the SDK with strict error propagation. A failed upload-address request or report upload fails that analysis job instead of being silently ignored. Normal local builds, tests, and stable npm publication do not upload analysis. Plugin telemetry is disabled. Complete account/repository onboarding and check accepted reports in the [bundle dashboard](https://app.codecov.io/github/yunfeizhu/mcp-mail-server/bundles). The first authenticated `main` baseline and the default-branch comment workflow can only be validated after this configuration is merged.

Both size reports measure the bundled CLI code, **excluding external runtime dependencies**. They are not total installation size, download size of the npm tarball, or runtime-performance results. Codecov reports are informational with a 5% warning threshold, not new required checks. The Actions comment compares exact PR head/base commits, each built on Node.js 24 with its own lockfile, and uses gzip level 9.

PR builds have a read-only token and no repository secrets. The separate `workflow_run` reporter uses only trusted `main` code, validates a bounded JSON artifact against the source run and current open PR, and updates only its own marked comment. It never executes downloaded files or PR code with write permissions. Stale results are skipped; a new PR push refreshes them. Fork runs may need GitHub's normal maintainer approval. The comment workflow must exist on `main` before it can respond to completed runs; after the setup is merged, validate all four integrations with a new PR/update. Bots do not replace the existing CI quality gate or the maintainer's merge decision.

## One-time setup

1. In GitHub **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**. The release workflow requests its own limited write permissions; the repository default can remain read-only. It does not approve or merge PRs.
2. In GitHub **Settings → Environments**, create an environment named `npm`. Under **Deployment branches and tags**, select **Selected branches and tags** and add a **Tag** rule named `v*`. Required reviewers are optional; leaving them unset allows automatic publishing after the tag checks pass.
3. Open the [npm package settings](https://www.npmjs.com/package/mcp-mail-server/access) as a package owner and add a **Trusted Publisher → GitHub Actions** with these exact fields:

   | Field                | Value             |
   | -------------------- | ----------------- |
   | Organization or user | `yunfeizhu`       |
   | Repository           | `mcp-mail-server` |
   | Workflow filename    | `publish-npm.yml` |
   | Environment name     | `npm`             |

4. Enable the allowed action for direct **`npm publish`**. New trusted publishers permit staged publishing by default; that alone does not authorize this workflow's direct publish command.

No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed. The publish job uses GitHub-hosted runners, Node.js 24, and npm 11.17.0. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for account configuration and troubleshooting.

## Prepare a release

1. Merge ordinary code PRs with [Conventional Commit](https://www.conventionalcommits.org/) messages: `fix:` means a patch, `feat:` a minor release, and `!` or a `BREAKING CHANGE:` footer a major release. Use the same convention for squash-merge titles. Documentation/CI-only commits do not independently require a release.
2. **Prepare release** creates or refreshes one draft release PR. Release Please updates `package.json`, `package-lock.json`, `CHANGELOG.md`, and `.release-please-manifest.json`. Our trusted `main` script reads that PR as data and synchronizes `CHANGELOG.zh.md`, `README.md`, and `README-zh.md` in an atomic, non-force-pushed documentation commit.
3. Maintain the reviewed Chinese release description in `release-notes/X.Y.Z.zh.md` on `main` as described below. Missing, untranslated, or stale notes leave the release PR in draft instead of copying English descriptions into Chinese files.
4. The workflow explicitly dispatches the read-only CI workflow for the release branch, waits for the exact final commit to pass, and only then marks the PR ready for review. Failures and concurrent head changes leave it in draft. Review the version and notes; merge the release PR **when you decide to publish**. Leaving it open does not release anything.
5. The next `main` run creates the version tag and GitHub Release, verifies the tag's commit, and explicitly dispatches npm publishing from that tag. Watch both **Prepare release** and **Publish to npm** in Actions. Only the publish job has npm OIDC permission.

GitHub does not reliably start follow-up workflows for pushes made with `GITHUB_TOKEN`; the explicit CI and publish dispatches avoid needing a personal access token. Chinese descriptions come from reviewed versioned Markdown, not from category-heading replacement or an external translation service. Existing handwritten release history and previous generated entries are retained. README synchronization updates release summaries, not feature documentation or usage examples; update those in the relevant code PR.

You do not need to edit versions, copy release descriptions into multiple files, or create tags manually. Chinese prose still requires maintainer review. Runtime and smoke-test versions are read from `package.json`. To refresh a draft after adding Chinese notes or resolving a workflow failure, run **Actions → Prepare release → Run workflow** on `main`, or use `gh workflow run release-please.yml --ref main`.

### Maintain Chinese release notes

From a checkout containing the pending release's English `CHANGELOG.md`, print a template:

```bash
npm run --silent release:notes:zh -- 2.1.2
```

An optional second argument selects another English changelog path. This command prints to stdout and never overwrites a translation. Copy the output into `release-notes/2.1.2.zh.md`, translate the descriptions, and submit that source file through an ordinary PR targeting `main`. Keeping the source on `main` ensures it survives Release Please rebuilding its release branch. Do not maintain the two generated Chinese sections separately.

Keep the first-line `release-source-sha256` marker. It binds the translation to the version and the complete current English notes, including links. Formatting-only bullet/line-ending differences and release dates do not invalidate it. If new releasable commits change the English notes, the workflow stops in draft: review and update the Chinese description before copying the new template's marker. Never update only the marker to bypass translation review.

Every release-note item must contain Chinese prose; protocol names, inline code, and URLs may remain unchanged. Heading-only translations and English-only items are rejected. The reviewed source is synchronized to both `CHANGELOG.zh.md` and `README-zh.md` without overwriting the original prose. Release verification checks their content, matching source markers, and consistency with that source. Previously published handwritten releases without source markers remain supported.

The initial manifest starts at the already published `2.1.0`, with a bootstrap commit at its release preparation. This prevents the first automated release from repeating the project's entire history. The previously merged reply-subject fix is therefore eligible for the next patch release; merging this CI setup PR does not itself publish a version.

## Retry a failed publish

If the tag is correct and npm has not accepted the package, fix the external configuration and rerun the failed job. Alternatively, dispatch the workflow from the same version tag:

```bash
gh workflow run publish-npm.yml --ref v2.1.1
```

Dispatching from a branch is rejected. Do not move a release tag or attempt to republish an npm version that already exists. Check [the package versions](https://www.npmjs.com/package/mcp-mail-server?activeTab=versions) and the Actions logs before retrying after an ambiguous network failure.
