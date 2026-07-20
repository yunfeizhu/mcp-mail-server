# Changelog

All notable changes to this project will be documented in this file.

## [1.2.2] - 2026-07-20

### Breaking Changes
- 单邮件工具现在必须同时传入 `mailbox` 和 UID；响应新增 `sourceMailbox` 与 `uidValidity`，避免命中其他邮箱中的同号 UID
- 未配置 `MAIL_ALLOWED_ROOTS` 时，默认禁用本地附件读取和写入

### Security
- 默认启用 IMAP 证书校验，自签名部署必须显式关闭或调整配置
- 为本地附件、Base64 返回、邮件解析和正文输出增加真实路径白名单及大小限制
- 升级 MCP SDK、Nodemailer、Mailparser、Rollup 及传递依赖，并移除存在漏洞且非必要的压缩插件

### Fixed
- 串行执行工具调用，避免并发请求在操作过程中切换 IMAP 当前邮箱
- 使用 Nodemailer 生成已发送副本的 MIME，保留附件与回复线程头
- 修复 SMTP 初始化残留、只读模式标记已读、发件箱状态漂移、重复 `Re:` 前缀和未回复分析优先处理旧邮件的问题

### Added
- 将原先单体入口拆分为 MCP 编排、工具定义、连接管理、搜索服务、共享类型及邮件工具函数模块
- 新增 `npm run dev:inspector`，支持通过浏览器配置连接并交互测试 MCP 工具
- 增加串行队列、邮件引用、路径策略、MIME 生成、搜索行为及 MCP stdio 握手测试

## [1.2.1] - 2026-03-18

### Fixed
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

### Added
- 全部搜索工具新增 `inboxOnly` 参数，支持仅搜索收件箱

### Improved
- `ensureSMTPConnection()` 补充并发初始化保护，含 30 秒超时
- 发件箱通过 RFC 6154 `\Sent` 属性自动探测并缓存，兼容各邮件服务商
- `saveMessageToFolder()` 简化逻辑，找不到发件箱时跳过保存
- 搜索改用 `slice(-limit)` 优先取最新邮件，日期过滤后不再返回空结果
- 回复邮件引用内容增加 HTML 转义，防止 XSS 注入

## [1.2.0] - 2026-03-08

### Added
- 新增附件管理功能：支持获取附件元数据、下载保存附件到本地
- 增强多邮箱搜索能力

### Fixed
- IMAP 连接增加 `socketTimeout` 配置，防止连接挂起
- 限制批量获取邮件数量，防止大邮箱场景下 IMAP 响应超时

## [1.1.16] - 2026-03-08

### Changed
- 回滚至 1.1.13 代码基础，撤销部分实验性改动

## [1.1.15] - 2026-03-05

### Documentation
- 重构 README 结构，优化工具说明格式

## [1.1.14] - 2026-03-05

### Added
- 新增 `export_attachment` 工具，支持将附件保存至本地路径

### Documentation
- 重写 README，完善附件功能文档和工具使用说明

## [1.1.13] - 2025-12-18

### Added
- 支持读取邮件附件内容
- IMAP 连接支持自签名证书（via PR #1）

## [1.1.12] - 2025-09-22

### Improved
- 搜索结果增加数量限制，防止返回过多数据
- 优化未回复邮件检测算法

## [1.1.11] - 2025-09-05

### Fixed
- 改进多邮箱场景下的邮件查找逻辑
- 修复标记邮件为已读时的异常问题

## [1.1.10] - 2025-08-25

### Improved
- 实现改进的未回复邮件检测算法，提升匹配准确率

## [1.1.9] - 2025-08-21

### Added
- 新增按发件人搜索未回复邮件的功能

## [1.1.8] - 2025-08-20

### Changed
- 重构未回复邮件搜索功能及相关标记操作
- 简化回复邮件主题的构建逻辑

## [1.1.7] - 2025-08-20

### Added
- 新增邮件标记管理功能（标记已读/未读等）
- 新增未回复邮件搜索功能

## [1.1.6] - 2025-08-20

### Fixed
- 移除回复邮件时正文内容的必填校验限制

## [1.1.5] - 2025-08-20

### Improved
- 添加用户一致性检查
- 优化 IMAP/SMTP 连接管理逻辑

## [1.1.4] - 2025-08-20

### Added
- 新增回复邮件功能，支持引用原始邮件内容
- 改进邮件处理流程

## [1.1.3] - 2025-08-08

### Documentation
- 优化构建配置和文档

## [1.1.2] - 2025-08-08

### Improved
- 增强邮件搜索功能，扩展搜索条件支持

## [1.1.1] - 2025-08-03

### Improved
- 改进邮件客户端连接管理和错误处理
- 移除 IMAP 单独断开连接功能，增强环境变量配置处理

## [1.1.0] - 2025-07-30

### Changed
- 从 POP3 协议迁移至 IMAP 协议，支持更完整的邮件操作
- 集成 mailparser 库，优化邮件解析能力

## [1.0.1] - 2025-07-30

### Changed
- 更新 rollup 构建配置
- 添加中文版 README 文档

## [1.0.0] - 2025-07-30

### Added
- 初始发布
- 基于 MCP 协议的邮件服务器核心功能
- 支持邮件收发、搜索、连接管理等基础操作
