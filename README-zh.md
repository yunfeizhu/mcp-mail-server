# MCP Mail Server

![NPM Version](https://img.shields.io/npm/v/mcp-mail-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**语言:** [English](README.md) | 中文

一个支持IMAP/SMTP协议的模型上下文协议服务器，适用于Claude、Cursor等AI助手的邮件操作。

## 功能特性

- **IMAP操作**: 跨邮箱搜索、阅读和管理邮件
- **SMTP支持**: 发送HTML/文本邮件和附件
- **安全配置**: 基于环境变量的TLS/SSL设置
- **AI友好**: 支持自然语言邮件操作命令
- **自动连接管理**: 自动处理IMAP/SMTP连接
- **多邮箱支持**: 访问收件箱、已发送和自定义文件夹

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
      "args": ["mcp-mail-server"],
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
      "args": ["mcp-mail-server"],
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

全局安装方式:

```bash
npm install -g mcp-mail-server
```

然后配置:

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "mcp-mail-server"
    }
  }
}
```

</details>

## 可用工具

| 工具 | 描述 |
|------|------|
| `connect_all` | 连接IMAP和SMTP服务器 |
| `get_connection_status` | 检查连接状态和服务器信息 |
| `disconnect_all` | 断开所有服务器连接 |
| `open_mailbox` | 打开指定邮箱/文件夹 |
| `list_mailboxes` | 列出可用邮件文件夹 |
| `search_messages` | 使用IMAP条件搜索邮件 |
| `search_by_sender` | 按发件人搜索邮件 |
| `search_by_subject` | 按主题关键词搜索 |
| `search_by_body` | 搜索邮件内容 |
| `search_since_date` | 按日期搜索邮件 |
| `search_larger_than` | 按大小搜索邮件 |
| `get_message` | 通过UID获取邮件 |
| `get_messages` | 获取多个邮件 |
| `delete_message` | 通过UID删除邮件 |
| `get_unseen_messages` | 获取所有未读邮件 |
| `get_recent_messages` | 获取最近邮件 |
| `send_email` | 通过SMTP发送邮件 |

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
- **search_messages**: `criteria` (数组, IMAP搜索条件)
- **search_by_sender**: `sender` (字符串, 邮箱地址)
- **search_by_subject**: `subject` (字符串, 关键词)
- **search_by_body**: `text` (字符串, 搜索文本)
- **search_since_date**: `date` (字符串, 日期格式)
- **search_larger_than**: `size` (数字, 字节数)

### 邮件操作
- **get_message**: `uid` (数字), `markSeen` (布尔值, 可选)
- **get_messages**: `uids` (数组), `markSeen` (布尔值, 可选)
- **delete_message**: `uid` (数字)

### 邮件发送
- **send_email**: `to` (字符串), `subject` (字符串), `text` (字符串, 可选), `html` (字符串, 可选), `cc` (字符串, 可选), `bcc` (字符串, 可选)

</details>


## 使用示例

与AI助手使用自然语言命令：

### 基本操作
- *"连接我的邮件服务器"*
- *"显示所有未读邮件"*  
- *"搜索来自boss@company.com的邮件"*
- *"发送邮件给team@company.com关于会议"*

### 高级搜索
- *"查找上周主题包含'紧急'的邮件"*
- *"显示大于5MB的邮件"*
- *"获取销售文件夹中的所有邮件"*

### 邮件管理  
- *"删除UID为123的邮件"*
- *"标记最近的邮件为已读"*
- *"列出我的所有邮件文件夹"*

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