# Dialog Variation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate repetitive hook titles, dialog CTA lines, and TikTok captions across all video generation flows by injecting rotating example pools and per-call style directives into the AI prompt.

**Architecture:** Three pools of 20–35 entries each live in `prompt-templates.ts`. At prompt build time in `ai-generate/route.ts`, 3 random samples from each pool plus a random style directive are computed and interpolated into the output field descriptions, replacing hardcoded example phrases. A separate fix removes the explicit "7 hari" seed string from `quick-video/route.ts`.

**Tech Stack:** TypeScript, Next.js API routes

---

### Task 1: Add pools and helpers to `lib/prompt-templates.ts`

**Files:**
- Modify: `lib/prompt-templates.ts` (append to end of file)

- [ ] **Step 1: Append pools and helpers to `lib/prompt-templates.ts`**

Add the following block at the very end of the file, after `generateTikTokDescription`:

```ts
// ---- Variation Pools ----

export const HOOK_TITLE_POOL = [
  // question
  "Kenapa Kulit Masih Kusam?",
  "Rambut Gugur Tak Henti?",
  "Dah Cuba Semua Cara?",
  "Penat Masalah Sama?",
  "Korang Tahu Tak Ni?",
  // bold_claim
  "Power Gila Produk Ni!",
  "Memang Wajib Ada Ni!",
  "Korang Mesti Try Ni!",
  "Serious Best Gila Ni!",
  "Ini Lah Yang Korang Nak!",
  "Confirm Korang Suka!",
  "Memang Berbaloi Weh!",
  "Korang Kena Cuba Ni!",
  "Produk Ni Memang Gempak!",
  "Jangan Miss Produk Ni!",
  // number_driven
  "3 Hari Nampak Beza!",
  "1 Produk 5 Manfaat!",
  "2 Minggu Dah Nampak!",
  "Dah 10K Orang Cuba!",
  "5 Star Confirm!",
  // urgency
  "Last Stok Alert!",
  "Grab Sebelum Habis!",
  "Jangan Menyesal Nanti!",
  "Terhad, Rebut Sekarang!",
  "Jangan Lepas Peluang Ni!",
  // emotional_payoff
  "Akhirnya Jumpa Jugak!",
  "Masalah Tu Selesai!",
  "Lega Gila Dah!",
  "Tak Sangka Macam Ni!",
  "Ni Lah Jawapannya!",
  // pov
  "POV: Jumpa Produk Ni",
  "POV: Masalah Dah Selesai",
  "POV: Life Changer Alert",
  "POV: Korang Nak Glowing",
  "POV: Bila Dah Try Ni",
  // curiosity
  "Ramai Tak Sedar Ni",
  "Selama Ni Buat Salah?",
  "Ni Baru Korang Tahu!",
  "Rahsia Yang Ramai Simpan",
  "Orang Lain Dah Tahu...",
] as const;

export const DIALOG_CTA_POOL = [
  "Korang kena grab ni sekarang, serious memang berbaloi duit korang!",
  "Stok limited tau, jangan tangguh lagi, grab sekarang jugak!",
  "Dah ramai yang dah grab, korang bila lagi nak try?",
  "Kalau korang nak hasil terbaik, grab ni sekarang jugak!",
  "Power gila produk ni, korang kena try sendiri baru tahu!",
  "Ni peluang korang, jangan lepas, grab selagi ada stok!",
  "Saya recommend ni, korang cuba dulu confirm korang suka!",
  "Korang rugi kalau tak try, serious best gila produk ni!",
  "Fuh memang power, korang kena ada ni dalam hidup korang!",
  "Tak perlu fikir panjang, grab je dulu tau!",
  "Memang worth it, korang grab sekarang sebelum stock habis!",
  "Korang yang tengah tengok ni, ni sign untuk korang grab!",
  "Last chance ni, korang grab sebelum menyesal nanti tau!",
  "Serious tak rugi pun, grab sekarang confirm korang happy!",
  "Kalau korang nak upgrade, start dengan produk ni sekarang!",
  "Jom sama-sama try, memang confirm korang tak akan kecewa!",
  "Korang kena ada ni, grab sekarang jangan lepas peluang!",
  "Best gila, korang grab cepat sebelum habis stok tau!",
  "Ni untuk korang yang nak yang terbaik, grab sekarang!",
  "Korang tengok dulu, pastu confirm terus nak grab jugak!",
] as const;

export const TIKTOK_CAPTION_POOL = [
  "Ni lah produk yang korang dah lama cari!",
  "Korang kena try ni, serious tak akan menyesal!",
  "Fuh, memang power! Grab sekarang sebelum habis stok!",
  "Bila dah jumpa produk macam ni, terus jatuh cinta!",
  "Masalah korang selesai dah dengan produk ni!",
  "Serious game changer! Korang mesti cuba sendiri baru tahu!",
  "Tak sangka boleh lain gila, korang kena try ni!",
  "POV: Bila korang akhirnya jumpa produk yang memang power!",
  "Dah jadi kegemaran ramai, korang bila lagi nak try?",
  "Memang takde alasan untuk tak grab ni sekarang!",
  "Korang yang ada masalah ni, ni lah jawapannya!",
  "Percaya ke tidak, korang cuba dulu baru tau!",
  "Lepas try baru faham kenapa ramai yang suka sangat!",
  "Quality memang tak tipu, korang grab sebelum stock habis!",
  "Ni baru yang korang patut tahu pasal produk ni!",
  "Dah test, memang worth every ringgit tau!",
  "Korang tengah tengok sign untuk grab ni sekarang!",
  "Kalau rasa nak upgrade hidup korang, start dengan ni!",
  "Fuh perghhh, korang kena tengok ni sampai habis!",
  "Tak percaya? Cuba dulu, korang confirm nak lagi!",
] as const;

export const HOOK_TITLE_STYLES = [
  "question",
  "bold_claim",
  "number_driven",
  "urgency",
  "emotional_payoff",
  "pov",
  "curiosity",
] as const;

export const CAPTION_STYLES = [
  "relatable_problem",
  "discovery",
  "social_proof",
  "pov_scenario",
  "fomo_urgency",
  "curiosity_gap",
] as const;

export function pickSamples<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  const result: T[] = [];
  const count = Math.min(n, copy.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * (copy.length - i));
    result.push(copy[idx]);
    copy[idx] = copy[copy.length - i - 1];
  }
  return result;
}

export function pickOne<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Flow"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/prompt-templates.ts
git commit -m "feat: add variation pools and helper functions to prompt-templates"
```

---

### Task 2: Inject dynamic examples into `app/api/prompts/ai-generate/route.ts`

**Files:**
- Modify: `app/api/prompts/ai-generate/route.ts`

- [ ] **Step 1: Update the import from `@/lib/prompt-templates`**

Find this import block (lines 7–15):

```ts
import {
  VIDEO_FORMATS,
  type VideoFormatId,
  getFormatSceneInstructions,
  HOOK_TEMPLATES,
  type HookStyle,
  GENRE_HOOK_STYLE,
  DIALOG_TONE_SANTAI,
} from "@/lib/prompt-templates";
```

Replace with:

```ts
import {
  VIDEO_FORMATS,
  type VideoFormatId,
  getFormatSceneInstructions,
  HOOK_TEMPLATES,
  type HookStyle,
  GENRE_HOOK_STYLE,
  DIALOG_TONE_SANTAI,
  HOOK_TITLE_POOL,
  DIALOG_CTA_POOL,
  TIKTOK_CAPTION_POOL,
  HOOK_TITLE_STYLES,
  CAPTION_STYLES,
  pickSamples,
  pickOne,
} from "@/lib/prompt-templates";
```

- [ ] **Step 2: Compute per-request variation values at the top of the POST handler**

Find this line (around line 196):

```ts
export async function POST(req: NextRequest) {
  const body = await req.json();
```

Add the following 5 lines immediately after `const body = await req.json();`:

```ts
  const hookTitleExamples = pickSamples(HOOK_TITLE_POOL, 3).join("', '");
  const ctaExamples = pickSamples(DIALOG_CTA_POOL, 3).join("', '");
  const captionExamples = pickSamples(TIKTOK_CAPTION_POOL, 3).join("', '");
  const hookTitleStyle = pickOne(HOOK_TITLE_STYLES);
  const captionStyle = pickOne(CAPTION_STYLES);
```

- [ ] **Step 3: Replace hardcoded hook_title example in the gempak prompt**

Find this string inside `gempakPrompt` (around line 490):

```ts
  "hook_title": "REQUIRED — Short punchy hook title in casual Bahasa Melayu for intro card (3-5 words, e.g. 'Rahsia Kulit Glowing!')",
```

Replace with:

```ts
  "hook_title": "REQUIRED — Short punchy hook title (${hookTitleStyle} format, 3-5 words). THIS CALL examples: '${hookTitleExamples}' — use as style reference only, do NOT copy directly.",
```

- [ ] **Step 4: Replace hardcoded variation_hook_title example in the gempak prompt**

Find this string inside `gempakPrompt` (around line 505):

```ts
      "variation_hook_title": "REQUIRED — Short punchy hook title for THIS scene (3-7 words, attention-grabbing, e.g. 'Rahsia Kulit Glowing!')",
```

Replace with:

```ts
      "variation_hook_title": "REQUIRED — Short punchy hook title for THIS scene (${hookTitleStyle} format, 3-7 words). THIS CALL examples: '${hookTitleExamples}' — use as style reference only, do NOT copy directly.",
```

- [ ] **Step 5: Replace hardcoded tiktok_caption example in the gempak prompt**

Find this string inside `gempakPrompt` (around line 509):

```ts
      "tiktok_caption": "REQUIRED — Catchy TikTok caption in casual Bahasa Melayu (max 150 chars, e.g. 'Produk ni memang wajib cuba!')",
```

Replace with:

```ts
      "tiktok_caption": "REQUIRED — Catchy TikTok caption (${captionStyle} style, max 150 chars, no hashtags). THIS CALL examples: '${captionExamples}' — use as style reference only, do NOT copy directly.",
```

- [ ] **Step 6: Add CTA override block to the gempak prompt**

Find this line near the end of `gempakPrompt` (around line 515):

```ts
Generate EXACTLY ${sceneCount} variations/scenes. Each must have a different stage and time range.
```

Add the following block immediately before that line:

```ts
CTA DIALOG OVERRIDE (applies to ALL AC/CTA scenes this call):
Dialog MUST be 8-22 words. FORBIDDEN: 'Harga Promosi', 'Cek Link'.
THIS CALL style examples: '${ctaExamples}'
Use these as tone/structure reference only — do NOT copy them directly. Generate fresh dialog matching the product and scene context.

```

- [ ] **Step 7: Replace hardcoded hook_title example in the paired/storyline prompt**

Find this string inside `systemPrompt` (around line 920):

```ts
"hook_title": "REQUIRED — Short punchy hook title in casual Bahasa Melayu for intro card (3-5 words, e.g. 'Rahsia Kulit Glowing!')",
```

Replace with:

```ts
"hook_title": "REQUIRED — Short punchy hook title (${hookTitleStyle} format, 3-5 words). THIS CALL examples: '${hookTitleExamples}' — use as style reference only, do NOT copy directly.",
```

- [ ] **Step 8: Replace hardcoded variation_hook_title example in the paired/storyline prompt**

Find this string inside `systemPrompt` (around line 920):

```ts
"variation_hook_title": "REQUIRED — Short punchy hook title in casual Bahasa Melayu for THIS specific variation (3-7 words, e.g. 'Rahsia Kulit Glowing!', 'Mesti Cuba Ni!', 'Last Stock!')",
```

Replace with:

```ts
"variation_hook_title": "REQUIRED — Short punchy hook title for THIS specific variation (${hookTitleStyle} format, 3-7 words). THIS CALL examples: '${hookTitleExamples}' — use as style reference only, do NOT copy directly.",
```

- [ ] **Step 9: Replace hardcoded tiktok_caption example in the paired/storyline prompt**

Find this string inside `systemPrompt` (around line 920):

```ts
"tiktok_caption": "REQUIRED — Catchy TikTok caption in casual Bahasa Melayu (max 150 chars, no hashtags, e.g. 'Produk ni memang wajib cuba!')",
```

Replace with:

```ts
"tiktok_caption": "REQUIRED — Catchy TikTok caption (${captionStyle} style, max 150 chars, no hashtags). THIS CALL examples: '${captionExamples}' — use as style reference only, do NOT copy directly.",
```

- [ ] **Step 10: Add CTA override block to the paired/storyline prompt**

Find this line near the end of `systemPrompt` (around line 921):

```ts
    IMPORTANT: Every variation MUST include "variation_hook_title", "variation_video_caption", and "tiktok_caption" — these are REQUIRED fields, never leave them empty.
```

Add the following block immediately before that line:

```ts
    CTA DIALOG OVERRIDE (applies to ALL AC/CTA scenes this call):
    Dialog MUST be 8-22 words. FORBIDDEN: 'Harga Promosi', 'Cek Link'.
    THIS CALL style examples: '${ctaExamples}'
    Use these as tone/structure reference only — do NOT copy them directly. Generate fresh dialog matching the product and scene context.
```

- [ ] **Step 11: Verify TypeScript compiles**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Flow"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add app/api/prompts/ai-generate/route.ts
git commit -m "feat: inject rotating example pools and style directives into AI prompts"
```

---

### Task 3: Fix VARIATION_ANGLES in `app/api/quick-video/route.ts`

**Files:**
- Modify: `app/api/quick-video/route.ts`

- [ ] **Step 1: Replace the "7 hari" challenge entry**

Find this line (around line 39):

```ts
  "challenge — 'I tried this for 7 days' or dare-style content",
```

Replace with:

```ts
  "challenge — dare or test-style content, e.g. 'korang berani try tak?'",
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Flow"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/quick-video/route.ts
git commit -m "fix: remove hardcoded 7-hari challenge seed from variation angles"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Flow"
npm run dev
```

- [ ] **Step 2: Generate 3 Quick Videos for the same product back-to-back**

In the browser, open Quick Video, pick any product, and generate 3 times. Check:
- `hook_title` values differ across the 3 generations
- `tiktok_caption` values differ across the 3 generations
- No "cabaran 7 hari" appears in any generation
- Dialog CTA lines differ and do not contain "Jom grab sekarang, korang memang tak akan menyesal percaya cakap aku"

- [ ] **Step 3: Generate once from Video Studio (gempak mode)**

Confirm `hook_title` and `tiktok_caption` also vary (different from Quick Video results above).
