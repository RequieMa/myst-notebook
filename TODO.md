# TODO

## 本次任务总览（v0.2.5 — 6 个 UX fix）

> 实现方式：**新 session**，用 `subagent-driven-development` + 每 subagent 一个 `git worktree` 并行开发。
> 当前 `Master` = v0.2.0 + 一个 `.gitignore` commit（`.gitignore`/`.vscodeignore` 的 scratch 忽略规则）。图谱工作已迁到 `graph-visualization-enhancement` 分支。

### ⛔ 范围外：图谱可视化增强
下面 §1 的「Graph 可视化功能完善」**不在本次实现范围**。它已实现并整体迁到 `graph-visualization-enhancement` 分支（19 commits）。本次 6 个 fix 完成后，再单独返回该分支继续。

---

## 1. Graph 可视化功能完善 —— ⛔ OUT OF SCOPE（本次不实现，见 graph-visualization-enhancement 分支）

Graph 功能目前只是有一个基本架子，非常不完善，体验不好。

**现状问题：**
- Graph 渲染可用但功能简陋
- 交互体验差（缩放、拖拽、tooltip 等）
- 可能缺少常见图表类型支持或配置选项

**目标：**
- 完善 graph 交互（平移、缩放、节点点击等）
- 美化默认渲染样式
- 考虑支持更多 graph directive 配置项

---

## 2. 本次实现：6 个 UX fix

### 2.1 计划清单（均已写好，在 `docs/superpowers/plans/`）

| # | Plan 文件 | 一句话 |
|---|-----------|--------|
| 1 | `2026-09-05-font-size-shortcuts.md` | `Ctrl+Alt+=/-` 改字号 + 状态栏下拉 |
| 2b | `2026-09-05-cell-keyboard-multiselect.md` | `Ctrl+Shift+↑/↓` 多选单元格（带锚点） |
| 2 | `2026-09-05-cell-auto-preview.md` | 单元格失焦自动回到预览态 |
| 3 | `2026-09-05-html-comment-preview.md` | HTML 注释在预览态可见显示 |
| 4 | `2026-09-05-save-selected-latex.md` | `Ctrl+Alt+S` 保存选中 LaTeX 到符号库 |
| 5 | `2026-09-05-suppress-completion-on-linebreak.md` | 输入 `\\` 自动隐藏补全 |

### 2.2 并行化分析 → **3 个 subagent（3 个 worktree）**

按**文件所有权**切分，保证并行 worktree 合并时零冲突：

- `src/extension.ts` / `package.json`：被 #1、#2b、#4 修改 → 必须同一 subagent
- `src/mathCompletion.ts`：被 #4、#5 修改 → 必须同一 subagent
- `src/cellFocus.ts`：#2 独占
- `renderer/mystRenderer.ts`：#3 独占

结论：

| Subagent | 负责 | 独占文件（只允许碰这些） |
|----------|------|--------------------------|
| **A** | #1 + #2b + #4 + #5 | `src/extension.ts`、`package.json`、`src/mathCompletion.ts`、`src/fontSize.ts`、`src/cellSelection.ts`、`src/core/{fontSize,cellSelection,mathCompletionItems,mathCompletion}.ts`（+ 各自 `.test.ts`） |
| **B** | #2 | `src/cellFocus.ts` |
| **C** | #3 | `renderer/mystRenderer.ts`、`src/core/mystComment.ts`（+ `.test.ts`） |

### 2.3 前置准备（主会话，dispatch 前做一次）

1. 把 `.worktrees/` 加进 `.gitignore` 并 commit（subagent 的 worktree 目录不被 git 跟踪；见 using-git-worktrees skill 的安全校验）。
2. `npm run build` 确认成功（会生成 `renderer/generated/katexCss.ts`，后续 tsc/test 依赖它）。
3. `npm test` 确认基线全绿。

### 2.4 每个 subagent 的统一流程

1. 用 **using-git-worktrees** skill 从 `Master` 建 worktree（branch 名见各 prompt）。
2. 严格按分配的 plan 逐 task 执行 **TDD**：
   - 先写测试（plan 里已给出完整测试代码，直接照抄）；
   - 跑测试确认 **FAIL**；
   - 实现最小代码；
   - 跑测试确认 **PASS**；
   - 有问题按 systematic-debugging 排查；
   - 对照 plan **audit**（逐条勾掉每个 checkbox，确认无遗漏、无偏离）；
   - 按 plan 里给的 commit message 提交（一个 task 一个 commit）。
3. 每完成一个 plan 跑 `npm run build` + `npm test` 确认不回归。
4. **报告**：改了哪些文件、测试数（新增/通过）、build 状态、有无偏离 plan（如有，说明原因）。

> 铁律：**只碰分配给自己的文件**，不得改动他人文件（尤其 `src/extension.ts`、`package.json`、`src/mathCompletion.ts` 只有 Subagent A 能碰）。

### 2.5 Subagent A prompt（#1 + #2b + #4 + #5）

```
实现 4 个 UX plan，用 using-git-worktrees skill 建 worktree，branch 名 `feat/ux-cell-font-math`。
按此顺序实现（#2b 的 extension.ts 锚点依赖 #1 已做，必须 #1 在前）：
1. docs/superpowers/plans/2026-09-05-font-size-shortcuts.md
2. docs/superpowers/plans/2026-09-05-cell-keyboard-multiselect.md
3. docs/superpowers/plans/2026-09-05-save-selected-latex.md
4. docs/superpowers/plans/2026-09-05-suppress-completion-on-linebreak.md

你只允许创建/修改这些文件（其余一律不碰）：
- src/core/fontSize.ts + src/core/fontSize.test.ts
- src/fontSize.ts
- src/core/cellSelection.ts + src/core/cellSelection.test.ts
- src/cellSelection.ts
- src/core/mathCompletionItems.ts + src/core/mathCompletionItems.test.ts
- src/core/mathCompletion.ts + src/core/mathCompletion.test.ts
- src/mathCompletion.ts
- src/extension.ts
- package.json

流程：读 plan → 照抄测试代码 → `npx vitest run <对应test>` 确认 FAIL → 实现 → 确认 PASS → `npm run build` + `npm test`。
4 个 plan 全部完成后，逐个 plan 重新通读并 audit（勾掉所有 checkbox）。
报告：文件清单、每个 plan 的新增测试数与结果、build 状态、偏离点。
```

### 2.6 Subagent B prompt（#2）

```
实现 1 个 UX plan，用 using-git-worktrees skill 建 worktree，branch 名 `feat/cell-auto-preview`：
- docs/superpowers/plans/2026-09-05-cell-auto-preview.md

你只允许修改这一个文件：src/cellFocus.ts（其余一律不碰）。

这是纯 VS Code 接线（无单测）。流程：读 plan → 按 task 改 cellFocus.ts → `npx tsc -p tsconfig.json --noEmit` 通过 → `npm run build` + `npm test`（回归）。
完成后对照 plan audit（勾掉 checkbox）。
报告：文件、typecheck/build/test 状态、偏离点。
```

### 2.7 Subagent C prompt（#3）

```
实现 1 个 UX plan，用 using-git-worktrees skill 建 worktree，branch 名 `feat/html-comment-preview`：
- docs/superpowers/plans/2026-09-05-html-comment-preview.md

你只允许创建/修改这些文件（其余一律不碰）：
- src/core/mystComment.ts + src/core/mystComment.test.ts
- renderer/mystRenderer.ts

流程：读 plan → 照抄测试到 src/core/mystComment.test.ts → `npx vitest run src/core/mystComment.test.ts` 确认 FAIL → 实现 src/core/mystComment.ts → 确认 PASS → 按 plan 改 renderer/mystRenderer.ts → `npm run build`（会重新 bundle renderer 并生成 katexCss.ts）+ `npm test`。
完成后对照 plan audit（勾掉 checkbox）。
报告：文件、测试数与结果、build 状态、偏离点。
```

### 2.8 汇总 + 发布（主会话，3 个 subagent 全部完成后）

1. 依次把 3 个 worktree 分支 merge 回 `Master`（顺序 A → B → C；文件不相交，应无冲突；有冲突立即停下解决）。
2. 全量验证：`npm run build` && `npm test` && `npm run test:integration`。
3. `package.json` 版本号 `0.2.0` → **`0.2.5`**。
4. `CHANGELOG.md` 顶部新增 `## [0.2.5]` 段（草稿见 2.9）。
5. 构建 vsix：`npm run package`（产出 `*.vsix`）。
6. commit（版本号 + CHANGELOG + vsix 之外的源码）+ push。

### 2.9 CHANGELOG v0.2.5 草稿

```markdown
## [0.2.5] - 2026-09-05

### Added
- **Font-size shortcuts + status-bar dropdown** — `Ctrl+Alt+=` / `Ctrl+Alt+-` step the notebook font size (8–32px), persisted to user settings; a status-bar item shows the current size and opens a QuickPick on click.
- **Keyboard cell multi-select** — `Ctrl+Shift+↑/↓` extend/shrink the cell selection with text-editor-style anchor behavior, so multi-selected cells can be copied/pasted natively.
- **HTML comments visible in preview** — markdown `<!-- ... -->` comments now render in gray italic with their markers instead of being hidden.
- **Save selected LaTeX** — `Ctrl+Alt+S` saves the exact cursor-selected LaTeX in the current cell to the math-symbol store; saved snippets appear in the Math Palette, QuickPick, and `\` completion.

### Fixed
- **Auto-preview on focus loss** — moving the selection to another cell now reverts the previously-edited cell to its rendered preview.
- **Completion after `\\`** — typing a LaTeX line break (`\\`) now hides the `\` completion list instead of leaving it open to swallow Tab/Enter.
```

---

## 3. 完成后回到图谱增强

6 个 fix 发布 v0.2.5 后，用 `git worktree add` 基于 `graph-visualization-enhancement` 分支新建 worktree，继续图谱增强工作（§1）。
