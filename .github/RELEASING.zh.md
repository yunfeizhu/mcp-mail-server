# CI 与 npm 自动发布

每次推送分支代码或提交 PR，都会在 Node.js 22 和 24 上自动运行现有质量门禁：格式、ESLint、TypeScript、发布构建和测试。CI 还会检查 package、lockfile 和中英文 changelog 的版本一致性，并预览 npm 包内容。

推送稳定版 `vX.Y.Z` 标签会触发 `publish-npm.yml`。标签必须指向 `main` 上的提交，且标签、package 版本、lockfile 版本和两份 changelog 的最新版本必须一致。流水线会重新执行质量检查，构建 tarball 并记录校验和，再由独立任务校验和发布这份 tarball，使用 npm OIDC 认证和 provenance。

普通代码推送只验证，不发布。npm 既有版本不可覆盖；此流程暂不支持预发布标签。

## 一次性配置

1. 在 GitHub **Settings → Environments** 创建名为 `npm` 的环境。在 **Deployment branches and tags** 中选择 **Selected branches and tags**，添加类型为 **Tag**、名称为 `v*` 的规则。是否设置审核人由维护者决定；不设置审核人时，标签检查通过后会自动发布。
2. 使用包所有者账号打开 [npm 包设置](https://www.npmjs.com/package/mcp-mail-server/access)，添加 **Trusted Publisher → GitHub Actions**，准确填写：

   | 字段                 | 值                |
   | -------------------- | ----------------- |
   | Organization or user | `yunfeizhu`       |
   | Repository           | `mcp-mail-server` |
   | Workflow filename    | `publish-npm.yml` |
   | Environment name     | `npm`             |

3. 在允许的操作中启用直接 **`npm publish`**。新配置默认允许 staged publishing，但仅有该权限不能执行此流程中的直接发布命令。

无需配置 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN` secret。发布任务使用 GitHub 托管 runner、Node.js 24 和 npm 11.17.0。账号设置与故障排查见 [npm Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。

## 准备一个版本

从最新 `main` 开始。例如，准备 2.1.0 之后的下一个补丁版本：

```bash
git switch main
git pull --ff-only
npm version patch --no-git-tag-version
```

为两份 changelog 添加对应版本和发布说明；按需更新 README 的版本摘要。运行时与冒烟测试直接读取 `package.json` 版本，不再需要分别修改。

将发布元数据放在同一个提交中，再创建和推送附注标签：

```bash
git add package.json package-lock.json CHANGELOG.md CHANGELOG.zh.md
git commit -m "chore(release): prepare 2.1.1"
git tag -a v2.1.1 -m "v2.1.1"
git push origin main --follow-tags
```

将 `2.1.1` 替换为实际版本。如果 `main` 要求通过 PR 合并，先合并发布元数据，再为合并后的提交打标签。在 GitHub **Actions → Publish to npm** 查看两个任务；只有第二个任务具备 npm 发布权限。

## 重试失败的发布

标签正确且 npm 尚未接受包时，修复外部配置后重跑失败任务，也可以从相同版本标签手动触发：

```bash
gh workflow run publish-npm.yml --ref v2.1.1
```

从分支手动触发会被拒绝。不要移动发布标签，也不要尝试重新发布已经存在的 npm 版本。网络中断导致结果不明确时，先检查 [npm 版本列表](https://www.npmjs.com/package/mcp-mail-server?activeTab=versions) 和 Actions 日志，再决定是否重试。
