---
description: "针对本地 OHLCV 数据集运行有界加密货币策略研究，并由独立评估器检查报告。通过本文选择或配置此研究工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-strategy-ralph

[English](README.md) | 中文

## 摘要

`strategy_ralph` 针对本地数据集比较一组固定的加密货币策略。全新 analyst 会生成报告，独立评估器会检查每份报告，最终 reviewer 会编写比较结果。工作流不会访问交易所或下单。结果描述的是一个历史样本，无法预测未来收益。

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

在 Cordis 组合中挂载此插件，即可向其中的 agent 提供 `strategy_ralph`。

### 适用场景

用于对工作区中已有的 OHLCV 数据集进行有界、可重复的研究。此工具不会获取市场数据或执行交易。analyst 和评估器使用其子 agent 已有的工具与访问权限。

### 最小配置

基础 bundle 默认禁用此工具。使用 profile patch 启用它：

```yaml
- id: tool-strategy-ralph
  disabled: false
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `subagentProvider` | `spawn` | analyst、评估器和 reviewer 使用的全新 provider。 |
| `maxIterations` | `10` | 每次调用的默认及最大策略数。 |
| `maxHandoffChars` | `10000` | 每份子 agent 报告序列化后的最大字符数。 |
| `maxResultChars` | `24000` | 返回给调用模型的渲染结果最大字符数。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-tool-strategy-ralph)列出了所有接受的字段。

模型会提供工作区相对数据集路径，并可选择固定策略的子集、交易成本假设和报告路径。路径必须位于工作区内。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节 — 点击展开</summary>

一个固定 workflow 会为每个选定策略运行 analyst 和评估器，然后启动一个全新的 reviewer。报告必须匹配分配的策略和路径；完成报告必须包含指标，且不得超过配置的交接上限。只有所有已选报告和最终比较都通过验证，结果才会标记为完成。

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 固定策略列表、报告检查、工作区相对路径检查、provider 选择和工具注册。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

- [Workflow 包](../workflow/README.zh.md) — workflow 执行服务。
- [Workflow PTC 包](../workflow-ptc/README.zh.md) — 固定脚本执行 provider。
- [Subagent 包](../../subagent/subagent/README.zh.md) — 子 agent provider 契约。
- [生成的工具目录](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-strategy-ralph) — 模型可见的工具 schema。

-----

<a id="model-experience"></a>
## 模型体验

### 策略研究指引

#### 模型看到的内容

插件会将以下指引追加到 system prompt：

##### 提示文本

```markdown
Use strategy_ralph for explicit cryptocurrency strategy research over a local dataset. It runs ten sequential fresh analysts, independent evaluators, and a final summary. It never places trades and its winner is historical for the supplied sample only.
```

#### Token 影响

当插件挂载到 agent 的注册范围时，提示会追加一个固定段落。

#### KV Cache 影响

该段落会追加到 system prompt。修改此包拥有的文本会更改提示后缀；provider 的缓存可用性和淘汰策略不由此包控制。

### 工具 schema

#### 模型看到的内容

生成的 [`strategy_ralph` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-strategy-ralph)公开本地数据集路径，以及可选的 symbol、策略上限、成本假设和报告路径。部署配置控制 provider 与交接大小上限。

#### Token 影响

接收已注册工具的 agent 会在请求中包含该工具 schema。

#### KV Cache 影响

相同工具注册下，schema 在调用之间保持稳定。修改 schema 会更改工具定义后缀。

## 已知限制和待办工作

<a id="known-limitations-and-deferred-work"></a>
此工具仅使用本地数据证据和有界报告。

- 此工具仅分析工作区已有数据，不会验证数据来源。
- 历史回测无法证明未来表现；此工具不会下单或推荐交易。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景 — 点击展开</summary>

无。

</details>
