# 更新日志

本文件记录项目的所有重要变更。

## [2.0.2] - 2026-08-19

### 修复

- 以单个 IMAP body stream 获取完整 RFC822 邮件，不再拼接独立返回的 `HEADER` 与 `TEXT` 分段；当 Gmail 等服务未按请求顺序返回分段时，仍可正确解析邮件头、Message-ID、附件元数据并下载附件

## [2.0.1] - 2026-07-22

### 修复

- 由 IMAP 服务器分配 `INTERNALDATE`，避开 `imap@0.8.19` 对已移除 `util.isDate` API 的调用，恢复 Node.js 23 及更高版本的已发送目录 APPEND 兼容性

## [2.0.0] - 2026-07-21

### 破坏性变更

- 最低 Node.js 版本从 18 提升到 22.13
- 将公开 MCP 工具从 25 个重复入口收敛为 12 个聚焦工具
- 使用 `check_connection` 统一连接检查，使用 `search_messages` 统一普通搜索，并以 `find_unreplied_messages` 替换旧的未回复搜索
- 移除 `open_mailbox`、`disconnect_all`、`get_message_count`、`get_attachments` 和旧搜索别名；搜索与邮件引用现在显式指定邮箱目录
- 搜索默认不再返回正文；需要完整内容时使用 `get_message` 或设置 `includeBody: true`

### 修复

- 在有界候选集上全量检查、按 IMAP 内部日期排序，并在返回数量限制前执行精确日期过滤，避免导入邮件或较早有效结果被丢弃
- 在精确时间过滤前放宽 IMAP 日历日期候选窗口，避免 INTERNALDATE 时区偏移漏掉边界邮件
- 根据 `In-Reply-To` 和 `References` 判断未回复状态，保留接收日期范围之后发出的回复，并将缺少 Message-ID 的邮件标记为 unknown
- reply-all 保留 Reply-To、To 和 CC 收件人，同时排除配置的账号地址
- 通过 UIDPLUS 仅永久删除指定 UID；定向 expunge 失败时回滚 `\\Deleted` 标记
- 为批量读取、邮箱列表、IMAP keywords、附件索引和布尔参数增加更严格的 schema 与运行时限制
- IMAP 获取邮件时显式请求 RFC822 大小；服务器未提供时返回 `size: null`，不再用误导性的零值
- 已发送副本保存失败时返回经过密码脱敏的结构化 `sentFolderError`，不再丢失失败原因
- 拒绝明文 IMAP 配置；未使用 SMTP 隐式 TLS 时，在认证前强制 STARTTLS
- 服务器同时缺少 MOVE 和 UIDPLUS 时安全拒绝移动，避免使用全局 EXPUNGE 降级路径
- 在服务端实际执行所有公开工具的输入 Schema，包括布尔值、数组上限、正文二选一和未知字段
- HTML-only 回复不再生成空的纯文本 alternative，引用的 HTML 会转换为安全可读文本
- 即使服务器没有返回 RFC822 大小，也会限制附件 MIME 的内存缓冲
- 附件目录逐级解析，下载文件排他创建，并在读写前校验已打开文件的 inode 和规范路径，防止父目录切换或符号链接绕过 `MAIL_ALLOWED_ROOTS`
- IMAP 在 `ready` 前结束连接时立即失败，避免工具调用永久等待
- 移动或永久删除前确认 UID 仍然存在，避免把无操作误报为成功
- 限制超大邮件头，并逐封加载完整正文，避免单封上限在批量读取时放大到数 GB 内存峰值
- 所有被检查的邮件头都计入 `MAIL_MAX_SEARCH_CANDIDATES`，包括无日期搜索和回复状态分析的两个阶段
- 除 RFC 规定大小写不敏感的 `INBOX` 外，保留大小写不同的邮箱目录名称
- 每次 `check_connection` 都实时复检 SMTP，不再把缓存的 transporter 当作实时连接
- 将 IMAP `close` 视为 `ready` 前后的终止连接事件；优雅断开超时时强制释放底层 socket
- `get_messages` 在读取正文前检查全部 UID，存在缺失时整体失败，不再静默漏掉邮件
- 纯文本回复可以正确引用 HTML-only 原邮件；超长引用会被截断，同时保留新回复和签名
- 在 stdio EOF、SIGINT、SIGTERM 或 SIGHUP 时关闭 IMAP、SMTP 与 MCP transport，避免客户端断开后残留邮件进程
- 关闭未使用的 IMAP ENVELOPE/BODYSTRUCTURE 获取，仅请求搜索必需的邮件头，并通过 `MAIL_MAX_SEARCH_HEADER_BYTES` 限制整次调用检查的头字段总字节数
- 复用已发送目录缓存前重新验证，并在移动返回目标 UID 时刷新 `destinationUidValidity`
- 为访问外部邮箱的工具补充准确的 MCP open-world 注解
- 连接前拒绝不安全的 IMAP keyword atom，避免空白、控制字符或协议语法改变乃至注入搜索命令
- 在缓冲 IMAP 邮件头 stream 时即时执行 `MAIL_MAX_SEARCH_HEADER_BYTES`，不再等全部候选抓取完成后才检查
- 显式实现 UIDPLUS 移动降级流程；COPY 成功但源邮件清理失败时始终返回结构化 partial 错误，即使服务器未返回 COPYUID
- UIDPLUS 移动或删除清理报错后重新打开目录并验证源 UID，尽可能回滚 `\\Deleted`；传输错误导致无法确认删除结果时返回结构化 unknown 状态
- 缓存 RFC 6154 `\\Sent` 属性目录前逐个验证所有候选目录的可选中性；全部失效时才继续尝试常见目录名
- `includeBody` 搜索补取正文时邮件消失会明确失败，不再静默返回仅包含邮件头的摘要
- 由 Rollup 直接解析并转译 TypeScript 源码，不再生成临时 JavaScript 或残留编译器文件监听；`tsc` 仅负责无输出的类型检查
- 限制工具字符串长度，端口必须为 1-65535，资源上限必须为安全整数且不得超过预设上限
- 每次测试后恢复并冒烟验证单文件发版 bundle，`npm pack` 时也强制重建，避免入口引用未打包的 TypeScript 输出
- 批量保存附件中途失败时返回已创建路径的结构化 partial 结果，不再隐藏先前成功写入的文件
- 全部已发送候选目录选择失败时归类为 `SENT_MAILBOX_NOT_FOUND`，不再误报为 APPEND 失败
- 不再把不稳定的 IMAP sequence number 暴露为邮件 `id`，移除无效的搜索 `limit` 缩小提示，并忽略本地 `.env` 文件
- 底层 IMAP 连接报错、结束或关闭时主动终止正在执行的命令，避免单次断线永久阻塞串行工具队列
- 永久删除在读写 SELECT 后再次校验 UIDVALIDITY，避免邮箱重建后同一 UID 指向另一封邮件
- 使用 `MAIL_MAX_RESPONSE_CHARACTERS` 限制单次工具调用返回的全部 text 与 HTML 正文总量，避免批量结果放大单正文上限
- 精确时间搜索将 IMAP 日期候选窗口扩展到两天以覆盖 UTC+14 至 UTC-12，保留 INBOX 之外大小写不同的已发送目录，并让纯文本邮件省略 HTML 而不是返回 `false`
- 将 MCP Inspector 1.0.0 固定为开发依赖，不再执行未锁定版本的 latest 包
- 为发出的 HTML 邮件统一跨平台系统字体栈、14px 基础字号和 1.6 行高，同时保留内部显式样式的覆盖能力
- 纯文本参数邮件保留 `text/plain`，同时自动生成带默认样式的 `text/html` alternative，避免支持 HTML 的邮件客户端显示为等宽字体

### 改进

- 新增 ESLint 10 Flat Config 与 Prettier，统一单引号、尾随逗号和确定性格式，并提供 `npm run check` 质量检查入口
- 搜索候选邮件只读取轻量头信息，仅为最终结果补取完整正文
- 候选过多时明确失败并提示缩小范围，不再用 UID 顺序猜测最新邮件；`MAIL_MAX_SEARCH_CANDIDATES` 对整次跨目录调用生效
- 新增可选的 `EMAIL_ADDRESS` 作为发件人 From 地址和 reply-all 账号身份，兼容登录用户名不是邮箱地址的账号
- 以可写模式逐个尝试已发送目录；只有确定未追加时才尝试下一候选，传输中断等结果不确定情况立即停止，避免重复已发送副本
- `sentFolderError` 返回每个已尝试目录的结构化结果，缓存第一个成功候选，并以大小写不敏感方式识别 RFC 6154 `\\Sent` 属性
- 同步更新中英文文档中的工具契约
- 新增 `continue_email_thread`：在已发送目录中查找主题完全匹配的最新邮件并续写周期报告线程，默认回复全部并携带上一封邮件的完整正文
- 将仓库内手写的源码、构建配置、脚本和测试统一为 TypeScript；JavaScript 仅作为发布运行时 bundle 的编译产物生成
- 源码与测试中的本地 TypeScript 导入可省略后缀，由 Rollup 负责模块解析，测试则通过 `tsx` 直接加载源码
- 运行时库保持为应用 bundle 的 external，并声明为 npm `dependencies`，生成更小且符合 Node.js 习惯的发布入口；测试会拒绝未声明的 external import
- 使用 Terser 压缩生产 bundle，同时保持开发监听产物可读，并继续将第三方运行时依赖作为 external
- 让根 TypeScript 项目覆盖源码、Rollup/ESLint 配置和构建脚本，使编辑器与命令行使用相同的严格 Node 类型诊断；测试项目仅放宽测试桩的隐式参数与空值断言
- 将已弃用的低层 MCP `Server` 与手写请求处理器迁移到 `McpServer.registerTool()`，使用 Zod Schema 和 SDK 原生输入校验

## [1.2.3] - 2026-07-20

### 新增

- 新增 `move_message`，支持通过邮箱范围内的邮件引用将邮件移动到已存在的目标文件夹，并可校验 UIDVALIDITY
- `send_email` 和 `reply_to_email` 新增可选的纯文本与 HTML 签名

### 改进

- IMAP 服务器提供目标 UID 时随移动结果返回；未提供时返回重新搜索目标邮箱的提示
- 回复签名位于新正文之后、原邮件引用之前，同时保留 text/plain 与 text/html 两种邮件正文格式
- 校验移动目标，拒绝将邮件移动到当前所在邮箱

### 文档

- 重构中英文 README，突出使用场景、快速配置、工具能力分组和精简版本说明
- 更新 Claude Desktop、Cursor、Claude Code 和 Codex 配置示例，并明确当前认证方式和 SMTP TLS 限制

## [1.2.2] - 2026-07-20

### 破坏性变更

- 单邮件工具现在必须同时传入 `mailbox` 和 UID；响应新增 `sourceMailbox` 与 `uidValidity`，避免命中其他邮箱中的同号 UID
- 未配置 `MAIL_ALLOWED_ROOTS` 时，默认禁用本地附件读取和写入

### 安全

- 默认启用 IMAP 证书校验，自签名部署必须显式关闭或调整配置
- 为本地附件、Base64 返回、邮件解析和正文输出增加真实路径白名单及大小限制
- 升级 MCP SDK、Nodemailer、Mailparser、Rollup 及传递依赖，并移除存在漏洞且非必要的压缩插件

### 修复

- 串行执行工具调用，避免并发请求在操作过程中切换 IMAP 当前邮箱
- 使用 Nodemailer 生成已发送副本的 MIME，保留附件与回复线程头
- 修复 SMTP 初始化残留、只读模式标记已读、发件箱状态漂移、重复 `Re:` 前缀和未回复分析优先处理旧邮件的问题

### 新增

- 将原先单体入口拆分为 MCP 编排、工具定义、连接管理、搜索服务、共享类型及邮件工具函数模块
- 新增 `npm run dev:inspector`，支持通过浏览器配置连接并交互测试 MCP 工具
- 增加串行队列、邮件引用、路径策略、MIME 生成、搜索行为及 MCP stdio 握手测试

## [1.2.1] - 2026-03-18

### 修复

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

### 新增

- 全部搜索工具新增 `inboxOnly` 参数，支持仅搜索收件箱

### 改进

- `ensureSMTPConnection()` 补充并发初始化保护，含 30 秒超时
- 发件箱通过 RFC 6154 `\Sent` 属性自动探测并缓存，兼容各邮件服务商
- `saveMessageToFolder()` 简化逻辑，找不到发件箱时跳过保存
- 搜索改用 `slice(-limit)` 优先取最新邮件，日期过滤后不再返回空结果
- 回复邮件引用内容增加 HTML 转义，防止 XSS 注入

## [1.2.0] - 2026-03-08

### 新增

- 新增附件管理功能：支持获取附件元数据、下载保存附件到本地
- 增强多邮箱搜索能力

### 修复

- IMAP 连接增加 `socketTimeout` 配置，防止连接挂起
- 限制批量获取邮件数量，防止大邮箱场景下 IMAP 响应超时

## [1.1.16] - 2026-03-08

### 变更

- 回滚至 1.1.13 代码基础，撤销部分实验性改动

## [1.1.15] - 2026-03-05

### 文档

- 重构 README 结构，优化工具说明格式

## [1.1.14] - 2026-03-05

### 新增

- 新增 `export_attachment` 工具，支持将附件保存至本地路径

### 文档

- 重写 README，完善附件功能文档和工具使用说明

## [1.1.13] - 2025-12-18

### 新增

- 支持读取邮件附件内容
- IMAP 连接支持自签名证书（via PR #1）

## [1.1.12] - 2025-09-22

### 改进

- 搜索结果增加数量限制，防止返回过多数据
- 优化未回复邮件检测算法

## [1.1.11] - 2025-09-05

### 修复

- 改进多邮箱场景下的邮件查找逻辑
- 修复标记邮件为已读时的异常问题

## [1.1.10] - 2025-08-25

### 改进

- 实现改进的未回复邮件检测算法，提升匹配准确率

## [1.1.9] - 2025-08-21

### 新增

- 新增按发件人搜索未回复邮件的功能

## [1.1.8] - 2025-08-20

### 变更

- 重构未回复邮件搜索功能及相关标记操作
- 简化回复邮件主题的构建逻辑

## [1.1.7] - 2025-08-20

### 新增

- 新增邮件标记管理功能（标记已读/未读等）
- 新增未回复邮件搜索功能

## [1.1.6] - 2025-08-20

### 修复

- 移除回复邮件时正文内容的必填校验限制

## [1.1.5] - 2025-08-20

### 改进

- 添加用户一致性检查
- 优化 IMAP/SMTP 连接管理逻辑

## [1.1.4] - 2025-08-20

### 新增

- 新增回复邮件功能，支持引用原始邮件内容
- 改进邮件处理流程

## [1.1.3] - 2025-08-08

### 文档

- 优化构建配置和文档

## [1.1.2] - 2025-08-08

### 改进

- 增强邮件搜索功能，扩展搜索条件支持

## [1.1.1] - 2025-08-03

### 改进

- 改进邮件客户端连接管理和错误处理
- 移除 IMAP 单独断开连接功能，增强环境变量配置处理

## [1.1.0] - 2025-07-30

### 变更

- 从 POP3 协议迁移至 IMAP 协议，支持更完整的邮件操作
- 集成 mailparser 库，优化邮件解析能力

## [1.0.1] - 2025-07-30

### 变更

- 更新 rollup 构建配置
- 添加中文版 README 文档

## [1.0.0] - 2025-07-30

### 新增

- 初始发布
- 基于 MCP 协议的邮件服务器核心功能
- 支持邮件收发、搜索、连接管理等基础操作
