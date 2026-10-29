import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.js'
import { money, pct } from '../lib/format.js'
import { valueCompany } from '../lib/valuation.js'

const PERSONA =
  '价值投资分析（巴菲特/芒格框架）。算的是内在价值区间，不是价格预测；不给目标价、不给买卖结论。'

const LABEL_ZH: Record<string, string> = {
  conservative: '保守',
  base: '中性',
  optimistic: '乐观',
}

export function valuationTool(config: Config) {
  return defineTool({
    name: 'vi_intrinsic_value',
    description: `${PERSONA} 用 owner earnings（股东盈余＝经营现金流 − 维持性资本开支）做三情景折现，输出内在价值区间。增速/折现率/永续增长率一律用百分数。折现率与永续增长默认取插件配置，可显式覆盖。owner earnings 不为正时模型不成立，会直接说明而不硬算。交付时只讲区间与假设，不讲「值多少钱所以可以买」。`,
    parameters: {
      ownerEarnings: {
        type: 'number',
        required: true,
        description: '最近一年 owner earnings（股东盈余），单位与 unit 一致。必须是正数，否则模型不成立。',
      },
      growth: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: '三情景的显式期 owner earnings 年增速（%），必须满足 保守 ≤ 中性 ≤ 乐观。',
        properties: {
          conservative: { type: 'number', required: true, description: '保守情景年增速（%）。' },
          base: { type: 'number', required: true, description: '中性情景年增速（%）。' },
          optimistic: { type: 'number', required: true, description: '乐观情景年增速（%）。' },
        },
      },
      netDebt: { type: 'number', description: '净债务（有息负债 − 现金）。净现金填负数。默认 0。' },
      sharesOutstanding: { type: 'number', description: '总股本（股）。给了才输出每股数。' },
      discountRate: { type: 'number', description: '折现率（%），覆盖插件配置。' },
      terminalGrowth: { type: 'number', description: '永续增长率（%），覆盖插件配置，必须小于折现率。' },
      years: { type: 'integer', description: '显式预测年数，覆盖插件配置。' },
      unit: { type: 'string', description: '金额单位，例如「亿元」「百万美元」。仅用于回显，不做换算。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unit: { type: 'string' },
          ownerEarnings: { type: 'number' },
          netDebt: { type: 'number' },
          sharesOutstanding: { oneOf: [{ type: 'number' }, { type: 'null' }] },
          discountRate: { type: 'number' },
          terminalGrowth: { type: 'number' },
          years: { type: 'number' },
          valued: { type: 'boolean' },
          scenarios: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                growthInput: { type: 'number' },
                growthApplied: { type: 'number' },
                pvExplicit: { type: 'number' },
                pvTerminal: { type: 'number' },
                enterpriseValue: { type: 'number' },
                equityValue: { type: 'number' },
                perShare: { oneOf: [{ type: 'number' }, { type: 'null' }] },
                terminalShare: { type: 'number' },
                warnings: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          band: {
            type: 'object',
            additionalProperties: false,
            properties: {
              low: { type: 'number' },
              mid: { type: 'number' },
              high: { type: 'number' },
              width: { type: 'number' },
            },
          },
          warnings: { type: 'array', items: { type: 'string' } },
          caveats: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => {
        const unit = value.unit ?? ''
        const assumptionsWarnings = value.warnings ?? []
        const scenarios = value.scenarios ?? []
        const lines: string[] = []
        lines.push(
          `**内在价值区间（owner earnings 折现）**　基数 ${money(value.ownerEarnings ?? 0, unit)}　折现率 ${pct(value.discountRate ?? 0)}　永续 ${pct(value.terminalGrowth ?? 0)}　${value.years ?? 0} 年`,
          '',
        )
        if (!value.valued) {
          for (const item of assumptionsWarnings) lines.push(`- ${item}`)
          return [{ type: 'text', text: lines.join('\n') }]
        }
        const bandLow = value.band?.low ?? 0
        const bandMid = value.band?.mid ?? 0
        const bandHigh = value.band?.high ?? 0
        lines.push(
          `- 保守 ${money(bandLow, unit)}　中性 ${money(bandMid, unit)}　乐观 ${money(bandHigh, unit)}`,
        )
        if (typeof value.sharesOutstanding === 'number') {
          const pes = scenarios
            .map((item) => (typeof item.perShare === 'number' ? item.perShare.toFixed(2) : '—'))
            .join(' / ')
          lines.push(`- 每股（保守/中性/乐观）：${pes} ${unit}/股`)
        }
        lines.push('', '**各情景**')
        for (const item of scenarios) {
          const label = LABEL_ZH[item.label ?? ''] ?? item.label ?? ''
          lines.push(
            `- ${label}：增速 ${pct(item.growthApplied ?? 0)}，显式期现值 ${money(item.pvExplicit ?? 0, unit)}，终值现值 ${money(item.pvTerminal ?? 0, unit)}，终值占比 ${pct(item.terminalShare ?? 0, 0)}`,
          )
          for (const warn of item.warnings ?? []) lines.push(`  - ⚠ ${warn}`)
        }
        if (assumptionsWarnings.length > 0) {
          lines.push('', '**参数提示**')
          for (const warn of assumptionsWarnings) lines.push(`- ${warn}`)
        }
        lines.push('', '**这个区间不等于什么**')
        for (const item of value.caveats ?? []) lines.push(`- ${item}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const assumptions = {
        discountRate: args.discountRate ?? config.discountRate,
        terminalGrowth: args.terminalGrowth ?? config.terminalGrowth,
        years: args.years ?? config.projectionYears,
        maxGrowth: config.maxGrowth,
      }
      const result = valueCompany({
        ownerEarnings: args.ownerEarnings,
        netDebt: args.netDebt ?? 0,
        sharesOutstanding: args.sharesOutstanding,
        scenarios: [
          { label: 'conservative', growth: args.growth.conservative },
          { label: 'base', growth: args.growth.base },
          { label: 'optimistic', growth: args.growth.optimistic },
        ],
        assumptions,
      })
      return {
        unit: args.unit ?? '（输入单位）',
        ownerEarnings: result.ownerEarnings,
        netDebt: result.netDebt,
        sharesOutstanding: result.sharesOutstanding,
        discountRate: result.discountRate,
        terminalGrowth: result.terminalGrowth,
        years: result.years,
        valued: result.valued,
        scenarios: result.scenarios,
        band: result.band,
        warnings: result.warnings,
        caveats: [
          '区间来自你提供的假设，不是市场共识，也不是我的预测。',
          '终值占比越高，结论越依赖永续假设；把它读成「价格的合理水平」是误用。',
          '这不是目标价：我不预测股价，也不给买卖点位。',
        ],
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `内在价值区间 · 基数 ${args.ownerEarnings}`,
      kind: 'other',
      rawInput: `${args.growth.conservative}% / ${args.growth.base}% / ${args.growth.optimistic}%`,
    }),
  })
}
