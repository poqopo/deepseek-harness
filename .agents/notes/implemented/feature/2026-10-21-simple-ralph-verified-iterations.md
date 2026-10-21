# Agent Note: Independently evaluated coding iterations

Status: implemented

English | [中文](2026-10-21-simple-ralph-verified-iterations.zh.md)

## Problem

Fresh-agent coding loops can return a completion report that has not been checked by another agent against the workspace.

## Decision

`@deepseek-ai/dsh-tool-simple-ralph` runs one fresh coding worker and one fresh evaluator per sequential iteration. The worker keeps `.ralph/progress.md` as shared durable state, while the evaluator inspects the workspace and decides whether work is complete, can continue, or is blocked. The tool is disabled in the base bundle until a profile patch enables it.

## Alternatives considered

**Add evaluation to `tool-ralph`** — that would change the existing tool's completion semantics and agent cost for every deployment. A separate tool lets users choose the evaluated loop explicitly.

**Use the model-authored `workflow` tool** — that gives the model control over the orchestration script. A fixed plugin-owned script keeps iteration order, report validation, and child count bounded.

## Consequences

Every iteration starts two child agents and shares one workspace between them. The evaluator can detect unsupported completion claims but does not revert worker edits. The configured iteration limit bounds the number of workers and evaluators.
