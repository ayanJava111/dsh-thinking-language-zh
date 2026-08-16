# dsh-thinking-language

[English](README.md) | [中文](README.zh.md)

A one-section [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle that pins the language an agent **thinks, reasons, and replies** in. The shipped default is Chinese mode: once installed, every agent composed by the deployment gets an ordered system-prompt section right after its persona telling the model to think and answer in Chinese.

It works on any DeepSeek Harness deployment (Web UI, headless, ACP) because it only contributes a [system-prompt section](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/core/system-prompt/README.md) — no tools, no shell access, no model changes.

## Install

```sh
dsh plugin --profile <name> add dsh-thinking-language
```

That installs the package into the profile and appends the bundle layer (the package declares `dsh.bundle`, so `dsh plugin` activates it automatically). Then:

```sh
dsh --profile <name>
```

The layer registers the `thinking-language` row, whose default config is the Chinese instruction. No further setup is needed. Verify the layer first without starting:

```sh
dsh --profile <name> --dump-config   # shows a "# == dsh-thinking-language" layer
```

## Config

One row, three fields:

| Key | Default | Meaning |
|---|---|---|
| `text` | the Chinese instruction below | The instruction rendered as the `thinking:language` section. A template: complete `{{…}}` groups interpolate strictly against registered prompt variables (`{{model}}` and `{{cwd}}` are registered by the shipped agent loop). Empty text drops the section at render. |
| `complete` | `false` | Make this section the complete system prompt, suppressing every other section. Leave off unless the language instruction must stand alone. |

The default `text` is:

> 请始终使用中文进行思考、推理与回复：你的思考过程（reasoning）与所有输出一律使用中文，包括对工具调用结果的解读与最终回答。

## Change the language or wording

Patch layers replace the targeted row's whole `config`, so an override restates every key it wants. Put this in your profile's `cordis.patch.yml` (or a `--patch` overlay) to switch to English:

```yaml
- id: thinking-language
  config:
    text: >-
      Always think, reason, and reply in English.
```

## How it works

The plugin exports the standard plugin contract (`name`, `inject: ['systemPrompt']`, `Config` type and Schemastery schema, `apply`) and registers one section:

- **Name**: `thinking:language` (exported as `THINKING_LANGUAGE_SECTION`).
- **Order**: `1` — immediately after the deployment persona (`0`), before the tool-guidance band (`100–199`), so the model reads the language instruction at the start of the prompt body.
- It never shadows the persona: persona presets (`@deepseek-ai/dsh-persona`) and this plugin coexist in the same composition.
- Registration rides the calling fiber, so hot-reloading a config edit removes the old section before the new one registers.

### Model experience

- **What the model sees**: one extra prompt section between the persona and tool guidance, e.g. `请始终使用中文进行思考、推理与回复：你的思考过程（reasoning）与所有输出一律使用中文，包括对工具调用结果的解读与最终回答。` — every request, for every agent on the deployment.
- **Token effect**: a fixed cost per request, equal to the rendered instruction text (about 60 tokens for the default).
- **KV-cache effect**: the section is stable for a given config, so prompt-prefix caching stays intact. Editing the text changes the prefix from the first changed token.
<img width="2202" height="969" alt="image" src="https://github.com/user-attachments/assets/102919dd-015d-4d21-b4a1-aef4ac2aecad" />

## Develop

```sh
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # tsdown -> lib/
pnpm smoke       # mounts lib/ against the real peers and asserts the rendered prompt
```

The `prepare` script runs `tsdown` with a self-contained config, so installing from git (`dsh plugin add github:you/dsh-thinking-language`) also produces the published entry. `@deepseek-ai/dsh-system-prompt` and `@deepseek-ai/cordis` are peer dependencies resolved from the dsh installation the profile runs on.

## Publish

- **npm**: `pnpm publish` (the `files` list ships `lib/`, `cordis.patch.yml`, and both READMEs; `dsh.bundle` points at the patch layer).
- **Tarball**: `pnpm pack`, then `dsh plugin add ./dsh-thinking-language-0.1.0.tgz`.
- **Git**: push the repo and let users `dsh plugin add github:you/dsh-thinking-language` — pnpm runs `prepare` after install, which builds `lib/` from source (users must allow the build for git dependencies).

## Known limitations

- Thinking text is the model's own reasoning output, steered by the system prompt rather than a wire-level switch: the section is a strong instruction, not a hard guarantee, and occasional non-Chinese fragments may still appear.
- If a deployed preset registers its own complete persona (`complete: true` on a persona row), it suppresses this section along with every other section.
- Peer range `^0.1.0-rc.2` targets the current rc series of `@deepseek-ai/dsh-system-prompt`; a future major may rename exports, which a peer bump would address.

## License

[MIT](LICENSE)
