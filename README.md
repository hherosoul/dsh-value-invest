# dsh-value-invest

DeepSeek Harness（`dsh`）的价值投资分析插件：用巴菲特/芒格那套「先生意、后价格」的框架分析**公司**，
并给模型装上一道**合规闸门**。

它不推荐股票、不给目标价、不预测涨跌、不承诺收益。工具只做三件事：算数、要求证据、拦下越界话术。

| 工具 | 用途 | 关键约束 |
|---|---|---|
| `vi_brief` | 返回七步分析协议、四类拒答话术与话术边界 | 新开一次分析时先调，避免模型自由发挥 |
| `vi_quality_scorecard` | 芒格质量清单打分（七项，满分 100） | 每项要么有数据、要么有证据；护城河只认可复述的事实，形容词算无证据 |
| `vi_intrinsic_value` | owner earnings 三情景折现，出**区间** | owner earnings ≤ 0 时直接判定模型不成立，不硬算 |
| `vi_margin_of_safety` | 价格相对价值下沿的折让幅度分级 | 只描述折让幅度，输出里显式声明「不含买卖结论」 |
| `vi_compliance_check` | 交付前文本扫描 | 命中买卖指令/收益承诺/评级用语/内幕暗示/股价预测/代客理财即判不通过 |

## 安装

```sh
dsh plugin --profile vi add github:hherosoul/dsh-value-invest#v0.1.0
```

`vi` 只是示例 profile 名，换成你自己的即可。

GitHub 直装拉的是源码，`dsh` 会运行本包的 `prepare` 构建出 `dist/`。pnpm ≥ 10 默认拒绝执行
git 依赖的构建脚本，所以**第一次 `add` 会失败**，并打印需要授权的确切包键。把那个键写进该
profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-value-invest: true
```

然后重新执行 `add`。

> 安全提示：授权构建等于允许本包代码在安装时于你的机器上执行，且不在 agent 沙箱内。
> 只对源码可信的包授权，并锁 commit（`github:hherosoul/dsh-value-invest#<sha>`），
> 这样后续推送无法悄悄改掉你实际运行的内容。

不想授权构建，也可以用 tarball（已构建好，无需 `allowBuilds`）：

```sh
pnpm pack
dsh plugin --profile vi add ./dsh-value-invest-0.1.0.tgz
```

## 配置

在 profile 的 `cordis.patch.yml`（或 `$DSH_HOME/cordis.patch.yml`）里覆盖本层：

```yaml
- id: value-invest
  name: dsh-value-invest
  config:
    discountRate: 9
    terminalGrowth: 2.5
    marginAmple: 35
    requireDisclaimer: true
```

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `discountRate` | number | `10` | 折现率（%），DCF 的 r |
| `terminalGrowth` | number | `3` | 永续增长率（%），必须小于折现率 |
| `maxGrowth` | number | `15` | 单情景增速上限（%），超出按上限算并告警 |
| `projectionYears` | number | `10` | 显式预测年数 |
| `marginThin` / `marginAdequate` / `marginAmple` | number | `10` / `25` / `40` | 安全边际四级分界（%） |
| `qualityExcellent` / `qualityPass` | number | `80` / `60` | 质量清单分数线 |
| `disclaimer` | string | 见源码 | 强制免责声明全文 |
| `requireDisclaimer` | boolean | `true` | 交付文本必须含免责声明 |
| `disclaimerKey` | string | `不构成投资建议` | 判定「已带声明」的关键短语 |
| `extraForbiddenPatterns` | string[] | `[]` | 追加合规禁用正则 |
| `briefHouseRules` | string[] | `[]` | 追加分析纪律，会出现在 `vi_brief` 输出里 |

**数值口径**：所有比率一律百分数——`18.5` 表示 18.5%，不是 0.185。

## 验证

三层验证，从便宜到贵：

```sh
# 1) 层是否被 profile 采纳：应看到 "# == dsh-value-invest"
dsh --profile vi --dump-config

# 2) 离线自检：注册、参数校验、execute、输出 schema、render、卸载
pnpm install && pnpm run build && pnpm smoke

# 3) 真跑（需模型凭据）：
dsh --profile vi "先调用 vi_brief，再用三行总结七步协议"
```

第 3 步在无 LLM 凭据的环境下会报 `MISSING_CREDENTIAL`，这是环境问题不是插件问题。

## 卸载

```sh
dsh plugin --profile vi remove dsh-value-invest
```

工具随插件 fiber 一起注销，不留残留注册。

## 合规立场

本插件按中国内地口径设红线：证券投资咨询属持牌业务。

- 不对具体证券给出买入/卖出/持有建议，不给目标价与买卖点位；
- 不承诺或暗示收益，不使用「必涨」「稳赚」「翻倍」这类表述；
- 不使用「强烈推荐」「金股」「跑赢大盘」等诱导性评级用语；
- 不接触、不复述内幕信息与所谓小道消息；
- 不代客下单、不代客理财；
- 交付文本必须带免责声明（可用 `requireDisclaimer` 调整）。

`vi_compliance_check` 是**文本机械筛查**，不是法律意见，也不能替代你自己的合规审查。
规则清单在 `src/lib/compliance.ts`，可按部署需要扩充。

## 已知限制

- **不取数**：所有财务数字由使用者提供。插件不连行情、不抓财报，也不替你猜数。
- **估值依赖假设**：DCF 的结论由折现率、增速、永续增长共同决定；插件只保证算得对、假设写在明面上。
- **不适用于所有生意**：owner earnings 为负、或现金流极不规则的生意（早期公司、强周期底部、
  金融股）用折现模型意义有限，工具会就此直说而不是给个数字。
- **质量清单是纪律工具，不是评分真理**：七项权重是编辑选择，可读可改。

## 许可

MIT，见 [LICENSE](./LICENSE)。

## 兼容性

| 插件版本 | dsh 版本 |
|---|---|
| 0.1.x | `>=0.2.0 <0.3.0` |
