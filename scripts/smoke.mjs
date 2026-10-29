/**
 * 离线自检：用真实的 cordis + dsh-tools 注册路径验证插件，不连 LLM、不需要 API key。
 *
 * 覆盖：插件加载 → 五个工具注册 → 参数校验 → execute 返回值 → 输出 schema 校验 → render → 卸载无残留。
 * 不覆盖：「模型在会话里主动选择调用」。那需要真实 LLM 凭据，见 README「怎么验」。
 *
 * 用法：node scripts/smoke.mjs      （或 pnpm smoke）
 */
import { Context, Service } from '@deepseek-ai/cordis'
import ToolRuntime, { valueSchemaSpecToJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import * as plugin from '../dist/index.js'

/** ToolRuntime 只依赖 systemPrompt；这里给它一个最小桩，避免拉起整个宿主。 */
class StubSystemPrompt extends Service {
  constructor(ctx) {
    super(ctx, 'systemPrompt', true)
  }
  section() {
    return () => {}
  }
  tools() {
    return () => {}
  }
  getSectionOrder() {
    return []
  }
}

const CONFIG = {
  discountRate: 10,
  terminalGrowth: 3,
  maxGrowth: 15,
  projectionYears: 10,
  marginThin: 10,
  marginAdequate: 25,
  marginAmple: 40,
  qualityExcellent: 80,
  qualityPass: 60,
  disclaimer: '本分析基于你提供的财务数据与假设，仅用于研究与讨论，不构成投资建议，也不构成任何证券买卖的要约或邀请。',
  requireDisclaimer: true,
  disclaimerKey: '不构成投资建议',
  extraForbiddenPatterns: [],
  briefHouseRules: ['不做短期业绩预测。'],
}

const TOOL_NAMES = ['vi_brief', 'vi_quality_scorecard', 'vi_intrinsic_value', 'vi_margin_of_safety', 'vi_compliance_check']

let failed = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function fakeExec(name, args) {
  return { callId: `smoke-${name}`, name, arguments: args, signal: new AbortController().signal }
}

async function callTools(ctx, name, args) {
  const def = ctx.tools.get(name)
  if (!def) throw new Error(`工具未注册：${name}`)
  // 注册表里的 parameters 已是编译后的 JSON Schema（模型看到的那份），用它校验参数。
  validateJsonSchemaValue(def.parameters, args)
  const value = await def.execute(args, fakeExec(name, args))
  validateJsonSchemaValue(valueSchemaSpecToJsonSchema(def.output.schema), value)
  const blocks = def.output.render(args, value)
  return { value, blocks }
}

const ctx = new Context()
await ctx.plugin(StubSystemPrompt)
await ctx.plugin(ToolRuntime)
const pluginFiber = await ctx.plugin(plugin, CONFIG)

console.log('\n[1] 插件加载与工具注册')
const registered = TOOL_NAMES.filter((name) => Boolean(ctx.tools.get(name)))
check(`五个工具全部注册（${registered.length}/${TOOL_NAMES.length}）`, registered.length === TOOL_NAMES.length, registered.join(','))
const schemas = ctx.tools.schemas()
check('模型可见的工具 schema 里包含本插件工具', TOOL_NAMES.every((name) => schemas.some((item) => item.name === name)))

console.log('\n[2] vi_brief')
{
  const { value, blocks } = await callTools(ctx, 'vi_brief', { section: 'all' })
  check('协议 7 步', value.protocol.length === 7)
  check('四类以上拒答话术', value.refusals.length >= 4)
  check('带上 config 追加纪律', value.houseRules.includes('不做短期业绩预测。'))
  check('render 出文本', blocks.length > 0 && blocks[0].type === 'text' && blocks[0].text.includes('能力圈'))
}

console.log('\n[3] vi_quality_scorecard')
{
  const args = {
    company: '示例制造',
    metrics: {
      roic: [16.2, 17.1, 15.8, 16.9, 17.4],
      roe: [18.1, 18.9, 17.6, 18.4, 19.2],
      grossMargin: [38.2, 38.6, 38.1, 38.9, 39.1],
      fcfConversion: [92, 95, 88, 97, 101],
      netDebtToEbitda: 0.6,
      interestCoverage: 14,
      shareCountChange5y: -2.1,
    },
    evidence: { moat: '更换供应商需重新做 18 个月认证，前五大客户平均合作 11 年，认证成本由客户承担。' },
    moatType: 'switching-cost',
    killPaths: [
      '大客户自建产线并内部化认证流程，三年内砍掉三成外购量',
      '上游关键材料被单一供应商卡住，涨价无法向下游传导',
      '行业标准变更导致既有认证失效，重新认证期间份额被抢',
    ],
  }
  const { value } = await callTools(ctx, 'vi_quality_scorecard', args)
  check('七个维度', value.dimensions.length === 7)
  check('满分 100', value.maxScore === 100)
  check('数据齐全时无无证据项', value.unevidenced.length === 0, value.unevidenced.join(','))
  check('高质量样本判为 excellent', value.grade === 'excellent', `${value.grade} ${value.totalScore}`)

  const weak = await callTools(ctx, 'vi_quality_scorecard', {
    company: '示例贸易',
    metrics: { roic: [6.1] },
    evidence: {},
    killPaths: [],
  })
  check('缺证据时判为无证据', weak.value.unevidenced.length > 0)
  check('缺证据时不给「优」', weak.value.grade !== 'excellent')
  check('ROIC 偏低触发红旗', weak.value.redFlags.length > 0)
}

console.log('\n[4] vi_intrinsic_value')
{
  const { value } = await callTools(ctx, 'vi_intrinsic_value', {
    ownerEarnings: 1200,
    growth: { conservative: 2, base: 6, optimistic: 10 },
    netDebt: 800,
    sharesOutstanding: 500,
    unit: '亿元',
  })
  check('三情景齐全', value.scenarios.length === 3)
  check('区间递增 low<mid<high', value.band.low < value.band.mid && value.band.mid < value.band.high)
  check('扣净债务后股东价值低于企业价值', value.scenarios[0].equityValue < value.scenarios[0].enterpriseValue)
  check('给了股本就有每股数', typeof value.scenarios[0].perShare === 'number')

  const clamped = await callTools(ctx, 'vi_intrinsic_value', {
    ownerEarnings: 500,
    growth: { conservative: 5, base: 25, optimistic: 40 },
  })
  check('增速超上限被截断并告警', clamped.value.scenarios[2].growthApplied === 15 && clamped.value.scenarios[2].warnings.length > 0)

  const negative = await callTools(ctx, 'vi_intrinsic_value', {
    ownerEarnings: -30,
    growth: { conservative: 1, base: 2, optimistic: 3 },
  })
  check('负现金流不硬算', negative.value.valued === false && negative.value.scenarios.length === 0)
}

console.log('\n[5] vi_margin_of_safety')
{
  const ample = await callTools(ctx, 'vi_margin_of_safety', { valueLow: 100, valueHigh: 160, price: 55, unit: '元' })
  check('折让 45% 判为显著', ample.value.grade === 'ample', `${ample.value.discountToLow}`)
  const none = await callTools(ctx, 'vi_margin_of_safety', { valueLow: 100, price: 130 })
  check('价格高于下沿判为无折让', none.value.grade === 'none')
  check('分级附带非建议声明', none.value.caveats.some((item) => item.includes('不含任何买卖结论')))
}

console.log('\n[6] vi_compliance_check')
{
  const dirty = '结论：建议买入并持有，目标价 45 元，明年必涨翻倍，稳赚不赔。'
  const blocked = await callTools(ctx, 'vi_compliance_check', { text: dirty })
  check('脏文本不通过', blocked.value.pass === false)
  check('命中买卖指令', blocked.value.violations.some((item) => item.ruleId === 'R001'))
  check('命中收益承诺', blocked.value.violations.some((item) => item.ruleId === 'R002'))
  check('缺免责声明被标记', blocked.value.missingDisclaimer === true)

  const clean = `示例制造近五年 ROIC 均值 16.7%，自由现金流转化率 94.6%。按 10% 折现、3% 永续增长，内在价值区间为 1.1–1.9 万亿元；当前价格相对区间下沿折让 45%。以上为基于假设的估算，不构成投资建议。`
  const passed = await callTools(ctx, 'vi_compliance_check', { text: clean })
  check('干净文本通过', passed.value.pass === true, JSON.stringify(passed.value.violations))
  check('无违规项', passed.value.violations.length === 0)
}

console.log('\n[7] 卸载无残留')
await pluginFiber.dispose()
const leftovers = TOOL_NAMES.filter((name) => {
  try {
    return Boolean(ctx.tools?.get(name))
  } catch {
    return false
  }
})
check('dispose 后工具全部注销', leftovers.length === 0, leftovers.join(','))

console.log(`\n结果：${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
process.exit(failed === 0 ? 0 : 1)
