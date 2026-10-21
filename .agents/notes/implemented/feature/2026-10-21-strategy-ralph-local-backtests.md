# Agent Note: Local cryptocurrency strategy research

Status: implemented

English | [中文](2026-10-21-strategy-ralph-local-backtests.zh.md)

## Problem

Strategy comparisons can hide inconsistent assumptions, unsupported completion claims, or an accidental shift from historical analysis to future trading advice.

## Decision

`@deepseek-ai/dsh-tool-strategy-ralph` runs a fixed set of local-dataset strategy analyses through fresh analysts, independent evaluators, and a final reviewer. It accepts workspace-relative paths, records cost assumptions, and reports a historical comparison only when the selected reports and summary pass structured checks. The base bundle disables the tool by default. It has no exchange connection or trade execution.

## Alternatives considered

**Add strategy behavior to `tool-ralph`** — that would couple general coding iteration to one research domain. A separate tool keeps its schema, path rules, and research-only guidance scoped to deployments that enable it.

**Fetch market data or place trades from the tool** — remote data and trade execution would add external state and financial consequences to a local research task. The tool accepts only workspace paths and delegates no exchange operation.

## Consequences

Each selected strategy starts an analyst and evaluator, followed by one reviewer. The report limit bounds model handoffs, while the iteration limit bounds child-agent count. Results describe the supplied historical sample; users remain responsible for dataset quality and cannot infer future performance from the reported winner.
