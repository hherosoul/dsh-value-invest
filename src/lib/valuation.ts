import { round, toRate } from './stats.js'

export interface ValuationAssumptions {
  /** 折现率（%）。 */
  discountRate: number
  /** 永续增长率（%）。 */
  terminalGrowth: number
  /** 显式预测年数。 */
  years: number
  /** 单情景增速上限（%）。 */
  maxGrowth: number
}

export interface ScenarioInput {
  label: string
  /** 显式期 owner earnings 增速（%）。 */
  growth: number
}

export interface ScenarioResult {
  label: string
  growthInput: number
  growthApplied: number
  pvExplicit: number
  pvTerminal: number
  enterpriseValue: number
  equityValue: number
  perShare: number | null
  terminalShare: number
  warnings: string[]
}

export interface ValuationInput {
  ownerEarnings: number
  netDebt: number
  sharesOutstanding?: number
  scenarios: ScenarioInput[]
  assumptions: ValuationAssumptions
}

export interface ValuationResult {
  ownerEarnings: number
  netDebt: number
  sharesOutstanding: number | null
  discountRate: number
  terminalGrowth: number
  years: number
  scenarios: ScenarioResult[]
  band: { low: number; mid: number; high: number; width: number }
  warnings: string[]
  valued: boolean
}

const TERMINAL_SHARE_WARN = 85

function valueOne(
  ownerEarnings: number,
  netDebt: number,
  shares: number | undefined,
  scenario: ScenarioInput,
  assumptions: ValuationAssumptions,
): ScenarioResult {
  const warnings: string[] = []
  const r = toRate(assumptions.discountRate)
  const gTerminal = toRate(assumptions.terminalGrowth)

  let growth = scenario.growth
  if (growth > assumptions.maxGrowth) {
    warnings.push(`增速 ${growth}% 超过上限 ${assumptions.maxGrowth}%，按上限计算。`)
    growth = assumptions.maxGrowth
  }
  const g = toRate(growth)

  // 显式期增速高于折现率是允许的（有限期内不会发散），但现值会高度依赖增速假设，必须点名。
  if (g >= r) {
    warnings.push(`显式期增速 ${growth}% 不低于折现率 ${assumptions.discountRate}%：这个情景的价值几乎全由增速假设决定。`)
  }

  let pvExplicit = 0
  for (let year = 1; year <= assumptions.years; year += 1) {
    pvExplicit += (ownerEarnings * (1 + g) ** year) / (1 + r) ** year
  }

  const earningsAtTerminal = ownerEarnings * (1 + g) ** assumptions.years
  let terminalGrowth = gTerminal
  if (gTerminal >= r - 0.005) {
    warnings.push(`永续增长率 ${assumptions.terminalGrowth}% 不低于折现率，按折现率 − 0.5 个百分点处理。`)
    terminalGrowth = r - 0.005
  }
  const terminalValue = (earningsAtTerminal * (1 + terminalGrowth)) / (r - terminalGrowth)
  const pvTerminal = terminalValue / (1 + r) ** assumptions.years

  const enterpriseValue = pvExplicit + pvTerminal
  const equityValue = enterpriseValue - netDebt
  const perShare = shares && shares > 0 ? equityValue / shares : null
  const terminalShare = enterpriseValue === 0 ? 0 : (pvTerminal / enterpriseValue) * 100

  if (terminalShare >= TERMINAL_SHARE_WARN) {
    warnings.push(`终值占企业价值 ${terminalShare.toFixed(0)}%：这个数主要是「永续假设」撑起来的，不是今年赚的。`)
  }

  return {
    label: scenario.label,
    growthInput: round(scenario.growth, 2),
    growthApplied: round(growth, 2),
    pvExplicit: round(pvExplicit, 2),
    pvTerminal: round(pvTerminal, 2),
    enterpriseValue: round(enterpriseValue, 2),
    equityValue: round(equityValue, 2),
    perShare: perShare === null ? null : round(perShare, 2),
    terminalShare: round(terminalShare, 1),
    warnings,
  }
}

export function valueCompany(input: ValuationInput): ValuationResult {
  const warnings: string[] = []
  const r = toRate(input.assumptions.discountRate)

  if (input.ownerEarnings <= 0) {
    return {
      ownerEarnings: round(input.ownerEarnings, 2),
      netDebt: round(input.netDebt, 2),
      sharesOutstanding: input.sharesOutstanding ?? null,
      discountRate: input.assumptions.discountRate,
      terminalGrowth: input.assumptions.terminalGrowth,
      years: input.assumptions.years,
      scenarios: [],
      band: { low: 0, mid: 0, high: 0, width: 0 },
      warnings: [
        'owner earnings 不为正，折现模型在数学上不成立：无正现金流的生意不能用 DCF 定价。',
        '要么改用资产/重置成本视角，要么直接放弃估值——这本身就是一个结论。',
      ],
      valued: false,
    }
  }

  if (input.assumptions.terminalGrowth >= input.assumptions.discountRate) {
    warnings.push('永续增长率不低于折现率：参数不自洽，已在每个情景内修正。')
  }
  if (!input.sharesOutstanding || input.sharesOutstanding <= 0) {
    warnings.push('未提供股本，只给企业价值与股东价值，不给每股数。')
  }

  const scenarios = input.scenarios.map((item) =>
    valueOne(input.ownerEarnings, input.netDebt, input.sharesOutstanding, item, input.assumptions),
  )

  const equityValues = scenarios.map((item) => item.equityValue)
  const base = scenarios.find((item) => item.label === 'base') ?? scenarios[Math.floor(scenarios.length / 2)]
  const low = Math.min(...equityValues)
  const high = Math.max(...equityValues)

  void r
  return {
    ownerEarnings: round(input.ownerEarnings, 2),
    netDebt: round(input.netDebt, 2),
    sharesOutstanding: input.sharesOutstanding ?? null,
    discountRate: input.assumptions.discountRate,
    terminalGrowth: input.assumptions.terminalGrowth,
    years: input.assumptions.years,
    scenarios,
    band: { low: round(low, 2), mid: round(base.equityValue, 2), high: round(high, 2), width: round(high - low, 2) },
    warnings,
    valued: true,
  }
}

export type MarginGrade = 'none' | 'thin' | 'adequate' | 'ample'

export interface MarginThresholds {
  thin: number
  adequate: number
  ample: number
}

export interface MarginResult {
  valueLow: number
  valueHigh: number | null
  price: number
  discountToLow: number
  discountToHigh: number | null
  grade: MarginGrade
  gradeLabel: string
  thresholds: MarginThresholds
  caveats: string[]
}

const GRADE_LABEL: Record<MarginGrade, string> = {
  none: '无折让（价格不低于估算价值下沿）',
  thin: '折让偏薄',
  adequate: '折让处于可讨论区间',
  ample: '折让显著',
}

export function gradeMargin(
  valueLow: number,
  valueHigh: number | null,
  price: number,
  thresholds: MarginThresholds,
): MarginResult {
  const caveats = [
    '分级只描述「价格相对你给出的估算价值区间下沿的折让幅度」，不含任何买卖结论。',
    '区间由你提供的假设推出：假设一改，折让幅度跟着改，分级也随之改变。',
    '估算价值本身可能错。折让大不等于风险小，先看质量清单与反面检验。',
  ]
  if (valueLow <= 0) {
    return {
      valueLow,
      valueHigh,
      price,
      discountToLow: 0,
      discountToHigh: null,
      grade: 'none',
      gradeLabel: '估算价值非正，无法计算折让',
      thresholds,
      caveats,
    }
  }

  const discountToLow = round(((valueLow - price) / valueLow) * 100, 2)
  const discountToHigh = valueHigh && valueHigh > 0 ? round(((valueHigh - price) / valueHigh) * 100, 2) : null

  let grade: MarginGrade
  if (discountToLow <= 0) grade = 'none'
  else if (discountToLow < thresholds.thin) grade = 'thin'
  else if (discountToLow < thresholds.ample) grade = 'adequate'
  else grade = 'ample'

  return {
    valueLow: round(valueLow, 2),
    valueHigh: valueHigh === null ? null : round(valueHigh, 2),
    price: round(price, 2),
    discountToLow,
    discountToHigh,
    grade,
    gradeLabel: GRADE_LABEL[grade],
    thresholds,
    caveats,
  }
}
