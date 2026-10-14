# CI 与 npm 自动发布

每次推送分支代码或提交 PR，都会在 Node.js 22 和 24 上自动运行现有质量门禁：格式、ESLint、TypeScript、发布构建和测试。CI 还会检查 package、lockfile、Release Please manifest、两份 changelog 和两份 README 的版本一致性，并预览 npm 包内容。

合并 Release Please 发布 PR 后，会创建稳定版 `vX.Y.Z` 标签和 GitHub Release，再显式从该标签触发 `publish-npm.yml`。标签必须指向 `main` 上的提交，且所有发布版本一致。流水线会重新执行质量检查，构建 tarball 并记录校验和，再由独立任务校验和发布这份 tarball，使用 npm OIDC 认证和 provenance。手动推送稳定版标签也会触发同一发布流水线。

普通代码推送只验证，不发布。npm 既有版本不可覆盖；此流程暂不支持预发布标签。

## 一次性配置

1. 在 GitHub **Settings → Actions → General → Workflow permissions** 启用 **Allow GitHub Actions to create and approve pull requests**。发布任务单独申请所需写权限，仓库默认权限可以保持只读。流水线不会自动批准或合并 PR。
2. 在 GitHub **Settings → Environments** 创建名为 `npm` 的环境。在 **Deployment branches and tags** 中选择 **Selected branches and tags**，添加类型为 **Tag**、名称为 `v*` 的规则。是否设置审核人由维护者决定；不设置审核人时，标签检查通过后会自动发布。
3. 使用包所有者账号打开 [npm 包设置](https://www.npmjs.com/package/mcp-mail-server/access)，添加 **Trusted Publisher → GitHub Actions**，准确填写：

   | 字段                 | 值                |
   | -------------------- | ----------------- |
   | Organization or user | `yunfeizhu`       |
   | Repository           | `mcp-mail-server` |
   | Workflow filename    | `publish-npm.yml` |
   | Environment name     | `npm`             |

4. 在允许的操作中启用直接 **`npm publish`**。新配置默认允许 staged publishing，但仅有该权限不能执行此流程中的直接发布命令。

无需配置 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN` secret。发布任务使用 GitHub 托管 runner、Node.js 24 和 npm 11.17.0。账号设置与故障排查见 [npm Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。

## 准备一个版本

1. 正常合并业务 PR，提交信息遵守 [Conventional Commits](https://www.conventionalcommits.org/)：`fix:` 自动生成补丁版，`feat:` 生成次版本，`!` 或 `BREAKING CHANGE:` 生成主版本。Squash 合并时，PR 标题也要遵守该格式。仅文档或 CI 变更不会独立触发发版。
2. **Prepare release** 自动创建或更新一个草稿发布 PR。Release Please 修改 `package.json`、`package-lock.json`、`CHANGELOG.md` 和 `.release-please-manifest.json`；来自可信 `main` 的脚本只把发布分支作为数据读取，在一个不强制推送的原子提交中同步 `CHANGELOG.zh.md`、`README.md` 和 `README-zh.md`。
3. 流水线显式触发发布分支的只读 CI，等待最终提交通过后才把 PR 改为可评审。检查失败或提交并发变化时仍保持草稿。审核版本与日志，**决定发布时才合并发布 PR**；不合并就不会发布。
4. 下一次 `main` 流水线创建版本标签和 GitHub Release，核对标签对应提交，再显式从该标签触发 npm 发布。在 Actions 查看 **Prepare release** 和 **Publish to npm**；只有最后的 publish 任务具备 npm OIDC 权限。

`GITHUB_TOKEN` 产生的推送不能可靠触发后续流水线，所以 CI 和 npm 发布都使用显式触发，不需要额外的个人访问令牌。中文文档自动同步分类标题、版本与日期，提交描述保留原文，不做机器翻译。历史手写说明和先前自动生成的版本记录会保留。README 自动同步的是版本摘要；功能文档和使用示例仍需随业务 PR 更新。

无需手动改版本、拼发布日志或打标签。运行时和冒烟测试直接读取 `package.json`。排除工作流故障后，可在 **Actions → Prepare release → Run workflow** 选择 `main` 刷新草稿，或执行 `gh workflow run release-please.yml --ref main`。

初始 manifest 使用已经发布的 `2.1.0`，并以该版本的准备提交作为 bootstrap 起点，避免第一次自动发版重复整个项目历史。之前已合并的回复主题修复会纳入下一个补丁版本；合并这次 CI 配置 PR 本身不会直接发布。

## 重试失败的发布

标签正确且 npm 尚未接受包时，修复外部配置后重跑失败任务，也可以从相同版本标签手动触发：

```bash
gh workflow run publish-npm.yml --ref v2.1.1
```

从分支手动触发会被拒绝。不要移动发布标签，也不要尝试重新发布已经存在的 npm 版本。网络中断导致结果不明确时，先检查 [npm 版本列表](https://www.npmjs.com/package/mcp-mail-server?activeTab=versions) 和 Actions 日志，再决定是否重试。
