# CI and npm releases

Every branch push and pull request runs the existing quality gate on Node.js 22 and 24: formatting, ESLint, TypeScript, the release bundle, and tests. CI also checks package/lockfile/changelog version consistency and previews the npm package contents.

Pushing a stable `vX.Y.Z` tag starts `publish-npm.yml`. The tagged commit must be on `main`; its tag, package version, lockfile versions, and newest English/Chinese changelog entries must agree. The workflow repeats the quality gate, builds a tarball, and uploads it with a checksum. A separate job verifies and publishes that exact tarball using npm OIDC authentication and provenance.

Ordinary code pushes do not publish a package. Existing npm versions cannot be overwritten. Prerelease tags are not supported by this workflow.

## One-time setup

1. In GitHub **Settings → Environments**, create an environment named `npm`. Under **Deployment branches and tags**, select **Selected branches and tags** and add a **Tag** rule named `v*`. Required reviewers are optional; leaving them unset allows automatic publishing after the tag checks pass.
2. Open the [npm package settings](https://www.npmjs.com/package/mcp-mail-server/access) as a package owner and add a **Trusted Publisher → GitHub Actions** with these exact fields:

   | Field                | Value             |
   | -------------------- | ----------------- |
   | Organization or user | `yunfeizhu`       |
   | Repository           | `mcp-mail-server` |
   | Workflow filename    | `publish-npm.yml` |
   | Environment name     | `npm`             |

3. Enable the allowed action for direct **`npm publish`**. New trusted publishers permit staged publishing by default; that alone does not authorize this workflow's direct publish command.

No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed. The publish job uses GitHub-hosted runners, Node.js 24, and npm 11.17.0. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) for account configuration and troubleshooting.

## Prepare a release

Start from an up-to-date `main`. For example, to prepare the next patch after 2.1.0:

```bash
git switch main
git pull --ff-only
npm version patch --no-git-tag-version
```

Update both changelogs with the new version and release notes; update the README release highlights when appropriate. Runtime and smoke-test versions are read from `package.json`, so they do not require manual edits.

Commit the release metadata together, then create and push an annotated tag:

```bash
git add package.json package-lock.json CHANGELOG.md CHANGELOG.zh.md
git commit -m "chore(release): prepare 2.1.1"
git tag -a v2.1.1 -m "v2.1.1"
git push origin main --follow-tags
```

Replace `2.1.1` with the actual version. If `main` requires pull requests, merge the release metadata through a PR first, then tag the merged commit. In GitHub **Actions → Publish to npm**, watch both jobs complete; only the second job has npm publishing permission.

## Retry a failed publish

If the tag is correct and npm has not accepted the package, fix the external configuration and rerun the failed job. Alternatively, dispatch the workflow from the same version tag:

```bash
gh workflow run publish-npm.yml --ref v2.1.1
```

Dispatching from a branch is rejected. Do not move a release tag or attempt to republish an npm version that already exists. Check [the package versions](https://www.npmjs.com/package/mcp-mail-server?activeTab=versions) and the Actions logs before retrying after an ambiguous network failure.
