# dsh-thinking-language 插件：开发制作与安装使用全流程指南

> 本文档面向两类读者：想照着流程**复刻开发**一个 DeepSeek Harness 插件的开发者，以及拿到插件后需要**安装使用**它的用户。
> 对应插件版本：`dsh-thinking-language@0.1.0`（2026-08）。

---

## 目录

- [第一部分：开发制作流程](#第一部分开发制作流程)
  - [1. 前置知识：DeepSeek Harness 插件体系](#1-前置知识deepseek-harness-插件体系)
  - [2. 项目骨架](#2-项目骨架)
  - [3. 编写插件源码](#3-编写插件源码)
  - [4. 编写 bundle 层 cordis.patch.yml](#4-编写-bundle-层-cordispatchyml)
  - [5. 编写测试](#5-编写测试)
  - [6. 构建与自包含 prepare](#6-构建与自包含-prepare)
  - [7. 双语文档与 i18n 配对](#7-双语文档与-i18n-配对)
  - [8. 全链路验证清单](#8-全链路验证清单)
  - [9. 发布](#9-发布)
- [第二部分：安装使用流程](#第二部分安装使用流程)
  - [10. 环境与兼容性](#10-环境与兼容性)
  - [11. 方式一：npm 安装](#11-方式一npm-安装)
  - [12. 方式二：tarball 安装](#12-方式二tarball-安装)
  - [13. 方式三：GitHub 安装](#13-方式三github-安装)
  - [14. 验证生效](#14-验证生效)
  - [15. 自定义语言与措辞](#15-自定义语言与措辞)
  - [16. 常见问题排查](#16-常见问题排查)

---

# 第一部分：开发制作流程

## 1. 前置知识：DeepSeek Harness 插件体系

### 1.1 插件的本质

在 Harness 中，**插件是一个导出 `apply` 函数的 TypeScript 模块**。框架加载时调用 `apply(ctx, config)`，你通过 `ctx` 注册能力（工具、提示词段、事件监听、服务……），插件卸载时框架自动清理这些注册。

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'        // 插件名
export const inject = ['tools']        // 依赖的服务，就绪后才会加载
export interface Config { ... }        // 配置类型
export const Config = Schema.object({ ... })  // Schemastery 运行时校验 schema
export function apply(ctx: Context, config: Config) { ... }
```

### 1.2 两种发布形态（本插件是第二种）

| 形态 | 描述 | 本插件 |
|---|---|---|
| 普通插件包 | 只导出插件模块，由 cordis.yml 行引用 | ✗ |
| **组合包（bundle）** | npm 包 + `package.json` 里声明 `dsh.bundle` + 一份 `cordis.patch.yml` 层；用户 `dsh plugin add` 安装后自动激活 | ✓ |

**组合包**回答的问题是「这个包装上后贡献什么？」——一个插入插件行的 patch 层。用户不需要手动改任何 cordis.yml，装上即生效，因此是最适合「发布给别人用」的形态。

### 1.3 本插件的设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 实现机制 | 注册一个**有序系统提示词段** `thinking:language` | 全局生效、与 persona 共存、无副作用；思考语言本质是提示词引导 |
| 段顺序 order | `1` | 紧跟部署 persona（`0`）之后、工具引导区间（`100–199`）之前，模型最先读到 |
| 是否遮蔽 persona | 否 | 独立段名，与 `@deepseek-ai/dsh-persona` 的 shadow 机制互不干扰 |
| 依赖声明 | `inject: ['systemPrompt']` | 由 `dsh-system-prompt` 服务提供段注册 API |
| 默认文案 | 放在 bundle 层 `cordis.patch.yml` 里 | 用户想换语言时在自己的层覆盖 `config` 即可，不用改包——这是 Harness 的「默认值给用户大概率保留的配置」原则 |

> 注：persona（部署人设）走的是 cordis 组装文件而非 `settings.yaml`，`dsh-system-prompt` 也没有注册 settings 命名空间，所以「思考语言」不能做成 settings 配置项，做成 prompt 段插件是正解。

### 1.4 环境要求

- Node.js `^22.19.0 || >=24.0.0`（与 dsh 一致）
- pnpm ≥ 10（本插件开发用 11.7.0）
- 一个可用的 dsh 部署用于端到端验证（本流程使用 deepseek-harness 源码 checkout 的 `pnpm dsh`）

---

## 2. 项目骨架

### 2.1 目录结构

```
dsh-thinking-language/
├── package.json           # dsh.bundle manifest + 脚本 + 依赖声明
├── cordis.patch.yml       # bundle 层：注册插件行并提供默认配置
├── src/index.ts           # 插件源码
├── tests/thinking-language.spec.ts   # vitest 测试
├── scripts/smoke.mjs      # 构建产物冒烟验证
├── tsconfig.json          # 严格类型检查配置
├── tsdown.config.ts       # 自包含构建配置
├── vitest.config.ts
├── README.md / README.zh.md           # 双语文档
├── README.i18n.yaml       # 双语配对记录（blob 哈希）
├── LICENSE                # MIT
└── .gitignore             # node_modules/ lib/ *.tsbuildinfo *.log
```

### 2.2 package.json 关键字段逐项说明

```json
{
  "name": "dsh-thinking-language",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "exports": {
    ".": { "types": "./lib/index.d.ts", "default": "./lib/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "README.zh.md", "LICENSE"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "scripts": {
    "prepare": "pnpm run build",
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "smoke": "node scripts/smoke.mjs"
  },
  "dependencies": {
    "@deepseek-ai/schemastery": "^3.18.1"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": ">=4.0.1",
    "@deepseek-ai/dsh-system-prompt": "^0.1.0-rc.2"
  }
}
```

- **`dsh.bundle.patch`**：这是「组合包」的身份证明。`dsh plugin add` 检测到它才会把该包追加进 profile 的 `dsh.profile.bundles` 并激活层。
- **`files`**：发布清单。`lib/` 是构建产物，`cordis.patch.yml` 是层文件，README/LICENSE 是文档义务。
- **`prepare`**：pnpm 在**本地 install 后**和**git 安装后**都会运行它。必须自包含——不能假设旁边有 monorepo checkout，所以直接跑 `tsdown` 转译 `src/`，不做项目引用、不做类型检查。
- **`dependencies` vs `peerDependencies`**：schemastery 是插件自身运行时依赖（schema 校验）；cordis 和 dsh-system-prompt 由用户运行的 dsh 安装提供，声明 peer 即可——内置包名始终从 dsh 安装目录解析，组合包可以放心依赖它们。
- **版本范围**：`^0.1.0-rc.2` 面向当前 rc 系列的 `@deepseek-ai/dsh-system-prompt`（npm 上最新 dsh `0.1.0-rc.6` 自带 `0.1.0-rc.6`）。

### 2.3 tsconfig.json

采用与官方仓库一致的严格设置：

```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2024"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": true
  },
  "include": ["src", "tests", "tsdown.config.ts", "vitest.config.ts"]
}
```

### 2.4 tsdown.config.ts

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,   // ← 关键：输出 .js/.d.ts 而非 .mjs/.d.mts
  dts: true,
  clean: true,
})
```

> **踩坑记录**：tsdown 默认会输出 `lib/index.mjs` / `lib/index.d.mts`，与 `package.json` 里 `main: lib/index.js` 不匹配。加 `fixedExtension: false`（package 声明了 `"type": "module"`，`.js` 就是 ESM）后输出与入口一致。

---

## 3. 编写插件源码

完整源码见 `src/index.ts`，按块讲解：

### 3.1 模块声明与契约

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'thinking-language'
export const inject = ['systemPrompt']
```

- `inject: ['systemPrompt']` 声明依赖；`import type {} from '@deepseek-ai/dsh-system-prompt'` 激活该包对 cordis `Context` 的**模块增强**，使 `ctx.systemPrompt` 获得类型。
- `inject` 保证 `apply` 执行时服务已就绪。

### 3.2 导出稳定常量

```ts
export const THINKING_LANGUAGE_SECTION = 'thinking:language'
export const THINKING_LANGUAGE_ORDER = 1
```

导出段名与顺序，让测试、部署覆盖层和 waterfall 监听器引用常量而不是复制字符串。段名采用 `命名空间:名称` 风格（与官方 `harness:identity`、`deployment:persona` 一致）。

### 3.3 Config 类型 + 运行时 schema

```ts
export interface Config {
  /** 指令文本；模板，{{…}} 组严格插值；空文本渲染时删除该段 */
  text: string
  /** 使该段成为完整系统提示词（默认关闭） */
  complete?: boolean
}

export const Config: z<Config> = z.object({
  text: z.string().required(),
  complete: z.boolean().default(false),
})
```

- **类型与 schema 同名导出**是 Cordis 的插件配置契约：加载时 schema 校验用户配置并填充默认值。
- 遵循「无硬编码可调参数」原则：凡部署可能改的值（指令文本）都是配置字段。

### 3.4 apply：注册段

```ts
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: THINKING_LANGUAGE_SECTION,
    order: THINKING_LANGUAGE_ORDER,
    text: config.text,
    ...(config.complete ? { complete: true } : {}),
  }), 'thinking-language.section()')
}
```

- `ctx.systemPrompt.section(...)` 返回 disposer；用 `ctx.effect(...)` 包裹后**注册随调用 fiber 一并 dispose**——配置热重载时旧段先移除、新段再注册，不会残留。
- `text` 是模板：`{{model}}`、`{{cwd}}` 等已注册提示词变量会在渲染阶段严格插值（随附 agent loop 注册了这两个）。

### 3.5 为什么这样做能覆盖「思考过程中文」

系统提示词组装时，各段按 `order` 升序拼接：`-100` harness 身份 → `0` persona → **`1` 本段** → `100–199` 工具引导。本段的指令因此位于提示词正文开头，是模型思考时最先读到、权重最高的引导。它不改模型、不加工具、不影响 persona 与任何其他插件，是最小侵入方案。

---

## 4. 编写 bundle 层 cordis.patch.yml

```yaml
# dsh-thinking-language bundle 层：一个 insert 行，默认配置即中文思考指令。
# 部署可在更晚的层（profile cordis.patch.yml 或 --patch overlay）覆盖该行。
- insert:
    - id: thinking-language
      name: dsh-thinking-language
      config:
        text: >-
          请始终使用中文进行思考、推理与回复：你的思考过程（reasoning）与所有输出一律使用中文，包括对工具调用结果的解读与最终回答。
```

要点：

- **`name` 用包名**而非相对路径——安装后的模块由 Node 从 dsh 安装目录解析（本地开发验证时才临时改绝对路径）。
- **层顺序**（后应用者胜出）：profile 的 `dsh.profile.bundles` 按序应用 → profile 自己的 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → 每个 `--patch <path>`。
- **patch 替换整行 `config`**，不是深合并：用户覆盖时要重述想要的每个键。

---

## 5. 编写测试

测试策略：直接挂载插件 + `dsh-system-prompt` 服务，断言 `assemble()` 的结果。8 个用例对应 8 条行为契约：

| 用例 | 验证的行为 |
|---|---|
| 段紧跟 persona 之后 | 注册成功，段顺序正确 |
| 位于工具引导之前 | order 契约（`< 100`） |
| 不 shadow persona | 与 persona 插件共存 |
| fiber 卸载后移除 | 生命周期清理 |
| 变量严格插值 | `{{model}}` 模板契约 |
| 空文本渲染时丢弃 | 与注册表行为一致 |
| 同层重复注册拒绝 | 段名唯一性 |
| `complete: true` | 成为完整提示词 |

关键测试代码（节选）：

```ts
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as ThinkingLanguage from '../src/index'

async function harness(persona = ''): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { persona })
  return ctx
}

it('registers the instruction section right after the deployment persona', async () => {
  const ctx = await harness('deployment identity')
  await ctx.plugin(ThinkingLanguage, { text: 'Always think in Chinese.' })

  const assembly = await ctx.systemPrompt.assemble()
  expect(assembly.sections.map(s => s.name)).toEqual([
    'harness:identity',
    'deployment:persona',
    'thinking:language',
  ])
})
```

运行：`pnpm test`。

---

## 6. 构建与自包含 prepare

```sh
pnpm install   # 装依赖；pnpm 会自动跑 prepare → tsdown → lib/
pnpm build     # 手动构建，输出 lib/index.js + lib/index.d.ts
```

`lib/` 是发布入口（`main`/`types` 指向它）。**不要提交 `lib/` 到 git**（`.gitignore` 已排除），git 安装时 `prepare` 会现场构建；npm 发布时则在 `pnpm publish` 前由 `prepublishOnly`/`prepare` 保证产物存在。

---

## 7. 双语文档与 i18n 配对

按官方仓库文档标准：

1. `README.md`（英文）+ `README.zh.md`（中文），顶部互相链接，结构包含：简介、安装、配置表（键/默认值/含义）、工作原理、模型体验（模型看到什么 / Token 影响 / KV Cache 影响）、开发、发布、已知限制。
2. `README.i18n.yaml` 记录两份文件的 git blob 哈希，作为「最近一次确认一致」的配对凭证：

```sh
git hash-object README.md     # 得到哈希后填入
git hash-object README.zh.md
```

```yaml
README.md: f99554dd6aaf8ccff5cc48c4e6b86e716459b4d4
README.zh.md: 5c4195614791878c5b91bcee1d0e4f896570cb3c
```

任一侧改动后必须同步另一侧并重新记录哈希。

---

## 8. 全链路验证清单

发布前按顺序跑一遍（本插件实际全部通过）：

```sh
# 1. 类型检查
pnpm typecheck

# 2. 单元测试（8 用例）
pnpm test

# 3. 构建 + 构建产物冒烟（把 lib/ 挂到真实 cordis/dsh-system-prompt 上，
#    断言渲染后的提示词包含指令）
pnpm build && pnpm smoke
# 期望输出：
#   sections: harness:identity | deployment:persona | thinking:language
#   instruction present: true
#   smoke ok

# 4. 真实 loader 解析（在 deepseek-harness checkout 内，用临时 overlay 指向本地构建产物）
#    overlay 内容：- insert: [ { id: thinking-language, name: '<绝对路径>/lib/index.js', config: { text: ... } } ]
pnpm dsh web --patch <overlay>.yml --dump-config
# 期望 dump 输出中包含该行及其 config

# 5. 发布形态检查
pnpm pack --pack-destination .
tar -tzf dsh-thinking-language-0.1.0.tgz
# 期望清单：lib/index.js、lib/index.d.ts、cordis.patch.yml、README.md、README.zh.md、LICENSE、package.json
```

> Windows 提示：若 vitest/vite 报 `spawn EPERM`，通常是在受限沙箱/受限终端里跑测试所致（vite 加载配置需要 spawn 子进程）；换到完整权限终端即可，与插件代码无关。

---

## 9. 发布

### 9.1 npm

```sh
# 发布前：改版本号（pnpm version patch）、确认 package.json 的 repository/author、
# 确认包名未被占用（无 scope 包名易撞名，可加自己的 scope）、
# 手动跑一次构建确保 lib/ 最新
pnpm build
pnpm publish
```

`pnpm publish` 按 `files` 清单打包（发布生命周期会再次触发构建脚本，手动 `pnpm build` 是双保险）。发布后用户安装：`dsh plugin add <包名>`。

### 9.2 tarball

```sh
pnpm pack
# 产出 dsh-thinking-language-0.1.0.tgz，直接分发给用户
```

### 9.3 GitHub

```sh
git init && git add . && git commit -m "feat: dsh-thinking-language bundle"
git remote add origin <你的仓库>
git push -u origin main
```

用户侧：`dsh plugin add github:you/dsh-thinking-language`（见 13 节）。**必须**保留 `prepare` 脚本：git 安装拉的是源码，靠它构建出 `lib/`。

---

# 第二部分：安装使用流程

## 10. 环境与兼容性

| 项 | 要求 |
|---|---|
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| dsh | ≥ `0.1.0-rc.2`（peer 依赖 `@deepseek-ai/dsh-system-prompt ^0.1.0-rc.2`），推荐最新 rc（当前 `0.1.0-rc.6`） |
| 前提 | 已有一个可启动的 profile（没有则安装时 `dsh plugin` 会自动初始化，以 `@deepseek-ai/dsh-base` 为第一个组合包） |

生效范围：插件挂载在**宿主组装**（不是 agent preset），因此安装后**重启 dsh 进程**即对全部 agent 生效，旧会话的新请求同样携带该段。

## 11. 方式一：npm 安装

```sh
# 安装：首次使用会自动初始化 profile，并把本包追加进 dsh.profile.bundles
dsh plugin --profile demo add dsh-thinking-language

# 不启动、只验证层
dsh --profile demo --dump-config
# 期望出现：
#   # == dsh-thinking-language
#   - id: thinking-language
#     name: dsh-thinking-language
#     config:
#       text: 请始终使用中文进行思考、推理与回复：……

# 启动
dsh --profile demo
# 或 Web UI：
dsh --profile demo web
```

卸载：

```sh
dsh plugin --profile demo remove dsh-thinking-language
```

## 12. 方式二：tarball 安装

适合内网/离线分发：开发者执行 `pnpm pack` 产出 `dsh-thinking-language-0.1.0.tgz`，用户执行：

```sh
dsh plugin --profile demo add ./dsh-thinking-language-0.1.0.tgz
```

## 13. 方式三：GitHub 安装

```sh
dsh plugin --profile demo add github:you/dsh-thinking-language
```

**注意构建授权这道坎**：

1. git 安装拉取源码，安装后 pnpm 会运行 `prepare` 构建 `lib/`。
2. pnpm ≥ 10 默认**拒绝**运行 git 依赖的 `prepare` 脚本，所以第一次 `add` 会失败；`dsh` 会提示你把 pnpm 打印的确切包键写进该 profile 的 `pnpm-workspace.yaml`：

```yaml
allowBuilds:
  dsh-thinking-language: true
```

3. 重新执行 `add` 即可。
4. **请如实看待这项授权**：它允许该包代码在安装时于你的机器上执行。只对源码可信的包授权，并锁定 commit（`github:you/dsh-thinking-language#<commit-sha>`），防止后续推送悄悄改变实际运行的代码。

## 14. 验证生效

1. `dsh --profile <name> --dump-config` 能看到 `# == dsh-thinking-language` 层（结构验证）。
2. 启动 dsh 后新开一个会话（Web UI 直接新建对话），随便问一句；观察模型回复为中文、思考（reasoning）内容为中文。
3. 想直接看提示词结构，可在会话里问模型「你的系统提示词里 thinking:language 段写了什么」作交叉确认（模型可能按策略拒绝复述，此时以行为观察为准）。

## 15. 自定义语言与措辞

用户**不需要改插件包**。patch 层替换整行 `config`，在自己的层里重述即可。

### 15.1 只换文案（profile 级）

编辑 profile 目录下的 `cordis.patch.yml`（没有就新建）：

```yaml
- id: thinking-language
  config:
    text: >-
      Always think, reason, and reply in English.
```

### 15.2 命令行 overlay（一次性）

```sh
dsh --profile demo --patch ./my-overlay.yml
```

`my-overlay.yml`：

```yaml
- insert:
    - id: thinking-language
      config:
        text: >-
          使用简体中文思考与回复，代码与专有名词除外。
```

### 15.3 完全停用（不卸载包）

在 profile 的 `cordis.patch.yml` 里禁用该行：

```yaml
- id: thinking-language
  disabled: true
```

> 层顺序回顾（后胜出）：profile bundles → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 参数。所以 15.1 的写法一定压过 bundle 默认值。

## 16. 常见问题排查

| 现象 | 原因与处理 |
|---|---|
| 装上后没生效 | ① dsh 进程没重启——bundle 层在**启动时**组合，装完必须重启（与 settings.yaml 的热重载不同）；② 检查 `--dump-config` 里是否出现该层，且 profile 用的确实是这个 profile |
| 思考/回复仍是英文 | ① 确认重启后**新建会话**观察；② 个别非中文片段属正常（思考是模型自身推理，提示词是强引导而非硬开关）；③ 检查是否被更晚的层覆盖了 `text` 或禁用了行 |
| 与自己的 persona 冲突 | 本插件不 shadow persona，二者共存；但若你的 preset 里 persona 行开了 `complete: true`（完整人设），它会连同本段一起抑制——这是 complete 段的定义行为 |
| `pnpm` 提示 peer 依赖告警 | 你的 dsh 版本太旧（`dsh-system-prompt < 0.1.0-rc.2`）。升级 dsh：`npm i -g @deepseek-ai/dsh@latest` 或让 profile 使用新版 |
| git 安装第一次失败 | 见 13 节：在 profile 的 `pnpm-workspace.yaml` 加 `allowBuilds` 后重装 |
| 改了 `text` 不生效 | patch 层**替换整行 config**而非合并——覆盖时遗漏的键会回到 schema 默认值（`text` 无默认值，遗漏会加载失败）；重述完整 `config` |

---

## 附：与官方文档的对应关系

本流程依据的官方标准文档（deepseek-harness 仓库内）：

| 本文章节 | 官方文档 |
|---|---|
| 插件契约 / 配置 schema | `docs/user/develop/basic/index.md`、`config.md` |
| 组合包与 profile、层顺序 | `docs/user/develop/basic/publish.md` |
| 系统提示词段与 order 约定 | `packages/core/system-prompt/README.md` |
| persona shadow 机制 | `packages/preset/persona/README.md` |
| 双语配对 | `docs/i18n/README.md`（`verify-translation-pairing` 脚本） |
