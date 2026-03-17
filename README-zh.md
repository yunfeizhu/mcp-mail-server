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

### [1.2.1] - 2026-03-18

**修复**
- 修复搜索条件（FROM/TO/SUBJECT/BODY/KEYWORD/SINCE）未使用嵌套数组格式，导致 TO 等搜索报错
- 修复 `search()` criteria 被多包一层数组，导致复合搜索条件失效
- 修复 `deleteMessage()` 在只读模式下操作失败
- 修复 `getRecentMessages()` 误用 IMAP `RECENT` 标志，改为按 UID 取最新 N 封
- 修复 `getRecentMessages()` / `getUnseenMessages()` 依赖上次操作遗留的邮箱状态
- 修复 `cleanReplySubject()` 只去除单层 `Re:` 前缀，导致多层回复的未回复检测误判
- 修复邮件日期存储为本地化字符串，跨平台解析不一致，改为 ISO 8601 格式
- 修复 `ensureIMAPConnection()` 并发等待无超时，可能无限阻塞
- 修复 `saveSentMessage()` 保存失败时仍返回 `sentFolderSaved: true`
- 修复 `handleGetMessages()` / `handleDeleteMessage()` 依赖 `currentBox` 状态查找邮件
- 修复 `reply_to_email` 在 `text` 为空时将 `"undefined"` 写入正文

**新增**
- 全部搜索工具新增 `inboxOnly` 参数，支持仅搜索收件箱

**优化**
- `ensureSMTPConnection()` 补充并发初始化保护，含 30 秒超时
- 发件箱通过 RFC 6154 `\Sent` 属性自动探测并缓存，兼容各邮件服务商
- `saveMessageToFolder()` 简化逻辑，找不到发件箱时跳过保存
- 搜索改用 `slice(-limit)` 优先取最新邮件，日期过滤后不再返回空结果
- 回复邮件引用内容增加 HTML 转义，防止 XSS 注入

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
- **get_message**: `uid` (数字), `markSeen` (布尔值, 可选)
- **get_messages**: `uids` (数组), `markSeen` (布尔值, 可选)
- **delete_message**: `uid` (数字)

### 邮件发送
- **send_email**: `to` (字符串), `subject` (字符串), `text` (字符串, 可选), `html` (字符串, 可选), `cc` (字符串, 可选), `bcc` (字符串, 可选), `attachments` (字符串数组, 可选, 绝对文件路径)
- **reply_to_email**: `originalUid` (数字), `text` (字符串), `html` (字符串, 可选), `replyToAll` (布尔值, 可选), `includeOriginal` (布尔值, 可选)

### 附件操作
- **get_attachments**: `uid` (数字) — 返回元数据: 文件名、类型、大小、索引
- **save_attachment**: `uid` (数字), `savePath` (字符串, 绝对路径), `attachmentIndex` (数字, 可选, 从0开始), `returnBase64` (布尔值, 可选, 默认: false)

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

**⚠️ 所有变量都是必需的**

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