import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.js'
import { money, pct } from '../lib/format.js'
import { gradeMargin } from '../lib/valuation.js'

const PERSONA =
  '价值投资分析（巴菲特/芒格框架）。只描述「价格相对估算价值的折让幅度」，不产出买卖结论。'

export function marginTool(config: Config) {
  return defineTool({
    name: 'vi_margin_of_safety',
    description: `${PERSONA} 计算当前价格相对内在价值区间下沿的安全边际，并按配置阈值给出「无折让 / 偏薄 / 可讨论 / 显著」四级描述。价格与价值必须来自用户输入；分级是折让幅度的度量，不是买卖建议——不要把它转写成「可以买」或「该卖了」。`,
    parameters: {
      valueLow: { type: 'number', required: true, description: '内在价值区间下沿（保守情景），单位与 unit 一致。' },
      valueHigh: { type: 'number', description: '内在价值区间上沿（乐观情景），可选，用于给出双重折让。' },
      price: { type: 'number', required: true, description: '当前价格（每股），单位与 unit 一致。' },
      unit: { type: 'string', description: '单位，例如「元」「美元」。仅用于回显。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          unit: { type: 'string' },
          valueLow: { type: 'number' },
          valueHigh: { oneOf: [{ type: 'number' }, { type: 'null' }] },
          price: { type: 'number' },
          discountToLow: { type: 'number' },
          discountToHigh: { oneOf: [{ type: 'number' }, { type: 'null' }] },
          grade: { type: 'string', enum: ['none', 'thin', 'adequate', 'ample'] },
          gradeLabel: { type: 'string' },
          thresholds: {
            type: 'object',
            additionalProperties: false,
            properties: {
              thin: { type: 'number' },
              adequate: { type: 'number' },
              ample: { type: 'number' },
            },
          },
          caveats: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => {
        const unit = value.unit ?? ''
        const thin = value.thresholds?.thin ?? 0
        const adequate = value.thresholds?.adequate ?? 0
        const ample = value.thresholds?.ample ?? 0
        const lines: string[] = []
        lines.push(
          `**安全边际 · ${value.gradeLabel ?? ''}**　价格 ${money(value.price ?? 0, unit)}　价值下沿 ${money(value.valueLow ?? 0, unit)}`,
          '',
        )
        lines.push(`- 相对下沿折让：${pct(value.discountToLow ?? 0, 2)}`)
        if (typeof value.discountToHigh === 'number') lines.push(`- 相对上沿折让：${pct(value.discountToHigh, 2)}`)
        lines.push(
          `- 分级阈值：< ${pct(thin, 0)} 偏薄；≥ ${pct(adequate, 0)} 可讨论；≥ ${pct(ample, 0)} 显著`,
        )
        lines.push('', '**读这个数之前**')
        for (const item of value.caveats ?? []) lines.push(`- ${item}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const result = gradeMargin(args.valueLow, args.valueHigh ?? null, args.price, {
        thin: config.marginThin,
        adequate: config.marginAdequate,
        ample: config.marginAmple,
      })
      return {
        unit: args.unit ?? '（输入单位）',
        valueLow: result.valueLow,
        valueHigh: result.valueHigh,
        price: result.price,
        discountToLow: result.discountToLow,
        discountToHigh: result.discountToHigh,
        grade: result.grade,
        gradeLabel: result.gradeLabel,
        thresholds: result.thresholds,
        caveats: result.caveats,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '安全边际 · 折让幅度分级',
      kind: 'other',
      rawInput: `价格 ${args.price} / 价值下沿 ${args.valueLow}`,
    }),
  })
}
