# MCP Mail Server

一个支持POP3和SMTP协议的MCP服务器，可以在Cursor中使用来收发邮件。通过环境变量进行安全配置。

## 功能特性

### POP3功能（接收邮件）
- 连接到POP3邮件服务器
- 用户认证
- 列出邮箱中的邮件
- 获取特定邮件内容
- 删除邮件
- 获取邮件总数
- 断开连接

### SMTP功能（发送邮件）  
- 连接到SMTP邮件服务器
- 发送邮件（支持文本和HTML格式）
- 支持抄送（CC）和密送（BCC）
- 断开连接

## 安装方式

### 方式1：通过npm全局安装
```bash
npm install -g mcp-mail-server
```

### 方式2：使用npx（推荐）
无需安装，直接使用：
```bash
npx mcp-mail-server
```

## Cursor配置

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

## 可用工具

### connect_pop3
连接到POP3邮件服务器并进行身份验证。

参数：
- `host` (string): POP3服务器地址
- `port` (number, 可选): 端口号，默认110
- `username` (string): 用户名
- `password` (string): 密码
- `tls` (boolean, 可选): 是否使用TLS，默认false

### list_messages
列出邮箱中的所有邮件。

### get_message
获取特定邮件的完整内容。

参数：
- `messageId` (number): 邮件ID

### delete_message
删除特定邮件。

参数：
- `messageId` (number): 邮件ID

### get_message_count
获取邮箱中邮件的总数。

### disconnect
断开与POP3服务器的连接。

### connect_smtp
连接到SMTP邮件服务器进行邮件发送。

参数：
- `host` (string): SMTP服务器地址
- `port` (number, 可选): 端口号，默认587
- `username` (string): 用户名
- `password` (string): 密码
- `secure` (boolean, 可选): 是否使用SSL/TLS，默认false

### send_email
通过SMTP发送邮件。

参数：
- `to` (string): 收件人邮箱地址，多个地址用逗号分隔
- `subject` (string): 邮件主题
- `text` (string, 可选): 纯文本邮件内容
- `html` (string, 可选): HTML格式邮件内容
- `cc` (string, 可选): 抄送地址，用逗号分隔
- `bcc` (string, 可选): 密送地址，用逗号分隔

### disconnect_smtp
断开与SMTP服务器的连接。

### quick_connect
一键连接到POP3和SMTP服务器。这是最便捷的连接方式，会同时连接收发邮件服务器。

## 使用示例

**注意：本项目已预配置邮件服务器设置，无需手动输入服务器信息。**

在Cursor中，你可以这样使用：

### 快速开始

1. 一键连接所有邮件服务器：
```
一键连接邮件服务器
```
或者
```
快速连接
```

### 接收邮件示例

1. 连接到POP3服务器（如果没有使用一键连接）：
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

### 发送邮件示例

1. 连接到SMTP服务器（如果没有使用一键连接）：
```
连接到SMTP服务器
```

2. 发送邮件：
```
发送邮件给 recipient@example.com，主题是"测试邮件"，内容是"这是一封测试邮件"
```

3. 发送HTML邮件：
```
发送HTML邮件给 recipient@example.com，主题是"HTML邮件"，HTML内容是"<h1>欢迎</h1><p>这是一封HTML邮件</p>"
```

## 配置方式

### 环境变量配置（推荐）

在Cursor的MCP配置中使用环境变量：

```json
{
  "mcpServers": {
    "mcp-mail": {
      "command": "node",
      "args": ["E:/Projects/mcp-mail/dist/index.js"],
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

### 必需的环境变量

**⚠️ 所有环境变量都是必需的，没有默认值！**

| 变量名 | 描述 | 示例值 |
|--------|------|--------|
| `POP3_HOST` | POP3服务器地址 | your-pop3-server.com |
| `POP3_PORT` | POP3端口 | 995 |
| `POP3_SECURE` | 启用TLS (true/false) | true |
| `SMTP_HOST` | SMTP服务器地址 | your-smtp-server.com |
| `SMTP_PORT` | SMTP端口 | 465 |
| `SMTP_SECURE` | 启用SSL (true/false) | true |
| `EMAIL_USER` | 邮箱用户名 | your-email@domain.com |
| `EMAIL_PASS` | 邮箱密码 | your-password |

### 配置验证

- 如果缺少任何必需的环境变量，服务器将启动失败并显示详细错误信息
- 布尔值必须是 `true` 或 `false`（不区分大小写）
- 端口号必须是有效的数字
- 启动时会显示配置摘要（不包含密码）

## 注意事项

- 密码将以明文形式传输，建议在安全的网络环境中使用
- 删除的邮件在断开连接前不会真正删除，需要正常退出连接才会生效
- 目前仅支持基本的POP3协议，不支持POP3S等加密连接
- SMTP支持SSL/TLS加密连接，建议在生产环境中启用
- 发送邮件时请确保SMTP服务器允许你的应用发送邮件
- 一些邮件服务商可能需要应用专用密码而不是账户密码

## 本地开发

如果你想修改或开发这个项目：

1. 克隆项目：
```bash
git clone https://github.com/your-username/mcp-mail-server.git
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
# 设置环境变量后测试
export POP3_HOST=your-pop3-server.com
export POP3_PORT=995
export POP3_SECURE=true
export SMTP_HOST=your-smtp-server.com
export SMTP_PORT=465
export SMTP_SECURE=true
export EMAIL_USER=your-email@domain.com
export EMAIL_PASS=your-password

# 运行
npm start
```

## 发布信息

- **npm包名**: `mcp-mail-server`
- **可执行命令**: `mcp-mail-server`
- **支持的Node.js版本**: >=18.0.0
- **许可证**: MIT