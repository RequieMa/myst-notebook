# TODO

## 1. `:::` 指令块渲染优化

`:::` fence block（admonitions、callouts 等 MyST directive）目前的输出渲染效果不理想，需要改进。

**现状问题：**
- `:::{note}` / `:::{warning}` / `:::{important}` 等指令块的渲染样式不够清晰
- 嵌套 `:::` 的处理可能有问题
- 与 Jupyter Book / MyST 标准渲染效果有差距

**目标：**
- 让 `:::` 块在 notebook cell 内有清晰、美观的视觉区分
- 支持常见 directive 类型（note, warning, important, caution, tip, seealso 等）
- 正确处理嵌套 directive

---

## 2. Graph 可视化功能完善

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


