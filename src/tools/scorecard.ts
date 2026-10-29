import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.js'
import { evaluateQuality } from '../lib/quality.js'

const PERSONA =
  '价值投资分析（巴菲特/芒格框架）。打的是生意质量的分，不是给股票评级；不推荐股票、不给目标价。'

const MOAT_TYPES = ['brand', 'switching-cost', 'network', 'cost-advantage', 'scale', 'regulation', 'none', 'unclear']

const VERDICT_LABEL: Record<string, string> = {
  pass: '达标',
  partial: '部分',
  fail: '不达标',
  unevidenced: '无证据',
}

export function scorecardTool(config: Config) {
  return defineTool({
    name: 'vi_quality_scorecard',
    description: `${PERSONA} 按芒格质量清单给一家公司的生意质量打分（护城河/ROIC/毛利率稳定性/现金转化/杠杆/股本纪律/反面检验，共 100 分）。比率一律用百分数（18.5 表示 18.5%），序列由旧到新。没有证据的项按 0 分计并列入 unevidenced：护城河必须给出可复述的事实，形容词不算证据。数据由用户提供，本工具不取数、不猜数。`,
    parameters: {
      company: { type: 'string', required: true, description: '公司名称或代码，仅作标识。' },
      metrics: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: '财务指标。比率用百分数；序列由旧到新排列。',
        properties: {
          roic: {
            type: 'array',
            required: true,
            items: { type: 'number' },
            description: 'ROIC（%）序列，由旧到新，建议 5 年以上；少于 4 年按 70% 折算。',
          },
          roe: { type: 'array', items: { type: 'number' }, description: 'ROE（%）序列，可选，仅作提示。' },
          grossMargin: { type: 'array', items: { type: 'number' }, description: '毛利率（%）序列。' },
          fcfConversion: { type: 'array', items: { type: 'number' }, description: '自由现金流/净利润（%）序列。' },
          netDebtToEbitda: { type: 'number', description: '净债务/EBITDA（倍），净现金填负数。' },
          interestCoverage: { type: 'number', description: '利息保障倍数（倍）。' },
          shareCountChange5y: { type: 'number', description: '5 年股本累计变化（%），正为稀释，负为回购。' },
        },
      },
      evidence: {
        type: 'object',
        required: true,
        additionalProperties: true,
        description:
          '证据映射，键为 moat（护城河）。值必须是可复述的具体事实，例如「更换供应商需重新做 18 个月认证，前五大客户平均合作 11 年」；只写「品牌强」这类形容词会被判为无证据。',
      },
      moatType: {
        type: 'string',
        enum: MOAT_TYPES,
        description: '护城河类型。不确定填 unclear，确认没有填 none。',
      },
      killPaths: {
        type: 'array',
        items: { type: 'string' },
        description: '「什么会杀死这门生意」的具体路径，每条至少一句完整描述；少于 3 条扣分。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          company: { type: 'string' },
          totalScore: { type: 'number' },
          maxScore: { type: 'number' },
          grade: { type: 'string', enum: ['excellent', 'adequate', 'insufficient'] },
          gradeLabel: { type: 'string' },
          dimensions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                weight: { type: 'number' },
                score: { type: 'number' },
                max: { type: 'number' },
                verdict: { type: 'string', enum: ['pass', 'partial', 'fail', 'unevidenced'] },
                evidence: { oneOf: [{ type: 'string' }, { type: 'null' }] },
                note: { type: 'string' },
              },
            },
          },
          unevidenced: { type: 'array', items: { type: 'string' } },
          redFlags: { type: 'array', items: { type: 'string' } },
          verdictNote: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const lines: string[] = []
        const redFlags = value.redFlags ?? []
        lines.push(
          `**${value.company ?? ''} · 质量清单 ${value.totalScore ?? 0}/${value.maxScore ?? 0}（${value.gradeLabel ?? ''}）**`,
          '',
        )
        for (const item of value.dimensions ?? []) {
          const verdict = item.verdict ?? 'unevidenced'
          lines.push(
            `- ${item.name ?? item.id ?? ''}　${item.score ?? 0}/${item.max ?? 0}　[${VERDICT_LABEL[verdict] ?? verdict}]　${item.note ?? ''}`,
          )
          if (item.evidence) lines.push(`  - 证据：${item.evidence}`)
        }
        if (redFlags.length > 0) {
          lines.push('', '**红旗**')
          for (const flag of redFlags) lines.push(`- ${flag}`)
        }
        lines.push('', `> ${value.verdictNote ?? ''}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const result = evaluateQuality(
        {
          company: args.company,
          metrics: args.metrics,
          evidence: args.evidence,
          moatType: args.moatType,
          killPaths: args.killPaths ?? [],
        },
        { excellent: config.qualityExcellent, pass: config.qualityPass },
      )
      return {
        company: result.company,
        totalScore: result.totalScore,
        maxScore: result.maxScore,
        grade: result.grade,
        gradeLabel: result.gradeLabel,
        dimensions: result.dimensions.map((item) => ({
          id: item.id,
          name: item.name,
          weight: item.weight,
          score: item.score,
          max: item.max,
          verdict: item.verdict,
          evidence: item.evidence,
          note: item.note,
        })),
        unevidenced: result.unevidenced,
        redFlags: result.redFlags,
        verdictNote: result.verdictNote,
      }
    },
    presentCall: (args) => ({ card: 'generic', title: `质量清单 · ${args.company}`, kind: 'other' }),
  })
}
