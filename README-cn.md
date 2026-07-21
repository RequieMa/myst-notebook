<sub>🌐 <a href="https://github.com/RequieMa/myst-notebook/blob/Master/README.md">English</a> · <b>中文</b></sub>

# MyST Notebook

> *"在 VS Code 里写作本该简单。为什么不能只专注于打字？这就是我的答案。"*

<!-- Support badges — always at the top, next to the value prop -->
[![Ko-fi](https://img.shields.io/badge/Support-ko--fi-FF5E5B?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/requiema)
[![Afdian](https://img.shields.io/badge/Support-爱发电-946CE6?style=flat)](https://afdian.com/a/requiema)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/RequieMa/myst-notebook/blob/Master/LICENSE)
[![VS Code](https://img.shields.io/badge/VS_Code-1.85+-blue.svg)](https://code.visualstudio.com/)
<!-- Coming: VS Code Marketplace version badge -->

<br>

**在 VS Code 的 notebook 编辑器中编辑 MyST Markdown（`.md`）。** 正文随打字实时渲染，数学公式通过 KaTeX 内联显示，`{code-cell}` 代码块通过 Jupyter 执行——一切都在同一个窗格中，无需预览面板，无需构建步骤。

[安装](#快速开始) · [功能](#功能一览) · [Zotero 引用](#zotero-引用) · [快捷键](#快捷键) · [目录结构](#仓库结构)

---

<!--
  Hero GIF：展示打开 .md 为 MyST Notebook → 输入正文 → 渲染 → 运行代码块。
  对着 Extension Development Host 录 20-30 秒。
-->
<p align="center">
  <img src="https://raw.githubusercontent.com/RequieMa/myst-notebook/Master/demo.gif" alt="MyST Notebook · 正文渲染、数学公式、代码执行内联显示在 VS Code 中" width="100%">
</p>

---

## 快速开始

从 VS Code Marketplace 安装，打开 MyST `.md` 文件，即开即写。

1. 从 [VS Code Marketplace](#) 安装 **MyST Notebook** <!-- 发布后更新链接 --> **尚未发布！**
2. 在 MyST / Jupyter Book 项目中打开 `.md` 文件（含有 `myst.yml` 的项目）
3. 点击编辑器工具栏中的 **Open as MyST Notebook**，或右键标签页 → **Reopen Editor With… → MyST Notebook**

设置 MyST Notebook 为 `.md` 文件的默认编辑器：**命令面板 → Configure default editor for '.md' → MyST Notebook**。

**环境要求：** VS Code 1.85+ · [Python 扩展](https://marketplace.visualstudio.com/items?itemName=ms-python.python)（代码执行所需） · Python 环境（可选——纯编辑和渲染无需 Python）

---

## 功能一览

| 功能 | 说明 | 使用方式 |
|------|------|----------|
| **内联渲染** | 正文和数学公式（`$…$`、`$$…$$`）在焦点离开时原地渲染 | 只需输入，然后移动到另一个单元格 |
| **可执行代码块** | `{code-cell}` 代码块通过 Jupyter 运行，输出实时流式显示 | `Ctrl+Shift+E` 插入，`Shift+Enter` 运行，或点击单元格上的 `▶ Run` |
| **▶ Run 按钮** | 每个代码单元格右下角显示 `▶ Run` 按钮 | 点击 `▶ Run` 即可执行该单元格 |
| **单击编辑** | 单击任意单元格即可开始编辑 | 单击一次——无需双击 |
| **知识图谱** | `[[wikilinks]]`、反向链接和 D3 力导向图——支持 MyST，`{cite}` 角色可作为图谱节点 | `Ctrl+Shift+G` 打开图谱 |
| **Zotero 引用** | 从你的 Zotero 库中插入 `{cite}` 引用，一条命令完成配置 | 运行 **MyST: Configure Zotero Citations**，然后 `Alt+Shift+Z` |
| **数学符号面板** | 收藏常用 LaTeX 符号，快捷键插入 | 在 `$…$` 中输入 `\` 触发自动补全，或 `Ctrl+Shift+M` 打开选择器 |
| **自动分割** | 在段落末尾按 Enter → 下方创建新单元格，光标就位 | 写完一个段落直接按 Enter |

---

## Demo 画廊

<!-- 每个核心功能一个条目。从 Extension Development Host (F5) 录制 GIF。 -->

### 内联渲染 + 自动分割

<p align="center"><img src="https://raw.githubusercontent.com/RequieMa/myst-notebook/Master/demo-render.gif" width="100%"></p>

正文和数学公式在离开单元格时自动渲染。自动分割在你写作时创建新单元格——无需鼠标，无需工具栏，无需弹窗。

### 代码执行

<p align="center"><img src="https://raw.githubusercontent.com/RequieMa/myst-notebook/Master/demo-run.gif" width="100%"></p>

`{code-cell}` 代码块自动发现你的 Python 环境并实时流式输出。无需安装 Jupyter 扩展。

### 知识图谱

<p align="center"><img src="https://raw.githubusercontent.com/RequieMa/myst-notebook/Master/demo-graph.gif" width="100%"></p>

`[[wikilinks]]` 和 `{cite}` 引用成为图谱中的边。按结构而非文件树浏览你的书。

---

## Zotero 引用

MyST Notebook 可以连接你的 Zotero 文献库，在写作时插入 `` {cite}`key` `` 引用——一条命令完成配置，之后无需离开键盘即可选择引用。

### 前置条件

1. **Zotero 桌面版** —— 已安装并保持运行（选择器通过 `127.0.0.1:23119` 与本机通信，该服务器仅在 Zotero 运行时存在）
2. **Better BibTeX** —— Zotero 插件（工具 → 插件，搜索 "Better BibTeX for Zotero"）
3. **Citation Picker for Zotero**（`mblode.zotero`）—— 推荐与 MyST Notebook 一起安装；VS Code 会提示一并安装

### 自动配置

在 MyST 工作区中，从命令面板运行 **MyST: Configure Zotero Citations**。该命令会：

- 检测 `mblode.zotero` 是否已安装（如未安装则提供安装选项）
- 将正确的 `` `{cite}` `` CAYW URL 写入 `.vscode/settings.json`
- 允许你在 `{cite}` / `{cite:p}` / `{cite:t}` 角色之间切换

使用 **Alt+Shift+Z** 插入引用——Zotero 选择器弹出，选择文献，按 Enter 即可。

> **WSL2 / Windows 10 用户：** 自动配置无法直接使用——WSL2 的 NAT 网络无法访问 Zotero 的 `127.0.0.1:23119`。请先按照 [WSL2 配置指南](https://github.com/RequieMa/myst-notebook/blob/Master/docs/citation-setup.md#wsl2--windows-10--required-setup) 完成网络设置。**Windows 11 用户**可尝试 [mirrored networking](https://github.com/RequieMa/myst-notebook/blob/Master/docs/citation-setup.md#wsl2--windows-10--required-setup)（更简单，尚未验证）。

### 验证是否正常

在 Zotero 运行时测试端点：

```bash
curl -s "http://127.0.0.1:23119/better-bibtex/cayw?format=json"
```

在 Zotero 弹窗中选择一条文献 → 返回描述你选择的 JSON 数据。然后测试 MyST 模板——在 `.md` 文件中按 **Alt+Shift+Z** → `` {cite}`key` `` 会插入到光标位置。

### 让引用可解析（生成参考文献列表）

`` {cite}`key` `` 只是第一步——要让构建时生成参考文献列表，引用键必须能对应到 `.bib` 文件中的条目。

1. **从 Zotero 自动导出 `.bib`**：右键你的文献库 → 导出 → **Better BibTeX** → 勾选 **"保持更新"** → 保存为例如 `references.bib`
2. **在 `myst.yml` 中注册**：
   ```yaml
   project:
     bibliography:
       - references.bib
   ```
3. **构建** `jupyter book build --html` —— 参考文献列表按页生成，仅包含实际引用的文献。

> ⚠️ **常见问题：** 如果选择器提示"could not connect to Zotero"但 Zotero 确实在运行，请检查 `zotero-citation-picker.port` 是否正确保存。不要在选择器中按 Escape——它产生的错误信息与服务器无响应完全相同。务必在选择文献后按 **Enter**。

---

## 快捷键

### 写作与单元格

| 按键 | 操作 |
|------|------|
| **Enter** | 在光标处分割单元格（在代码块 / 空单元格内则为换行） |
| **Alt+Enter** | 插入文字换行（不分割） |
| **Shift+Enter** | 运行单元格并前进到下一个 |
| **Ctrl+Shift+E** | 将当前单元格转换为代码单元格 |
| **Ctrl+Shift+R** | 将当前单元格转换为 Markdown 单元格 |
| **Ctrl+Shift+D** | 在下方插入仅展示的代码块 |
| **Ctrl+D** | 删除选中的单元格（非编辑模式下） |

### 数学与引用

| 按键 | 操作 |
|------|------|
| **在 `$…$` 中输入 `\`** | LaTeX 符号自动补全 |
| **Ctrl+Shift+M** | 打开数学符号选择面板（最近使用优先） |
| **Alt+Shift+Z** | 打开 Zotero 引用选择器 |

### 内核管理（命令面板）

| 命令 | 操作 |
|------|------|
| **MyST: Restart Kernel** | 重启内核，清除所有状态 |
| **MyST: Interrupt Kernel** | 发送 SIGINT 中断正在运行的单元格 |

---

## 仓库结构

```
myst-notebook/
├── src/
│   ├── extension.ts          # 激活入口
│   ├── mystSerializer.ts     # 无损 .md ↔ notebook 双向转换
│   ├── mystController.ts     # 单元格执行编排
│   ├── kernelSession.ts      # Jupyter 内核生命周期管理
│   ├── cellStatusBar.ts      # 代码单元格 ▶ Run 按钮
│   ├── cellFocus.ts          # 单击进入编辑模式
│   ├── enterSplit.ts         # Enter 键分割单元格
│   ├── mathCompletion.ts     # LaTeX 自动补全
│   ├── core/                 # 纯函数：分割、序列化、标签、模板
│   └── graph/                # 知识图谱（foam 核心 + webview + VS Code 功能）
├── renderer/                 # notebook 渲染器（markdown-it + KaTeX）
├── media/                    # 引导页图片
├── test-fixtures/            # smoke 测试用 MyST 工作区
├── .github/workflows/        # CI（构建+测试）与 release（vsce publish）
├── esbuild.js                # 打包脚本
├── package.json              # 扩展清单
└── README.md
```

---

## 局限性

- **MyST 冒号围栏指令**（`:::{note}`、`:::{warning}`、`:::{figure}` 等）**不支持**在 notebook 编辑器中内联渲染。VS Code 的 notebook 渲染器仅支持行内级 markdown，不支持块级自定义语法。编辑时这些指令显示为纯文本——它们在 `jupyter-book build` 构建时会被正确处理。按正常写法输入指令语法即可，编译器会负责最终渲染。
- `figure`/`image` 指令中的**相对本地图片路径**可能在渲染器沙箱中无法解析。请使用绝对 `https://` URL 或 data URI。
- **CRLF 换行符**不在 v1 范围内（假定为 LF）。
- 首次保存时，块之间的**空行会被规范化**为一个空行。已经规范的原始文件可以实现逐字节无损往返。

---

## 我为什么做这个

我平时用 MyST 写技术文档，而现有所有工作流都有同一个妥协：在纯文本编辑器里盲写，然后运行构建才能看到效果。预览窗格分散注意力；Jupyter 把我拉进浏览器；Quarto 和 JupyterBook 让我停下来编译。没有一个工具能让我*写*的时候看到的就是文档最终的样子。

所以我做了自己想要的工具——源文件**就是** notebook，原地渲染，无需构建，无需第二个窗口。如果你也感受过同样的痛苦，这个扩展就是为你准备的。

---

## 关于作者

<div align="center">

| | | |
|---|---|---|
| 📧 | Email | [mazengou@gmail.com](mailto:mazengou@gmail.com) |
| 🌐 | 个人网站 | [requiema.github.io](https://requiema.github.io) |
| 📝 | dev.to | [dev.to/requiema](https://dev.to/requiema) |
| 𝕏 | X | [x.com/mazengou](https://x.com/mazengou) |
| 👾 | Reddit | [u/Leather_Rip7919](https://www.reddit.com/user/Leather_Rip7919/) |
| 🔖 | 掘金 | [juejin.cn/user/76300220645242](https://juejin.cn/user/76300220645242) |
| 📦 | Gitee | [gitee.com/requiema](https://gitee.com/requiema) |
| 📖 | 知乎 | [zhihu.com/people/consilivm](https://www.zhihu.com/people/consilivm) |
| 🎬 | Bilibili | 镇魂曲麦 |
| 📱 | 公众号 | 镇魂曲麦 |

</div>

