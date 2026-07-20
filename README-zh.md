# MCP Mail Server

![NPM Version](https://img.shields.io/npm/v/mcp-mail-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**语言:** [English](README.md) | 中文

一个支持IMAP/SMTP协议的模型上下文协议服务器，适用于Claude、Cursor等AI助手的邮件操作。

## 功能特性

- **IMAP操作**: 跨邮箱搜索、阅读和管理邮件
- **SMTP支持**: 发送HTML/文本邮件和附件
- **附件管理**: 查看附件元数据并保存附件到本地文件
- **安全配置**: 基于环境变量的TLS/SSL设置
- **AI友好**: 支持自然语言邮件操作命令
- **自动连接管理**: 自动处理IMAP/SMTP连接
- **多邮箱支持**: 访问收件箱、已发送和自定义文件夹

## 更新日志

### [1.2.2] - 2026-07-20

**Breaking Changes**
- 单邮件工具现在必须同时传入 `mailbox` 和 UID，并返回 `sourceMailbox` 与 `uidValidity`
- 本地附件读取和写入现在必须显式配置 `MAIL_ALLOWED_ROOTS` 白名单

**Security**
- 默认启用 IMAP 证书校验，并增加真实路径校验和载荷大小限制
- 升级 MCP SDK、Nodemailer、Mailparser、Rollup 及传递依赖，并移除存在漏洞的压缩插件

**Fixed**
- 串行执行有状态 IMAP 工具调用，并修复发件箱状态漂移、SMTP 初始化清理、只读 `markSeen`、回复线程及未回复邮件排序问题
- 已发送副本改用 Nodemailer 生成 MIME，保留附件和回复线程头

**Added**
- 将单体入口拆分为 MCP 编排、连接管理、搜索服务、工具定义、共享类型和工具函数模块
- 新增 `npm run dev:inspector` 浏览器交互测试，并扩充自动化回归覆盖

完整版本历史请查看 [CHANGELOG.zh.md](CHANGELOG.zh.md)。

---

## 快速开始

1. **安装**: `npm install -g mcp-mail-server`
2. **配置** 环境变量（参见[配置](#配置)）
3. **添加** 到MCP客户端配置
4. **使用** 自然语言: *"显示今天的未读邮件"*

## 安装

<details>
<summary>Claude Desktop</summary>

添加到你的 `claude_desktop_config.json`:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

添加到Cursor的MCP设置:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

使用 `claude mcp add` 命令添加:

```bash
claude mcp add mcp-mail-server \
  -e IMAP_HOST=your-imap-server.com \
  -e IMAP_PORT=993 \
  -e IMAP_SECURE=true \
  -e SMTP_HOST=your-smtp-server.com \
  -e SMTP_PORT=465 \
  -e SMTP_SECURE=true \
  -e EMAIL_USER=your-email@domain.com \
  -e EMAIL_PASS=your-password \
  -- npx -y mcp-mail-server
```

或手动添加到 `.claude/settings.json`：

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>OpenAI Codex</summary>

添加到项目根目录的 `codex.json`:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>其他MCP客户端</summary>

其他MCP客户端的配置方式类似，核心配置均为:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

请根据具体客户端的文档将以上配置放置到对应的配置文件中。

</details>

## 可用工具

| 工具 | 描述 |
|------|------|
| `connect_all` | 连接IMAP和SMTP服务器 |
| `get_connection_status` | 检查连接状态和服务器信息 |
| `disconnect_all` | 断开所有服务器连接 |
| `open_mailbox` | 打开指定邮箱/文件夹 |
| `list_mailboxes` | 列出可用邮件文件夹 |
| `get_message_count` | 获取当前邮箱邮件总数 |
| `get_unseen_messages` | 获取所有未读邮件 |
| `get_recent_messages` | 获取最近邮件 |
| `search_by_sender` | 按发件人搜索邮件 |
| `search_by_subject` | 按主题关键词搜索 |
| `search_by_recipient` | 按收件人搜索邮件 |
| `search_by_body` | 搜索邮件正文内容 |
| `search_since_date` | 按日期搜索邮件 |
| `search_unread_from_sender` | 按发件人搜索未读邮件 |
| `search_unreplied_from_sender` | 按发件人搜索未回复邮件 |
| `search_with_keyword` | 按关键词/标记搜索邮件 |
| `search_all_messages` | 搜索所有邮件，支持日期范围和数量限制 |
| `get_message` | 通过UID获取邮件 |
| `get_messages` | 获取多个邮件 |
| `delete_message` | 通过UID删除邮件 |
| `send_email` | 通过SMTP发送邮件（支持附件） |
| `reply_to_email` | 回复指定邮件 |
| `get_attachments` | 获取邮件的附件元数据 |
| `save_attachment` | 下载并保存附件到本地文件 |

<details>
<summary>详细工具参数</summary>

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
- **delete_message**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选)

### 邮件发送
- **send_email**: `to` (字符串), `subject` (字符串), `text` (字符串, 可选), `html` (字符串, 可选), `cc` (字符串, 可选), `bcc` (字符串, 可选), `attachments` (字符串数组, 可选, 绝对文件路径)
- **reply_to_email**: `mailbox` (字符串), `originalUid` (数字), `uidValidity` (数字, 可选), `text` (字符串), `html` (字符串, 可选), `replyToAll` (布尔值, 可选), `includeOriginal` (布尔值, 可选)

### 附件操作
- **get_attachments**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选) — 返回元数据: 文件名、类型、大小、索引
- **save_attachment**: `mailbox` (字符串), `uid` (数字), `uidValidity` (数字, 可选), `savePath` (字符串, 绝对路径), `attachmentIndex` (数字, 可选, 从0开始), `returnBase64` (布尔值, 可选, 默认: false)

</details>


## 使用示例

与AI助手使用自然语言命令：

### 基本操作
- *"连接我的邮件服务器"*
- *"显示所有未读邮件"*  
- *"搜索来自boss@company.com的邮件"*
- *"发送邮件给team@company.com关于会议"*
- *"回复UID为123的邮件"*

### 高级搜索
- *"查找上周主题包含'紧急'的邮件"*
- *"显示来自boss@company.com的未回复邮件"*
- *"搜索发给team@company.com的邮件"*
- *"获取销售文件夹中的所有邮件"*
- *"搜索来自boss@company.com的未读邮件"*
- *"显示最近7天的所有邮件"*
- *"列出全部邮件，限制20封"*

### 邮件管理  
- *"删除UID为123的邮件"*
- *"标记最近的邮件为已读"*
- *"列出我的所有邮件文件夹"*

### 附件操作
- *"查看UID为456的邮件有哪些附件"*
- *"将UID为456的邮件的所有附件保存到D:/Downloads"*
- *"下载UID为789的邮件的第一个附件"*
- *"发送带附件的邮件给team@company.com，附件路径是D:/report.pdf"*

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
| `SMTP_SECURE` | 启用SSL | `true` |
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

**注意**: 使用[应用专用密码](https://support.google.com/accounts/answer/185833)而不是常规密码。

</details>

<details>
<summary>Outlook/Hotmail配置</summary>

```bash
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=true
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
```

</details>

### 安全说明

- **使用应用密码**: 启用2FA并在可用时使用应用专用密码
- **需要TLS/SSL**: 始终使用安全连接 (IMAP_SECURE=true, SMTP_SECURE=true)
- **环境变量**: 绝不在配置文件中硬编码凭据

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
   export EMAIL_PASS=your-password
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

## 贡献

欢迎贡献！请随时提交Pull Request。

## 许可证

MIT许可证 - 详见[LICENSE](LICENSE)文件。

---

**包信息：**
- 包名: `mcp-mail-server`
- Node.js: ≥18.0.0
- 仓库: [GitHub](https://github.com/yunfeizhu/mcp-mail-server)
- 问题: [报告Bug](https://github.com/yunfeizhu/mcp-mail-server/issues)
