# 项目交接文档

> **交接日期**：2026-10-28
> **仓库**：https://github.com/SeupLio/kotoba-jlpt（公开）
> **本地路径**：`E:\hc\kotoba-jlpt`
> **当前状态**：Web + Android 双端闭环；Web 通过类型检查、**56 项单测**、生产构建、Playwright 全流程与离线重载；
> Android 14（API 34）模拟器走通完整学习流程（撤销 / 结算 / 深色 / 断网重载 / 返回键 / 横屏，控制台零报错）；
> 已用本地 keystore 签出 **v1.0.0 release APK（4.4 MB）**并发布到 GitHub Releases，debug APK 约 5.4 MB。
> 本轮完成 README 用户化改版、品牌 Logo 与全端图标、词性补全与多义项、
> 新词预习后移、沉浸式视觉与个性化设置，并重拍 21 张截图与同步文档。release 签名材料仅保存在本机，未入库。
> **许可**：代码 MIT；`data/processed/` 数据 CC BY-SA 4.0

---

## 一、交付全景

### 1.1 一句话说明

「言葉 Kotoba」是一个**完全离线**的 JLPT N5–N1 日语词汇训练器。不联网、不需账号，用

> **连续三次答对 + 跨两个不同日期**才算掌握 → **自适应艾宾浩斯间隔 + 难度因子 + 逾期惩罚**排复习

这套规则解决「背完就忘」，并用蒙特卡洛模拟验证过这套规则比常见做法更有效。

### 1.2 交付清单

| 模块 | 产出 | 位置 | 状态 |
|---|---|---|---|
| 数据流水线 | 抓取 → 清洗 → 补录 → 校验 → 出包 | `scripts/fetch_sources.py`<br>`scripts/build_dataset.py`<br>`scripts/validate_dataset.py` | ✅ 可复现；`data/raw/` 已 gitignore |
| 中文释义补录 | 人工补录 1296 条 | `data/overrides/zh_glosses_1~5.json` | ✅ 已入库 |
| 词库成品 | N5–N1 五个分级 JSON + 索引 | `data/processed/` | ✅ 括号配对 0 异常，已重建 |
| Web 应用 | React 18 + TS + Vite + PWA | `web/` | ✅ 本轮已重建 |
| Android 应用 | Capacitor 6 打包 | `web/android/` | ✅ v1.0.0 release APK 4.4 MB 已签名并发布；debug 5.4 MB；模拟器全流程通过，真机 TTS 未验证 |
| 算法验证 | 蒙特卡洛模拟 + 参数敏感性 | `sim/` | ✅ 结论稳定（32 次重复） |
| 单元测试 | **56 项**（srs / quiz / scheduler / pace） | `web/src/core/*.test.ts` | ✅ 全部通过 |
| 界面自查 | Playwright 截图 + 控制台错误监控 | `scripts/capture.mjs`、`docs/screenshots/` | ✅ 21 张截图（含 Android 实拍） |
| Android 冒烟 | WebView CDP + adb 截图 + 断网/横屏检查 | `scripts/android-smoke.mjs` | ✅ 模拟器全流程通过 |
| 布局自查 | 手机 / 平板 / 桌面三档截图 | `scripts/inspect-layout.mjs` | ✅ 三档无横向溢出 |
| 文档 | 面向用户的 README、设计说明、交接文档 | `README.md`、`docs/DESIGN.md`、本文 | ✅ README 只保留功能、优势、截图与使用说明，技术细节留在 docs |
| CI | 类型检查 / 测试 / 构建 / 数据校验 | `.github/workflows/ci.yml` | ✅ 已上线，2026-10-28 首次运行三 job 全绿（[run #1](https://github.com/SeupLio/kotoba-jlpt/actions/runs/40637652793)） |

### 1.3 词库指标（本轮重建后）

| 指标 | 数值 |
|---|---|
| 总词数 | **7811** |
| 分级 | N5 674 / N4 630 / N3 1659 / N2 1778 / N1 3070 |
| 中文释义覆盖 | 100.0%（其中 1296 条为人工补录） |
| 英文释义覆盖 | 100.0% |
| 例句覆盖 | 92.8%（7245 / 7811） |
| 形近音近干扰项索引 | 100.0%（7808 / 7811） |
| 中文括号配对异常 | **0 条**（修复前 466 条） |

### 1.4 已排除的数据源（重要）

**egg rolls 牌组（CC BY-NC 4.0）已主动排除**，因为它禁止商用与再分发，混进来会污染整个数据集的许可。
后续若要扩充词库，同样必须先确认许可兼容性。当前只用了：

- OpenJLPT — CC BY-SA 4.0
- Japanese-Chinese-thesaurus — Unlicense

---

## 二、验证结论（可直接引用，勿重新推导）

模拟设定：180 天 / 1500 词 / 每日 90 个练习动作 / 每日新学上限 20 / **32 次重复取平均**。
遗忘模型 `R(t)=exp(-Δt·d/S)`，难度系数 `d∈[0.55,1.45]`。

| 策略 | 留存率 | 毕业后首次复习通过率 | 期望记住词数 | 每记住一词成本 |
|---|---|---|---|---|
| **本系统**：三连对跨天 + 自适应艾宾浩斯 + 逾期惩罚 | 94.1% | **76.2%** | **378.7** | **42.50** |
| 三连对（同天）+ 艾宾浩斯 + 难度因子 | 94.1% | 66.2% | 376.2 | 42.79 |
| 一次正确即掌握 + 固定间隔 | 94.1% | 36.7% | 360.1 | 44.62 |
| 三连对（同天）+ 固定间隔 | 94.1% | 67.1% | 347.7 | 46.30 |
| 不复习（学一遍） | 0.0% | 0.0% | 0.0 | — |

长期记忆形成：本系统 **79.1%** 的词稳定性 ≥30 天，**69.9%** ≥120 天。

**参数敏感性（连续正确次数 1→5）**：

```
1 次：首次复习通过率 36.0% | 期望记住 426.1 词 | 每词成本 37.74
2 次：首次复习通过率 59.2% | 期望记住 307.4 词 | 每词成本 52.31
3 次：首次复习通过率 76.7% | 期望记住 377.3 词 | 每词成本 42.67  ← 默认
4 次：首次复习通过率 81.4% | 期望记住 399.9 词 | 每词成本 40.31
5 次：首次复习通过率 81.5% | 期望记住 388.4 词 | 每词成本 41.51
```

> ⚠️ **诚实的结论**：单纯看「期望记住词数」，4 次略优于 3 次（多记约 6%，成本低约 5%，32 次重复下差异稳定）。
> 默认仍取 3 次，原因是：这是需求方明确指定的规则；3 次已把首次复习通过率从 36% 拉到 77%，主要矛盾已解决；
> 再练一轮换来的 6% 收益，不如把时间花在覆盖更多新词上。设置页已开放 `masteryStreak`，可按需改为 4~5。

---

## 三、本轮完成的工作

### 3.1 P0：466 条中文释义括号残缺（已修复）

**现象**：`甘い → 味道）甜的`、`暑い → 天气）热`，左括号被清洗规则误删。

**修复**：

1. `scripts/build_dataset.py` 的 `clean_zh()` 中，两段剥离非汉字前缀的正则不再吞掉 `（` `(`；
2. 增加 `strip_dangling()` 兜底，用栈配对扫描丢弃无匹配括号；
3. `scripts/validate_dataset.py` 新增中文释义括号配对检查；
4. 重建全部 `data/processed/*.json` 并同步到 `web/public/data/`。

**验证**：五个等级共 7811 词，括号配对异常 **0 条**；`npm test` 全部通过；
`quiz.ts` 的同义干扰项排除与截断逻辑未出现回归。

### 3.2 SRS 规则加固

- 新增 `failStreak`（连续失败）与 `lapses`（累计遗忘）双计数；
- 连续失败 3 次才退回学习中，避免「一年偶发错三次就永久降级」；
- 答错时清空 `correctDays`，防止旧日期让降级词当天重新刷回熟练；
- 提前复习（`overdueRatio < -0.15`）不升阶、不改期，避免通过「错词重练」刷间隔；
- 新增 `isLeech()`：连续错 2 次，或累计遗忘 4 次且仍在学习中，标为易错词；
- 新增 `nextVerificationAt()`：跨天验证固定在次日 04:00 后且至少间隔 6 小时，堵住 23:59→00:01 刷熟练的漏洞。

### 3.3 学习闭环

- **新词预习卡**：词形、读音（按设置显示假名/罗马字）、释义、例句、发音、标为已会；
- **场次内重练**：答错换题型，间隔 3~5 题重新出现，受 `maxRepeatPerWord` 上限约束；
- **待明日验证**：三连对完成但未跨天时明确标记，当天不再追问；
- **撤销**：提交先暂存，反馈阶段可撤销；撤销会移除本次插入的重练题；
- **结算页**：正确率、新学/复习/新熟练/用时，以及新词、需重看、已会跳过列表；
- **退出即保存**：关闭学习页也会提交当前题并结算，不丢最后一道题。

### 3.4 产品化功能

- **三步新手引导**：等级多选、每日新词数、目标考试日期；可在设置重看；
- **考试配速**：按剩余词量、每日新词数与考试日期计算是否跟得上，给出建议每日词数；
- **易错词卡与专项练习**：首页直接进入 `buildDrillPlan()` 生成的易错词队列；
- **未来 7 天复习负载**：逾期计入今天，提前看到复习高峰；
- **备份提醒**：超过 14 天未导出时在首页提示；设置页显示上次备份时间；
- **老用户迁移**：已有设置但缺 `onboarded` 字段时自动视为已引导，不打断；
- **导入校验**：检查 version/settings/progress/daily，先清空旧进度再写入，避免残留。

### 3.5 题型与数据展示

- 例句填空保留 `rubyBefore/rubyAfter` 注音，题干给中文提示而非英文；
- 填空下划线改为 `inline-block`，长例句换行时不再溢出卡片；
- 看词选义/自评卡按设置显示假名与罗马音提示；
- 词条详情增加「易混淆词 · 点按查看」，例句高亮支持动词活用降级到词干；
- 长例句中的目标词高亮不会被 ruby 拆分错位。

### 3.6 PWA 与工程

- Service Worker 缓存名改为构建时写入时间戳（Vite 插件替换 `__BUILD_ID__`），发版不再复用旧缓存；
- 导航请求改 **network-first**（发版后不再短暂加载旧 `index.html`），静态资源仍 stale-while-revalidate；
- `scripts/capture.mjs` 适配新手引导，并会自动纠正错题（撤销后重答），用于生成干净截图；
- 类型检查、56 项单测、生产构建全部通过；
- 生产 preview 下验证 Service Worker 已接管页面，断网重载仍能进入引导页，控制台无报错；
- `web/android/app/build/outputs/apk/debug/app-debug.apk` 已重新构建（5.4 MB，内含最新词库与 Web 产物）。

### 3.7 Android 模拟器实测（2026-10-27）

**环境**：AVD `kotoba_api34`（API 34 Google APIs x86_64，中等手机尺寸），无音频启动；APK 通过 adb 安装，
用 WebView 远程调试（CDP）驱动真实页面，关键界面用 `adb exec-out screencap` 取图。

**自动化流程**（`scripts/android-smoke.mjs`）：新手引导（N3 多选 / 每日 20 / 考试日期）→ 首页断言 →
学习预习卡 → 首题作答 → 撤销 → 重答 → 24 轮循环覆盖多题型 → 输入题提交 → 退出并检查结算页 →
词书搜索「駅」→ 统计页图表 → 深色主题切换 → IndexedDB 进度条数 → 断网重载 → 物理返回键 → 横屏。

**实测结果（最终 APK 重装后复跑）**：17 题作答 / 7 张预习卡；题型覆盖 `jp2zh`、`zh2jp`、`typing`、
`audio2jp`、`cloze`；撤销正常；结算页 39% / 18 题；搜索命中；统计图 10 个 SVG；深色生效；进度 8 条；
断网重载 Service Worker 外壳与底部导航仍在；返回键从设置页回到首页；横屏 915×364 不破版；
**控制台零报错**。听力题在模拟器上能出现并触发朗读调用，但因模拟器以 `-no-audio` 启动，**实际出声未验证**。

**本轮发现并修复的 Android 专属问题**：

1. **退出学习页跳过结算**：`exitAndSave` 直接 `onExit()`，已答题不展示结算；改为有作答时切到 `SummaryView`；
2. **软键盘滞留**：输入题提交或退出后键盘仍挡住界面；新增 `hideKeyboard()`，在提交与退出时调用；
3. **系统导航栏全黑**：浅色主题下底部黑边割裂；`MainActivity` 注册 `KotobaNav` JS 桥，主题切换时同步
   `setNavigationBarColor` 与图标明暗，washi/ink 两种主题均已验证。

### 3.8 竞品痛点审计与修正

| 用户痛点 | 本项目的处理 |
|---|---|
| 发音/音调不准 | 只把假名送给 TTS，避免汉字误读；不承诺音调高低，界面也不标注音调；系统无日语语音时自动隐藏听力题并说明原因 |
| 释义随意（駅→驿站、子供→幼稚） | 中文释义经过清洗、括号修复与 1296 条人工补录；释义顺序按常用度排列；训练中以中文释义为标准答案，干扰项优先取形近/音近/同场词 |
| 默认中文提示四选一，容易猜 | 默认题型包含看词选义、看义选词、看词选假名、听力选词、拼写、例句填空六种；新词首轮不直接考拼写，复习阶段强制换通道 |
| 「已掌握」始终是 0，逻辑不透明 | 首页与统计页分别展示「已熟练 / 待验证 / 学习中」；答题反馈显示 `连续正确 x/3`；规则说明写明三连对 + 跨天验证，跳过只算「已会」不计熟练 |
| 复习量滚雪球 / 复习债 | 首页展示未来 7 天复习负载；`maxReviewPerDay` 默认 100 封顶；逾期词优先但不无限叠加；**不做长期未复习自动核销**，并有回归测试防止回退 |
| 自动把久未复习判为已掌握 | 明确禁止；只有连续答对且跨天验证才提升状态，间隔再长也不会被系统「送分」 |
| 记忆模式单一、缺少递进 | 9 种题型 + `retryMode()` 答错换通道重练 + 场次内 3~5 题后重现 + 跨天验证，形成递进式多轮复习 |
| 拼写功能缺失 | `typing` 题型：听音/看义拼写，支持假名与汉字输入，提交后可对照读音 |
| 笔记 / 搜索 / 自定义语料库 | 词条支持个人笔记与自定义释义；词书支持汉字、假名、释义、笔记全文搜索；**暂不做自定义语料库**（见 DESIGN 第 10 节） |
| 平板闪退 / 列表不全 / 界面乱 | 增加全局 ErrorBoundary；三档响应式布局；词书每批渲染 60 条并可「加载更多」；56 项单测 + 模拟器走查 |

### 3.9 响应式重设计与视觉统一

- **手机（<720px）**：单列 + 底部导航；学习页进入专注模式，隐藏顶栏与导航；触控目标不小于 44px；
- **平板（720–1023px）**：内容居中，最大宽度 820px，双列卡片避免拉伸；
- **桌面（≥1024px）**：248px 侧栏 + 双列内容；词书为「列表 + 详情」双栏，统计页图表并排，设置页两栏；
- **横屏矮屏**：压缩顶栏与底部导航高度，隐藏副标题，保证一屏内可答题；
- 三档均沿用和纸、朱红、墨色与自绘 SVG 图标，深色主题同步系统状态栏/导航栏。

### 3.10 品牌、词义与沉浸式预习（2026-10-28）

- **品牌标识**：新增 `web/src/components/Brand.tsx`，统一 Web 顶栏 / 侧栏、引导页与 PWA / Android 图标；
  墨色圆角方牌 + 朱红日轮 + 和纸书页。Android 自适应图标、传统图标与启动屏全部重新生成，
  启动屏中文不再出现豆腐块；PWA 图标与 `icon.svg` 使用同一套几何。
- **词性补全**：新增 `num`（数词）与 `adj-ix`（形容词（い））映射，补齐 36 个未分类词与若干误标词；
  7,811 词词性覆盖 **100%**。词性在预习卡、答题反馈、词库列表与词条详情中统一展示。
- **多义项**：中文释义切分上限从 4 条提高到 6 条，单条最长 30 字；首条常见释义加粗，其余义项次级展示；
  新增 78 个 5~6 义项词条。结算页与词库列表同步展示首义 + 次义。
- **预习后移**：预习后不再立刻作答；`deferItem(list, pos, 4)` 将当前词后移至少 4 个位置，
  连续预习时形成约 5 个新词的滚动窗口，回到该词才出题。队列长度与答题进度不变；
  scheduler 新增 3 条「预习后移」单测。
- **沉浸式视觉**：首页问候 masthead、品牌印章与「一日一语」；学习页环境光、纸纹与竖排「言葉」水印；
  卡片 / 按钮 / 选项统一分层阴影与渐变；新增朱 / 靛 / 松 / 梅四套强调色、和纸纹理开关、
  沉浸背景开关与大字模式，设置随备份迁移。
- **文案与控件**：移除界面中的模拟参数与留存公式，改成用户可理解的规则说明；滑块跟随强调色；
  词库未学词不再显示空进度条，改为「未学」标签。
- **脚本**：`capture.mjs`、`inspect-layout.mjs`、`android-smoke.mjs` 均适配「连续预习直到出题」的新流程；
  README 截图已全部重拍。

---

## 四、环境与复现说明

### 4.1 本机环境

| 项 | 路径 / 版本 |
|---|---|
| Python | `C:\Users\10718\.workbuddy\binaries\python\envs\default\Scripts\python.exe`（Pillow、requests） |
| Node | v24.18.0（`web/` 内使用） |
| JDK | `C:\Program Files\Java\jdk-21` |
| Android SDK | `C:\Users\10718\AppData\Local\Android\Sdk`（platform-tools / platform-34 / build-tools 34.0.0） |
| Playwright | 项目根 `node_modules`（截图与自查） |
| Android 模拟器 | AVD `kotoba_api34`（API 34 Google APIs x86_64，`medium_phone`），WebView 调试端口 9222 |
| 开发服务器 | `http://127.0.0.1:29560`（本轮自查使用） |

### 4.2 常用命令

```bash
# Web 开发
cd E:/hc/kotoba-jlpt/web
npm run sync:data     # data/processed → public/data
npm run dev
npm run typecheck
npm test              # 56 项
npm run build

# 界面截图与冒烟（先启动 dev server）
cd E:/hc/kotoba-jlpt
node scripts/capture.mjs http://127.0.0.1:29560
node scripts/inspect-layout.mjs http://127.0.0.1:29560   # 手机 / 平板 / 桌面三档布局

# Android 模拟器冒烟（需先启动 AVD 并通过 adb 打开应用 WebView 调试）
cd E:/hc/kotoba-jlpt
node scripts/android-smoke.mjs

# 数据流水线
cd E:/hc/kotoba-jlpt
python scripts/fetch_sources.py      # 需要联网，抓取 data/raw/
python scripts/build_dataset.py
python scripts/validate_dataset.py

# 算法验证（约 1~2 分钟）
python sim/srs_sim.py --runs 32

# Android
cd E:/hc/kotoba-jlpt/web
npm run cap:sync
npm run android:debug
npm run android:release   # 需要 web/android/keystore.properties 与本地 keystore
```

### 4.3 Git 推送的特殊情况（务必注意）

**本地 git 历史与远端 `main` 是两条独立线**：此前仓库内容通过 **Git Data API** 以无父提交发布；
2026-10-28 又在 GitHub 网页端补交了 `.github/workflows/ci.yml`（commit `b9809e6`），远端因此有本地没有的提交。
**不要 `git pull` 合并这两条线，也不要 force push 覆盖远端。**

当前 Token 仍是 classic OAuth，scopes 为 `gist, read:org, repo`，缺 `workflow`；而本地历史包含
`.github/workflows/ci.yml`，所以**常规 `git push` 仍会被 GitHub 整次拒绝**。

旧的全量发布脚本：

```bash
python scripts/push_via_api.py SeupLio/kotoba-jlpt main
```

它从 `git credential fill` 读 Token（不落盘），创建根提交并更新 ref，且**跳过** `.github/workflows/*`。

> **该脚本现在会删掉远端 workflow**：它用本地工作树生成完整 tree，而 tree 中没有 `ci.yml`，
> 更新 `main` 后 GitHub 会视为删除，CI 随即失效。**此后只改文档/代码时，请用 Contents API
> 在远端 HEAD 之上提交单个文件**，不要再跑全量脚本。本轮 `docs/HANDOVER.md` 就是通过 Contents API 更新的。

> 要恢复常规 `git push`：新建 classic PAT 勾选 `repo` + `workflow`，在 Windows 凭据管理器更新
> `github.com` 的 Git 凭据（或 `git credential approve`）。**不要把 Token 贴在聊天里或提交到仓库。**
> 之后仍需先备份远端 `main`、确认两条历史如何合并，未经确认不要 force push。

**安全约束**：不要提交 `keystore`、`keystore.properties`、Token、`data/raw/` 或任何本机隐私数据。

### 4.4 Release 签名与发布

- 签名材料只保存在本机，均已被 `.gitignore` 排除：
  - `web/android/app/kotoba-release.keystore`
  - `web/android/keystore.properties`（含密码）
- `web/android/app/build.gradle` 会在 `keystore.properties` 存在时启用 release 签名；缺失时仍能构建未签名包。
- 当前 release 证书 SHA-256：`e24df553ba9c1ac74ebc156d7e569c25294378076f77a77dde262a6dbb21642e`。
  **丢失 keystore 后无法再发布可覆盖安装的升级包，请把 keystore 与密码一起离线备份。**
- 构建：`cd web && npm run android:release`，产物为
  `web/android/app/build/outputs/apk/release/app-release.apk`。
- v1.0.0 已发布：https://github.com/SeupLio/kotoba-jlpt/releases/tag/v1.0.0
- 发布新版本时递增 `versionCode`（每次 +1）与 `versionName`，再打新 tag 并上传 APK；不要复用已发布的 tag。

---

## 五、当前待办（按优先级）

| # | 事项 | 说明 | 优先级理由 |
|---|---|---|---|
| 1 | **Android 真机验证** | 模拟器已走通；真机重点检查：日语 TTS 是否出声、软键盘遮挡、物理返回键、离线启动、IndexedDB 持久化、新启动图标与闪屏 | 模拟器无音频输出，真实发声仍待验证 |
| 2 | **平板实机验证** | 用 iPad / Android 平板检查双列布局、长列表加载、横竖屏切换、词书与统计页的留白 | 竞品在平板上翻车最多，模拟器只能覆盖尺寸 |
| 3 | **真人使用 1~2 周** | 观察「预习后隔几个词再测」的 5 词窗口是否太长、待明日验证是否造成当日卡顿、易错词专项是否过量、考试配速建议是否合理 | 模拟不能替代真人体验；本轮改动了首次学习节奏，尤需实测 |
| 4 | **补齐剩余 7.2% 例句** | 无例句的词会自动避开 cloze，但题型均匀性受影响 | 数据增强，非阻塞 |
| 5 | **N1 释义颗粒度** | 部分 N1 词的义项排序与颗粒度较粗，适合按使用反馈逐步人工补录 | 内容质量 |
| 6 | **备份 release keystore** | 本机 `web/android/app/kotoba-release.keystore` 与 `keystore.properties` 尚未做离线备份；丢失后无法升级已发布版本 | 发布后最高优先级，需人工完成 |

### 已知风险与限制

- **TTS 依赖系统语音包**：Android 若未安装日语语音数据，听力题型会被自动剔除；模拟器无音频输出，**发声质量与音调未验证**；
- **模拟 ≠ 真人实验**：`sim/` 的结论用于策略间相对比较，真实记忆曲线因人而异；
- **词库以 JLPT 考试词表为准**：不含专业术语与方言；
- **中文释义为机器辅助 + 人工补录**：约 1296 条人工补录，其余来自开源词库；
- **无账号与云同步**：刻意如此，跨设备用导出/导入 JSON；
- **Android 仅模拟器验证**：API 34 模拟器已走通完整流程，真机、平板与不同厂商 WebView 仍需抽测；
- **无在线演示站**：仓库未启用 GitHub Pages，README 中的 Web 入口说明为「自建部署」；
- **release 签名依赖本机密钥**：keystore 与密码未入库，丢失后无法发布可覆盖安装的升级包，需自行离线备份；
- **不做自定义语料库**：词库结构固定为 JLPT 分级，个人补充通过笔记与自定义释义完成，避免引入许可不明的内容。

---

## 六、决策记录（避免重复踩坑）

| 决策 | 原因 | 影响面 |
|---|---|---|
| 排除 egg rolls 牌组 | CC BY-NC 4.0 禁止商用/限制再分发 | 词库收录范围 |
| TTS 改用双后端抽象 | Android WebView 不支持 `speechSynthesis` | `src/hooks/useSpeech.ts` |
| 掌握判定加入「跨 2 个日期」 | 挡住「当场记得、隔天就忘」的假熟练；模拟显示首次复习通过率提升约 10 个百分点 | `src/core/srs.ts` |
| 默认 `masteryStreak=3` 而非模拟最优的 4 | 需求方明确指定 3 次；已在设置页开放调整 | `DEFAULT_SETTINGS` |
| 新词先预习再测 | 避免「没学过就被考」带来的挫败与蒙对；预习不占答题次数 | `Study.tsx` |
| 预习后至少后移 4 个队列位置再作答 | 刚看完释义立刻选只是短时复述；隔几个词回来才接近真实回忆 | `Study.tsx`、`scheduler.ts` 的 `deferItem()` |
| 首义加粗、多义项最多 6 条 | 手机阅读优先常见义；无限展开会让反馈区长到无法扫读 | `GlossList`、词库清洗脚本 |
| 词性覆盖率必须 100% | 未分类词会让题型与释义提示失真；36 条缺口用 `num`/`adj-ix` 映射与人工修正补齐 | `scripts/` 词库构建、`validate_dataset.py` |
| 答错优先当场换题型重练 | 短时复述不可信；换通道才能验证形—音—义联结 | `Study.tsx`、`retryMode()` |
| 三连对完成后要求次日验证 | 同天刷满仍可能是短时记忆；固定次日 04:00 后，避免熬夜刷熟练 | `srs.ts`、`scheduler.ts` |
| 提交先暂存、可撤销 | 手滑成本低，避免一次误触毁掉连击与正确率 | `Study.tsx` |
| 易错词用连续失败 + 累计遗忘双阈值 | 纯累计会把偶发错误也标成易错；纯连续会漏掉反复遗忘 | `isLeech()` |
| 全程自绘 SVG 图标 | 规避第三方图标库授权与风格撞脸 | `src/components/icons.tsx` |
| Logo 用同一套几何生成所有尺寸 | 墨色方块 + 朱红日轮 + 和纸书页，避免 Web、PWA、Android 三套图标风格漂移 | `Brand.tsx`、`gen_*_icons.py` |
| 个性化用 `<html data-*>` 开关 | 纯 CSS 覆盖即可生效，首帧前写入不闪烁，无需为每个主题建 Context | `styles.css`、`App.tsx` |
| README 只讲用户价值 | GitHub 首页面向潜在使用者；架构、测试数、脚本命令留在 `docs/HANDOVER.md` | `README.md` |
| 应用 ID 统一为 `io.github.seuplio.kotoba` | GitHub 账号实为 `SeupLio` | `capacitor.config.ts`、`build.gradle` |
| 退出学习页先结算再回首页 | 直接退出会丢掉最后一题的反馈与成绩，用户以为「白学了」 | `Study.tsx`、`showSummary` |
| 输入题提交/退出时主动收键盘 | Android WebView 不会自动收起，键盘会挡住下一题与结算 | `platform/native.ts`、`hideKeyboard()` |
| 原生导航栏由 Web 主题驱动 | 系统默认黑条在浅色主题下割裂；JS 桥比 Capacitor 插件更轻 | `MainActivity.java`、`KotobaNav` |
| Service Worker 缓存名构建时注入时间戳 | 手写版本号容易忘记升级，导致发版后仍读旧缓存 | `vite.config.ts`、`public/sw.js` |
| TTS 只送假名、不标注音调 | 避免汉字多音误读；没有可靠音调数据时不假装专业 | `useSpeech.ts`、`DESIGN.md` 4.6 |
| 不做长期未复习自动核销 | 与「已掌握」语义冲突，会让用户误以为学会了；复习债用负载视图与上限管理 | `srs.ts` 回归测试 |
| 不做自定义语料库 | 用户自建内容难以校验许可与释义质量，且与 JLPT 分级目标冲突；用笔记/自定义释义替代 | `DESIGN.md` 第 10 节 |
| 三档断点 720 / 1024 | 手机单列、平板居中、桌面侧栏，覆盖常见浏览器与设备宽度 | `styles.css` |
| `data/raw/` 入 gitignore | 原始数据体积大且可重新下载 | 重建词库需先跑 `fetch_sources.py` |
| release keystore 只留本机 | 签名私钥一旦入库等同泄露，任何人都能伪造升级包 | `*.keystore`、`keystore.properties` 均在 gitignore |
| 首个版本定为 v1.0.0 | 与 `versionName "1.0.0"` 对齐，给后续 `versionCode` 递增留出空间 | `build.gradle`、GitHub Release |

---

## 七、给下一位接手者的建议顺序

1. 先在自己的 Android 真机上装 v1.0.0 release APK，按第五章第 1 项做真机验证（模拟器已通过，重点听音频与键盘）；
2. 用平板过一遍双列布局与横竖屏，确认长列表与触控目标；
3. 先离线备份 `web/android/app/kotoba-release.keystore` 与 `web/android/keystore.properties`，再继续发版；
4. CI 已在远端 `main` 生效：推送到 `main` 会自动跑三个 job，也可在 Actions 页面用 `workflow_dispatch` 手动重跑；
   本地提交仍以 `npm run typecheck` / `npm test` / `npm run build` 为准，别只看远端结果；
5. 连续使用 1~2 周，记录「待明日验证」「易错词专项」「考试配速」三处的真实感受，再决定是否调默认参数；
6. 有余力再补例句与 N1 释义。

> 本轮结束前应保证：`npm run typecheck`、`npm test`、`npm run build` 全绿，
> `node scripts/capture.mjs` 与 `node scripts/android-smoke.mjs` 无控制台错误，
> `git status` 中不包含 keystore/token/临时脚本。
