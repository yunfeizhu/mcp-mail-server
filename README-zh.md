# Mcp Mail Server

<!-- mcp-name: mcp-mail-server -->

[![NPM Version](https://img.shields.io/npm/v/mcp-mail-server)](https://www.npmjs.com/package/mcp-mail-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**语言：** [English](README.md) | 中文

一个基于模型上下文协议（MCP）的邮件服务器，通过 IMAP 和 SMTP 协议提供邮件操作能力。该服务器使 LLM 能够代替用户搜索、阅读、管理和发送电子邮件。

### 功能特性

- 通过 IMAP 读取/搜索/删除邮件
- 通过 SMTP 发送和回复邮件
- 读取和导出邮件附件到本地文件
- 多邮箱支持（收件箱、已发送、自定义文件夹）
- 自动管理 IMAP/SMTP 连接
- 安全的 TLS/SSL 连接

## 安装

<details>
<summary>Claude Desktop</summary>

将以下配置添加到 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

在终端中运行以下命令：

```bash
claude mcp add mail \
  -e IMAP_HOST=imap.gmail.com \
  -e IMAP_PORT=993 \
  -e IMAP_SECURE=true \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_PORT=465 \
  -e SMTP_SECURE=true \
  -e EMAIL_USER=your-email@gmail.com \
  -e EMAIL_PASS=your-app-password \
  -- npx -y mcp-mail-server
```

更多详情请参阅 [Claude Code MCP 文档](https://docs.anthropic.com/en/docs/claude-code/mcp)。

</details>

<details>
<summary>VS Code</summary>

点击下方按钮快速安装：

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=mail&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-mail-server%22%5D%7D)
[![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=mail&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-mail-server%22%5D%7D&quality=insiders)

手动安装时，将以下 JSON 添加到 VS Code 的用户设置（JSON）中。按 `Ctrl + Shift + P`，输入 `Preferences: Open User Settings (JSON)` 打开。

也可以将配置添加到工作区目录下的 `.vscode/mcp.json` 文件中，方便与团队共享配置。

> 使用 `mcp.json` 文件时需要包含 `mcp` 外层键。

```json
{
  "mcp": {
    "servers": {
      "mcp-mail-server": {
        "command": "npx",
        "args": ["-y", "mcp-mail-server"],
        "env": {
          "IMAP_HOST": "imap.gmail.com",
          "IMAP_PORT": "993",
          "IMAP_SECURE": "true",
          "SMTP_HOST": "smtp.gmail.com",
          "SMTP_PORT": "465",
          "SMTP_SECURE": "true",
          "EMAIL_USER": "your-email@gmail.com",
          "EMAIL_PASS": "your-app-password"
        }
      }
    }
  }
}
```

> 有关 VS Code 中 MCP 配置的更多信息，请参阅 [VS Code MCP 官方文档](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)。

</details>

<details>
<summary>Cursor</summary>

将以下配置添加到 Cursor MCP 设置文件（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

将以下配置添加到 Windsurf MCP 配置文件（`~/.codeium/windsurf/mcp_config.json`）：

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Cline</summary>

在 VS Code 中打开 Cline 设置，进入 **MCP Servers**，点击 **Configure MCP Servers**，添加以下配置：

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Cherry Studio</summary>

打开 Cherry Studio 设置，进入 **MCP 服务器**，点击 **添加服务器**，类型选择 **STDIO**，然后填入：

- **Command**：`npx`
- **Args**：`-y mcp-mail-server`
- **环境变量**：添加所有必需的环境变量（参见[配置](#配置)）

</details>

<details>
<summary>其他 MCP 客户端（Augment Code、Trae、Zed、Amazon Q Developer 等）</summary>

大多数 MCP 客户端都采用类似的 JSON 配置格式。以下标准的 `mcpServers` 配置块几乎适用于所有客户端：

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

只需将其放入对应客户端的 MCP 配置文件中即可。具体文件位置请参考各客户端的官方文档。

也可以全局安装后直接使用 `mcp-mail-server` 作为命令：

```bash
npm install -g mcp-mail-server
```

</details>

## 工具列表

### 连接管理

| 工具                    | 说明                         |
| ----------------------- | ---------------------------- |
| `connect_all`           | 同时连接 IMAP 和 SMTP 服务器 |
| `get_connection_status` | 检查当前连接状态和服务器信息 |
| `disconnect_all`        | 断开所有邮件服务器连接       |

### 邮箱管理

| 工具             | 说明                     | 参数                                                    |
| ---------------- | ------------------------ | ------------------------------------------------------- |
| `open_mailbox`   | 打开指定的邮箱/文件夹    | `mailboxName`（可选，默认 "INBOX"）、`readOnly`（可选） |
| `list_mailboxes` | 列出所有可用的邮件文件夹 | —                                                       |

### 邮件搜索

| 工具                           | 说明                           | 参数                                             |
| ------------------------------ | ------------------------------ | ------------------------------------------------ |
| `search_messages`              | 使用 IMAP 搜索条件搜索邮件     | `criteria`（数组）                               |
| `search_by_sender`             | 按发件人搜索邮件               | `sender`                                         |
| `search_by_subject`            | 按主题关键词搜索邮件           | `subject`                                        |
| `search_by_body`               | 搜索邮件正文内容               | `text`                                           |
| `search_since_date`            | 搜索指定日期之后的邮件         | `date`                                           |
| `search_unreplied_from_sender` | 查找来自特定发件人的未回复邮件 | `sender`、`startDate`（可选）、`endDate`（可选） |
| `search_larger_than`           | 查找大于指定大小的邮件         | `size`（字节）                                   |

### 邮件读取

| 工具                  | 说明                  | 参数                                                                                                               |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `get_message`         | 通过 UID 获取单封邮件 | `uid`、`markSeen`（可选）、`includeAttachmentContent`（可选，默认 `true`）、`attachmentMaxBytes`（可选）           |
| `get_messages`        | 通过 UID 批量获取邮件 | `uids`（数组）、`markSeen`（可选）、`includeAttachmentContent`（可选，默认 `false`）、`attachmentMaxBytes`（可选） |
| `get_unseen_messages` | 获取所有未读邮件      | —                                                                                                                  |
| `get_recent_messages` | 获取最近收到的邮件    | —                                                                                                                  |

> 邮件对象中的附件字段：`filename`、`contentType`、`size`、`contentBase64`（仅当 `includeAttachmentContent=true` 且在大小限制内时）、`contentTruncated`（超限时为 `true`）

### 附件与邮件管理

| 工具                | 说明                     | 参数                                                                       |
| ------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `export_attachment` | 将邮件附件导出到本地文件 | `uid`、`filePath`、`attachmentIndex`（可选，默认 `0`）、`filename`（可选） |
| `delete_message`    | 通过 UID 删除邮件        | `uid`                                                                      |

### 发送与回复

| 工具             | 说明               | 参数                                                                                                |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `send_email`     | 通过 SMTP 发送邮件 | `to`、`subject`、`text`（可选）、`html`（可选）、`cc`（可选）、`bcc`（可选）、`attachments`（可选） |
| `reply_to_email` | 回复指定邮件       | `originalUid`、`text`、`html`（可选）、`replyToAll`（可选）、`includeOriginal`（可选）              |

## 使用示例

与 AI 助手使用自然语言命令：

### 基本操作

- _"连接我的邮件服务器"_
- _"显示所有未读邮件"_
- _"搜索来自 boss@company.com 的邮件"_
- _"发送邮件给 team@company.com 关于会议"_
- _"回复 UID 为 123 的邮件"_

### 高级搜索

- _"查找上周主题包含'紧急'的邮件"_
- _"显示来自 boss@company.com 的未回复邮件"_
- _"显示大于 5MB 的邮件"_
- _"获取销售文件夹中的所有邮件"_

### 附件操作

- _"获取 UID 为 123 的邮件，并包含附件内容"_
- _"获取 UID 为 101 和 102 的邮件，但不包含附件内容"_
- _"将 UID 123 的第一个附件导出到 /tmp/report.pdf"_
- _"将 UID 123 中名为 invoice.pdf 的附件导出到 /tmp/invoice.pdf"_

### 邮件管理

- _"删除 UID 为 123 的邮件"_
- _"标记最近的邮件为已读"_
- _"列出我的所有邮件文件夹"_

## 配置

### 环境变量

所有环境变量均为**必填**：

| 变量          | 说明                   | 示例                   |
| ------------- | ---------------------- | ---------------------- |
| `IMAP_HOST`   | IMAP 服务器地址        | `imap.gmail.com`       |
| `IMAP_PORT`   | IMAP 端口号            | `993`                  |
| `IMAP_SECURE` | 启用 TLS/SSL           | `true`                 |
| `SMTP_HOST`   | SMTP 服务器地址        | `smtp.gmail.com`       |
| `SMTP_PORT`   | SMTP 端口号            | `465`                  |
| `SMTP_SECURE` | 启用 TLS/SSL           | `true`                 |
| `EMAIL_USER`  | 邮箱用户名             | `your-email@gmail.com` |
| `EMAIL_PASS`  | 邮箱密码或应用专用密码 | `your-app-password`    |

### 邮箱配置参考

<details>
<summary>Gmail</summary>

```
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
```

> [!IMPORTANT]
> Gmail 需要使用[应用专用密码](https://support.google.com/accounts/answer/185833)。请先开启两步验证，然后生成应用专用密码。

</details>

<details>
<summary>Outlook / Hotmail</summary>

```
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=true
```

</details>

<details>
<summary>Yahoo 邮箱</summary>

```
IMAP_HOST=imap.mail.yahoo.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=465
SMTP_SECURE=true
```

> [!IMPORTANT]
> Yahoo 需要使用[应用专用密码](https://help.yahoo.com/kb/generate-manage-third-party-passwords-sln15241.html)。请先开启两步验证。

</details>

### 安全最佳实践

- **使用应用专用密码**：始终使用应用专用密码，而非主密码
- **启用两步验证**：在邮箱账户中开启两步验证
- **使用 TLS/SSL**：始终设置 `IMAP_SECURE=true` 和 `SMTP_SECURE=true`
- **仅通过环境变量传递**：切勿在配置文件中硬编码凭据

## 调试

可以使用 [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) 调试服务器：

```bash
npx @modelcontextprotocol/inspector npx mcp-mail-server
```

连接前，请在 Inspector 的环境变量配置面板中设置所需的环境变量。

## 开发

1. 克隆仓库：

   ```bash
   git clone https://github.com/yunfeizhu/mcp-mail-server.git
   cd mcp-mail-server
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 构建项目：

   ```bash
   npm run build
   ```

4. 运行测试：
   ```bash
   npm test
   ```

## 贡献

欢迎贡献！无论是添加新工具、增强现有功能还是改进文档，我们都非常欢迎您提交 Pull Request。

更多 MCP 服务器示例和实现模式，请参阅：
https://github.com/modelcontextprotocol/servers

## 许可证

本 MCP 服务器基于 MIT 许可证发布。您可以自由使用、修改和分发本软件，须遵守 MIT 许可证的条款和条件。详情请参阅项目中的 [LICENSE](LICENSE) 文件。
