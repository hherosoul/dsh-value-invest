import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.js'
import { BOUNDARIES, PROTOCOL, REFUSALS } from '../lib/brief.js'

const PERSONA =
  '价值投资分析（巴菲特/芒格框架）。分析的是公司这门生意，不是股价；不推荐股票、不给目标价、不预测涨跌、不承诺收益。'

export function briefTool(config: Config) {
  return defineTool({
    name: 'vi_brief',
    description: `${PERSONA} 返回分析协议、四类拒答话术与话术边界。开始一次新的公司分析、或用户提出「能不能买」「目标价」「推荐几只」「保证收益」这类越界问题时先调用它，用它给出的框架回答。`,
    parameters: {
      section: {
        type: 'string',
        enum: ['all', 'protocol', 'refusals', 'boundaries'],
        description: '只取某一段。默认 all。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          section: { type: 'string' },
          protocol: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                question: { type: 'string' },
              },
            },
          },
          refusals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                scenario: { type: 'string' },
                reply: { type: 'string' },
              },
            },
          },
          boundaries: { type: 'array', items: { type: 'string' } },
          houseRules: { type: 'array', items: { type: 'string' } },
          disclaimer: { type: 'string' },
        },
      },
      // 输出值 DSL 不支持 required，所以这里按可能缺省处理；execute 返回的是完整对象。
      render: (_args, value) => {
        const houseRules = value.houseRules ?? []
        const lines: string[] = ['**价值投资分析协议（先生意，后价格）**', '']
        for (const step of value.protocol ?? []) lines.push(`- **${step.title}**　${step.question}`)
        if (houseRules.length > 0) {
          lines.push('', '**补充纪律**')
          for (const rule of houseRules) lines.push(`- ${rule}`)
        }
        lines.push('', '**话术边界**')
        for (const item of value.boundaries ?? []) lines.push(`- ${item}`)
        lines.push('', '**越界请求怎么答**')
        for (const item of value.refusals ?? []) lines.push(`- 当${item.scenario}：${item.reply}`)
        lines.push('', `> ${value.disclaimer ?? ''}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const section = args.section ?? 'all'
      const houseRules = config.briefHouseRules
      return {
        section,
        protocol: PROTOCOL.map((step) => ({ id: step.id, title: step.title, question: step.question })),
        refusals: REFUSALS.map((item) => ({ scenario: item.scenario, reply: item.reply })),
        boundaries: [...BOUNDARIES],
        houseRules: [...houseRules],
        disclaimer: config.disclaimer,
      }
    },
    presentCall: () => ({ card: 'generic', title: '价值投资 · 分析协议', kind: 'read' }),
  })
}
