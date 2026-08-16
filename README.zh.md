# dsh-thinking-language

[English](README.md) | [中文](README.zh.md)

一个单段式的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 组合包，用于固定 agent **思考、推理与回复**所用的语言。随附默认是中文模式：安装后，部署组装出的每个 agent 都会在 persona 之后获得一个有序系统提示词段，要求模型用中文思考并作答。

它适用于任何 DeepSeek Harness 部署（Web UI、headless、ACP），因为它只贡献一个[系统提示词段](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/core/system-prompt/README.md)——没有工具、没有 shell 权限、不改动模型。

## 安装

```sh
dsh plugin --profile <name> add dsh-thinking-language
```

该命令把包装进 profile，并追加组合包层（包声明了 `dsh.bundle`，`dsh plugin` 会自动激活它）。随后：

```sh
dsh --profile <name>
```

该层注册 `thinking-language` 行，其默认配置就是中文指令，无需任何额外设置。启动前可先单独验证这一层：

```sh
dsh --profile <name> --dump-config   # 显示 "# == dsh-thinking-language" 层
```

## 配置

一行，三个字段：

| 键 | 默认值 | 含义 |
|---|---|---|
| `text` | 下方中文指令 | 渲染为 `thinking:language` 段的指令文本。它是模板：完整的 `{{…}}` 组会严格按已注册提示词变量插值（随附 agent loop 注册了 `{{model}}` 与 `{{cwd}}`）。空文本在渲染时删除该段。 |
| `complete` | `false` | 使该段成为完整系统提示词，抑制其他所有段。除非语言指令需要单独存在，否则不要开启。 |

默认 `text` 为：

> 请始终使用中文进行思考、推理与回复：你的思考过程（reasoning）与所有输出一律使用中文，包括对工具调用结果的解读与最终回答。

## 更换语言或措辞

patch 层会替换目标行的整个 `config`，因此覆盖时需要重述你想要的每个键。在 profile 自己的 `cordis.patch.yml`（或 `--patch` overlay）中写：

```yaml
- id: thinking-language
  config:
    text: >-
      Always think, reason, and reply in English.
```

## 工作原理

插件导出标准插件契约（`name`、`inject: ['systemPrompt']`、`Config` 类型与 Schemastery schema、`apply`），并注册一个段：

- **名称**：`thinking:language`（导出为 `THINKING_LANGUAGE_SECTION`）。
- **顺序**：`1` —— 紧跟部署 persona（`0`）之后、工具引导区间（`100–199`）之前，因此模型在提示词正文开头就会读到语言指令。
- 它从不遮蔽 persona：persona preset（`@deepseek-ai/dsh-persona`）与本插件可以在同一组装中共存。
- 注册随调用 fiber 一并 dispose，因此热重载配置修改时，旧段会先移除、新段再注册。

### 模型体验

- **模型看到的内容**：persona 与工具引导之间多出一个提示词段，例如 `请始终使用中文进行思考、推理与回复：你的思考过程（reasoning）与所有输出一律使用中文，包括对工具调用结果的解读与最终回答。` —— 部署上的每个 agent、每次请求都会携带。
- **Token 影响**：每次请求的固定成本，等于渲染后的指令文本（默认约 60 token）。
- **KV Cache 影响**：给定配置下该段稳定不变，提示词前缀缓存保持有效。修改文本会从第一个变化的 token 起使前缀失效。

## 开发

```sh
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # tsdown -> lib/
pnpm smoke       # 将 lib/ 挂载到真实 peer 依赖上，断言渲染后的提示词
```

`prepare` 脚本以自包含配置运行 `tsdown`，因此从 git 安装（`dsh plugin add github:you/dsh-thinking-language`）也能产出发布入口。`@deepseek-ai/dsh-system-prompt` 与 `@deepseek-ai/cordis` 是 peer 依赖，由 profile 所运行的 dsh 安装解析。

## 发布

- **npm**：`pnpm publish`（`files` 清单会带上 `lib/`、`cordis.patch.yml` 与两份 README；`dsh.bundle` 指向 patch 层）。
- **Tarball**：`pnpm pack`，然后 `dsh plugin add ./dsh-thinking-language-0.1.0.tgz`。
- **Git**：推送仓库，用户执行 `dsh plugin add github:you/dsh-thinking-language` —— pnpm 安装后运行 `prepare`，从源码构建 `lib/`（用户需要为 git 依赖授权构建）。

## 已知限制与暂缓事项

- 思考文本是模型自己的推理输出，由系统提示词引导而非线上开关：该段是强指令，不是硬保证，个别非中文片段仍可能出现。
- 若部署的 preset 注册了完整 persona（persona 行开启 `complete: true`），它会连同其他所有段一起抑制本段。
- peer 范围 `^0.1.0-rc.2` 面向 `@deepseek-ai/dsh-system-prompt` 当前的 rc 系列；未来大版本若更名导出，需随 peer 版本号升级。

## 许可证

[MIT](LICENSE)
