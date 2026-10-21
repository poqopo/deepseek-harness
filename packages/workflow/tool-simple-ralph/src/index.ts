/** Model-facing loop with fresh coding workers and independent evaluation.
 * @module @deepseek-ai/dsh-tool-simple-ralph
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { WorkflowResult, WorkflowRun } from '@deepseek-ai/dsh-workflow'
import type { SubagentProvider } from '@deepseek-ai/dsh-subagent'

/** Cordis plugin name. */
export const name = 'tool-simple-ralph'
/** Services required by the plugin. */
export const inject = ['tools', 'workflowEngine', 'subagents', 'systemPrompt']

/** Deployment policy for Simple Ralph runs. */
export interface Config {
  /** Fresh structured-output provider for workers and evaluators. */
  subagentProvider?: string
  /** Default and maximum iteration count for one run. */
  maxIterations?: number
  /** Maximum serialized size of one worker or evaluator report. */
  maxHandoffChars?: number
  /** Maximum rendered characters returned to the calling model. */
  maxResultChars?: number
}

/** Schemastery schema for Simple Ralph deployment policy. */
export const Config: z<Config> = z.object({
  subagentProvider: z.string().default('spawn'),
  maxIterations: z.number().step(1).min(1).max(50).default(5),
  maxHandoffChars: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(12_000),
  maxResultChars: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16_000),
})

interface ResolvedConfig {
  readonly subagentProvider: string
  readonly maxIterations: number
  readonly maxHandoffChars: number
  readonly maxResultChars: number
}

type Status = 'complete' | 'continue' | 'blocked'
interface Report { status: Status; summary: string; evidence: string[]; remaining: string[]; blocker: string }
interface RunValue { status: Status | 'limit' | 'failed'; iterations: number; worker?: Report; evaluator?: Report }

const META = {
  name: 'simple-ralph',
  description: 'Sequential fresh-agent coding iterations with durable workspace progress and independent evaluation.',
  phases: [{ title: 'Simple Ralph iterations', detail: 'One worker and one evaluator per sequential iteration.' }],
}

const SCRIPT = String.raw`
const reportSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['continue', 'complete', 'blocked'] },
    summary: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    remaining: { type: 'array', items: { type: 'string' } },
    blocker: { type: 'string' },
  },
  required: ['status', 'summary', 'evidence', 'remaining', 'blocker'],
  additionalProperties: false,
}
function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() }
function list(value) { return Array.isArray(value) && value.every(text) }
function valid(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Simple Ralph child returned no report')
  if (!text(report.summary) || !list(report.evidence) || !list(report.remaining) || typeof report.blocker !== 'string' || report.blocker !== report.blocker.trim()) throw new Error('Simple Ralph child returned an invalid report')
  if (report.status === 'complete' && (report.evidence.length === 0 || report.remaining.length !== 0 || report.blocker !== '')) throw new Error('completion requires evidence and no remaining work')
  if (report.status === 'continue' && (report.remaining.length === 0 || report.blocker !== '')) throw new Error('continuation requires remaining work and no blocker')
  if (report.status === 'blocked' && !text(report.blocker)) throw new Error('blocked status requires a concrete blocker')
  if (!['complete', 'continue', 'blocked'].includes(report.status)) throw new Error('status must be complete, continue, or blocked')
  if (JSON.stringify(report).length > args.maxHandoffChars) throw new Error('Simple Ralph report exceeds maxHandoffChars')
  if (!['complete', 'continue', 'blocked'].includes(report.status)) throw new Error('status must be complete, continue, or blocked')
  if (JSON.stringify(report).length > args.maxHandoffChars) throw new Error('Simple Ralph report exceeds maxHandoffChars')
  return report
}
let last = null
phase('Simple Ralph iterations')
for (let iteration = 1; iteration <= args.maxIterations; iteration += 1) {
  const prior = last === null ? '(none: initialize progress.md)' : JSON.stringify(last)
  const worker = await agent([
    'You are a fresh Simple Ralph coding worker. You have no parent conversation.',
    'Immutable original objective:\n' + args.objective,
    'Iteration ' + iteration + ' of ' + args.maxIterations + '.',
    'Read and maintain .ralph/progress.md as durable state. It must contain the original objective, completion criteria, completed work, remaining work, latest test results, and current blockers. Inspect the actual workspace before acting. Make concrete edits, run relevant tests, and update progress.md. Do not rely on claims from the previous handoff.',
    'Previous bounded handoff:\n' + prior,
    'Return one structured report. Mark complete only when criteria are verified by workspace/test evidence. Mark blocked only when meaningful progress requires human input or external state.',
  ].join('\n\n'), { label: 'Simple Ralph worker ' + iteration, phase: 'Simple Ralph iterations', schema: reportSchema })
  if (worker === null) return { status: 'failed', iterations: iteration }
  const workerReport = valid(worker)
  const evaluator = await agent([
    'You are a fresh independent evaluator. You have no parent conversation.',
    'Immutable original objective:\n' + args.objective,
    'Evaluate iteration ' + iteration + ' from the actual workspace, not from the worker claim. Read .ralph/progress.md, inspect changed files, and run a focused verification when practical.',
    'Worker report:\n' + JSON.stringify(workerReport),
    'Return complete only with concrete evidence that every criterion is satisfied. Return continue when more work is possible. Return blocked only for a concrete blocker. Do not edit the workspace.',
  ].join('\n\n'), { label: 'Simple Ralph evaluator ' + iteration, phase: 'Simple Ralph iterations', schema: reportSchema })
  if (evaluator === null) return { status: 'failed', iterations: iteration, worker: workerReport }
  const evaluatorReport = valid(evaluator)
  if (evaluatorReport.status === 'complete' || evaluatorReport.status === 'blocked') return { status: evaluatorReport.status, iterations: iteration, worker: workerReport, evaluator: evaluatorReport }
  last = evaluatorReport
}
return { status: 'limit', iterations: args.maxIterations, evaluator: last }
`

/** Resolve a model-selected limit against the deployment ceiling.
 * @param value - Optional per-call iteration limit.
 * @param ceiling - Configured maximum iteration limit.
 * @returns The effective iteration limit.
 */
function resolveMax(value: number | undefined, ceiling: number): number {
  const result = value ?? ceiling
  if (!Number.isSafeInteger(result) || result < 1 || result > ceiling) throw new TypeError(`maxIterations must be a positive integer no greater than ${ceiling}`)
  return result
}

/** Resolve and validate deployment defaults before registering the tool.
 * @param config - Loader-provided deployment configuration.
 * @returns Complete values used by the tool registration.
 */
function resolveConfig(config: Config): ResolvedConfig {
  const value: ResolvedConfig = {
    subagentProvider: config.subagentProvider ?? 'spawn',
    maxIterations: config.maxIterations ?? 5,
    maxHandoffChars: config.maxHandoffChars ?? 12_000,
    maxResultChars: config.maxResultChars ?? 16_000,
  }
  if (value.subagentProvider.length === 0 || value.subagentProvider !== value.subagentProvider.trim()) {
    throw new TypeError('subagentProvider must be a non-empty normalized string')
  }
  for (const [name, limit] of [['maxIterations', value.maxIterations], ['maxHandoffChars', value.maxHandoffChars], ['maxResultChars', value.maxResultChars]] as const) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError(`${name} must be a positive safe integer`)
  }
  if (value.maxIterations > 50) throw new TypeError('maxIterations must be no greater than 50')
  return value
}
/** Require a fresh provider that supports structured reports.
 * @param ctx - Cordis context that owns subagent providers.
 * @param name - Configured provider name.
 * @returns The registered provider.
 */
function provider(ctx: Context, name: string): SubagentProvider {
  const value = ctx.subagents.getProvider(name)
  if (value === undefined) throw new Error(`Simple Ralph provider "${name}" is not registered`)
  if (value.inheritsParentContext || !value.capabilities.outputSchema) throw new Error(`Simple Ralph provider "${name}" must be fresh and support structured output`)
  return value
}
/** Convert unsuccessful workflow completion to a tool error.
 * @param result - Settled workflow result.
 * @returns Error text, or undefined when the workflow completed normally.
 */
function stopError(result: WorkflowResult): string | undefined {
  if (result.stopReason === 'completed') return undefined
  return `Simple Ralph workflow ${result.stopReason}${result.error === undefined ? '' : `: ${result.error}`}`
}
/** Render a bounded parent-facing result.
 * @param value - Settled Simple Ralph result.
 * @param max - Maximum output character count.
 * @returns Result text within the configured limit.
 */
function render(value: RunValue, max: number): string {
  const text = `Simple Ralph finished with status ${value.status} after ${value.iterations} iteration${value.iterations === 1 ? '' : 's'}.\n${JSON.stringify(value, null, 2)}`
  const marker = '\n… [truncated]'
  return text.length <= max ? text : max <= marker.length ? text.slice(0, max) : `${text.slice(0, max - marker.length)}${marker}`
}
/** Present a pending Simple Ralph call.
 * @param args - Tool arguments.
 * @returns Generic pending-call card data.
 */
function presentCall(args: { objective: string }): ToolCallView { return { card: 'generic', title: 'simple-ralph', rawInput: args.objective } }
/** Present a settled Simple Ralph call.
 * @param _args - Tool arguments, unused by the generic result card.
 * @param _result - Tool result, rendered by the tool output formatter.
 * @returns Generic result-card data.
 */
function presentResult(_args: unknown, _result: { content: unknown[]; isError: boolean }): ToolResultView { return { card: 'generic' } }

/** Register the bounded fresh-worker Simple Ralph tool.
 * @param ctx - Cordis context receiving tool and prompt registrations.
 * @param config - Deployment policy, normalized by the Loader.
 * @returns Nothing.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const { maxIterations: ceiling, maxHandoffChars, maxResultChars, subagentProvider: route } = resolved
  ctx.systemPrompt.section({
    name: 'tool:simple-ralph',
    order: ctx.systemPrompt.getSectionOrder('TOOL_RALPH'),
    text: 'Use simple_ralph for coding objectives that should progress through fresh sequential workers. It automatically maintains .ralph/progress.md and runs an independent evaluator after each iteration. Do not substitute a completion claim for workspace evidence.',
  })
  ctx.tools.register(defineTool({
    name: 'simple_ralph',
    description: 'Run a bounded autonomous coding loop. Each iteration uses a fresh worker, shared workspace progress.md, and an independent evaluator. Stops on verified completion, a concrete blocker, or the configured iteration limit.',
    parameters: {
      objective: { type: 'string', required: true, description: 'Immutable coding objective and completion target.' },
      maxIterations: { type: 'number', description: `Optional limit from 1 through ${ceiling}.` },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: { runId: { type: 'string', required: true }, agentsStarted: { type: 'integer', required: true }, result: { type: 'json', required: true } } }, render: (_args, value) => [{ type: 'text', text: render(value.result as unknown as RunValue, maxResultChars) }] },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('simple_ralph requires a calling agent')
      const objective = args.objective.trim()
      if (objective.length === 0) throw new Error('objective must be non-empty')
      const maxIterations = resolveMax(args.maxIterations, ceiling)
      provider(ctx, route)
      const run: WorkflowRun = ctx.workflowEngine.start({
        script: SCRIPT,
        meta: META,
        args: { objective, maxIterations, maxHandoffChars },
        subagentProvider: route,
        maxTotalAgents: maxIterations * 2,
        parent: exec.agent,
        signal: exec.signal,
      })
      const cancel = () => { run.cancel('parent step aborted') }
      exec.signal.addEventListener('abort', cancel, { once: true })
      if (exec.signal.aborted) run.cancel('parent step aborted')
      try {
        const settled = await run.result
        const error = stopError(settled)
        if (error !== undefined) throw new Error(error)
        return { runId: run.id, agentsStarted: settled.agentsStarted, result: settled.value as unknown as JsonValue }
      } finally {
        exec.signal.removeEventListener('abort', cancel)
        await run.dispose()
      }
    },
    presentCall,
    presentResult,
  }))
}
