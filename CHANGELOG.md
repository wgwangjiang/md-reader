# 更新日志

## [1.4.0] - 2026-04-13

### 链接跳转浏览器功能 (src/main.js, src-tauri/)

#### 新增链接点击在默认浏览器中打开
- 预览区域点击链接时，自动在系统默认浏览器中打开，而非在 Tauri webview 中导航
- 添加 `tauri-plugin-shell` 插件，调用 `shell.open()` 打开外部链接
- 使用原始 `href` 属性值获取链接地址，避免浏览器解析为 `tauri.localhost` 相对路径
- 自动补全无协议前缀的裸域名链接（如 `www.baidu.com` → `https://www.baidu.com`）
- 支持 `http://`、`https://` 等完整协议链接直接打开
- 锚点链接（`#anchor`）和本地路径（`/path`）不受影响

#### 权限配置更新
- `src-tauri/capabilities/default.json` 添加 `shell:allow-open` 权限
- `src-tauri/Cargo.toml` 添加 `tauri-plugin-shell` 依赖
- `src-tauri/src/main.rs` 注册 `tauri_plugin_shell::init()` 插件

#### 关于面板更新
- 功能列表新增"链接跳转"条目

---

## [1.3.0] - 2026-03-16

### 新建文件功能 (src/main.js, src/index.html)

#### 新增 Ctrl+N 新建文件
- 快捷键 Ctrl+N 创建空白 Markdown 文件，自动进入编辑模式
- 工具栏新增"新建文件"按钮（带 + 号的文件图标）
- 新建前若当前文档有未保存更改，弹出三选对话框（是/否/取消）提示保存

#### Ctrl+S 保存流程优化
- 新建文件（无路径）按 Ctrl+S 时，先弹出"是否保存当前文件？"确认对话框
- 点"是"后弹出目录选择器，选择保存位置
- 已有路径的文件仍直接保存到原路径

#### 未保存更改提示完善
- 关闭程序时：若有未保存更改（含新建文件），弹出保存提示对话框
- 打开其他文件时：若有未保存更改（含新建文件），弹出保存提示对话框
- 编辑模式兼容新建文件：修改 `toggleEditMode()` 判断条件，支持无路径的新建文件

#### 关于面板更新
- 功能列表新增"新建文件"条目
- 快捷键表格新增 Ctrl+N 条目

---

## [1.2.0] - 2026-03-16

### 窗口标题显示当前文件名 (src/main.js)

- 打开文件后，窗口标题栏显示 "Markdown 阅读器 - 文件名"（如 "Markdown 阅读器 - HISTORY.md"）
- 未打开文件时，窗口标题仅显示 "Markdown 阅读器"
- 通过 Tauri 窗口 API 动态更新标题，跟随文件打开、保存、另存为等操作自动同步

### 修复窗口标题权限 (src-tauri/capabilities/default.json)

- 添加 `core:window:allow-set-title` 权限，修复 Tauri v2 下 setTitle 被静默拦截的问题

---

## [1.1.9] - 2026-03-14

### 编辑工具栏增强 (src/index.html, src/main.js, src/styles.css)

#### 新增撤销/重做功能
- 编辑工具栏新增撤销（Ctrl+Z）和重做（Ctrl+Y）按钮
- 实现编辑历史记录栈，支持最多 100 步撤销/重做
- 历史操作期间自动跳过重复记录，避免状态混乱

#### 标题按钮下拉菜单
- 标题按钮（H）点击后弹出下拉菜单，包含 H1-H6 全部标题级别及普通文本选项
- 支持快速插入或切换当前行的标题级别

#### 修复工具栏按钮点击导致文档滚动到底部的问题
- 修复编辑模式下点击格式工具栏任意按钮后，文档内容自动跳转到底部的问题

---

## [1.1.8] - 2026-03-02

### 表格渲染修复 (src/main.js)

#### 修复表格空单元格导致列错位的问题
- 修复当表格行首列为空时（如分类合并行 `| | command | desc |`），空单元格被 `filter` 过滤掉，导致该行单元格数量少于表头，列内容整体左移错位
- 原因：`row.split('|').filter(cell => cell.trim() !== '')` 会将空白单元格视为空字符串并移除
- 修复：改用 `row.split('|').slice(1, -1)` 仅移除首尾分割产物，保留中间的空单元格
- 同步修复表头解析逻辑，防止同类问题

---

## [1.1.7] - 2026-02-28

### 完整 Markdown 标准与 GFM 扩展支持 (src/main.js, src/styles.css)

#### HTML 白名单大幅扩展
- 重写 HTML 标签处理系统：从硬编码 4 种标签改为通用白名单机制（40+ 标签）
- 支持所有 GitHub 兼容 HTML 标签：`<p>`, `<a>`, `<br>`, `<span>`, `<center>`, `<kbd>`, `<figure>` 等
- 通用属性白名单（20+ 属性）：`align`, `href`, `src`, `style`, `class`, `id` 等
- 安全防护：自动阻止 `javascript:` URL，`<a>` 自动添加 `target="_blank"` 和 `rel="noopener noreferrer"`
- 通用块级元素段落清理，替代逐标签硬编码清理

#### 标准 Markdown 新增
- 反斜杠转义：`\*`, `\#`, `\[` 等特殊字符可通过 `\` 转义为普通文本
- 引用式链接：`[text][id]` + `[id]: url "title"` 定义格式
- 引用式图片：`![alt][id]` 格式
- 快捷引用式链接：`[text]` 自动匹配同名定义
- Setext 风格标题：文字下方用 `===` 或 `---` 下划线定义 h1/h2
- HTML 实体修复：`&copy;`, `&#123;` 等不再被双重转义

#### GFM 扩展新增
- 波浪号代码块：支持 `~~~` 作为代码块围栏（与 ` ``` ` 等价）
- 裸露 URL 自动链接：`https://example.com` 自动转换为可点击链接
- GFM 提示块（Alerts）：支持 `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`，含独立配色样式
- 标题自动 ID：所有标题自动生成 `id` 属性，支持锚点导航和中文标题

#### Badge 显示修复
- 修复连续链接图片（badge）之间被 `<br>` 分隔导致纵向排列的问题，现在正确并排显示

---

## [1.1.6] - 2026-02-27

### Markdown 渲染增强 (src/main.js, src/styles.css)

#### 支持安全 HTML 标签渲染
- 新增 `<div align="center">` 支持，居中内容正确渲染
- 新增 HTML `<img>` 标签支持（含 `src`、`alt`、`width`、`height` 属性），不再被转义为纯文本
- 新增 `<details>` / `<summary>` 折叠块支持
- 安全处理：仅允许白名单内的标签，其余仍转义防止 XSS

#### 图片渲染修复
- 修复外部图片在 WebView 中无法加载的问题：为所有 `<img>` 添加 `referrerpolicy="no-referrer"`
- 修复 Markdown 图片链接 `[!["alt"](img)](link)` 中 alt 文本含双引号时 HTML 属性被破坏的问题
- 修复连续 HTML `<img>` 标签被 `<br>` 分隔导致纵向排列的问题，现在正确并排显示
- 修复链接内 badge 图标与文字不在同一水平线的问题：`vertical-align: middle`

#### 段落清理
- 新增 `<div>`、`<details>`、`<summary>` 周围多余 `<p>` 标签的自动清理

---

## [1.1.5] - 2026-02-04

### 版本更新
- 版本号：1.0.0 → **1.1.5**
- 作者：MdReader Team → **WIND**

### PDF 导出文件名优化 (src/main.js)
- 导出 PDF 时，打印对话框的默认文件名现在自动使用当前打开的文件名
- 自动去除 `.md` 后缀并添加 `.pdf` 扩展名（如 `readme.md` → `readme.pdf`）
- 实现方式：打印前临时修改 `document.title` 为 PDF 文件名，打印完成后自动恢复原标题
- 未打开文件时，默认文件名为 `document.pdf`

---

## 2026-02-04 样式优化

### PDF 导出默认文件名自动填充 (src/main.js)
- 导出 PDF 时，打印对话框的默认文件名现在自动使用当前打开的文件名
- 自动去除 `.md` 后缀并添加 `.pdf` 扩展名（如 `readme.md` → `readme.pdf`）
- 实现方式：打印前临时修改 `document.title` 为 PDF 文件名，打印完成后自动恢复原标题
- 未打开文件时，默认文件名为 `document.pdf`

---

## 2026-02-04 样式优化

### 预览区样式调整 (src/styles.css)

#### 字体大小
- 基础字体: 14px
- h1: 1.75em → 2em
- h2: 1.35em → 1.5em  
- h3: 1.15em → 1.25em
- h4: 1em → 1.1em
- h5: 0.9em → 1em
- h6: 0.8em → 0.9em
- 代码块字体: 13px → 14px

#### 表格样式
- 表格内边距: 1px 1px (非常紧凑)
- 使用 `border-collapse: separate` 模式确保边框显示完整
- 外边框 2px solid #999，单元格边框 1px solid #999

#### 代码块样式
- 内边距: 4px 6px (从 16px 大幅减小)
- 外边距: 0.5em 0 (从 1em 减小)
- 背景色: #f6f8fa

---

### PDF 导出样式调整 (src/main.js)

#### 字体大小
- 基础字体: 12px → 14px
- h1: 1.9em
- h2: 1.5em
- h3: 1.3em
- h4: 1.1em
- h5: 1em
- h6: 0.9em
- 代码块字体: 14px

#### 表格样式
- 表格内边距: 1px 1px (从 12px 16px 大幅减小)
- 使用 `border-collapse: separate` 模式
- 外边框 2px solid #999

#### 间距优化
- 行内 code padding: 1px 3px (从 2px 6px 减小)
- 代码块 margin: 0.3em 0
- 引用块 padding-left: 8px (从 16px 减小)
- 引用块 margin: 0.3em 0 (从 1em 减小)
- 引用块边框: 3px (从 4px 减小)

#### 页面设置
- @page margin: 8mm
- body padding: 0

### 默认字体设置 (src/index.html, src/main.js)

- 默认字体大小: 14px (从 16px 调整)
- 字体设置滑块默认值: 14px

---



## 2026-02-04 功能增强与优化

### PDF 默认预览边距调整 (src/main.js)
- 页面边距从 0mm 调整为 8mm，改善阅读体验
- 同步调整打印样式 `@media print` 中的边距设置

### 双击打开文件支持 (src-tauri/src/main.rs, src/main.js)
- 新增命令行参数解析，支持双击 Markdown 文件打开
- 新增 `open-file-from-cli` 事件监听，文件打开后自动加载
- 新增 `openFileByPath()` 函数处理文件路径
- 新增 `initCliFileHandler()` 初始化文件处理器
- 依赖: 添加 tokio 用于异步处理

### 文件关联 (src-tauri/tauri.conf.json, register-file-assoc.reg)
- 配置文件关联支持 `.md`、`.markdown`、`.txt` 文件
- 提供注册表文件 `register-file-assoc.reg` 用于手动注册文件关联
- 提供 `unregister-file-assoc.reg` 用于取消注册

### 替换功能修复 (src/main.js)
- 修复 `replaceAll()` 函数未通知后端修改状态的问题
- 替换后现在会正确调用 `set_modified` 命令
- 关闭程序时会正确提示保存

### 搜索框优化 (src/index.html)
- 搜索输入框添加 `autocomplete="off"` 属性
- 禁用浏览器自动填充历史记录，避免干扰搜索

### 导出网页功能 (src/index.html, src/main.js)
- 新增工具栏"导出网页"按钮
- 新增 `exportToHtml()` 函数，支持导出独立 HTML 文件
- 包含完整样式（响应式布局、代码高亮、表格样式等）
- 默认文件名为原文件名（.md 替换为 .html）

### 查找按钮状态管理 (src/index.html, src/main.js)
- 查找按钮初始状态设为禁用
- 打开文件后自动启用查找按钮
- 与编辑按钮保持一致的启用逻辑

### 编辑/预览按钮切换 (src/index.html, src/main.js)
- 编辑按钮现在支持状态切换显示
- 预览模式：显示铅笔图标，提示"进入编辑模式"
- 编辑模式：显示眼睛图标，提示"进入预览模式"
- 修改 `toggleEditMode()` 函数动态更新图标和提示

### 关于面板增强 (src/index.html)
- 扩展关于面板，新增功能列表说明
- 新增快捷键说明表格（Ctrl+O/S/F、Esc）
- 面板支持滚动，适应内容增加
- 添加 macOS 快捷键提示

---

## 2026-02-03 编辑按钮状态优化与打印样式调整

### 编辑按钮在未打开文件时禁用 (src/index.html, src/main.js, src/styles.css)
- 编辑按钮初始状态设为 `disabled`
- 新增 `.toolbar-btn:disabled` 样式，设置透明度为 0.4，光标为 `not-allowed`
- `toggleEditMode()` 函数添加检查：未打开文件时直接返回，不执行切换
- `openFile()` 成功后启用编辑按钮 `document.getElementById('btn-edit').disabled = false`
- 防止用户未打开文件时点击编辑按钮显示右侧空白内容

### PDF 打印样式优化尝试 (src/main.js)
- 多次调整 `@page` 规则和 body 样式，尝试去除打印预览两侧灰色边距
- 尝试使用 `zoom: 0.5` 将打印内容缩放为 50%
- 最终恢复原有样式，保持内容正常显示
- 注：浏览器打印预览的灰色边距为浏览器默认安全边距，需在打印设置中手动选择"边距: 无"去除
---

## 2026-02-02 初始版本

### 功能特性
- Markdown 文件打开和编辑
- 实时预览模式
- 查找和替换功能
- 字体设置（字体和字号）
- 导出 PDF
- 导出 HTML 网页
- 代码高亮支持
- 表格、任务列表、脚注等 Markdown 扩展语法支持

### 技术栈
- 前端: HTML + CSS + JavaScript
- 桌面框架: Tauri (Rust)
- 构建工具: Vite
- 代码高亮: highlight.js

---