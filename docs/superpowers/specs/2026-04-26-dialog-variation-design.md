# Dialog, Hook Title & Caption Variation — Design Spec
Date: 2026-04-26

## Problem

All video creation flows (Quick Video, Video Studio, Custom Video) produce repetitive dialog,
hook titles, and TikTok captions. Root causes:

1. The AI generation prompt hardcodes the same example phrases on every call — Gemini anchors to
   these and reuses them (e.g. `'Rahsia Kulit Glowing!'`, `'Jom grab sekarang, korang memang tak
   akan menyesal percaya cakap aku!'`, `'Produk ni memang wajib cuba!'`).
2. The `VARIATION_ANGLES` array in `quick-video/route.ts` contains an explicit `"7 hari"` string
   that causes Gemini to repeatedly generate "cabaran 7 hari" content.
3. No per-call style directive exists — Gemini has no instruction to vary the structural format
   (question vs bold claim vs number-driven etc.) between calls.

## Solution: Option C — Rotating Example Pools + Style Directives

### Scope

Affects all flows that call `/api/prompts/ai-generate`:
- Quick Video
- Video Studio v1 & v2 (Gempak)
- Custom Video
- Tools page

`VARIATION_ANGLES` fix is Quick Video only.

### Constraints

- Zero changes to scene structure, SEEIUWTOA formula, video format mappings, or job creation logic.
- All pool entries must follow promoter tone rules: speak TO the audience (`"korang"`), no personal
  testimony, no efficacy overclaims (`"berkesan"`, `"terbukti"`), no Indonesian slang.
- Bold Claim style: hype the product and direct the audience — no personal vouching.

---

## Files Changed

### 1. `lib/prompt-templates.ts`

Add at the bottom of the file:

#### `HOOK_TITLE_POOL` — 35 entries across 7 formats

| Format | Examples |
|---|---|
| question | `"Kenapa Kulit Masih Kusam?"`, `"Rambut Gugur Tak Henti?"`, `"Dah Cuba Semua Cara?"`, `"Penat Masalah Sama?"`, `"Korang Tahu Tak Ni?"` |
| bold_claim | `"Power Gila Produk Ni!"`, `"Memang Wajib Ada Ni!"`, `"Korang Mesti Try Ni!"`, `"Serious Best Gila Ni!"`, `"Ini Lah Yang Korang Nak!"`, `"Confirm Korang Suka!"`, `"Memang Berbaloi Weh!"`, `"Korang Kena Cuba Ni!"`, `"Produk Ni Memang Gempak!"`, `"Jangan Miss Produk Ni!"` |
| number_driven | `"3 Hari Nampak Beza!"`, `"1 Produk 5 Manfaat!"`, `"2 Minggu Dah Nampak!"`, `"Dah 10K Orang Cuba!"`, `"5 Star Confirm!"` |
| urgency | `"Last Stok Alert!"`, `"Grab Sebelum Habis!"`, `"Jangan Menyesal Nanti!"`, `"Terhad, Rebut Sekarang!"`, `"Jangan Lepas Peluang Ni!"` |
| emotional_payoff | `"Akhirnya Jumpa Jugak!"`, `"Masalah Tu Selesai!"`, `"Lega Gila Dah!"`, `"Tak Sangka Macam Ni!"`, `"Ni Lah Jawapannya!"` |
| pov | `"POV: Jumpa Produk Ni"`, `"POV: Masalah Dah Selesai"`, `"POV: Life Changer Alert"`, `"POV: Korang Nak Glowing"`, `"POV: Bila Dah Try Ni"` |
| curiosity | `"Ramai Tak Sedar Ni"`, `"Selama Ni Buat Salah?"`, `"Ni Baru Korang Tahu!"`, `"Rahsia Yang Ramai Simpan"`, `"Orang Lain Dah Tahu..."` |

#### `DIALOG_CTA_POOL` — 20 CTA closing lines (8–22 words)

Promoter style, speak TO audience, no efficacy claims, no `"Harga Promosi"`, no `"Cek Link"`:

```
"Korang kena grab ni sekarang, serious memang berbaloi duit korang!"
"Stok limited tau, jangan tangguh lagi, grab sekarang jugak!"
"Dah ramai yang dah grab, korang bila lagi nak try?"
"Kalau korang nak hasil terbaik, grab ni sekarang jugak!"
"Power gila produk ni, korang kena try sendiri baru tahu!"
"Ni peluang korang, jangan lepas, grab selagi ada stok!"
"Saya recommend ni, korang cuba dulu confirm korang suka!"
"Korang rugi kalau tak try, serious best gila produk ni!"
"Fuh memang power, korang kena ada ni dalam hidup korang!"
"Tak perlu fikir panjang, grab je dulu tau!"
"Memang worth it, korang grab sekarang sebelum stock habis!"
"Korang yang tengah tengok ni, ni sign untuk korang grab!"
"Last chance ni, korang grab sebelum menyesal nanti tau!"
"Serious tak rugi pun, grab sekarang confirm korang happy!"
"Kalau korang nak upgrade, start dengan produk ni sekarang!"
"Jom sama-sama try, memang confirm korang tak akan kecewa!"
"Korang kena ada ni, grab sekarang jangan lepas peluang!"
"Best gila, korang grab cepat sebelum habis stok tau!"
"Ni untuk korang yang nak yang terbaik, grab sekarang!"
"Korang tengok dulu, pastu confirm terus nak grab jugak!"
```

#### `TIKTOK_CAPTION_POOL` — 20 captions (max 150 chars, no hashtags)

Promoter tone, varied formats, no testimony:

```
"Ni lah produk yang korang dah lama cari!"
"Korang kena try ni, serious tak akan menyesal!"
"Fuh, memang power! Grab sekarang sebelum habis stok!"
"Bila dah jumpa produk macam ni, terus jatuh cinta!"
"Masalah korang selesai dah dengan produk ni!"
"Serious game changer! Korang mesti cuba sendiri baru tahu!"
"Tak sangka boleh lain gila, korang kena try ni!"
"POV: Bila korang akhirnya jumpa produk yang memang power!"
"Dah jadi kegemaran ramai, korang bila lagi nak try?"
"Memang takde alasan untuk tak grab ni sekarang!"
"Korang yang ada masalah ni, ni lah jawapannya!"
"Percaya ke tidak, korang cuba dulu baru tau!"
"Lepas try baru faham kenapa ramai yang suka sangat!"
"Quality memang tak tipu, korang grab sebelum stock habis!"
"Ni baru yang korang patut tahu pasal produk ni!"
"Dah test, memang worth every ringgit tau!"
"Korang tengah tengok sign untuk grab ni sekarang!"
"Kalau rasa nak upgrade hidup korang, start dengan ni!"
"Fuh perghhh, korang kena tengok ni sampai habis!"
"Tak percaya? Cuba dulu, korang confirm nak lagi!"
```

#### Style directive pools

```ts
export const HOOK_TITLE_STYLES = [
  "question",        // "Kenapa Kulit Masih Kusam?"
  "bold_claim",      // "Power Gila Produk Ni!"
  "number_driven",   // "3 Hari Nampak Beza!"
  "urgency",         // "Last Stok Alert!"
  "emotional_payoff",// "Akhirnya Jumpa Jugak!"
  "pov",             // "POV: Jumpa Produk Ni"
  "curiosity",       // "Ramai Tak Sedar Ni"
] as const;

export const CAPTION_STYLES = [
  "relatable_problem",  // frame around audience pain point being solved
  "discovery",          // genuine find / surprise
  "social_proof",       // hint others are already using it
  "pov_scenario",       // start with POV:
  "fomo_urgency",       // limited availability / missing out
  "curiosity_gap",      // make them want to know more
] as const;
```

#### Helper functions

```ts
export function pickSamples<T>(pool: readonly T[], n: number): T[]
// Returns n unique random items from pool. If n >= pool.length, returns shuffled copy.

export function pickOne<T>(pool: readonly T[]): T
// Returns one random item from pool.
```

---

### 2. `app/api/prompts/ai-generate/route.ts`

At the top of the `POST` handler, before any prompt string is built, compute once per request:

```ts
const hookTitleExamples = pickSamples(HOOK_TITLE_POOL, 3).join("', '")
const ctaExamples       = pickSamples(DIALOG_CTA_POOL, 3).join("', '")
const captionExamples   = pickSamples(TIKTOK_CAPTION_POOL, 3).join("', '")
const hookTitleStyle    = pickOne(HOOK_TITLE_STYLES)
const captionStyle      = pickOne(CAPTION_STYLES)
```

These values are then interpolated into both the `gempak` prompt and the `paired`/storyline prompt
at the output field description level:

**`hook_title` / `variation_hook_title` fields:**
```
"hook_title": "REQUIRED — Short punchy hook title (${hookTitleStyle} format, 3-5 words).
               THIS CALL examples: '${hookTitleExamples}' — use these as style reference only,
               do NOT copy them directly."
```

**`tiktok_caption` field:**
```
"tiktok_caption": "REQUIRED — Catchy TikTok caption (${captionStyle} style, max 150 chars,
                   no hashtags). THIS CALL examples: '${captionExamples}' — use as style
                   reference only, do NOT copy directly."
```

**CTA dialog examples — runtime override block:**
The static `dialogDirection` fields in `VIDEO_FORMATS` and `SEEIUWTOA_ELEMENTS` are NOT modified.
Instead, a CTA override block is appended to the prompt after the scene instructions, which
supersedes any examples embedded in `dialogDirection` at runtime:

```
CTA DIALOG OVERRIDE (applies to ALL AC/CTA scenes this call):
MUST be 8-22 words. FORBIDDEN: 'Harga Promosi', 'Cek Link'.
THIS CALL style examples: '${ctaExamples}'
Use these as tone/structure reference only — do NOT copy them directly.
Generate fresh dialog that matches the product and scene context.
```

This keeps the static element definitions clean and makes the runtime injection explicit.

---

### 3. `app/api/quick-video/route.ts`

Fix `VARIATION_ANGLES` entry:

```ts
// Before:
"challenge — 'I tried this for 7 days' or dare-style content",

// After:
"challenge — dare or test-style content, e.g. 'korang berani try tak?'",
```

---

## What Does NOT Change

- SEEIUWTOA formula elements and their `visualDirection`
- `FORMAT_SCENE_MAPPINGS` and scene groupings
- `DIALOG_TONE_SANTAI` tone rules (still fully in effect)
- `HOOK_TEMPLATES` (controversial / curiosity / story_based)
- `AVATAR_DNA` and avatar pronoun rules
- Job creation, video rendering, overlay config
- All other API routes

---

## Expected Outcome

Each generation call receives 3 randomly selected examples per output field plus a randomly
selected style directive. Across 10 consecutive generations for the same product, the hook titles,
captions, and CTA lines should span at least 4–5 distinct structural formats rather than repeating
the same 1–2 patterns.
