---
description: "使用全新 worker、持久工作区进度和独立评估来运行有界编码迭代。通过本文选择或配置 Simple Ralph 工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-simple-ralph

[English](README.md) | 中文

## 摘要

`simple_ralph` 通过全新的 worker 和独立评估器推进一个编码目标。每个 worker 都会更新 `.ralph/progress.md`，评估器会检查工作区，然后循环继续或报告完成。工具会在达到配置的迭代上限或遇到具体阻塞时停止。每轮会启动两个子 agent，因此模型成本重要时应配置较小的上限。

## 目录

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制和待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在 Cordis 组合中挂载此插件，即可向其中的 agent 提供 `simple_ralph`。

### 适用场景

当编码任务适合由全新 worker 反复执行并由独立评估器检查时使用。单次有界委派请使用 subagent；无需独立评估的全新 worker 循环请使用 [`tool-ralph`](../tool-ralph/README.zh.md)。

### 最小配置

基础 bundle 默认禁用此工具。使用 profile patch 启用它：

```yaml
- id: tool-simple-ralph
  disabled: false
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `subagentProvider` | `spawn` | worker 和评估器使用的全新 provider。 |
| `maxIterations` | `5` | 每次调用的默认及最大迭代次数，范围为 1 到 50。 |
| `maxHandoffChars` | `12000` | 每份子 agent 报告序列化后的最大字符数。 |
| `maxResultChars` | `16000` | 返回给调用模型的渲染结果最大字符数。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-simple-ralph)列出了所有接受的字段。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节 — 点击展开</summary>

一个固定的 workflow 脚本交替运行编码 worker 和独立评估器。两者都接收结构化报告 schema，每次交接都有大小上限。调用 agent 是所有子 agent 的 parent；取消信号会传给 workflow，工具返回前会完成资源释放。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 固定 workflow、报告检查、provider 选择、取消处理和工具注册。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [Workflow 包](../workflow/README.zh.md) — workflow 执行服务。
- [Workflow PTC 包](../workflow-ptc/README.zh.md) — 固定脚本执行 provider。
- [Subagent 包](../../subagent/subagent/README.zh.md) — 子 agent provider 契约。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-simple-ralph) — 模型可见的工具 schema。

-----

<a id="model-experience"></a>
## 模型体验

### Simple Ralph 指引

#### 模型看到的内容

插件会将以下指引追加到 system prompt：

##### 提示文本

```markdown
Use simple_ralph for coding objectives that should progress through fresh sequential workers. It automatically maintains .ralph/progress.md and runs an independent evaluator after each iteration. Do not substitute a completion claim for workspace evidence.
```

#### Token 影响

当插件挂载到 agent 的注册范围时，提示会追加一个固定段落。

#### KV Cache 影响

该段落会追加到 system prompt。修改此包拥有的文本会更改提示后缀；provider 的缓存可用性和淘汰策略不由此包控制。

### 工具 schema

#### 模型看到的内容

生成的 [`simple_ralph` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-simple-ralph)公开必填目标和可选迭代上限。Provider 选择与报告限制仍由部署配置控制。

#### Token 影响

接收已注册工具的 agent 会在请求中包含该工具 schema。

#### KV Cache 影响

相同工具注册下，schema 在调用之间保持稳定。修改 schema 会更改工具定义后缀。

## 已知限制和待办工作

<a id="known-limitations-and-deferred-work"></a>

- 每轮会启动两个 agent，因此配置的上限虽然限制工作量，仍可能产生较高的模型用量。
- worker 和评估器共享工作区；评估器不会撤销 worker 的修改。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景 — 点击展开</summary>

无。

</details>
