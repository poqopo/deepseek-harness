/** Model-facing local-dataset cryptocurrency strategy research workflow.
 * @module @deepseek-ai/dsh-tool-strategy-ralph
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { WorkflowResult, WorkflowRun } from '@deepseek-ai/dsh-workflow'
import type { SubagentProvider } from '@deepseek-ai/dsh-subagent'

/** Cordis plugin name. */
export const name = 'tool-strategy-ralph'
/** Services required by the plugin. */
export const inject = ['tools', 'workflowEngine', 'subagents', 'systemPrompt']

/** Deployment policy for bounded strategy research. */
export interface Config {
  /** Fresh structured-output provider used for analysts and evaluators. */
  subagentProvider?: string
  /** Default and maximum strategy count per call. */
  maxIterations?: number
  /** Maximum serialized size of one child report. */
  maxHandoffChars?: number
  /** Maximum rendered characters returned to the calling model. */
  maxResultChars?: number
}

/** Schemastery schema for strategy research policy. */
export const Config: z<Config> = z.object({
  subagentProvider: z.string().default('spawn'),
  maxIterations: z.number().step(1).min(1).max(10).default(10),
  maxHandoffChars: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10_000),
  maxResultChars: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(24_000),
})

const STRATEGIES = [
  'Buy and hold baseline',
  'SMA crossover',
  'EMA crossover',
  'RSI mean reversion',
  'Bollinger Bands mean reversion',
  'Donchian breakout',
  'Momentum with volatility filter',
  'MACD crossover',
  'Grid trading simulation',
  'Ensemble strategy combining the strongest signals',
] as const

interface ResolvedConfig {
  readonly subagentProvider: string
  readonly maxIterations: number
  readonly maxHandoffChars: number
  readonly maxResultChars: number
}

type Status = 'complete' | 'blocked'
interface Report {
  strategy: string
  status: Status
  summary: string
  metrics: string[]
  assumptions: string[]
  limitations: string[]
  reportPath: string
  blocker: string
}
interface Summary {
  summaryPath: string
  winner: string
  comparison: string
  caveats: string[]
  verified: boolean
}
interface RunValue {
  status: 'complete' | 'blocked' | 'failed'
  iterations: number
  reports: Report[]
  summary?: Summary
}

const META = {
  name: 'strategy-ralph',
  description: 'Ten sequential fresh-agent strategy backtests with per-iteration reports and an overall summary.',
  phases: [
    { title: 'Strategy backtests', detail: 'One fresh analyst and one fresh evaluator for each strategy.' },
    { title: 'Strategy summary', detail: 'A fresh reviewer compares the verified reports.' },
  ],
}

const SCRIPT = String.raw`
const strategies = ${JSON.stringify(STRATEGIES)}
const reportSchema = {
  type: 'object',
  properties: {
    strategy: { type: 'string' },
    status: { type: 'string', enum: ['complete', 'blocked'] },
    summary: { type: 'string' },
    metrics: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
    reportPath: { type: 'string' },
    blocker: { type: 'string' },
  },
  required: ['strategy', 'status', 'summary', 'metrics', 'assumptions', 'limitations', 'reportPath', 'blocker'],
  additionalProperties: false,
}
const summarySchema = {
  type: 'object',
  properties: {
    summaryPath: { type: 'string' },
    winner: { type: 'string' },
    comparison: { type: 'string' },
    caveats: { type: 'array', items: { type: 'string' } },
    verified: { type: 'boolean' },
  },
  required: ['summaryPath', 'winner', 'comparison', 'caveats', 'verified'],
  additionalProperties: false,
}
function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() }
function list(value) { return Array.isArray(value) && value.every(text) }
function report(value, expectedStrategy, expectedPath) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('strategy analyst returned no report')
  if (
    !text(value.strategy)
    || !text(value.summary)
    || !list(value.metrics)
    || !list(value.assumptions)
    || !list(value.limitations)
    || !text(value.reportPath)
    || typeof value.blocker !== 'string'
    || value.blocker !== value.blocker.trim()
  ) throw new Error('strategy analyst returned a malformed report')
  if (value.strategy !== expectedStrategy || value.reportPath !== expectedPath) {
    throw new Error('strategy analyst returned a report for a different strategy or path')
  }
  if (value.status === 'complete' && (
    value.blocker !== ''
    || value.metrics.length === 0
    || value.assumptions.length === 0
    || value.limitations.length === 0
  )) throw new Error('complete strategy report needs metrics, assumptions, limitations, and no blocker')
  if (value.status === 'blocked' && !text(value.blocker)) throw new Error('blocked strategy report requires a concrete blocker')
  if (value.status !== 'complete' && value.status !== 'blocked') throw new Error('strategy report status is invalid')
  if (JSON.stringify(value).length > args.maxHandoffChars) throw new Error('strategy report exceeds maxHandoffChars')
  return value
}
function summary(value) {
  if (
    !value
    || typeof value !== 'object'
    || !text(value.summaryPath)
    || !text(value.winner)
    || !text(value.comparison)
    || !list(value.caveats)
    || typeof value.verified !== 'boolean'
  ) throw new Error('summary reviewer returned a malformed result')
  if (value.summaryPath !== args.summaryPath) throw new Error('summary reviewer returned a different summary path')
  if (value.verified && !strategies.includes(value.winner)) throw new Error('verified summary winner is not in the fixed strategy set')
  if (JSON.stringify(value).length > args.maxHandoffChars) throw new Error('strategy summary exceeds maxHandoffChars')
  return value
}
const reports = []
phase('Strategy backtests')
for (let i = 0; i < Math.min(args.maxIterations, strategies.length); i += 1) {
  const strategy = strategies[i]
  const prior = JSON.stringify(reports.slice(-2)).slice(0, args.maxHandoffChars)
  const worker = await agent([
    'You are a fresh strategy backtest analyst. You have no parent conversation.',
    'Objective: compare cryptocurrency strategies on one local dataset and write research-only reports.',
    'Do not trade or access an exchange.',
    'Dataset: ' + args.datasetPath + '; symbol: ' + args.symbol + '; assigned strategy: ' + strategy + '.',
    'Fee per side: ' + args.feePerSide + '; adverse slippage per side: ' + args.slippagePerSide + '.',
    'Read the dataset and metadata before acting. Use only local files.',
    'Define signals with data available before execution and avoid look-ahead bias.',
    'State fee and slippage assumptions. Implement a reproducible local backtest using available tools.',
    'Write a Markdown report to ' + args.reportDir + '/iteration-' + (i + 1) + '.md.',
    'Include strategy definition, timing, metrics, trades, exposure, assumptions, limitations, and a research-only conclusion.',
    'Update .ralph/progress.md with objective, criteria, completed work, remaining work, test results, and blockers.',
    'Recent bounded reports from previous iterations: ' + prior,
    'Return complete only after verifying the report file and deterministic backtest output. Use blocked only for a concrete blocker.',
  ].join('\n\n'), { label: 'Strategy analyst ' + (i + 1), phase: 'Strategy backtests', schema: reportSchema })
  if (worker === null) {
    reports.push({
      strategy,
      status: 'blocked',
      summary: 'Analyst failed to return a structured report.',
      metrics: [],
      assumptions: [],
      limitations: ['No structured result was returned.'],
      reportPath: args.reportDir + '/iteration-' + (i + 1) + '.md',
      blocker: 'fresh analyst failure',
    })
    continue
  }
  const reportPath = args.reportDir + '/iteration-' + (i + 1) + '.md'
  const workerReport = report(worker, strategy, reportPath)
  const evaluator = await agent([
    'You are a fresh independent evaluator. You have no parent conversation.',
    'Inspect the local dataset, report file, and any backtest script. Do not trust the analyst claim alone.',
    'Expected strategy: ' + strategy + '. Expected report path: ' + args.reportDir + '/iteration-' + (i + 1) + '.md.',
    'Check look-ahead bias, explicit costs, reproducible metrics, and limitations. Do not edit files.',
    'Return the same schema and preserve the strategy and report path. Mark blocked only for a concrete verification failure.',
    'Analyst report: ' + JSON.stringify(workerReport),
  ].join('\n\n'), { label: 'Strategy evaluator ' + (i + 1), phase: 'Strategy backtests', schema: reportSchema })
  if (evaluator === null) {
    reports.push({ ...workerReport, status: 'blocked', blocker: 'independent evaluator failure' })
  } else {
    reports.push(report(evaluator, strategy, reportPath))
  }
}
phase('Strategy summary')
const final = await agent([
  'You are a fresh independent research reviewer. Do not trust prior agent claims.',
  'Read the local dataset, metadata, .ralph/progress.md, and every report under ' + args.reportDir + '.',
  'Verify that every selected strategy has a report.',
  'Compare net return after stated costs, drawdown, trade count, and exposure.',
  'Use risk-adjusted metrics only when a common return series exists. Never invent missing statistics.',
  'Select a historical winner for this sample only, not a future recommendation.',
  'Write ' + args.summaryPath + ' with an executive summary, comparison table, winner, runner-ups, assumptions, and limitations.',
  'Include an explicit research-only/no-trading disclaimer and update .ralph/progress.md with final checks.',
  'Return a structured summary with verified=true only if the files and comparison are actually verified.',
].join('\n\n'), { label: 'Strategy summary reviewer', phase: 'Strategy summary', schema: summarySchema })
if (final === null) return { status: 'failed', iterations: reports.length, reports }
const finalSummary = summary(final)
const expectedReports = Math.min(args.maxIterations, strategies.length)
const verifiedReports = reports.length === expectedReports && reports.every(item => item.status === 'complete')
return {
  status: finalSummary.verified && verifiedReports ? 'complete' : 'blocked',
  iterations: reports.length,
  reports,
  summary: finalSummary,
}
`

/** Require a fresh provider that supports structured reports.
 * @param ctx - Cordis context that owns subagent providers.
 * @param name - Configured provider name.
 * @returns The registered provider.
 */
function provider(ctx: Context, name: string): SubagentProvider {
  const value = ctx.subagents.getProvider(name)
  if (value === undefined) throw new Error(`Strategy Ralph provider "${name}" is not registered`)
  if (value.inheritsParentContext || !value.capabilities.outputSchema) {
    throw new Error(`Strategy Ralph provider "${name}" must be fresh and support structured output`)
  }
  return value
}
/** Convert unsuccessful workflow completion to a tool error.
 * @param result - Settled workflow result.
 * @returns Error text, or undefined when the workflow completed normally.
 */
function stopError(result: WorkflowResult): string | undefined {
  if (result.stopReason === 'completed') return undefined
  const detail = result.error === undefined ? '' : `: ${result.error}`
  return `Strategy Ralph workflow ${result.stopReason}${detail}`
}
/** Render a bounded parent-facing result.
 * @param value - Settled strategy research result.
 * @param max - Maximum output character count.
 * @returns Result text within the configured limit.
 */
function render(value: RunValue, max: number): string {
  const text = `Strategy Ralph finished with status ${value.status} after ${value.iterations} iterations.\n`
    + JSON.stringify(value, null, 2)
  const marker = '\n… [truncated]'
  return text.length <= max ? text : max <= marker.length ? text.slice(0, max) : `${text.slice(0, max - marker.length)}${marker}`
}
/** Present a pending Strategy Ralph call.
 * @param args - Tool arguments.
 * @returns Generic pending-call card data.
 */
function presentCall(args: { datasetPath: string }): ToolCallView {
  return { card: 'generic', title: 'strategy-ralph', rawInput: args.datasetPath }
}
/** Present a settled Strategy Ralph call.
 * @param _args - Tool arguments, unused by the generic result card.
 * @param _result - Tool result, rendered by the tool output formatter.
 * @returns Generic result-card data.
 */
function presentResult(_args: unknown, _result: { content: unknown[]; isError: boolean }): ToolResultView { return { card: 'generic' } }

/** Resolve and validate deployment policy before registering the tool.
 * @param config - Loader-provided deployment configuration.
 * @returns Complete values used by the tool registration.
 */
function resolveConfig(config: Config): ResolvedConfig {
  const value: ResolvedConfig = {
    subagentProvider: config.subagentProvider ?? 'spawn',
    maxIterations: config.maxIterations ?? 10,
    maxHandoffChars: config.maxHandoffChars ?? 10_000,
    maxResultChars: config.maxResultChars ?? 24_000,
  }
  if (value.subagentProvider.length === 0 || value.subagentProvider !== value.subagentProvider.trim()) {
    throw new TypeError('subagentProvider must be a non-empty normalized string')
  }
  const limits = [
    ['maxIterations', value.maxIterations],
    ['maxHandoffChars', value.maxHandoffChars],
    ['maxResultChars', value.maxResultChars],
  ] as const
  for (const [name, limit] of limits) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError(`${name} must be a positive safe integer`)
  }
  if (value.maxIterations > STRATEGIES.length) throw new TypeError(`maxIterations must be no greater than ${STRATEGIES.length}`)
  return value
}

/** Require one normalized path inside the calling workspace.
 * @param value - Model-supplied workspace-relative path.
 * @param name - Field name used in the diagnostic.
 * @returns Normalized slash-separated relative path.
 */
function workspacePath(value: string, name: string): string {
  const normalized = value.trim().replaceAll('\\', '/')
  if (normalized.length === 0 || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new TypeError(`${name} must be a non-empty workspace-relative path`)
  }
  const segments = normalized.split('/').filter(segment => segment.length > 0 && segment !== '.')
  if (segments.length === 0 || segments.includes('..')) {
    throw new TypeError(`${name} must stay within the workspace`)
  }
  return segments.join('/')
}

/** Register bounded, research-only strategy analysis.
 * @param ctx - Cordis context receiving tool and prompt registrations.
 * @param config - Deployment policy, normalized by the Loader.
 * @returns Nothing.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  const { maxIterations: ceiling, subagentProvider: route, maxHandoffChars, maxResultChars } = resolved
  ctx.systemPrompt.section({
    name: 'tool:strategy-ralph',
    order: ctx.systemPrompt.getSectionOrder('TOOL_RALPH'),
    text: [
      'Use strategy_ralph for explicit cryptocurrency strategy research over a local dataset.',
      'It runs ten sequential fresh analysts, independent evaluators, and a final summary.',
      'It never places trades and its winner is historical for the supplied sample only.',
    ].join(' '),
  })
  ctx.tools.register(defineTool({
    name: 'strategy_ralph',
    description: [
      'Run ten sequential fresh-agent backtests over a local BTC/crypto dataset.',
      'Produces one verified report per strategy and an overall summary.',
      'Research only; no trade execution.',
    ].join(' '),
    parameters: {
      datasetPath: { type: 'string', required: true, description: 'Workspace-relative path to a local OHLCV JSON dataset.' },
      symbol: { type: 'string', description: 'Asset symbol, for example BTCUSDT.' },
      maxIterations: {
        type: 'number',
        description: `Number of strategies to run, from 1 through ${ceiling}; use 10 for the complete set.`,
      },
      feePerSide: { type: 'number', description: 'Fee assumption passed to analysts, as a decimal fraction.' },
      slippagePerSide: { type: 'number', description: 'Adverse slippage assumption passed to analysts, as a decimal fraction.' },
      reportDir: { type: 'string', description: 'Workspace-relative report directory.' },
      summaryPath: { type: 'string', description: 'Workspace-relative summary Markdown path.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          runId: { type: 'string', required: true },
          agentsStarted: { type: 'integer', required: true },
          result: { type: 'json', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: render(value.result as unknown as RunValue, maxResultChars),
      }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('strategy_ralph requires a calling agent')
      const datasetPath = workspacePath(args.datasetPath, 'datasetPath')
      const maxIterations = args.maxIterations ?? ceiling
      if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > ceiling) {
        throw new TypeError(`maxIterations must be a positive integer no greater than ${ceiling}`)
      }
      const reportDir = workspacePath(args.reportDir ?? '.ralph/strategy-research/reports', 'reportDir')
      const summaryPath = workspacePath(args.summaryPath ?? '.ralph/strategy-research/summary.md', 'summaryPath')
      const symbol = (args.symbol ?? 'BTCUSDT').trim()
      const feePerSide = args.feePerSide ?? 0.001
      const slippagePerSide = args.slippagePerSide ?? 0.0005
      if (symbol.length === 0 || symbol !== symbol.trim()) throw new TypeError('symbol must be a non-empty normalized string')
      const validFee = Number.isFinite(feePerSide) && feePerSide >= 0 && feePerSide <= 1
      const validSlippage = Number.isFinite(slippagePerSide) && slippagePerSide >= 0 && slippagePerSide <= 1
      if (!validFee || !validSlippage) {
        throw new TypeError('fee and slippage must be finite fractions from 0 through 1')
      }
      provider(ctx, route)
      const run: WorkflowRun = ctx.workflowEngine.start({
        script: SCRIPT,
        meta: META,
        args: {
          datasetPath,
          symbol,
          maxIterations,
          feePerSide,
          slippagePerSide,
          reportDir,
          summaryPath,
          maxHandoffChars,
        },
        subagentProvider: route,
        maxTotalAgents: maxIterations * 2 + 1,
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
