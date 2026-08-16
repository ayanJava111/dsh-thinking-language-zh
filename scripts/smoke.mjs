// Smoke test over the BUILT entry (lib/): mounts the plugin against the real
// cordis + dsh-system-prompt peer dependencies and asserts the section lands
// in a rendered prompt. Run with `node scripts/smoke.mjs` after `pnpm build`.
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as ThinkingLanguage from '../lib/index.js'

const ctx = new Context()
await ctx.plugin(SystemPrompt, { persona: 'You are a coding agent.' })
await ctx.plugin(ThinkingLanguage, { text: '请始终使用中文进行思考、推理与回复。' })

const assembly = await ctx.systemPrompt.assemble()
const prompt = renderPrompt(assembly)
const names = assembly.sections.map(section => section.name)
console.log('sections:', names.join(' | '))
console.log('instruction present:', prompt.includes('请始终使用中文'))
if (!prompt.includes('请始终使用中文')) throw new Error('instruction missing from rendered prompt')
console.log('smoke ok')
