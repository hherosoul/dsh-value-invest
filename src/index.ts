import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.js'
import { briefTool } from './tools/brief.js'
import { scorecardTool } from './tools/scorecard.js'
import { valuationTool } from './tools/valuation.js'
import { marginTool } from './tools/margin.js'
import { complianceTool } from './tools/compliance.js'

export const name = 'value-invest'
export const inject = ['tools']

export { Config }

export function apply(ctx: Context, config: Config) {
  // inject 保证 ctx.tools 在 apply 执行时已就绪；
  // 五个注册都是副作用，插件卸载时由 fiber 自动注销，不需要手写清理。
  ctx.tools.register(briefTool(config))
  ctx.tools.register(scorecardTool(config))
  ctx.tools.register(valuationTool(config))
  ctx.tools.register(marginTool(config))
  ctx.tools.register(complianceTool(config))
}
