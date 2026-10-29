import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.js'
import { checkCompliance } from '../lib/compliance.js'

const PERSONA =
  '合规闸门。境内证券投资咨询属持牌业务：不荐股、不承诺收益、不代客理财、不传播内幕信息、不预测股价。'

export function complianceTool(config: Config) {
  return defineTool({
    name: 'vi_compliance_check',
    description: `${PERSONA} 交付前必须调用：把准备发给用户的分析文本整段传进来，机械筛查买卖指令、目标价、收益承诺、诱导性评级、内幕暗示、股价预测、代客理财、绝对化表述，以及免责声明是否缺失。返回 pass 与逐条违规片段（含改写建议）。pass=false 时必须先改写文本再重新检查，不要把带阻断项的内容直接交付。`,
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: '准备交付给用户的完整分析文本（含免责声明）。整段传入，不要节选。',
      },
      strict: {
        type: 'boolean',
        description: '严格模式：提示级（warn）违规也判不通过。默认 false。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pass: { type: 'boolean' },
          blockers: { type: 'number' },
          warnings: { type: 'number' },
          violations: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ruleId: { type: 'string' },
                severity: { type: 'string', enum: ['blocker', 'warn'] },
                label: { type: 'string' },
                quote: { type: 'string' },
                index: { type: 'number' },
                suggestion: { type: 'string' },
              },
            },
          },
          missingDisclaimer: { type: 'boolean' },
          requiredDisclaimer: { type: 'string' },
          checkedLength: { type: 'number' },
          summary: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const violations = value.violations ?? []
        const lines: string[] = [`**合规检查 · ${value.pass ? '通过' : '不通过'}**　${value.summary ?? ''}`, '']
        if (violations.length === 0) {
          lines.push('- 未命中任何规则。')
        } else {
          for (const item of violations.slice(0, 14)) {
            const where = item.quote ? `「${item.quote}」@${item.index}` : '（全文）'
            lines.push(`- [${item.ruleId}·${item.severity === 'blocker' ? '阻断' : '提示'}] ${item.label} ${where}`)
            lines.push(`  - ${item.suggestion}`)
          }
          if (violations.length > 14) lines.push(`- ……另有 ${violations.length - 14} 处同类命中。`)
        }
        if (value.missingDisclaimer) {
          lines.push('', `**必须附上的免责声明**`, `> ${value.requiredDisclaimer}`)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args) {
      const result = checkCompliance(args.text, {
        disclaimerKey: config.disclaimerKey,
        requiredDisclaimer: config.disclaimer,
        requireDisclaimer: config.requireDisclaimer,
        extraPatterns: config.extraForbiddenPatterns,
      })
      const strict = args.strict === true
      const pass = strict ? result.pass && result.warnings === 0 : result.pass
      return {
        pass,
        blockers: result.blockers,
        warnings: result.warnings,
        violations: result.violations,
        missingDisclaimer: result.missingDisclaimer,
        requiredDisclaimer: result.requiredDisclaimer,
        checkedLength: result.checkedLength,
        summary: strict && result.pass && result.warnings > 0 ? `严格模式：${result.warnings} 处提示项判为不通过。` : result.summary,
      }
    },
    presentCall: () => ({ card: 'generic', title: '合规闸门 · 交付前扫描', kind: 'search' }),
  })
}
