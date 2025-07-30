# MCP Mail Server

**语言:** [English](README.md) | 中文

一个支持POP3和SMTP协议的MCP服务器，可以在Cursor中使用来收发邮件。通过环境变量进行安全配置。

## ✨ 功能特性

### 📥 POP3功能（接收邮件）
- 连接到POP3邮件服务器
- 用户认证与TLS支持
- 列出邮箱中的邮件
- 获取特定邮件内容
- 删除邮件
- 获取邮件总数
- 安全连接管理

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
        "POP3_HOST": "your-pop3-server.com",
        "POP3_PORT": "995",
        "POP3_SECURE": "true",
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
        "POP3_HOST": "your-pop3-server.com",
        "POP3_PORT": "995",
        "POP3_SECURE": "true",
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

### `connect_pop3`
使用预配置设置连接到POP3邮件服务器。

### `list_messages`
列出邮箱中的所有邮件及其元数据。

### `get_message`
获取特定邮件的完整内容。

**参数：**
- `messageId` (number): 要获取的邮件ID

### `delete_message`
删除特定邮件。

**参数：**
- `messageId` (number): 要删除的邮件ID

### `get_message_count`
获取邮箱中邮件的总数。

### `disconnect`
断开与POP3服务器的连接。

### `connect_smtp`
使用预配置设置连接到SMTP邮件服务器。

### `send_email`
通过SMTP发送邮件。

**参数：**
- `to` (string): 收件人邮箱地址，多个地址用逗号分隔
- `subject` (string): 邮件主题
- `text` (string, 可选): 纯文本邮件内容
- `html` (string, 可选): HTML格式邮件内容
- `cc` (string, 可选): 抄送地址，用逗号分隔
- `bcc` (string, 可选): 密送地址，用逗号分隔

### `disconnect_smtp`
断开与SMTP服务器的连接。

### `quick_connect`
使用预配置设置同时连接到POP3和SMTP服务器。

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
快速连接邮件
```

### 📥 接收邮件示例

1. 连接到POP3服务器（如果没有使用快速连接）：
```
连接到POP3服务器
```

2. 列出邮件：
```
显示我的邮件列表
```

3. 获取特定邮件：
```
显示邮件ID为1的邮件内容
```

4. 删除邮件：
```
删除邮件ID为1的邮件
```

### 📤 发送邮件示例

1. 连接到SMTP服务器（如果没有使用快速连接）：
```
连接到SMTP服务器
```

2. 发送简单邮件：
```
发送邮件给 recipient@example.com，主题是"测试邮件"，内容是"你好，这是一封测试邮件"
```

3. 发送HTML邮件：
```
发送HTML邮件给 recipient@example.com，主题是"欢迎"，HTML内容是"<h1>欢迎！</h1><p>这是一封HTML邮件</p>"
```

## 🔧 环境变量配置

### 必需的环境变量

**⚠️ 所有环境变量都是必需的，没有默认值！**

| 变量名 | 描述 | 示例值 |
|--------|------|--------|
| `POP3_HOST` | POP3服务器地址 | your-pop3-server.com |
| `POP3_PORT` | POP3端口号 | 995 |
| `POP3_SECURE` | 启用TLS (true/false) | true |
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
export POP3_HOST=your-pop3-server.com
export POP3_PORT=995
export POP3_SECURE=true
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