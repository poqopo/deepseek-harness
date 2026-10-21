# Agent Note: 独立评估的编码迭代

Status: implemented

[English](2026-10-21-simple-ralph-verified-iterations.md) | 中文

## 问题

全新 agent 编码循环可能会返回完成报告，但没有其他 agent 根据工作区检查过该报告。

## 决策

`@deepseek-ai/dsh-tool-simple-ralph` 在每轮顺序迭代中运行一个全新的编码 worker 和一个全新的评估器。worker 将 `.ralph/progress.md` 作为共享持久状态维护，评估器检查工作区并判断工作是否完成、可以继续或受到阻塞。基础 bundle 默认禁用此工具，直到 profile patch 启用它。

## 考虑过的替代方案

**在 `tool-ralph` 中加入评估** — 这会改变现有工具的完成语义，并增加每个部署的 agent 成本。单独提供工具可以让用户明确选择经过评估的循环。

**使用由模型编写的 `workflow` 工具** — 这会让模型控制编排脚本。由插件拥有的固定脚本可约束迭代顺序、报告验证和子 agent 数量。

## 后果

每轮会启动两个子 agent，并让它们共享一个工作区。评估器可以发现缺乏依据的完成声明，但不会撤销 worker 的修改。配置的迭代上限会限制 worker 和评估器的总数量。
