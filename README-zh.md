<div align="center">

# MCP Mail Server

**让你的 AI 助手真正读懂并处理邮件。**

通过支持密码或应用专用密码认证的标准 IMAP/SMTP 邮箱，在 Claude、Cursor、Codex 等 MCP 客户端中搜索、阅读、整理、回复和发送邮件。

[![npm 版本](https://img.shields.io/npm/v/mcp-mail-server?logo=npm)](https://www.npmjs.com/package/mcp-mail-server)
[![npm 下载量](https://img.shields.io/npm/dm/mcp-mail-server?logo=npm)](https://www.npmjs.com/package/mcp-mail-server)
[![Node.js](https://img.shields.io/node/v/mcp-mail-server?logo=node.js)](https://www.npmjs.com/package/mcp-mail-server)
[![MIT 许可证](https://img.shields.io/npm/l/mcp-mail-server)](LICENSE)

[English](README.md) · **简体中文**

[为什么选择它？](#为什么选择它) · [快速开始](#快速开始) · [客户端配置](#客户端配置) · [工具能力](#工具能力一览) · [配置](#配置) · [开发](#开发)

</div>

> “找出 Alice 本周发来的未读邮件，帮我总结一下，然后把已经处理完的邮件移到 Archive。”

## 为什么选择它？

<table>
  <tr>
    <td width="50%"><strong>🔎 快速找到重要邮件</strong><br>跨文件夹按发件人、收件人、主题、正文、日期、已读状态和回复状态搜索。</td>
    <td width="50%"><strong>✉️ 在对话中直接处理</strong><br>用自然语言阅读、发送、回复、移动和删除邮件。</td>
  </tr>
  <tr>
    <td width="50%"><strong>📎 完整处理附件</strong><br>查看附件信息、下载文件，并通过明确的目录白名单发送本地附件。</td>
    <td width="50%"><strong>🔐 数据由你掌控</strong><br>服务在本地运行，直连邮箱服务商，同时启用证书校验和载荷大小限制。</td>
  </tr>
</table>

## 你可以这样问

| 目标           | 示例                                                          |
| -------------- | ------------------------------------------------------------- |
| 快速了解收件箱 | “总结一下今天收到的未读邮件。”                                |
| 找到特定邮件   | “查找 finance@example.com 发来的、与第三季度预算有关的邮件。” |
| 整理收件箱     | “把已经处理完的邮件从收件箱移到 Archive。”                    |
| 带上下文回复   | “回复 Alex 最近发来的邮件，并保持在同一个邮件线程中。”        |
| 处理附件       | “把那封邮件里的 PDF 附件保存到 Downloads 文件夹。”            |
| 发送正式邮件   | “发送项目进展邮件，并附上我的文本和 HTML 签名。”              |

## 快速开始

> [!IMPORTANT]
> 开始前请先为邮箱账号启用 IMAP 和 SMTP。本服务目前仅支持密码或应用专用密码认证，尚不支持 OAuth2。

1. **准备** IMAP/SMTP 服务地址，以及服务商支持的应用专用密码。
2. **按照下方示例** 将服务添加到你的 MCP 客户端。
3. **重启或重新连接** 客户端，然后试着说：_“显示今天的未读邮件。”_

所有示例都使用 `npx -y mcp-mail-server`，无需全局安装。

## 客户端配置

<details>
<summary>Claude Desktop</summary>

打开 **设置 > 开发者 > 编辑配置**，将服务添加到 `claude_desktop_config.json`：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "your-imap-server.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "your-smtp-server.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@domain.com",
        "EMAIL_ADDRESS": "your-email@domain.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

保存文件后，完全退出并重新启动 Claude Desktop。最新客户端操作方式请参考[官方本地 MCP 服务指南](https://modelcontextprotocol.io/docs/develop/connect-local-servers)。

</details>

<details>
<summary>Cursor</summary>

将服务添加到 Cursor 的以下任一 MCP 配置文件：

- 项目级：`.cursor/mcp.json`
- 全局：`~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "your-imap-server.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "your-smtp-server.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@domain.com",
        "EMAIL_ADDRESS": "your-email@domain.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

当前配置位置及行为请参考 [Cursor MCP 文档](https://cursor.com/docs/mcp)。

</details>

<details>
<summary>Claude Code</summary>

按用户级作用域添加，使该服务可在所有项目中使用：

```bash
claude mcp add \
  --scope user \
  --env IMAP_HOST=your-imap-server.com \
  --env IMAP_PORT=993 \
  --env IMAP_SECURE=true \
  --env SMTP_HOST=your-smtp-server.com \
  --env SMTP_PORT=465 \
  --env SMTP_SECURE=true \
  --env EMAIL_USER=your-email@domain.com \
  --env EMAIL_ADDRESS=your-email@domain.com \
  --env EMAIL_PASS=your-app-password \
  --transport stdio \
  mcp-mail-server \
  -- npx -y mcp-mail-server
```

仅在当前项目使用时可改为 `--scope local`（默认值）；需要生成可共享的项目配置时使用 `--scope project`，配置会写入项目根目录的 `.mcp.json`。Claude Code 不会从 `.claude/settings.json` 读取 MCP 服务。可执行 `claude mcp get mcp-mail-server`，或在 Claude Code 中使用 `/mcp` 检查连接。作用域和配置规则请参考 [Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)。

</details>

<details>
<summary>OpenAI Codex</summary>

使用 Codex CLI 添加服务：

```bash
codex mcp add mcp-mail-server \
  --env IMAP_HOST=your-imap-server.com \
  --env IMAP_PORT=993 \
  --env IMAP_SECURE=true \
  --env SMTP_HOST=your-smtp-server.com \
  --env SMTP_PORT=465 \
  --env SMTP_SECURE=true \
  --env EMAIL_USER=your-email@domain.com \
  --env EMAIL_ADDRESS=your-email@domain.com \
  --env EMAIL_PASS=your-app-password \
  -- npx -y mcp-mail-server
```

Codex 的用户级配置保存在 `~/.codex/config.toml`。若只希望在受信任的当前项目中生效，可使用 `.codex/config.toml`：

```toml
[mcp_servers.mcp-mail-server]
command = "npx"
args = ["-y", "mcp-mail-server"]
env_vars = [
  "IMAP_HOST",
  "IMAP_PORT",
  "IMAP_SECURE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "EMAIL_USER",
  "EMAIL_ADDRESS",
  "EMAIL_PASS"
]
```

启动 Codex 前，需要先在宿主环境中设置这些变量。ChatGPT 桌面端、Codex CLI 和 Codex IDE 扩展共享该配置。当前配置选项请参考 [Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp)。

</details>

<details>
<summary>其他MCP客户端</summary>

请使用客户端当前支持的 MCP 配置格式，并注册一个本地 **STDIO** 服务：

- 命令：`npx`
- 参数：`-y`、`mcp-mail-server`
- 环境变量：下方[配置](#配置)章节列出的 IMAP、SMTP 和账号必填变量

不同客户端的配置文件名和格式并不统一，不要默认所有客户端都支持 `mcpServers` JSON 格式。

</details>

## 工具能力一览

| 能力       | 工具                                                            |
| ---------- | --------------------------------------------------------------- |
| 连接管理   | `check_connection`                                              |
| 邮箱文件夹 | `list_mailboxes`                                                |
| 搜索发现   | `search_messages`、`find_unreplied_messages`                    |
| 邮件处理   | `get_message`、`get_messages`、`move_message`、`delete_message` |
| 撰写发送   | `send_email`、`reply_to_email`、`continue_email_thread`         |
| 附件处理   | `get_message` 返回附件元数据，`save_attachment` 保存文件        |

<details>
<summary>查看完整工具参数</summary>

### 连接管理

- **check_connection**：按需连接 IMAP、实时验证 SMTP，并返回结构化状态

### 邮箱操作

- **list_mailboxes**: 无需参数

### 搜索操作

- **search_messages**：组合使用 `mailboxes`、`from`、`to`、`subject`、`body`、IMAP `keywords`、`unread`、包含下界的 `since`、不包含上界的 `before`、`limit` 和 `includeBody`。不传 `mailboxes` 时搜索 INBOX 和自动识别的已发送邮箱。日期时间搜索会将 IMAP 日历日期候选窗口在两侧各放宽两天，再按精确时间过滤，覆盖 UTC+14 到 UTC-12 的完整 INTERNALDATE 日期跨度。`MAIL_MAX_SEARCH_CANDIDATES` 范围内的候选会先按内部日期排序再应用 `limit`；超出上限时提示缩小范围，不会按 UID 顺序猜测。默认仅返回摘要。Keywords 必须是符合 atom 安全规则的自定义 IMAP keyword；空白、控制字符、IMAP 语法字符和系统 flag 会被拒绝。`includeBody` 为 true 时，如果选中的邮件在补取正文前消失，或本次调用会超过正文响应总量预算，调用会明确失败。
- **find_unreplied_messages**：`sender`（必填）、`mailboxes`（可选，默认 INBOX）、`since`、`before`、`limit`。根据 `In-Reply-To` 和 `References` 判断；缺少 `Message-ID` 的邮件会进入 `unknownMessages`，不再按主题猜测。

```json
{
  "mailboxes": ["INBOX", "Archive"],
  "from": "alice@example.com",
  "unread": true,
  "since": "2026-07-01",
  "before": "2026-08-01",
  "limit": 20
}
```

### 邮件操作

- **get_message**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选), `markSeen` (布尔值, 可选)
- **get_messages**: `mailbox` (字符串), `uids` (数组), `uidValidity` (数字, 可选), `markSeen` (布尔值, 可选)。任一请求 UID 不存在时，会在读取正文前整体失败；合计返回正文超过 `MAIL_MAX_RESPONSE_CHARACTERS` 时也会明确失败。
- **move_message**: `mailbox` (字符串), `uid` (数字), `targetMailbox` (字符串), `uidValidity` (数字, 可选)。源 UID 和目标邮箱都必须已经存在；服务器不支持 MOVE 或 UIDPLUS 时会安全失败。服务器返回目标 UID 时，结果还会刷新 `destinationUidValidity`。UIDPLUS 降级路径清理源邮件报错时，会重新打开源目录、验证 UID，并尽可能回滚 `\\Deleted`。MOVE 或 COPY 确认前断线会返回 `isError: true`、`partial: true` 和 `copyOutcome: "unknown"`；已确认复制但源清理不确定时返回 `copyOutcome: "succeeded"`，以及经过验证的 `sourceState`、可选 `sourceDeletedFlag` 和可用的目标引用。两种情况都应先检查源和目标目录，再决定是否重试。
- **delete_message**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选)。先确认 UID 存在，再仅永久删除指定 UID。STORE 或 UID EXPUNGE 报错时会重新验证源 UID，并尽可能回滚 `\\Deleted`；无法确认的传输错误返回结构化 `outcome: "unknown"`，不再武断地声称邮件未删除。

### 邮件发送

- **send_email**: `to` (字符串), `subject` (字符串), `text` (字符串, 可选), `html` (字符串, 可选), `signature` (对象, 可选：包含 `text` 和/或 `html`), `cc` (字符串, 可选), `bcc` (字符串, 可选), `attachments` (字符串数组, 可选, 绝对文件路径)。`text` 和 `html` 至少提供一个。
- **reply_to_email**: `mailbox` (字符串), `originalUid` (数字), `uidValidity` (数字, 可选), `text` (字符串, 可选), `html` (字符串, 可选), `signature` (对象, 可选：包含 `text` 和/或 `html`), `replyToAll` (布尔值, 默认 false), `includeOriginal` (布尔值, 默认 true)。`text` 和 `html` 至少提供一个。
- **continue_email_thread**: `subject` (字符串), `recipient` (字符串, 可选，用于缩小匹配范围), `since` (字符串, 可选), `text` (字符串, 可选), `html` (字符串, 可选), `signature` (对象, 可选), `replyToAll` (布尔值, 默认 true), `includeOriginal` (布尔值, 默认 true)。它会在自动识别的已发送目录中寻找规范化主题完全一致的最新邮件，确认存在 Message-ID 后回复该邮件，使日报、周报保持在同一线程中，并默认携带上一封邮件的完整正文；正文仍受 `MAIL_MAX_BODY_CHARACTERS` 安全上限约束。

周期报告的自然语言调用示例：

> 请继续回复我今天发给 `manager@example.com` 的《研发日报》，不要新建邮件线程。新增内容："今日完成邮件回复功能修复；明日计划完成回归验证。"请保留之前的完整邮件内容，并回复所有人。

建议明确提供“继续回复上一封”、准确主题、收件人或日期以及本次新增正文，帮助客户端选择 `continue_email_thread`，避免误用 `send_email` 新建线程。

签名会追加在新邮件正文之后；回复邮件时，签名位于原邮件引用之前。为兼容不同邮件客户端，建议同时提供 `signature.text` 和 `signature.html`。HTML 签名会按可信邮件 HTML 直接使用。

发出的 HTML 邮件默认继承跨平台系统字体栈（`Segoe UI` / `PingFang SC` / `Microsoft YaHei` / `Noto Sans CJK SC`，并以 Arial 和 sans-serif 兜底）、14px 基础字号和 1.6 行高。调用方在 HTML 内显式设置的样式仍会覆盖这些默认值。调用方只提供 `text` 时，服务端会保留 `text/plain` 正文，同时自动生成内容等价、带默认样式的 `text/html` alternative，避免支持 HTML 的邮件客户端退回等宽纯文本显示。

启用 `includeOriginal` 时，HTML-only 原邮件会转换成可读纯文本供 text alternative 引用；超长引用会按 `MAIL_MAX_BODY_CHARACTERS` 截断，同时保留新回复正文和签名。

SMTP 接受邮件后，发送工具会返回 `sentFolderSaved` 和自动识别的 `sentFolder`。只有确定未追加时才尝试下一个已发送目录；传输失败等结果不确定时立即停止，避免重复副本。如果保存失败，SMTP 成功状态仍会保留，`sentFolderError` 会返回脱敏后的 `stage`、`code`、`message`、`mailbox` 和可用时的逐候选 `attempts`。

### 附件操作

- **get_message** 会随邮件返回附件文件名、类型、大小和索引
- **save_attachment**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选), `savePath` (字符串, 绝对路径), `attachmentIndex` (数字, 可选, 从0开始), `returnBase64` (布尔值, 可选, 默认: false)。批量保存时若后续写入失败，会返回 `isError: true`、`partial`、`savedFiles` 和 `failedAttachment`，避免重试时静默生成重复文件。

</details>

## 配置

### 环境变量

**核心邮件变量是必需的；文件与安全策略变量按需配置。**

| 变量                           | 描述                                                                                                        | 示例                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `IMAP_HOST`                    | IMAP服务器地址                                                                                              | `imap.gmail.com`                |
| `IMAP_PORT`                    | IMAP端口号，范围 1-65535                                                                                    | `993`                           |
| `IMAP_SECURE`                  | 必须为 `true`；使用隐式 TLS IMAP 端点，通常为 993 端口                                                      | `true`                          |
| `SMTP_HOST`                    | SMTP服务器地址                                                                                              | `smtp.gmail.com`                |
| `SMTP_PORT`                    | SMTP端口号，范围 1-65535                                                                                    | `465`                           |
| `SMTP_SECURE`                  | 465 端口使用隐式 TLS；587 端口设为 `false`，并在认证前强制 STARTTLS                                         | `true`                          |
| `EMAIL_USER`                   | 邮箱用户名                                                                                                  | `your-email@gmail.com`          |
| `EMAIL_PASS`                   | 邮箱密码/应用密码                                                                                           | `your-app-password`             |
| `EMAIL_ADDRESS`                | 发件人 From 地址及 reply-all 账号身份，默认使用 `EMAIL_USER`                                                | `your-email@gmail.com`          |
| `IMAP_TLS_REJECT_UNAUTHORIZED` | 是否校验 IMAP TLS 证书，默认 `true`                                                                         | `true`                          |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | 是否校验 SMTP TLS 证书，默认 `true`                                                                         | `true`                          |
| `MAIL_ALLOWED_ROOTS`           | 允许附件读取/写入的已存在目录；未设置时禁用本地附件读写。多个目录在 macOS/Linux 用 `:`、Windows 用 `;` 分隔 | `/Users/me/Documents:/tmp/mail` |
| `MAIL_MAX_ATTACHMENT_BYTES`    | 单个附件及附件总量上限，默认 25 MiB，最大 1 GiB                                                             | `26214400`                      |
| `MAIL_MAX_MESSAGE_BYTES`       | 单封邮件内存解析上限，默认 25 MiB，最大 1 GiB                                                               | `26214400`                      |
| `MAIL_MAX_BASE64_BYTES`        | 允许返回 Base64 的附件大小上限，默认 1 MiB，最大 100 MiB                                                    | `1048576`                       |
| `MAIL_MAX_BODY_CHARACTERS`     | 单个正文或 HTML 返回字符上限，默认 200000，最大 10000000                                                    | `200000`                        |
| `MAIL_MAX_RESPONSE_CHARACTERS` | 单次正文读取工具调用返回的 text 与 HTML 合计字符上限，默认 2000000，最大 100000000                          | `2000000`                       |
| `MAIL_MAX_SEARCH_CANDIDATES`   | 单次调用最多检查的邮件头总数，默认 5000，最大 100000                                                        | `5000`                          |
| `MAIL_MAX_SEARCH_HEADER_BYTES` | 单次调用最多缓冲的请求邮件头原始字节数，默认 16 MiB，最大 1 GiB                                             | `16777216`                      |

搜索结果会返回 `sourceMailbox`、`uid` 和 `uidValidity`。后续读取、回复、移动、下载附件或删除邮件时，应原样传回这些字段，避免不同邮箱中的相同 UID 指向错误邮件；不再把不稳定的 IMAP sequence number 暴露为邮件 `id`。`size` 是服务器返回的 RFC822 字节大小；服务器未提供时为 `null`。搜索默认只返回摘要；完整正文和附件元数据请使用 `get_message`，或显式设置 `includeBody: true`。

### 常用邮件提供商

<details>
<summary>Gmail配置</summary>

```bash
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
EMAIL_USER=your-email@gmail.com
EMAIL_ADDRESS=your-email@gmail.com
EMAIL_PASS=your-app-password
```

**注意**：本服务当前只支持密码认证，尚不支持 OAuth2。Google 账号的普通密码无法使用；如果账号允许，请使用[应用专用密码](https://support.google.com/accounts/answer/185833)。Google 推荐使用 OAuth 登录，受管理账号也可能禁用应用专用密码。

</details>

<details>
<summary>Outlook/Hotmail（当前暂不支持）</summary>

Outlook.com 和 Exchange Online 的 IMAP、SMTP 目前要求使用 OAuth2/现代身份验证。本服务当前只接受用户名和密码，因此暂不支持 Outlook/Hotmail 账号。

Outlook SMTP 的 587 端口还要求使用 STARTTLS，对应 `SMTP_SECURE=false`；仅修改该变量仍然无法解决 OAuth 认证要求。请参考 [Microsoft 当前 IMAP 和 SMTP 配置说明](https://support.microsoft.com/en-US/Outlook/pop-imap-and-smtp-settings-for-outlook-com)。

</details>

### 安全说明

- **认证限制**：本服务目前仅支持密码或应用专用密码认证，尚不支持 OAuth2
- **服务商允许时使用应用专用密码**：不要使用邮箱主账号密码
- **强制传输加密**：IMAP 仅允许隐式 TLS；SMTP 在 `SMTP_SECURE=true` 时使用隐式 TLS，设为 `false` 时会在认证前强制 STARTTLS
- **保持证书校验开启**：除非使用自己控制并明确可信的私有 CA，否则不要关闭两个 TLS `REJECT_UNAUTHORIZED` 配置
- **保护本地凭据**：MCP 客户端可能把 `EMAIL_PASS` 保存在本地配置文件中，请限制文件权限，并且绝不要把包含凭据的配置提交到版本控制
- **保护本地环境文件**：Git 已忽略 `.env` 和 `.env.*`；共享配置模板时只使用已脱敏的 `.env.example`

## 开发

开发和运行均需要 Node.js 22.13 或更高版本；仓库通过 `.nvmrc` 将本地开发版本固定为 Node.js 22.23.0 LTS。

<details>
<summary>本地开发设置</summary>

1. **克隆仓库**:

   ```bash
   git clone https://github.com/yunfeizhu/mcp-mail-server.git
   cd mcp-mail-server
   ```

2. **安装依赖**:

   ```bash
   npm install
   ```

3. **构建项目**:

   ```bash
   npm run build
   ```

   执行完整的本地质量检查：

   ```bash
   npm run check
   ```

   也可以使用 `npm run format`、`npm run lint:fix`、`npm run format:check` 和 `npm run lint` 分别执行格式化与代码检查。

   Rollup 会直接解析并转译 `src/*.ts`，生成单文件发布 bundle。本地 TypeScript 导入省略文件后缀，第三方包子路径则保留其发布时声明的后缀；`tsc` 仅执行类型检查，测试通过 `tsx` 直接加载源码。运行时库保持为 external，并通过包内声明的 `dependencies` 安装。

4. **设置环境变量**:

   ```bash
   export IMAP_HOST=your-imap-server.com
   export IMAP_PORT=993
   export IMAP_SECURE=true
   export SMTP_HOST=your-smtp-server.com
   export SMTP_PORT=465
   export SMTP_SECURE=true
   export EMAIL_USER=your-email@domain.com
   export EMAIL_ADDRESS=your-email@domain.com
   export EMAIL_PASS=your-app-password
   ```

5. **运行服务器**:
   ```bash
   npm start
   ```

</details>

### 使用 MCP Inspector 交互测试

运行：

```bash
npm run dev:inspector
```

命令会先构建项目，然后打开固定版本为 1.0.0 的 MCP Inspector 页面。在连接面板中填写：

- Transport Type：`STDIO`
- Command：`node`
- Arguments：`dist/index.js`
- Environment Variables：填写上方配置表中的 IMAP、SMTP、账号及密码变量

点击 **Connect** 后进入 **Tools** 页面，先调用 `check_connection` 验证 IMAP 和 SMTP；其他工具也会按需自动连接。附件工具还需要配置 `MAIL_ALLOWED_ROOTS`。

MCP 服务和固定版本的 Inspector 均需要 Node.js 22.13 或更高版本。

## 版本说明

<details open>
<summary><strong>v2.0.2</strong> — 修复完整邮件与附件解析</summary>

**修复**

- 将完整 RFC822 邮件作为单个 IMAP body stream 获取，避免 Gmail 等服务调整独立邮件头与正文分段的返回顺序，恢复邮件头、Message-ID、附件元数据与附件下载。

</details>

<details>
<summary><strong>v2.0.1</strong> — 恢复新版 Node.js 的已发送目录保存</summary>

**修复**

- 由邮件服务器分配 `INTERNALDATE`，避开 `imap@0.8.19` 对已移除 `util.isDate` API 的调用，恢复 Node.js 23 及更高版本的 IMAP APPEND。

</details>

<details>
<summary><strong>v2.0.0</strong> — 更精简的工具面和更安全的邮件操作</summary>

**破坏性变更**

- 将 25 个重复工具收敛为 12 个聚焦工具，包括统一的 `search_messages`、`check_connection`、`find_unreplied_messages`，以及面向周期报告的 `continue_email_thread`。
- 移除隐式邮箱状态以及重复的连接、搜索、计数和附件元数据工具。

**修复**

- 在 limit 前应用精确日期范围，保留 reply-all 收件人，并依据线程头判断回复状态。
- 使用定向 UID EXPUNGE，删除单封邮件时不会清理目录中其他已标记 `\\Deleted` 的邮件。
- 搜索默认返回轻量摘要，仅为最终选中的结果读取完整正文。
- 有值时返回 RFC822 邮件大小（否则为 `null`）；已发送副本保存失败时提供结构化且脱敏的诊断信息。
- 移动/删除前确认 UID 存在，限制邮件头和批量读取内存，实时验证 SMTP，并让所有搜索路径共享同一候选预算。
- 运行时库保持为 npm 已声明依赖，并拒绝发布 bundle 中未声明的 external import。

</details>

<details>
<summary><strong>v1.2.3</strong> — 支持移动邮件、邮件签名和更清晰的快速配置</summary>

**新增**

- 新增 `move_message`，支持将邮箱范围内的邮件移动到已存在的目标文件夹。
- `send_email` 和 `reply_to_email` 新增可选的纯文本与 HTML 签名。

**改进**

- IMAP 服务器提供目标 UID 时随移动结果返回，未提供时提示重新搜索目标邮箱。
- 回复签名位于新正文之后、原邮件引用之前，同时保留 MIME 多格式正文。
- 校验移动目标，拒绝将邮件移动到当前所在邮箱。

**文档**

- 围绕常用邮件工作流、精简快速开始、工具能力分组和客户端配置重构 README。

</details>

完整版本历史请查看 [CHANGELOG.zh.md](CHANGELOG.zh.md)。

## Star History

<a href="https://www.star-history.com/?repos=yunfeizhu%2Fmcp-mail-server&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=yunfeizhu/mcp-mail-server&type=date&theme=dark&legend=top-left&sealed_token=D25BFoz0nGKX7s4KmXe3x8mPcUiHq4HcwGCJr8LRZ1bOh3O9kYp1Ghc9B3bangB64vdDMw2eKlYH0ZLHl-R6suQD-c8A9G_FlEgziC3ANIGhsyXsv2w74pHl7LvDH0ZNji88Td7y8rf38gK4XEw7Faog6Rs82mrxQGJjvD10bWiuOECL4gUazenKKGVc" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=yunfeizhu/mcp-mail-server&type=date&legend=top-left&sealed_token=D25BFoz0nGKX7s4KmXe3x8mPcUiHq4HcwGCJr8LRZ1bOh3O9kYp1Ghc9B3bangB64vdDMw2eKlYH0ZLHl-R6suQD-c8A9G_FlEgziC3ANIGhsyXsv2w74pHl7LvDH0ZNji88Td7y8rf38gK4XEw7Faog6Rs82mrxQGJjvD10bWiuOECL4gUazenKKGVc" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=yunfeizhu/mcp-mail-server&type=date&legend=top-left&sealed_token=D25BFoz0nGKX7s4KmXe3x8mPcUiHq4HcwGCJr8LRZ1bOh3O9kYp1Ghc9B3bangB64vdDMw2eKlYH0ZLHl-R6suQD-c8A9G_FlEgziC3ANIGhsyXsv2w74pHl7LvDH0ZNji88Td7y8rf38gK4XEw7Faog6Rs82mrxQGJjvD10bWiuOECL4gUazenKKGVc" />
 </picture>
</a>

## 贡献

欢迎提交 Bug、功能建议和 Pull Request。你可以先前往 [Issues](https://github.com/yunfeizhu/mcp-mail-server/issues) 讨论，也可以直接发起 Pull Request。

## 许可证

本项目使用 [MIT License](LICENSE)。

---

<div align="center">

[npm](https://www.npmjs.com/package/mcp-mail-server) · [GitHub](https://github.com/yunfeizhu/mcp-mail-server) · [Issues](https://github.com/yunfeizhu/mcp-mail-server/issues) · [更新日志](CHANGELOG.zh.md)

</div>
