# ChatGPT as Alternative AI Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ChatGPT (OpenAI) as a globally selectable AI provider alongside Gemini, controlled via a setting in the settings page.

**Architecture:** A new `lib/ai-client.ts` abstracts both Gemini and OpenAI behind a single `generateText` / `generateTextWithImage` interface. All 5 backend routes that currently call Gemini directly are updated to call the shared client instead. The active provider (`"gemini"` | `"openai"`) and OpenAI API key are stored in the existing flat `Setting` table and managed from the settings page.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma (SQLite), native `fetch` (no OpenAI SDK), Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/ai-client.ts` | Shared Gemini + OpenAI HTTP wrapper |
| Modify | `app/settings/page.tsx` | Add OpenAI key field + provider selector UI |
| Modify | `app/api/prompts/ai-generate/route.ts` | Replace inline Gemini calls with `generateText` / `generateTextWithImage` |
| Modify | `app/api/prompts/ai-generate-image/route.ts` | Replace inline Gemini call with `generateText` |
| Modify | `app/api/prompts/ai-generate-content/route.ts` | Replace inline Gemini call with `generateText` |
| Modify | `app/api/products/[id]/matrix/route.ts` | Replace inline Gemini call with `generateText` |
| Modify | `app/api/jobs/route.ts` | Replace inline Gemini call with `generateText` |

---

## Task 1: Create `lib/ai-client.ts`

**Files:**
- Create: `lib/ai-client.ts`

- [ ] **Step 1: Create the file with both provider implementations**

```typescript
// lib/ai-client.ts

export interface AIConfig {
  provider: "gemini" | "openai";
  geminiApiKey?: string;
  openaiApiKey?: string;
  temperature?: number;
  responseFormat?: "json" | "text";
}

export async function generateText(
  prompt: string,
  config: AIConfig,
): Promise<string> {
  if (config.provider === "openai") {
    return callOpenAI(prompt, null, null, config);
  }
  return callGemini(prompt, null, null, config);
}

export async function generateTextWithImage(
  prompt: string,
  imageBase64: string,
  imageMimeType: string,
  config: AIConfig,
): Promise<string> {
  if (config.provider === "openai") {
    return callOpenAI(prompt, imageBase64, imageMimeType, config);
  }
  return callGemini(prompt, imageBase64, imageMimeType, config);
}

async function callGemini(
  prompt: string,
  imageBase64: string | null,
  imageMimeType: string | null,
  config: AIConfig,
): Promise<string> {
  const key = config.geminiApiKey;
  if (!key) throw new Error("Gemini API key not configured");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];

  if (imageBase64 && imageMimeType) {
    parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
  }

  const generationConfig: Record<string, unknown> = {};
  if (config.responseFormat === "json") {
    generationConfig.responseMimeType = "application/json";
  }
  if (config.temperature !== undefined && config.temperature > 0) {
    generationConfig.temperature = config.temperature;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
      cache: "no-store" as RequestCache,
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error: ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAI(
  prompt: string,
  imageBase64: string | null,
  imageMimeType: string | null,
  config: AIConfig,
): Promise<string> {
  const key = config.openaiApiKey;
  if (!key) throw new Error("OpenAI API key not configured");

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

  const content: ContentPart[] = [{ type: "text", text: prompt }];

  if (imageBase64 && imageMimeType) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${imageMimeType};base64,${imageBase64}` },
    });
  }

  const body: Record<string, unknown> = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    temperature: config.temperature ?? 1.0,
  };

  if (config.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    cache: "no-store" as RequestCache,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `OpenAI error: ${res.status}`,
    );
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Flow"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `lib/ai-client.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/ai-client.ts
git commit -m "feat: add shared AI client abstraction for Gemini and OpenAI"
```

---

## Task 2: Update Settings Page

**Files:**
- Modify: `app/settings/page.tsx`

The settings page uses `SETTING_FIELDS` array for text/password inputs. We add the OpenAI key to that array and add a separate provider selector UI block (radio group) because it's a select control, not a text input.

- [ ] **Step 1: Add OpenAI API key to `SETTING_FIELDS`**

In `app/settings/page.tsx`, find this block:

```typescript
const SETTING_FIELDS = [
  {
    key: "extension_id",
    label: "Chrome Extension ID",
    placeholder: "ohdoccgglgmopfclmolmhhchebmmn...",
    type: "text",
  },
  {
    key: "gemini_api_key",
    label: "Gemini API Key",
    placeholder: "AIzaSy...",
    type: "password",
  },
  {
    key: "telegram_bot_token",
    label: "Telegram Bot Token",
    placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    type: "password",
  },
  {
    key: "telegram_chat_id",
    label: "Telegram Chat ID / Channel",
    placeholder: "@mychannel or -1001234567890",
    type: "text",
  },
];
```

Replace with:

```typescript
const SETTING_FIELDS = [
  {
    key: "extension_id",
    label: "Chrome Extension ID",
    placeholder: "ohdoccgglgmopfclmolmhhchebmmn...",
    type: "text",
  },
  {
    key: "gemini_api_key",
    label: "Gemini API Key",
    placeholder: "AIzaSy...",
    type: "password",
  },
  {
    key: "openai_api_key",
    label: "ChatGPT API Key",
    placeholder: "sk-...",
    type: "password",
  },
  {
    key: "telegram_bot_token",
    label: "Telegram Bot Token",
    placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    type: "password",
  },
  {
    key: "telegram_chat_id",
    label: "Telegram Chat ID / Channel",
    placeholder: "@mychannel or -1001234567890",
    type: "text",
  },
];
```

- [ ] **Step 2: Add AI Provider selector inside the settings card**

In `app/settings/page.tsx`, find the block that renders the `SETTING_FIELDS` inputs and the Save button. It ends with:

```tsx
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
```

Replace with:

```tsx
        {/* AI Provider Selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            AI Provider
          </label>
          <p className="mb-2 text-xs text-gray-500">
            Choose which AI is used for all prompt and content generation
          </p>
          <div className="flex gap-4">
            {(["gemini", "openai"] as const).map((p) => (
              <label
                key={p}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors has-[:checked]:border-rose-500 has-[:checked]:bg-rose-50"
              >
                <input
                  type="radio"
                  name="ai_provider"
                  value={p}
                  checked={(settings["ai_provider"] || "gemini") === p}
                  onChange={() =>
                    setSettings((s) => ({ ...s, ai_provider: p }))
                  }
                  className="accent-rose-500"
                />
                {p === "gemini" ? "Gemini (Google)" : "ChatGPT (OpenAI)"}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
```

- [ ] **Step 3: Verify dev server compiles without errors**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Flow"
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Manual verify in browser**

Open Settings page. Confirm:
- "ChatGPT API Key" password field appears below "Gemini API Key"
- "AI Provider" radio group shows "Gemini (Google)" and "ChatGPT (OpenAI)"
- Selecting ChatGPT and clicking Save persists the selection (reload page, radio stays on ChatGPT)

- [ ] **Step 5: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: add OpenAI API key and AI provider selector to settings"
```

---

## Task 3: Update `app/api/prompts/ai-generate/route.ts`

**Files:**
- Modify: `app/api/prompts/ai-generate/route.ts`

This route has **two** Gemini calls:
1. ~line 409: inside the `storyline` / `gempak` mode (with optional image)
2. ~line 823: inside the `paired` mode (with optional image)

Both need to be replaced. The route currently receives `apiKey` from the request body — keep reading it for Gemini. For OpenAI, read key from DB.

- [ ] **Step 1: Add import and DB provider reads at top of handler**

Find the import at the top of the file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
```

Add the ai-client import:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { generateText, generateTextWithImage, type AIConfig } from "@/lib/ai-client";
```

- [ ] **Step 2: Read provider settings at the top of the POST handler**

The POST handler destructures the request body including `apiKey`. After the existing validation block that checks `if (!apiKey)`, add the provider/OpenAI key fetch. Find this block:

```typescript
  if (!apiKey)
    return NextResponse.json(
      { error: "Gemini API key is required" },
      { status: 400 },
    );
```

Replace with:

```typescript
  const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
  const provider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";

  const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
  const openaiApiKey = openaiKeySetting?.value || "";

  if (provider === "gemini" && !apiKey)
    return NextResponse.json(
      { error: "Gemini API key is required" },
      { status: 400 },
    );
  if (provider === "openai" && !openaiApiKey)
    return NextResponse.json(
      { error: "OpenAI API key not configured. Set it in Settings." },
      { status: 400 },
    );

  const aiConfig: AIConfig = {
    provider,
    geminiApiKey: apiKey,
    openaiApiKey,
  };
```

- [ ] **Step 3: Replace first Gemini call (storyline/gempak mode, ~line 409)**

Find this block (inside the storyline/gempak branch):

```typescript
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
          generationConfig: {
            responseMimeType: "application/json",
            ...(temperature > 0 ? { temperature } : {}),
          },
        }),
        cache: "no-store" as RequestCache,
      },
    );

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err.error?.message || "Gemini API error" },
        { status: res.status },
      );
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
```

Note: `promptParts` is an array that may contain a text part and optionally an inline image. Look for where `promptParts` is built above this call. The code uses `productImageBase64` and `productImageMime` for the image. Replace the entire fetch block with:

```typescript
    let rawText: string;
    try {
      const callConfig: AIConfig = { ...aiConfig, temperature: temperature > 0 ? temperature : undefined, responseFormat: "json" };
      if (productImageBase64) {
        rawText = await generateTextWithImage(systemPrompt, productImageBase64, productImageMime, callConfig);
      } else {
        rawText = await generateText(systemPrompt, callConfig);
      }
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : "AI error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
```

Note: The variable `systemPrompt` is the prompt string built above this block. Look for where it's assigned — it's the large template string ending with the scenes/format instructions.

- [ ] **Step 4: Replace second Gemini call (paired mode, ~line 823)**

Find this block (inside the paired mode, after `promptParts` is built):

```typescript
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: promptParts }],
          generationConfig: {
            responseMimeType: "application/json",
            ...(temperature > 0 ? { temperature } : {}),
          },
        }),
        cache: "no-store" as RequestCache,
      },
    );

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err.error?.message || "Gemini API error" },
        { status: res.status },
      );
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
```

Replace with:

```typescript
    let rawText: string;
    try {
      const callConfig: AIConfig = { ...aiConfig, temperature: temperature > 0 ? temperature : undefined, responseFormat: "json" };
      if (productImageBase64) {
        rawText = await generateTextWithImage(systemPrompt, productImageBase64, productImageMime, callConfig);
      } else {
        rawText = await generateText(systemPrompt, callConfig);
      }
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : "AI error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "ai-generate"
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/api/prompts/ai-generate/route.ts
git commit -m "feat: wire ai-generate route through shared AI client"
```

---

## Task 4: Update `app/api/prompts/ai-generate-image/route.ts`

**Files:**
- Modify: `app/api/prompts/ai-generate-image/route.ts`

This route receives `apiKey` from the request body and makes a single Gemini text call (no vision).

- [ ] **Step 1: Add import**

At the top of the file, add:

```typescript
import { prisma } from "@/lib/prisma";
import { generateText, type AIConfig } from "@/lib/ai-client";
```

- [ ] **Step 2: Read provider settings and add `aiConfig` after existing validation**

After the existing `if (!apiKey)` validation block, add:

```typescript
  const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
  const provider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";

  const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
  const openaiApiKey = openaiKeySetting?.value || "";

  if (provider === "openai" && !openaiApiKey)
    return NextResponse.json(
      { error: "OpenAI API key not configured. Set it in Settings." },
      { status: 400 },
    );

  const aiConfig: AIConfig = {
    provider,
    geminiApiKey: apiKey,
    openaiApiKey,
    responseFormat: "json",
  };
```

- [ ] **Step 3: Replace Gemini fetch block**

Find:

```typescript
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        cache: "no-store" as RequestCache,
      },
    );

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err.error?.message || "Gemini API error" },
        { status: res.status },
      );
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
```

Replace with:

```typescript
  try {
    let rawText: string;
    try {
      rawText = await generateText(systemPrompt, aiConfig);
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : "AI error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
```

- [ ] **Step 4: TypeScript check and commit**

```bash
npx tsc --noEmit 2>&1 | grep "ai-generate-image"
git add app/api/prompts/ai-generate-image/route.ts
git commit -m "feat: wire ai-generate-image route through shared AI client"
```

---

## Task 5: Update `app/api/prompts/ai-generate-content/route.ts`

**Files:**
- Modify: `app/api/prompts/ai-generate-content/route.ts`

This route receives `apiKey` from the request body. Single text call.

- [ ] **Step 1: Add imports**

After existing imports at top of file add:

```typescript
import { prisma } from "@/lib/prisma";
import { generateText, type AIConfig } from "@/lib/ai-client";
```

- [ ] **Step 2: Add provider reads after validation**

After the `if (!apiKey)` block, add:

```typescript
  const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
  const provider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";

  const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
  const openaiApiKey = openaiKeySetting?.value || "";

  if (provider === "openai" && !openaiApiKey)
    return NextResponse.json(
      { error: "OpenAI API key not configured. Set it in Settings." },
      { status: 400 },
    );

  const aiConfig: AIConfig = {
    provider,
    geminiApiKey: apiKey,
    openaiApiKey,
    temperature: 0.9,
    responseFormat: "text",
  };
```

- [ ] **Step 3: Replace the Gemini fetch block**

Find:

```typescript
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return NextResponse.json(
        { error: `Gemini API error: ${err}` },
        { status: 500 },
      );
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
```

Replace with:

```typescript
  try {
    let rawText: string;
    try {
      rawText = await generateText(prompt, aiConfig);
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : "AI error";
      return NextResponse.json({ error: `AI API error: ${msg}` }, { status: 500 });
    }
```

- [ ] **Step 4: TypeScript check and commit**

```bash
npx tsc --noEmit 2>&1 | grep "ai-generate-content"
git add app/api/prompts/ai-generate-content/route.ts
git commit -m "feat: wire ai-generate-content route through shared AI client"
```

---

## Task 6: Update `app/api/products/[id]/matrix/route.ts`

**Files:**
- Modify: `app/api/products/[id]/matrix/route.ts`

This route already reads Gemini key from DB. It needs to also read `ai_provider` and `openai_api_key`.

- [ ] **Step 1: Add import**

At the top of the file add:

```typescript
import { generateText, type AIConfig } from "@/lib/ai-client";
```

- [ ] **Step 2: Replace the DB key read + Gemini call inside the `gemini` mode block**

Find this block (around line 190-272):

```typescript
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "gemini_api_key" },
    });
    const apiKey = apiKeySetting?.value;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured. Set it in Settings." },
        { status: 400 },
      );
    }
```

Replace with:

```typescript
    const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
    const provider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";

    const geminiKeySetting = await prisma.setting.findUnique({ where: { key: "gemini_api_key" } });
    const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
    const geminiKey = geminiKeySetting?.value || "";
    const openaiKey = openaiKeySetting?.value || "";

    if (provider === "gemini" && !geminiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured. Set it in Settings." },
        { status: 400 },
      );
    }
    if (provider === "openai" && !openaiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Set it in Settings." },
        { status: 400 },
      );
    }

    const aiConfig: AIConfig = {
      provider,
      geminiApiKey: geminiKey,
      openaiApiKey: openaiKey,
      temperature: 1.0,
      responseFormat: "text",
    };
```

- [ ] **Step 3: Replace the Gemini fetch call**

Find:

```typescript
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 1.0 },
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        return NextResponse.json(
          { error: err.error?.message || "Gemini API error" },
          { status: 500 },
        );
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
```

Replace with:

```typescript
    try {
      let rawText: string;
      try {
        rawText = await generateText(prompt, aiConfig);
      } catch (aiErr: unknown) {
        const msg = aiErr instanceof Error ? aiErr.message : "AI error";
        return NextResponse.json({ error: `Matrix generation failed: ${msg}` }, { status: 500 });
      }
```

- [ ] **Step 4: TypeScript check and commit**

```bash
npx tsc --noEmit 2>&1 | grep "matrix"
git add "app/api/products/[id]/matrix/route.ts"
git commit -m "feat: wire matrix route through shared AI client"
```

---

## Task 7: Update `app/api/jobs/route.ts`

**Files:**
- Modify: `app/api/jobs/route.ts`

This route has a `generateWithGemini` helper function (around line 346) that directly calls Gemini. It reads `gemini_api_key` from DB ~line 268 before calling this helper.

- [ ] **Step 1: Add import**

At the top of `app/api/jobs/route.ts` add:

```typescript
import { generateText, type AIConfig } from "@/lib/ai-client";
```

- [ ] **Step 2: Replace the DB key read + call site (lines 267-296)**

Find this exact block:

```typescript
      const geminiKeySetting = await prisma.setting.findUnique({
        where: { key: "gemini_api_key" },
      });
      if (geminiKeySetting?.value) {
        const geminiResult = await generateWithGemini(
          geminiKeySetting.value,
          pTitle,
          pDesc,
          pPrice,
          videoType as string,
          hashtags,
        );
        if (
          !(userProductName && userProductName.trim()) &&
          geminiResult.productName
        )
          tiktokProductName = geminiResult.productName;
        if (
          !(userDescription && userDescription.trim()) &&
          geminiResult.description
        )
          tiktokDescription = geminiResult.description;
      }
```

Replace with:

```typescript
      const providerSetting = await prisma.setting.findUnique({ where: { key: "ai_provider" } });
      const jobProvider = (providerSetting?.value === "openai" ? "openai" : "gemini") as "gemini" | "openai";
      const geminiKeySetting = await prisma.setting.findUnique({ where: { key: "gemini_api_key" } });
      const openaiKeySetting = await prisma.setting.findUnique({ where: { key: "openai_api_key" } });
      const jobGeminiKey = geminiKeySetting?.value || "";
      const jobOpenaiKey = openaiKeySetting?.value || "";
      const hasAiKey = jobProvider === "gemini" ? !!jobGeminiKey : !!jobOpenaiKey;
      if (hasAiKey) {
        const jobAiConfig: AIConfig = { provider: jobProvider, geminiApiKey: jobGeminiKey, openaiApiKey: jobOpenaiKey };
        const aiResult = await generateWithAI(
          jobAiConfig,
          pTitle,
          pDesc,
          pPrice,
          videoType as string,
          hashtags,
        );
        if (
          !(userProductName && userProductName.trim()) &&
          aiResult.productName
        )
          tiktokProductName = aiResult.productName;
        if (
          !(userDescription && userDescription.trim()) &&
          aiResult.description
        )
          tiktokDescription = aiResult.description;
      }
```

- [ ] **Step 3: Replace the `generateWithGemini` function definition and body**

Find the entire function (lines 346-404):

```typescript
async function generateWithGemini(
  apiKey: string,
  title: string,
  description: string,
  price: string,
  videoType: string,
  hashtags: string[],
): Promise<{ productName: string; description: string }> {
  const hashtagStr = hashtags.map((h) => `#${h}`).join(" ");

  const prompt = `You are a TikTok product marketing expert for the Malaysian market.

Given this product:
- Original Title: ${title}
- Description: ${description || "N/A"}
- Price: ${price || "N/A"}
- Marketing Angle: ${videoType}

Generate:
1. "productName": A clean, catchy product name for TikTok (max 30 characters). Remove SKU codes, brackets, special characters. Make it short, appealing, and easy to read. Use Malay or English.
2. "description": A compelling TikTok product description (max 200 characters). Include the product benefit, price if available, and a call to action. Write in casual Malay. Append these hashtags at the end: ${hashtagStr}

Output JSON only: { "productName": "...", "description": "..." }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // Enforce max length for product name
  let productName = String(parsed.productName || "").trim();
  if (productName.length > 30) {
    productName = productName
      .substring(0, 30)
      .replace(/\s+\S*$/, "")
      .trim();
  }

  return {
    productName,
    description: String(parsed.description || "").trim(),
  };
}
```

Replace with:

```typescript
async function generateWithAI(
  config: AIConfig,
  title: string,
  description: string,
  price: string,
  videoType: string,
  hashtags: string[],
): Promise<{ productName: string; description: string }> {
  const hashtagStr = hashtags.map((h) => `#${h}`).join(" ");

  const prompt = `You are a TikTok product marketing expert for the Malaysian market.

Given this product:
- Original Title: ${title}
- Description: ${description || "N/A"}
- Price: ${price || "N/A"}
- Marketing Angle: ${videoType}

Generate:
1. "productName": A clean, catchy product name for TikTok (max 30 characters). Remove SKU codes, brackets, special characters. Make it short, appealing, and easy to read. Use Malay or English.
2. "description": A compelling TikTok product description (max 200 characters). Include the product benefit, price if available, and a call to action. Write in casual Malay. Append these hashtags at the end: ${hashtagStr}

Output JSON only: { "productName": "...", "description": "..." }`;

  const rawText = await generateText(prompt, { ...config, responseFormat: "json" });
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // Enforce max length for product name
  let productName = String(parsed.productName || "").trim();
  if (productName.length > 30) {
    productName = productName
      .substring(0, 30)
      .replace(/\s+\S*$/, "")
      .trim();
  }

  return {
    productName,
    description: String(parsed.description || "").trim(),
  };
}
```

- [ ] **Step 4: TypeScript check and commit**

```bash
npx tsc --noEmit 2>&1 | grep "jobs"
git add app/api/jobs/route.ts
git commit -m "feat: wire jobs route through shared AI client"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Flow"
npx tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 2: Test Gemini provider (default behavior unchanged)**

1. Open Settings → confirm "Gemini (Google)" is selected
2. Go to Video Studio → generate a prompt
3. Confirm generation succeeds and output looks correct

- [ ] **Step 3: Test ChatGPT provider**

1. Open Settings → enter a valid OpenAI API key → select "ChatGPT (OpenAI)" → Save
2. Go to Video Studio → generate a prompt
3. Confirm generation succeeds — output structure should be identical JSON
4. Open Settings → switch back to Gemini

- [ ] **Step 4: Commit final check**

```bash
git add -A
git status
# Should be clean
```
