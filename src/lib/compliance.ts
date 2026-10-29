export type Severity = 'blocker' | 'warn'

export interface Violation {
  ruleId: string
  severity: Severity
  label: string
  quote: string
  index: number
  suggestion: string
}

export interface ComplianceResult {
  pass: boolean
  blockers: number
  warnings: number
  violations: Violation[]
  missingDisclaimer: boolean
  requiredDisclaimer: string
  checkedLength: number
  summary: string
}

interface Rule {
  id: string
  label: string
  severity: Severity
  patterns: string[]
  suggestion: string
}

/**
 * 红线口径（中国内地）：证券投资咨询属持牌业务，未持牌不得对具体证券的买卖做出建议、
 * 不得承诺收益、不得使用诱导性评级用语、不得传播内幕信息、不得代客理财。
 * 这里做的是「文本机械筛查」，不是法律意见。
 */
const RULES: Rule[] = [
  {
    id: 'R001',
    label: '具体买卖指令',
    severity: 'blocker',
    patterns: [
      '(?:建议|可以|应该|不妨|考虑|值得|推荐|不如)\\s*(?:买入|卖出|加仓|减仓|清仓|建仓|抄底|梭哈|上车|进场)',
      '(?:买入|卖出|增持|减持)\\s*评级',
      '目标价',
      '(?:止盈|止损)\\s*(?:位|价|点)',
      '(?:重仓|满仓|全仓|杠杆)\\s*(?:买入|干|搞|上)',
    ],
    suggestion: '改成「这门生意在什么条件下便宜、什么条件下贵」的条件句，删掉指向具体证券的动作动词。',
  },
  {
    id: 'R002',
    label: '收益承诺',
    severity: 'blocker',
    patterns: [
      '(?:必涨|稳赚|包赚|保本|保底|零风险|无风险|稳赢|躺赚|包你赚|保证收益|保证盈利)',
      '年化\\s*\\d+(?:\\.\\d+)?\\s*%\\s*(?:收益|回报|以上)',
    ],
    suggestion: '承诺收益是硬违规。改为陈述历史数据与其口径，并说明未来不保证。',
  },
  {
    id: 'R003',
    label: '诱导性评级用语',
    severity: 'blocker',
    patterns: ['强烈推荐', '重点推荐', '金股', '牛股', '黑马', '妖股', '跑赢大盘', '大幅上涨空间', '最佳买点', '稳赚不赔'],
    suggestion: '删除评级式措辞，改用质量清单得分与估值区间这些可复算的指标说话。',
  },
  {
    id: 'R004',
    label: '内幕与操纵暗示',
    severity: 'blocker',
    patterns: ['内幕', '小道消息', '庄家', '主力建仓', '老鼠仓', '坐庄', '拉抬', '对倒'],
    suggestion: '内幕信息不可使用也不可传播。整段删除，不做任何引用或复述。',
  },
  {
    id: 'R005',
    label: '股价方向预测',
    severity: 'warn',
    patterns: [
      '(?:股价|价格)\\s*(?:会|将|必|一定|肯定)\\s*(?:涨|跌)',
      '(?:下周|下月|明天|本月|明年)\\s*(?:会|将)\\s*(?:涨|跌|见顶|见底)',
      '(?:涨到|跌到)\\s*\\d+',
    ],
    suggestion: '把方向判断换成「在 X 假设下，价值区间是 Y」，时间维度只谈多年，不谈几天几周。',
  },
  {
    id: 'R006',
    label: '代客理财',
    severity: 'blocker',
    patterns: ['(?:帮你|替你|代你)\\s*(?:下单|操作|交易|炒股|管理账户|管账户)', '跟单', '带你炒股', '喊单', '带你赚钱'],
    suggestion: '不接受委托、不代客操作：明确说明只做分析，决策与下单由本人完成。',
  },
  {
    id: 'R007',
    label: '绝对化表述',
    severity: 'warn',
    patterns: ['绝对', '必然', '毫无疑问', '百分百', '板上钉钉', '万无一失'],
    suggestion: '删掉绝对化副词。结论要带条件：在什么假设下、区间是多少、假设破了会怎样。',
  },
]

const MAX_HITS_PER_PATTERN = 5

function scan(pattern: string, flags: string, text: string, limit: number): Array<{ quote: string; index: number }> {
  const hits: Array<{ quote: string; index: number }> = []
  let regex: RegExp
  try {
    regex = new RegExp(pattern, flags)
  } catch {
    return hits
  }
  for (const match of text.matchAll(regex)) {
    const quote = String(match[0]).slice(0, 60)
    hits.push({ quote, index: match.index ?? 0 })
    if (hits.length >= limit) break
  }
  return hits
}

export function checkCompliance(
  text: string,
  options: { disclaimerKey: string; requiredDisclaimer: string; requireDisclaimer: boolean; extraPatterns: string[] },
): ComplianceResult {
  const violations: Violation[] = []

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      for (const hit of scan(pattern, 'gu', text, MAX_HITS_PER_PATTERN)) {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          label: rule.label,
          quote: hit.quote,
          index: hit.index,
          suggestion: rule.suggestion,
        })
      }
    }
  }

  for (const pattern of options.extraPatterns) {
    for (const hit of scan(pattern, 'gu', text, MAX_HITS_PER_PATTERN)) {
      violations.push({
        ruleId: 'R900',
        severity: 'blocker',
        label: '部署方自定义禁用词',
        quote: hit.quote,
        index: hit.index,
        suggestion: '命中部署方在 config.extraForbiddenPatterns 中定义的禁用规则，按该部署的合规要求改写。',
      })
    }
  }

  const missingDisclaimer = options.requireDisclaimer && !text.includes(options.disclaimerKey)
  if (missingDisclaimer) {
    violations.push({
      ruleId: 'R008',
      severity: 'blocker',
      label: '缺免责声明',
      quote: '',
      index: text.length,
      suggestion: `交付文本结尾必须原样附上免责声明：${options.requiredDisclaimer}`,
    })
  }

  violations.sort((a, b) => a.index - b.index)
  const blockers = violations.filter((item) => item.severity === 'blocker').length
  const warnings = violations.filter((item) => item.severity === 'warn').length
  const pass = blockers === 0

  const summary = pass
    ? warnings === 0
      ? '通过：未命中任何风险表述红线。'
      : `通过：无阻断项，但有 ${warnings} 处提示级表述建议改写。`
    : `不通过：${blockers} 处阻断项必须先改写才能交付${warnings > 0 ? `，另有 ${warnings} 处提示项` : ''}。`

  return {
    pass,
    blockers,
    warnings,
    violations,
    missingDisclaimer,
    requiredDisclaimer: options.requiredDisclaimer,
    checkedLength: text.length,
    summary,
  }
}
