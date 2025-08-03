# MCP Mail Server

**语言:** [English](README.md) | 中文

一个支持IMAP和SMTP协议的MCP服务器，可以在Cursor中使用来收发邮件。通过环境变量进行安全配置。

## ✨ 功能特性

### 📥 IMAP功能（接收邮件）
- 连接到IMAP邮件服务器，支持TLS
- 打开和管理多个邮箱（文件夹）
- 多条件高级邮件搜索功能
- 通过UID获取完整邮件内容，集成mailparser解析
- 标记邮件为已读/未读
- 从服务器删除邮件
- 获取邮件数量和邮箱信息
- 列出所有可用邮箱
- 获取未读和最新邮件
- 自动连接管理
- 实时连接状态监控

### 📤 SMTP功能（发送邮件）  
- 连接到SMTP邮件服务器
- 发送邮件（支持文本和HTML格式）
- 支持抄送（CC）和密送（BCC）
- SSL/TLS加密支持
- 完善的错误处理

## 📦 安装方式

### 方式1：通过npm全局安装
```bash
npm install -g mcp-mail-server
```

### 方式2：使用npx（推荐）
无需安装，直接使用：
```bash
npx mcp-mail-server
```

## ⚙️ Cursor配置

在Cursor的MCP配置文件中添加以下配置：

### 使用npx方式（推荐）：
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

### 使用全局安装方式：
```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "mcp-mail-server",
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

## 🛠️ 可用工具

### 连接管理

### `connect_all`
使用预配置设置同时连接到IMAP和SMTP服务器。

### `get_connection_status`
检查IMAP和SMTP服务器的当前连接状态，包括服务器信息和当前邮箱。

### `disconnect_imap`
仅断开与IMAP服务器的连接。

### `disconnect_all`
断开与IMAP和SMTP服务器的连接。

### 邮箱操作

### `open_mailbox`
打开指定邮箱（文件夹）进行操作。

**参数：**
- `mailboxName` (string, 可选): 要打开的邮箱名称（默认："INBOX"）
- `readOnly` (boolean, 可选): 以只读模式打开邮箱（默认：false）

### `list_mailboxes`
列出服务器上所有可用的邮箱（文件夹）。

### 邮件搜索工具

### `search_messages`
使用IMAP搜索条件搜索邮件。

**参数：**
- `criteria` (array, 可选): IMAP搜索条件数组（默认：搜索所有邮件）
  - 示例：`["UNSEEN"]`, `["FROM", "sender@example.com"]`, `["SUBJECT", "meeting"]`

### `search_by_sender`
搜索来自特定发件人的邮件。

**参数：**
- `sender` (string): 发件人邮箱地址

### `search_by_subject`
按主题关键词搜索邮件。

**参数：**
- `subject` (string): 要在主题中搜索的关键词

### `search_by_body`
搜索正文中包含特定文本的邮件。

**参数：**
- `text` (string): 要在邮件正文中搜索的文本

### `search_since_date`
搜索指定日期以来的邮件。

**参数：**
- `date` (string): 日期，支持多种格式如"April 20, 2010"、"20-Apr-2010"等

### `search_larger_than`
搜索大于指定大小的邮件。

**参数：**
- `size` (number): 大小（字节）

### `search_with_keyword`
搜索具有特定关键词/标签的邮件。

**参数：**
- `keyword` (string): 要搜索的关键词

### `search_unread_from_sender`
搜索来自特定发件人的未读邮件（演示AND逻辑）。

**参数：**
- `sender` (string): 发件人邮箱地址

### `get_messages`
通过UID获取多个邮件。

**参数：**
- `uids` (array): 要获取的邮件UID数组
- `markSeen` (boolean, 可选): 获取时是否标记为已读（默认：false）

### `get_message`
通过UID获取特定邮件的完整内容。

**参数：**
- `uid` (number): 要获取的邮件UID
- `markSeen` (boolean, 可选): 获取时是否标记为已读（默认：false）

### `delete_message`
通过UID删除特定邮件。

**参数：**
- `uid` (number): 要删除的邮件UID

### `get_message_count`
获取当前邮箱中邮件的总数。

### `get_unseen_messages`
获取当前邮箱中所有未读邮件。

### `get_recent_messages`
获取当前邮箱中所有最新邮件。

### 邮件发送

### `send_email`
通过SMTP发送邮件。

**参数：**
- `to` (string): 收件人邮箱地址，多个地址用逗号分隔
- `subject` (string): 邮件主题
- `text` (string, 可选): 纯文本邮件内容
- `html` (string, 可选): HTML格式邮件内容
- `cc` (string, 可选): 抄送地址，用逗号分隔
- `bcc` (string, 可选): 密送地址，用逗号分隔


## 💡 使用示例

**注意：本项目通过环境变量使用预配置的邮件服务器设置。**

在Cursor中，你可以使用自然语言命令：

### 🚀 快速开始

1. 一键连接所有邮件服务器：
```
连接邮件服务器
```
或者
```
连接所有邮件服务器
```

2. 检查连接状态：
```
显示邮件连接状态
```
或者
```
检查邮件服务器连接
```

### 📥 接收邮件示例

**注意：IMAP连接会在需要时自动建立**

1. 打开邮箱：
```
打开INBOX邮箱
```
或者
```
以只读模式打开已发送邮箱
```

2. 搜索邮件：
```
搜索未读邮件
```
或者
```
搜索来自 sender@example.com 的邮件
```
或者
```
搜索正文包含"紧急"的邮件
```
或者
```
搜索大于1MB的邮件
```
或者
```
搜索来自 boss@company.com 的未读邮件
```

3. 获取特定邮件：
```
显示UID为123的邮件内容
```

4. 获取所有未读邮件：
```
显示所有未读邮件
```

5. 列出可用邮箱：
```
显示所有邮件文件夹
```

6. 删除邮件：
```
删除UID为123的邮件
```

### 📤 发送邮件示例

**注意：SMTP连接会在需要时自动建立**

1. 发送简单邮件：
```
发送邮件给 recipient@example.com，主题是"测试邮件"，内容是"你好，这是一封测试邮件"
```

2. 发送HTML邮件：
```
发送HTML邮件给 recipient@example.com，主题是"欢迎"，HTML内容是"<h1>欢迎！</h1><p>这是一封HTML邮件</p>"
```

3. 发送带有抄送和密送的邮件：
```
发送邮件给 primary@example.com，抄送给 cc@example.com，密送给 bcc@example.com，主题是"团队更新"，内容是"周度团队更新"
```

## 🔧 环境变量配置

### 必需的环境变量

**⚠️ 所有环境变量都是必需的，没有默认值！**

| 变量名 | 描述 | 示例值 |
|--------|------|--------|
| `IMAP_HOST` | IMAP服务器地址 | your-imap-server.com |
| `IMAP_PORT` | IMAP端口号 | 993 |
| `IMAP_SECURE` | 启用TLS (true/false) | true |
| `SMTP_HOST` | SMTP服务器地址 | your-smtp-server.com |
| `SMTP_PORT` | SMTP端口号 | 465 |
| `SMTP_SECURE` | 启用SSL (true/false) | true |
| `EMAIL_USER` | 邮箱用户名 | your-email@domain.com |
| `EMAIL_PASS` | 邮箱密码 | your-password |

### 配置验证

- 如果缺少任何必需的环境变量，服务器将启动失败
- 布尔值必须是 `true` 或 `false`（不区分大小写）
- 端口号必须是有效的整数
- 启动时会显示配置摘要（密码被隐藏）

## ⚠️ 安全注意事项

- 可用时使用应用专用密码（Gmail、Outlook等）
- 确保生产环境中的网络连接安全
- 推荐使用环境变量配置方法
- 强烈建议为两个协议启用TLS/SSL加密

## 🔨 本地开发

如果你想修改或开发这个项目：

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

4. 本地测试：
```bash
# 设置环境变量
export IMAP_HOST=your-imap-server.com
export IMAP_PORT=993
export IMAP_SECURE=true
export SMTP_HOST=your-smtp-server.com
export SMTP_PORT=465
export SMTP_SECURE=true
export EMAIL_USER=your-email@domain.com
export EMAIL_PASS=your-password

# 运行服务器
npm start
```

## 📊 发布信息

- **包名**: `mcp-mail-server`
- **可执行文件**: `mcp-mail-server`
- **Node.js版本**: >=18.0.0
- **许可证**: MIT
- **仓库**: [GitHub](https://github.com/yunfeizhu/mcp-mail-server)