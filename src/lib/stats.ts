/** 纯计算辅助：不碰 I/O，不做格式化。 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

/** 总体标准差（样本即全集，不再减自由度）。 */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  let acc = 0
  for (const value of values) acc += (value - avg) ** 2
  return Math.sqrt(acc / values.length)
}

/** 变异系数：标准差 / 均值绝对值，均值为 0 时返回 0。 */
export function coefficientOfVariation(values: number[]): number {
  const avg = mean(values)
  if (avg === 0) return 0
  return stdev(values) / Math.abs(avg)
}

export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper)
}

/** 百分数 → 小数。 */
export function toRate(percent: number): number {
  return percent / 100
}
