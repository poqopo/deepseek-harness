---
description: "Run bounded cryptocurrency strategy research against a local OHLCV dataset with independent report checks. Use this page to choose or configure the research-only tool."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-strategy-ralph

English | [中文](README.zh.md)

## Summary

`strategy_ralph` compares a fixed set of cryptocurrency strategies against a local dataset. Fresh analysts produce reports, independent evaluators check each report, and a final reviewer writes a comparison. The workflow does not access an exchange or place trades. Its results describe one historical sample and do not predict future returns.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a Cordis composition to expose `strategy_ralph` to its agents.

### When to choose it

Use it for bounded, repeatable research over an OHLCV dataset already available in the workspace. It does not retrieve market data or execute trades. Analysts and evaluators use the tools and access already available to their child agents.

### Minimal configuration

The base bundle keeps this tool disabled by default. Enable it with a profile patch:

```yaml
- id: tool-strategy-ralph
  disabled: false
```

| Field | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | Fresh provider used by analysts, evaluators, and the reviewer. |
| `maxIterations` | `10` | Default and maximum strategy count for one call. |
| `maxHandoffChars` | `10000` | Maximum serialized characters in one child report. |
| `maxResultChars` | `24000` | Maximum rendered characters returned to the calling model. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-strategy-ralph) lists every accepted field.

The model supplies a workspace-relative dataset path and may choose a subset of the fixed strategies, transaction-cost assumptions, and report paths. Paths must remain inside the workspace.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One fixed workflow runs an analyst and evaluator for each selected strategy, then starts a fresh reviewer. Reports must match their assigned strategy and path, include metrics when complete, and remain within the configured handoff limit. A result is complete only when every selected report and the final comparison are verified.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Fixed strategy set, report checks, workspace-relative path checks, provider selection, and tool registration. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Workflow package](../workflow/README.md) — workflow execution service.
- [Workflow PTC package](../workflow-ptc/README.md) — fixed-script execution provider.
- [Subagent package](../../subagent/subagent/README.md) — child-agent provider contract.
- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-strategy-ralph) — model-visible tool schema.

-----

<a id="model-experience"></a>
## Model Experience

### Strategy research guidance

#### What the model sees

The plugin appends this guidance to the system prompt:

##### Prompt text

```markdown
Use strategy_ralph for explicit cryptocurrency strategy research over a local dataset. It runs ten sequential fresh analysts, independent evaluators, and a final summary. It never places trades and its winner is historical for the supplied sample only.
```

#### Token effect

The prompt adds one fixed paragraph when the plugin is mounted in an agent's registration scope.

#### KV Cache effect

The paragraph is appended to the system prompt. Changing this package-owned text changes the prompt suffix; provider cache availability and eviction remain outside this package.

### Tool schema

#### What the model sees

The generated [`strategy_ralph` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-strategy-ralph) exposes the local dataset path and optional symbol, strategy limit, cost assumptions, and report paths. The deployment controls the provider and handoff limits.

#### Token effect

The tool schema is included in requests for agents that receive the registered tool.

#### KV Cache effect

The schema remains stable between calls with the same tool registration. Changing the schema changes the tool-definition suffix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
One orienting sentence: only local dataset evidence and bounded reports are available to this tool.

- The tool analyzes only data already present in the workspace and does not validate its provenance.
- Historical backtests do not establish future performance; the tool does not place or recommend trades.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
