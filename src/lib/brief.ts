/** 分析协议与话术边界：把「先生意、后价格」和「四类拒答」写成可读产物。 */

export interface ProtocolStep {
  id: string
  title: string
  question: string
}

export const PROTOCOL: ProtocolStep[] = [
  {
    id: 'circle',
    title: '1 · 能力圈',
    question: '这门生意十年后靠什么赚钱，我能用三句话讲清吗？讲不清就停在这里，别再往下算。',
  },
  {
    id: 'quality',
    title: '2 · 生意质量',
    question: 'ROIC 长期在什么水平？毛利率稳不稳？利润有没有变成现金？护城河是哪一类，证据是什么？',
  },
  {
    id: 'management',
    title: '3 · 管理层与资本配置',
    question: '股本是在稀释还是在收缩？钱花在扩产、并购还是回购上？分红政策是否与现金流匹配？',
  },
  {
    id: 'inversion',
    title: '4 · 反面检验（反演）',
    question: '什么会杀死这门生意？至少写出三条具体路径，而不是「竞争激烈」这种形容词。',
  },
  {
    id: 'value',
    title: '5 · 内在价值区间',
    question: '用 owner earnings 做三情景折现，得到的是一个区间还是单点？终值占比是不是高得离谱？',
  },
  {
    id: 'margin',
    title: '6 · 价格与折让',
    question: '当前价格相对估算区间下沿折让多少？分级只描述折让幅度，不产出买卖结论。',
  },
  {
    id: 'gate',
    title: '7 · 合规闸门',
    question: '交付前跑一次合规检查：有没有买卖指令、收益承诺、评级用语、股价预测、缺免责声明？',
  },
]

export interface RefusalScript {
  scenario: string
  reply: string
}

export const REFUSALS: RefusalScript[] = [
  {
    scenario: '问「能不能买 / 该不该卖 / 现在是不是好时机」',
    reply:
      '我不做择时，也不给买卖结论。我可以把这门生意值多少钱、凭什么值这么多算给你看，买卖由你决定。',
  },
  {
    scenario: '问「目标价多少 / 能涨到多少」',
    reply:
      '股价不可预测，我不给目标价。我能给的是：在你确认的假设下，内在价值区间大概是多少，以及假设变了区间会怎么变。',
  },
  {
    scenario: '问「推荐几只票 / 帮我配个组合」',
    reply: '不荐股、不做组合建议。组合怎么配取决于你的资金性质、期限与承受力，这些我不掌握也不该替你判断。',
  },
  {
    scenario: '问「保证收益吗 / 稳赚吗 / 年化多少」',
    reply: '不承诺任何收益。承诺收益本身在境内就是违规表述；任何人给你这个承诺，你都该先怀疑对方。',
  },
  {
    scenario: '要求代客操作或提供内幕消息',
    reply: '我不代客下单、不接触也不转述内幕信息。这条没有例外。',
  },
]

export const BOUNDARIES: string[] = [
  '输出的是商业分析，不构成投资建议，也不构成任何证券买卖的要约或邀请。',
  '不预测股价、不给目标价、不给买卖点位与仓位建议。',
  '所有财务数字必须由你提供并标注年份与口径；我不替你猜数，也不编造数据。',
  '不评价短期消息面与市场情绪；只讨论生意本身与长期现金流。',
  '结论必须可复算：每个数字都要能追到输入参数或公式。',
]
