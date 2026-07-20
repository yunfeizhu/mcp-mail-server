<div align="center">

# MCP Mail Server

**让你的 AI 助手真正读懂并处理邮件。**

通过标准 IMAP/SMTP 邮箱，在 Claude、Cursor、Codex 等 MCP 客户端中搜索、阅读、整理、回复和发送邮件。

[![npm 版本](https://img.shields.io/npm/v/mcp-mail-server?logo=npm&color=CB3837)](https://www.npmjs.com/package/mcp-mail-server)
[![npm 下载量](https://img.shields.io/npm/dm/mcp-mail-server?logo=npm&color=CB3837)](https://www.npmjs.com/package/mcp-mail-server)
[![Node.js](https://img.shields.io/node/v/mcp-mail-server?logo=node.js&color=339933)](https://www.npmjs.com/package/mcp-mail-server)
[![MIT 许可证](https://img.shields.io/npm/l/mcp-mail-server?color=blue)](LICENSE)

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

| 目标 | 示例 |
|---|---|
| 快速了解收件箱 | “总结一下今天收到的未读邮件。” |
| 找到特定邮件 | “查找 finance@example.com 发来的、与第三季度预算有关的邮件。” |
| 整理收件箱 | “把已经处理完的邮件从收件箱移到 Archive。” |
| 带上下文回复 | “回复 Alex 最近发来的邮件，并保持在同一个邮件线程中。” |
| 处理附件 | “把那封邮件里的 PDF 附件保存到 Downloads 文件夹。” |
| 发送正式邮件 | “发送项目进展邮件，并附上我的文本和 HTML 签名。” |

## 快速开始

> [!IMPORTANT]
> 开始前请先为邮箱账号启用 IMAP 和 SMTP。本服务目前仅支持密码或应用专用密码认证，尚不支持 OAuth2。

1. **准备** IMAP/SMTP 服务地址，以及服务商支持的应用专用密码。
2. **按照下方示例** 将服务添加到你的 MCP 客户端。
3. **重启或重新连接** 客户端，然后试着说：*“显示今天的未读邮件。”*

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
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

当前配置位置及行为请参考 [Cursor MCP 文档](https://docs.cursor.com/context/model-context-protocol)。

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

| 能力 | 工具 |
|---|---|
| 连接管理 | `connect_all`、`get_connection_status`、`disconnect_all` |
| 邮箱文件夹 | `open_mailbox`、`list_mailboxes`、`get_message_count` |
| 搜索发现 | `get_unseen_messages`、`get_recent_messages`、`search_by_sender`、`search_by_subject`、`search_by_recipient`、`search_by_body`、`search_since_date`、`search_unread_from_sender`、`search_unreplied_from_sender`、`search_with_keyword`、`search_all_messages` |
| 邮件处理 | `get_message`、`get_messages`、`move_message`、`delete_message` |
| 撰写发送 | `send_email`、`reply_to_email` |
| 附件处理 | `get_attachments`、`save_attachment` |

<details>
<summary>查看完整工具参数</summary>

### 连接管理
- **connect_all**: 无需参数
- **get_connection_status**: 无需参数  
- **disconnect_all**: 无需参数

### 邮箱操作  
- **open_mailbox**: `mailboxName` (字符串, 默认: "INBOX"), `readOnly` (布尔值)
- **list_mailboxes**: 无需参数

### 搜索操作
- **search_by_sender**: `sender` (字符串, 邮箱地址), `startDate` (字符串, 可选), `endDate` (字符串, 可选)
- **search_by_subject**: `subject` (字符串, 关键词), `startDate` (字符串, 可选), `endDate` (字符串, 可选)
- **search_by_recipient**: `recipient` (字符串, 邮箱地址), `startDate` (字符串, 可选), `endDate` (字符串, 可选)
- **search_by_body**: `text` (字符串, 搜索文本), `startDate` (字符串, 可选), `endDate` (字符串, 可选)
- **search_since_date**: `date` (字符串, 日期格式)
- **search_unread_from_sender**: `sender` (字符串, 邮箱地址), `startDate` (字符串, 可选), `endDate` (字符串, 可选)
- **search_unreplied_from_sender**: `sender` (字符串, 邮箱地址), `startDate` (字符串, 可选), `endDate` (字符串, 可选), `limit` (数字, 可选)
- **search_with_keyword**: `keyword` (字符串, 关键词), `startDate` (字符串, 可选), `endDate` (字符串, 可选)
- **search_all_messages**: `startDate` (字符串, 可选), `endDate` (字符串, 可选), `limit` (数字, 可选, 默认: 50)

### 邮件操作
- **get_message_count**: 无需参数
- **get_unseen_messages**: 无需参数
- **get_recent_messages**: 无需参数
- **get_message**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选), `markSeen` (布尔值, 可选)
- **get_messages**: `mailbox` (字符串), `uids` (数组), `uidValidity` (数字, 可选), `markSeen` (布尔值, 可选)
- **move_message**: `mailbox` (字符串), `uid` (数字), `targetMailbox` (字符串), `uidValidity` (数字, 可选)。目标邮箱文件夹必须已经存在。
- **delete_message**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选)

### 邮件发送
- **send_email**: `to` (字符串), `subject` (字符串), `text` (字符串, 可选), `html` (字符串, 可选), `signature` (对象, 可选：包含 `text` 和/或 `html`), `cc` (字符串, 可选), `bcc` (字符串, 可选), `attachments` (字符串数组, 可选, 绝对文件路径)
- **reply_to_email**: `mailbox` (字符串), `originalUid` (数字), `uidValidity` (数字, 可选), `text` (字符串), `html` (字符串, 可选), `signature` (对象, 可选：包含 `text` 和/或 `html`), `replyToAll` (布尔值, 可选), `includeOriginal` (布尔值, 可选)

签名会追加在新邮件正文之后；回复邮件时，签名位于原邮件引用之前。为兼容不同邮件客户端，建议同时提供 `signature.text` 和 `signature.html`。HTML 签名会按可信邮件 HTML 直接使用。

### 附件操作
- **get_attachments**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选) — 返回元数据: 文件名、类型、大小、索引
- **save_attachment**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选), `savePath` (字符串, 绝对路径), `attachmentIndex` (数字, 可选, 从0开始), `returnBase64` (布尔值, 可选, 默认: false)

</details>

## 配置

### 环境变量

**核心邮件变量是必需的；文件与安全策略变量按需配置。**

| 变量 | 描述 | 示例 |
|------|------|------|
| `IMAP_HOST` | IMAP服务器地址 | `imap.gmail.com` |
| `IMAP_PORT` | IMAP端口号 | `993` |
| `IMAP_SECURE` | 启用TLS | `true` |
| `SMTP_HOST` | SMTP服务器地址 | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP端口号 | `465` |
| `SMTP_SECURE` | 是否使用隐式 TLS；465 端口通常为 `true`，587 端口使用 STARTTLS 时为 `false` | `true` |
| `EMAIL_USER` | 邮箱用户名 | `your-email@gmail.com` |
| `EMAIL_PASS` | 邮箱密码/应用密码 | `your-app-password` |
| `IMAP_TLS_REJECT_UNAUTHORIZED` | 是否校验 IMAP TLS 证书，默认 `true` | `true` |
| `MAIL_ALLOWED_ROOTS` | 允许附件读取/写入的已存在目录；未设置时禁用本地附件读写。多个目录在 macOS/Linux 用 `:`、Windows 用 `;` 分隔 | `/Users/me/Documents:/tmp/mail` |
| `MAIL_MAX_ATTACHMENT_BYTES` | 单个附件及附件总量上限，默认 25 MiB | `26214400` |
| `MAIL_MAX_MESSAGE_BYTES` | 单封邮件在内存中解析的上限，默认 25 MiB | `26214400` |
| `MAIL_MAX_BASE64_BYTES` | 允许返回 Base64 的附件大小上限，默认 1 MiB | `1048576` |
| `MAIL_MAX_BODY_CHARACTERS` | 单个正文或 HTML 返回字符上限，默认 200000 | `200000` |

搜索结果会返回 `sourceMailbox`、`uid` 和 `uidValidity`。后续读取、回复、下载附件或删除邮件时，应原样传回这些字段，避免不同邮箱中的相同 UID 指向错误邮件。

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
- **让 SMTP 安全模式与端口匹配**：隐式 TLS（通常为 465 端口）使用 `SMTP_SECURE=true`；STARTTLS（通常为 587 端口）使用 `false`
- **保护本地凭据**：MCP 客户端可能把 `EMAIL_PASS` 保存在本地配置文件中，请限制文件权限，并且绝不要把包含凭据的配置提交到版本控制

## 开发

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

4. **设置环境变量**:
   ```bash
   export IMAP_HOST=your-imap-server.com
   export IMAP_PORT=993
   export IMAP_SECURE=true
   export SMTP_HOST=your-smtp-server.com
   export SMTP_PORT=465
   export SMTP_SECURE=true
   export EMAIL_USER=your-email@domain.com
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

命令会先构建项目，然后打开 MCP Inspector 页面。在连接面板中填写：

- Transport Type：`STDIO`
- Command：`node`
- Arguments：`dist/index.js`
- Environment Variables：填写上方配置表中的 IMAP、SMTP、账号及密码变量

点击 **Connect** 后进入 **Tools** 页面，先调用 `connect_all` 和 `get_connection_status`，再测试搜索、读取或发送邮件工具。附件工具还需要配置 `MAIL_ALLOWED_ROOTS`。

MCP Inspector 当前需要 Node.js 22；这只影响交互调试页面，不改变本 MCP 服务自身的 Node.js 18+ 运行要求。

## 版本说明

<details>
<summary><strong>v1.2.3</strong> — 支持移动邮件、邮件签名和更清晰的快速配置</summary>

**Added**

- 新增 `move_message`，支持将邮箱范围内的邮件移动到已存在的目标文件夹。
- `send_email` 和 `reply_to_email` 新增可选的纯文本与 HTML 签名。

**Improved**

- IMAP 服务器提供目标 UID 时随移动结果返回，未提供时提示重新搜索目标邮箱。
- 回复签名位于新正文之后、原邮件引用之前，同时保留 MIME 多格式正文。
- 校验移动目标，拒绝将邮件移动到当前所在邮箱。

**Documentation**

- 围绕常用邮件工作流、精简快速开始、工具能力分组和客户端配置重构 README。

</details>

完整版本历史请查看 [CHANGELOG.zh.md](CHANGELOG.zh.md)。

## 贡献

欢迎提交 Bug、功能建议和 Pull Request。你可以先前往 [Issues](https://github.com/yunfeizhu/mcp-mail-server/issues) 讨论，也可以直接发起 Pull Request。

## 许可证

本项目使用 [MIT License](LICENSE)。

---

<div align="center">

[npm](https://www.npmjs.com/package/mcp-mail-server) · [GitHub](https://github.com/yunfeizhu/mcp-mail-server) · [Issues](https://github.com/yunfeizhu/mcp-mail-server/issues) · [更新日志](CHANGELOG.zh.md)

</div>
