import { coefficientOfVariation, mean, round } from './stats.js'

/** 质量清单的输入：全部来自用户/模型提供的原始数字，本模块不做任何外部取数。 */
export interface QualityMetrics {
  roic: number[]
  roe?: number[]
  grossMargin?: number[]
  fcfConversion?: number[]
  netDebtToEbitda?: number
  interestCoverage?: number
  shareCountChange5y?: number
}

export interface QualityInput {
  company: string
  metrics: QualityMetrics
  evidence: Record<string, unknown>
  moatType?: string
  killPaths: string[]
}

export type Verdict = 'pass' | 'partial' | 'fail' | 'unevidenced'

export interface QualityDimension {
  id: string
  name: string
  weight: number
  score: number
  max: number
  verdict: Verdict
  evidence: string | null
  note: string
}

export interface QualityThresholds {
  excellent: number
  pass: number
}

export interface QualityResult {
  company: string
  totalScore: number
  maxScore: number
  grade: 'excellent' | 'adequate' | 'insufficient'
  gradeLabel: string
  dimensions: QualityDimension[]
  unevidenced: string[]
  redFlags: string[]
  verdictNote: string
}

function readEvidence(evidence: Record<string, unknown>, key: string): string | null {
  const value = evidence[key]
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

function dimension(
  id: string,
  name: string,
  weight: number,
  score: number,
  verdict: Verdict,
  evidence: string | null,
  note: string,
): QualityDimension {
  const bounded = Math.max(0, Math.min(weight, Math.round(score)))
  return { id, name, weight, score: bounded, max: weight, verdict, evidence, note }
}

/** 护城河：没有可复述的证据就不给分——这是本清单最重要的一条纪律。 */
function scoreMoat(moatType: string | undefined, evidence: string | null): QualityDimension {
  const weight = 20
  if (moatType === 'none') {
    return dimension('moat', '护城河', weight, 0, 'fail', evidence, '被分析方自述无护城河：不给分。')
  }
  if (!evidence) {
    return dimension('moat', '护城河', weight, 0, 'unevidenced', null, '缺可复述的证据（客户为什么走不掉、对手为什么抄不动）。')
  }
  if (moatType === undefined || moatType === 'unclear') {
    return dimension('moat', '护城河', weight, 8, 'partial', evidence, '有描述但护城河类型未定，先归类再打分。')
  }
  if (evidence.length >= 40) {
    return dimension('moat', '护城河', weight, 20, 'pass', evidence, `类型：${moatType}；证据具体。`)
  }
  if (evidence.length >= 15) {
    return dimension('moat', '护城河', weight, 14, 'partial', evidence, `类型：${moatType}；证据偏薄，补一个可验证事实。`)
  }
  return dimension('moat', '护城河', weight, 8, 'partial', evidence, `类型：${moatType}；证据只有几个字，等同未证。`)
}

/** ROIC：十年平均是巴菲特口径，样本不足四年只给折扣分。 */
function scoreRoic(values: number[]): QualityDimension {
  const weight = 20
  if (values.length === 0) {
    return dimension('roic', '投入资本回报率', weight, 0, 'unevidenced', null, '缺 ROIC 序列（至少给 4 年）。')
  }
  const avg = mean(values)
  let base: number
  if (avg >= 15) base = 20
  else if (avg >= 12) base = 16
  else if (avg >= 10) base = 11
  else if (avg >= 8) base = 6
  else base = 0

  const thin = values.length < 4
  const score = thin ? base * 0.7 : base
  const note = `均值 ${avg.toFixed(1)}%（${values.length} 年）${thin ? '；样本不足 4 年，按 70% 折算' : ''}`
  const verdict: Verdict = base === 0 ? 'fail' : thin ? 'partial' : 'pass'
  return dimension('roic', '投入资本回报率', weight, score, verdict, null, note)
}

/** 毛利率：看稳定性（变异系数）也看方向（首尾差）。 */
function scoreGrossMargin(values: number[] | undefined): QualityDimension {
  const weight = 15
  if (!values || values.length < 4) {
    return dimension('grossMargin', '毛利率稳定性', weight, 0, 'unevidenced', null, '至少给 4 年毛利率才能判断稳定性。')
  }
  const cv = coefficientOfVariation(values)
  let base: number
  if (cv <= 0.05) base = 15
  else if (cv <= 0.1) base = 12
  else if (cv <= 0.18) base = 8
  else base = 4

  const drift = values[values.length - 1] - values[0]
  const penalty = drift <= -5 ? 3 : 0
  const notes = [`变异系数 ${cv.toFixed(3)}`, `首尾差 ${drift.toFixed(1)} 个百分点`]
  if (penalty > 0) notes.push('毛利率累计下滑超过 5 个百分点，扣 3 分')
  return dimension(
    'grossMargin',
    '毛利率稳定性',
    weight,
    base - penalty,
    base - penalty <= 6 ? 'partial' : 'pass',
    null,
    notes.join('；'),
  )
}

/** 现金转化：净利润是不是真的变成了现金。 */
function scoreFcfConversion(values: number[] | undefined): QualityDimension {
  const weight = 15
  if (!values || values.length === 0) {
    return dimension('fcfConversion', '自由现金流转化', weight, 0, 'unevidenced', null, '缺「自由现金流/净利润」序列。')
  }
  const avg = mean(values)
  let base: number
  if (avg >= 90) base = 15
  else if (avg >= 75) base = 12
  else if (avg >= 60) base = 8
  else if (avg >= 40) base = 4
  else base = 0
  return dimension(
    'fcfConversion',
    '自由现金流转化',
    weight,
    base,
    base === 0 ? 'fail' : base >= 8 ? 'pass' : 'partial',
    null,
    `均值 ${avg.toFixed(1)}%（${values.length} 年）`,
  )
}

/** 杠杆：净债务/EBITDA 为主，利息保障为辅助扣分。 */
function scoreLeverage(netDebtToEbitda: number | undefined, interestCoverage: number | undefined): QualityDimension {
  const weight = 10
  if (netDebtToEbitda === undefined && interestCoverage === undefined) {
    return dimension('leverage', '杠杆与偿债', weight, 0, 'unevidenced', null, '缺净债务/EBITDA 与利息保障倍数。')
  }
  let base: number
  if (netDebtToEbitda === undefined) {
    base = interestCoverage !== undefined && interestCoverage >= 8 ? 9 : 5
  } else if (netDebtToEbitda <= 0) base = 10
  else if (netDebtToEbitda <= 1.5) base = 9
  else if (netDebtToEbitda <= 2.5) base = 7
  else if (netDebtToEbitda <= 3.5) base = 4
  else base = 1

  const penalty = interestCoverage !== undefined && interestCoverage < 4 ? 2 : 0
  const notes: string[] = []
  if (netDebtToEbitda !== undefined) notes.push(`净债务/EBITDA ${netDebtToEbitda.toFixed(2)}x`)
  if (interestCoverage !== undefined) notes.push(`利息保障 ${interestCoverage.toFixed(1)}x`)
  if (penalty > 0) notes.push('利息保障低于 4x，扣 2 分')
  return dimension(
    'leverage',
    '杠杆与偿债',
    weight,
    base - penalty,
    base - penalty >= 7 ? 'pass' : 'partial',
    null,
    notes.join('；'),
  )
}

/** 股本：长期稀释是复利杀手。 */
function scoreDilution(change: number | undefined): QualityDimension {
  const weight = 10
  if (change === undefined) {
    return dimension('dilution', '股本纪律', weight, 0, 'unevidenced', null, '缺 5 年股本变化幅度。')
  }
  let base: number
  if (change <= 0) base = 10
  else if (change <= 5) base = 8
  else if (change <= 10) base = 5
  else if (change <= 20) base = 2
  else base = 0
  const note = `5 年累计${change >= 0 ? '稀释' : '收缩'} ${Math.abs(change).toFixed(1)}%`
  return dimension('dilution', '股本纪律', weight, base, base >= 5 ? 'pass' : base === 0 ? 'fail' : 'partial', null, note)
}

/** 反面检验（芒格的反演）：说不出三条死法，说明没想清楚。 */
function scoreInversion(killPaths: string[]): QualityDimension {
  const weight = 10
  const specific = killPaths.map((item) => item.trim()).filter((item) => item.length >= 6)
  if (specific.length === 0) {
    return dimension('inversion', '反面检验', weight, 0, 'unevidenced', null, '没有列出「什么会杀死这门生意」。')
  }
  if (specific.length >= 3) {
    return dimension('inversion', '反面检验', weight, 10, 'pass', specific.join(' / '), `列出 ${specific.length} 条失效路径。`)
  }
  return dimension('inversion', '反面检验', weight, 6, 'partial', specific.join(' / '), `只列出 ${specific.length} 条，补齐到 3 条。`)
}

export function evaluateQuality(input: QualityInput, thresholds: QualityThresholds): QualityResult {
  const moatEvidence = readEvidence(input.evidence, 'moat')
  const dimensions: QualityDimension[] = [
    scoreMoat(input.moatType, moatEvidence),
    scoreRoic(input.metrics.roic ?? []),
    scoreGrossMargin(input.metrics.grossMargin),
    scoreFcfConversion(input.metrics.fcfConversion),
    scoreLeverage(input.metrics.netDebtToEbitda, input.metrics.interestCoverage),
    scoreDilution(input.metrics.shareCountChange5y),
    scoreInversion(input.killPaths ?? []),
  ]

  const totalScore = dimensions.reduce((sum, item) => sum + item.score, 0)
  const maxScore = dimensions.reduce((sum, item) => sum + item.max, 0)
  const unevidenced = dimensions.filter((item) => item.verdict === 'unevidenced').map((item) => item.name)

  const roicAvg = mean(input.metrics.roic ?? [])
  const fcfAvg = input.metrics.fcfConversion?.length ? mean(input.metrics.fcfConversion) : undefined

  const redFlags: string[] = []
  if (input.metrics.roic?.length && input.metrics.roic[input.metrics.roic.length - 1] < 8) {
    redFlags.push('最近一年 ROIC 低于 8%：资本回报不及机会成本区间的下沿。')
  }
  if (roicAvg > 0 && roicAvg < 10) redFlags.push(`ROIC 均值 ${roicAvg.toFixed(1)}%，未达到「好生意」的常见门槛 10%。`)
  if (input.metrics.grossMargin && input.metrics.grossMargin.length >= 4) {
    const drift = input.metrics.grossMargin[input.metrics.grossMargin.length - 1] - input.metrics.grossMargin[0]
    if (drift <= -5) redFlags.push(`毛利率 4 年以上累计下滑 ${Math.abs(drift).toFixed(1)} 个百分点：定价权可能在流失。`)
  }
  if (fcfAvg !== undefined && fcfAvg < 60) redFlags.push(`自由现金流转化均值 ${fcfAvg.toFixed(1)}%：账面利润没有变成现金。`)
  if (input.metrics.shareCountChange5y !== undefined && input.metrics.shareCountChange5y > 20) {
    redFlags.push('5 年股本稀释超过 20%：管理层在拿股东的钱买单。')
  }
  if (input.metrics.netDebtToEbitda !== undefined && input.metrics.netDebtToEbitda > 3.5) {
    redFlags.push('净债务/EBITDA 高于 3.5x：周期下行时议价能力归零。')
  }
  if (input.metrics.interestCoverage !== undefined && input.metrics.interestCoverage < 4) {
    redFlags.push('利息保障低于 4x：利率上行直接侵蚀股东盈余。')
  }

  let grade: QualityResult['grade']
  if (totalScore >= thresholds.excellent && unevidenced.length === 0) grade = 'excellent'
  else if (totalScore >= thresholds.pass) grade = 'adequate'
  else grade = 'insufficient'

  if (grade === 'excellent' && unevidenced.length > 0) grade = 'adequate'
  if (roicAvg > 0 && roicAvg < 8 && fcfAvg !== undefined && fcfAvg < 60) grade = 'insufficient'

  const gradeLabel =
    grade === 'excellent' ? '质量达标（证据齐）' : grade === 'adequate' ? '质量可讨论（仍有缺口）' : '质量不达标'

  const notes: string[] = []
  if (unevidenced.length > 0) notes.push(`有 ${unevidenced.length} 项无证据（${unevidenced.join('、')}），按 0 分计。`)
  if (redFlags.length > 0) notes.push(`触发 ${redFlags.length} 条红旗，先解释红旗再谈估值。`)
  if (notes.length === 0) notes.push('七项均有数据或证据支撑；估值前仍需确认数据口径与年份。')

  return {
    company: input.company,
    totalScore,
    maxScore,
    grade,
    gradeLabel,
    dimensions,
    unevidenced,
    redFlags,
    verdictNote: notes.join(' '),
  }
}

export function formatScore(score: number, max: number): string {
  return `${round(score, 1)}/${max}`
}
