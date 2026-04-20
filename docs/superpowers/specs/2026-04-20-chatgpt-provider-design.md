# ChatGPT as Alternative AI Provider

**Date:** 2026-04-20  
**Status:** Approved

## Summary

Add ChatGPT (OpenAI) as a manually selectable AI provider alongside Gemini for all prompt and content generation across the app. A global provider setting controls which AI is used everywhere.

---

## 1. Data & Settings

Two new keys in the existing flat `Setting` table (no schema migration required):

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `openai_api_key` | string | `""` | ChatGPT API key |
| `ai_provider` | string | `"gemini"` | Active provider: `"gemini"` or `"openai"` |

Settings are persisted via the existing `PUT /api/settings` endpoint — no new API routes needed.

---

## 2. Settings UI (`app/settings/page.tsx`)

Add two new fields alongside the existing Gemini API key input:

1. **ChatGPT API Key** — password-type input, placeholder `sk-...`, saves `openai_api_key` to DB
2. **AI Provider** — radio group or select with options: **Gemini** | **ChatGPT**, saves `ai_provider` to DB

The provider selector makes it clear which AI is currently active globally.

---

## 3. Shared AI Client (`lib/ai-client.ts`)

New file exporting a single function:

```ts
generateText(prompt: string, config: AIConfig): Promise<string>
generateTextWithImages(prompt: string, imageBase64: string[], config: AIConfig): Promise<string>
```

### `AIConfig`

```ts
interface AIConfig {
  provider: "gemini" | "openai"
  geminiApiKey?: string
  openaiApiKey?: string
  temperature?: number
  responseFormat?: "json" | "text"
}
```

### Gemini path
- HTTP POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Inline base64 images supported via `inlineData` parts (existing behavior)
- `responseMimeType: "application/json"` when `responseFormat === "json"`

### OpenAI path
- HTTP POST to `https://api.openai.com/v1/chat/completions`
- Model: `gpt-4o-mini`
- Images supported via `image_url` content blocks (base64 `data:image/jpeg;base64,...`)
- `response_format: { type: "json_object" }` when `responseFormat === "json"`

Both paths return a plain `string` — callers receive identical output regardless of provider. Existing JSON parsing/cleanup logic in each route is unchanged.

---

## 4. Route Updates

Five backend routes replace their inline Gemini HTTP calls with `generateText()`:

| Route | Current Gemini usage |
|-------|---------------------|
| `app/api/prompts/ai-generate/route.ts` | Scene/script generation, vision analysis |
| `app/api/prompts/ai-generate-content/route.ts` | Content generation variant |
| `app/api/products/[id]/matrix/route.ts` | Matrix extraction (gemini mode) |
| `app/api/custom-video/route.ts` | Quick video pipeline |
| `app/api/quick-video/route.ts` | Simplified quick video |

**Pattern for each route:**

```ts
// At top of handler
const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } })
const provider = (providerSetting?.value ?? "gemini") as "gemini" | "openai"

const geminiKey = await prisma.setting.findUnique({ where: { key: "gemini_api_key" } })
const openaiKey = await prisma.setting.findUnique({ where: { key: "openai_api_key" } })

const aiConfig: AIConfig = {
  provider,
  geminiApiKey: geminiKey?.value,
  openaiApiKey: openaiKey?.value,
  temperature: ...,
  responseFormat: "json",
}

// Replace inline Gemini HTTP call with:
const result = await generateText(prompt, aiConfig)
```

---

## 5. Out of Scope

- `gempakstudio/src/services/geminiService.ts` — legacy file, not touched
- Auto-fallback between providers — not implemented (manual selection only)
- Per-feature provider selection — global setting only
- Token usage tracking / cost comparison UI
