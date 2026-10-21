---
description: "Run bounded coding iterations with fresh workers, durable workspace progress, and independent evaluation. Use this page to choose or configure the Simple Ralph tool."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-simple-ralph

English | [中文](README.zh.md)

## Summary

`simple_ralph` advances one coding objective through fresh workers and an independent evaluator. Each worker updates `.ralph/progress.md`, and the evaluator checks the workspace before the loop continues or reports completion. The tool stops at a configured iteration limit or a concrete blocker. Each iteration starts two child agents, so choose a small limit when model cost matters.

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

Mount the plugin in a Cordis composition to expose `simple_ralph` to its agents.

### When to choose it

Use it when a coding task benefits from repeated fresh workers and a separate evaluator. For a single bounded delegation, use subagents; for a fresh worker loop without independent evaluation, use [`tool-ralph`](../tool-ralph/README.md).

### Minimal configuration

The base bundle keeps this tool disabled by default. Enable it with a profile patch:

```yaml
- id: tool-simple-ralph
  disabled: false
```

| Field | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | Fresh provider used for workers and evaluators. |
| `maxIterations` | `5` | Default and maximum iterations for one call, from 1 through 50. |
| `maxHandoffChars` | `12000` | Maximum serialized characters in each child report. |
| `maxResultChars` | `16000` | Maximum rendered characters returned to the calling model. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-tool-simple-ralph) lists every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One fixed workflow script alternates a coding worker and an independent evaluator. Both receive structured report schemas, and each handoff is size-limited. The calling agent remains the parent of every child; cancellation is forwarded to the workflow and disposal completes before the tool returns.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Fixed workflow, report checks, provider selection, cancellation, and tool registration. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Workflow package](../workflow/README.md) — workflow execution service.
- [Workflow PTC package](../workflow-ptc/README.md) — fixed-script execution provider.
- [Subagent package](../../subagent/subagent/README.md) — child-agent provider contract.
- [Generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-simple-ralph) — model-visible tool schema.

-----

<a id="model-experience"></a>
## Model Experience

### Simple Ralph guidance

#### What the model sees

The plugin appends this guidance to the system prompt:

##### Prompt text

```markdown
Use simple_ralph for coding objectives that should progress through fresh sequential workers. It automatically maintains .ralph/progress.md and runs an independent evaluator after each iteration. Do not substitute a completion claim for workspace evidence.
```

#### Token effect

The prompt adds one fixed paragraph when the plugin is mounted in an agent's registration scope.

#### KV Cache effect

The paragraph is appended to the system prompt. Changing this package-owned text changes the prompt suffix; provider cache availability and eviction remain outside this package.

### Tool schema

#### What the model sees

The generated [`simple_ralph` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-simple-ralph) exposes a required objective and optional iteration limit. Provider selection and report limits remain deployment configuration.

#### Token effect

The tool schema is included in requests for agents that receive the registered tool.

#### KV Cache effect

The schema remains stable between calls with the same tool registration. Changing the schema changes the tool-definition suffix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Each iteration starts two agents, so the configured limit bounds work but can still incur substantial model usage.
- Workers and evaluators share the workspace; the evaluator does not undo worker changes.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
