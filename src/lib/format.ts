/** 渲染用的文本格式化：只拼接字符串，不做业务判断。 */

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`
}

export function times(value: number, digits = 2): string {
  return `${value.toFixed(digits)}x`
}

export function money(value: number, unit: string): string {
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4
  return `${value.toFixed(digits)} ${unit}`
}

export function bullet(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n')
}

export function rule(title: string): string {
  return `\n**${title}**\n`
}
