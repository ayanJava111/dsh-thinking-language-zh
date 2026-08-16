import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { describe, expect, it } from 'vitest'
import * as ThinkingLanguage from '../src/index'
import { THINKING_LANGUAGE_SECTION } from '../src/index'

async function harness(persona = ''): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { persona })
  return ctx
}

/** The rendered (uninterpolated) text of one assembled section. */
async function sectionText(ctx: Context, name: string): Promise<string | undefined> {
  const assembly = await ctx.systemPrompt.assemble()
  return assembly.sections.find(section => section.name === name)?.text
}

describe('the thinking-language plugin', () => {
  it('registers the instruction section right after the deployment persona', async () => {
    const ctx = await harness('deployment identity')

    await ctx.plugin(ThinkingLanguage, { text: 'Always think in Chinese.' })

    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.map(section => section.name)).toEqual([
      'harness:identity',
      'deployment:persona',
      THINKING_LANGUAGE_SECTION,
    ])
    expect(await sectionText(ctx, THINKING_LANGUAGE_SECTION)).toBe('Always think in Chinese.')
  })

  it('sits before tool guidance, matching the exported order contract', async () => {
    const ctx = await harness('')

    ctx.systemPrompt.section({ name: 'tool:guidance', order: 100, text: 'tool guidance' })
    await ctx.plugin(ThinkingLanguage, { text: 'Think in Chinese.' })

    const names = (await ctx.systemPrompt.assemble()).sections.map(section => section.name)
    expect(names.indexOf(THINKING_LANGUAGE_SECTION)).toBeLessThan(names.indexOf('tool:guidance'))
  })

  it('keeps the persona untouched: it adds a distinct section instead of shadowing', async () => {
    const ctx = await harness('deployment identity')

    await ctx.plugin(ThinkingLanguage, { text: 'Think in Chinese.' })

    expect(await sectionText(ctx, 'deployment:persona')).toBe('deployment identity')
    expect(await sectionText(ctx, THINKING_LANGUAGE_SECTION)).toBe('Think in Chinese.')
  })

  it('removes the section when its fiber unloads', async () => {
    const ctx = await harness('')
    const fiber = await ctx.plugin(ThinkingLanguage, { text: '中文思考。' })
    expect(await sectionText(ctx, THINKING_LANGUAGE_SECTION)).toBe('中文思考。')

    await fiber.dispose()

    expect(await sectionText(ctx, THINKING_LANGUAGE_SECTION)).toBeUndefined()
  })

  it('interpolates prompt variables strictly, like any other section', async () => {
    const ctx = await harness('')
    ctx.systemPrompt.variable('model', () => 'deepseek-v4-pro')

    await ctx.plugin(ThinkingLanguage, { text: 'Think in Chinese on {{model}}.' })

    expect(await sectionText(ctx, THINKING_LANGUAGE_SECTION)).toBe('Think in Chinese on {{model}}.')
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('Think in Chinese on deepseek-v4-pro.')
  })

  it('drops an empty section at render', async () => {
    const ctx = await harness('deployment identity')

    await ctx.plugin(ThinkingLanguage, { text: '' })

    expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain(THINKING_LANGUAGE_SECTION)
  })

  it('rejects a duplicate registration in the same layer', async () => {
    const ctx = await harness('')
    await ctx.plugin(ThinkingLanguage, { text: 'first' })

    await expect(ctx.plugin(ThinkingLanguage, { text: 'second' })).rejects.toThrow()
  })

  it('makes a complete section the exact prompt after every other contribution', async () => {
    const ctx = await harness('deployment identity')
    ctx.systemPrompt.section({ name: 'global:extra', order: 100, text: 'global guidance' })

    await ctx.plugin(ThinkingLanguage, { text: 'Only this.', complete: true })

    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections).toEqual([{ name: THINKING_LANGUAGE_SECTION, text: 'Only this.' }])
    expect(renderPrompt(assembly)).toBe('Only this.')
  })
})
