/**
 * A thinking-language prompt section for the DeepSeek Harness.
 *
 * Registers one ordered system-prompt section right after the deployment
 * persona (order `0`) and before tool guidance (`100–199`). The shipped
 * bundle default instructs the model to think, reason, and reply in Chinese;
 * a deployment overrides the section text in its own cordis layer to pick any
 * other language or wording without touching this package.
 *
 * Unlike the persona row (`@deepseek-ai/dsh-persona`), this section never
 * shadows the deployment persona: it contributes a distinct, independently
 * named section, so persona presets and this plugin coexist in the same
 * composition. A `complete: true` section instead becomes the exact system
 * prompt, the same contract every section provider shares.
 *
 * @module dsh-thinking-language
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Cordis plugin name. */
export const name = 'thinking-language'

/** The prompt registry this section contributes to. */
export const inject = ['systemPrompt']

/**
 * Prompt section name. Exported so tests, deployments, and waterfall
 * listeners can address this section instead of restating the string.
 */
export const THINKING_LANGUAGE_SECTION = 'thinking:language'

/**
 * Prompt order: immediately after the deployment persona (`0`), before the
 * tool-guidance band (`100–199`), so the language instruction is read by the
 * model at the very start of the prompt body.
 */
export const THINKING_LANGUAGE_ORDER = 1

/** Plugin config: the instruction text this section renders. */
export interface Config {
  /**
   * Instruction prose rendered as the `thinking:language` section. A template:
   * complete `{{…}}` groups interpolate strictly against registered prompt
   * variables (the shipped agent loop registers `{{model}}` and `{{cwd}}`).
   * Empty text drops the section at render, like every other section.
   */
  text: string
  /**
   * Make this section the complete system prompt, suppressing every other
   * section. Off by default; useful only for a deployment that wants the
   * language instruction to stand alone.
   */
  complete?: boolean
}

/** Runtime schema for the plugin config. */
export const Config: z<Config> = z.object({
  text: z.string().required(),
  complete: z.boolean().default(false),
})

/**
 * Register the thinking-language section. Disposal rides the calling fiber,
 * so hot-reloading a config edit removes the old section before the new one
 * registers.
 * @param ctx - plugin context; the `systemPrompt` service is ready because
 * of the declared {@link inject}.
 * @param config - the instruction text and complete-prompt policy.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: THINKING_LANGUAGE_SECTION,
    order: THINKING_LANGUAGE_ORDER,
    text: config.text,
    ...(config.complete ? { complete: true } : {}),
  }), 'thinking-language.section()')
}
