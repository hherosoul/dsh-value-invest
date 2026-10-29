import Schema from '@deepseek-ai/schemastery'

/**
 * 所有「不同部署可能取不同值」的参数都在这里，代码里不硬编码。
 * 比率一律用百分数：18.5 表示 18.5%。
 */
export interface Config {
  /** 折现率（%），DCF 的 r。 */
  discountRate: number
  /** 永续增长率（%），必须小于 discountRate。 */
  terminalGrowth: number
  /** 单情景增速上限（%），超过则截断并告警。 */
  maxGrowth: number
  /** 显式预测年数。 */
  projectionYears: number
  /** 安全边际「薄」的下界（%）。 */
  marginThin: number
  /** 安全边际「可接受」的下界（%）。 */
  marginAdequate: number
  /** 安全边际「充足」的下界（%）。 */
  marginAmple: number
  /** 质量清单「优」的分数线。 */
  qualityExcellent: number
  /** 质量清单「及格」的分数线。 */
  qualityPass: number
  /** 强制附带的免责声明全文。 */
  disclaimer: string
  /** 是否强制要求交付文本包含免责声明。 */
  requireDisclaimer: boolean
  /** 判定「已带免责声明」的关键短语。 */
  disclaimerKey: string
  /** 追加的合规禁用正则（字符串形式，便于部署方扩充）。 */
  extraForbiddenPatterns: string[]
  /** 追加到分析协议末尾的自有纪律条款。 */
  briefHouseRules: string[]
}

export const Config: Schema<Config> = Schema.object({
  discountRate: Schema.number().default(10).description('折现率（%）。'),
  terminalGrowth: Schema.number().default(3).description('永续增长率（%），必须小于折现率。'),
  maxGrowth: Schema.number().default(15).description('单情景增速上限（%），超出按上限计算并告警。'),
  projectionYears: Schema.number().default(10).description('显式预测年数。'),
  marginThin: Schema.number().default(10).description('安全边际「薄」的下界（%）。'),
  marginAdequate: Schema.number().default(25).description('安全边际「可接受」的下界（%）。'),
  marginAmple: Schema.number().default(40).description('安全边际「充足」的下界（%）。'),
  qualityExcellent: Schema.number().default(80).description('质量清单「优」的分数线。'),
  qualityPass: Schema.number().default(60).description('质量清单「及格」的分数线。'),
  disclaimer: Schema.string()
    .default('本分析基于你提供的财务数据与假设，仅用于研究与讨论，不构成投资建议，也不构成任何证券买卖的要约或邀请。')
    .description('强制附带的免责声明。'),
  requireDisclaimer: Schema.boolean().default(true).description('交付文本必须包含免责声明。'),
  disclaimerKey: Schema.string().default('不构成投资建议').description('判定文本已带免责声明的关键短语。'),
  extraForbiddenPatterns: Schema.array(Schema.string()).default([]).description('追加的合规禁用正则（字符串）。'),
  briefHouseRules: Schema.array(Schema.string()).default([]).description('追加到分析协议的自有纪律条款。'),
})
