# TikTok Affiliate Simple — Design Spec

**Date:** 2026-04-27
**Status:** Approved

---

## Overview

A new standalone web app that is a stripped-down copy of the existing TikTok Affiliate Flow project, containing only the Quick Video feature. The existing app is left completely untouched.

**Core purpose:** Pick a product from a catalog → AI generates script, hook, dialog, captions → user reviews and edits the output → confirm and send to automation queue → Chrome extension handles Google Flow (image/video generation) and TikTok Studio posting.

---

## Project Location

```
~/Downloads/Personal Project 2026/
  ├── Tiktok Affiliate Flow/        ← existing app, untouched
  └── Tiktok Affiliate Simple/      ← new app (this spec)
```

---

## Tech Stack

Identical to the existing project:

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router), React 19 |
| Styling | Tailwind CSS 4.2 |
| Language | TypeScript 5.9 |
| ORM | Prisma 6.x |
| Database | SQLite (local) |
| AI | Gemini API (script generation) |
| Automation | Chrome Extension (Manifest V3) — forked from existing |

---

## Navigation — 5 Pages

| Page | Route | Purpose |
|------|-------|---------|
| Products | `/products` | Catalog of saved products — add via URL scrape or manual form |
| Quick Video | `/quick-video` | Main feature — generate, preview, edit, queue |
| Queue | `/automation` | Monitor job status (Pending / Processing / Done / Failed) |
| Gallery | `/gallery` | View and download completed videos and images |
| Settings | `/settings` | Gemini API key, extension ID, quick video presets |

The app defaults (`/`) redirect to `/quick-video`.

---

## Pages Detail

### Products (`/products`)

- **URL scraping**: Paste a TikTok Shop product URL → app scrapes title, price, images, description, shop name via Cheerio
- **Manual form**: Enter product name, USP, price, platform, images by hand (for non-TikTok products)
- Product cards show: thumbnail, name, price, USP snippet
- Delete product action
- No bulk import, no CSV upload (removed for simplicity)

### Quick Video (`/quick-video`) — Main Feature

#### Preset Configuration Bar (top of page)
Collapsible panel for global defaults:
- Avatar selection
- Video genre (Soft Sell, Hard Sell, Comedy, Educational, Emotional, POV, ASMR, Review, Unboxing)
- Format (Super Short 8s / Short 20s / Complete 40s)
- Hook title styling (color, font size, background)
- Overlay caption settings
- AI temperature slider

#### Product Cards Grid
Each product card shows:
- Product thumbnail, name, price
- Tiga Segi matrix progress (e.g. "3/12 combos used")
- **"⚡ Generate Preview"** button — triggers AI generation
- If a preview is ready and waiting: **"✏️ Review"** button instead

#### 4-Step Quick Video Flow

**Step 1 — Pick Product**
User clicks "Generate Preview" on a product card.

**Step 2 — AI Generating**
API calls Gemini with the product's USP, target audience, and the next unused Tiga Segi combination. Gemini returns:
- Hook title text
- Scene image prompts (3–5 scenes depending on format)
- Dialog / voiceover script per scene
- Scene overlay captions
- TikTok caption + hashtags

**Step 3 — Review & Edit**
A right-side slide-out drawer opens (product grid stays visible) showing all generated content as editable fields:
- Hook title (text input)
- Per-scene image prompt (textarea)
- Per-scene dialog / voiceover script (textarea)
- Per-scene overlay caption (text input)
- TikTok caption + hashtags (textarea)

User can freely edit any field before confirming.

**Step 4 — Confirm & Queue**
User clicks "Confirm & Queue". The app:
1. Marks the Tiga Segi combination as used
2. Creates VideoJob records in the database (one per scene)
3. Jobs appear immediately in the Queue page
4. Chrome extension picks them up and begins processing

### Queue (`/automation`)

- Job list grouped by status: Pending → Processing → Done → Failed
- Per-job: product name, scene number, current status, timestamp
- Failed jobs show error message + retry button
- Auto-start toggle (extension begins processing automatically when jobs arrive)

### Gallery (`/gallery`)

- Grid of completed videos and images in 9:16 portrait tiles
- Click to preview, download button per item
- Filter by product name

### Settings (`/settings`)

- Gemini API key input
- Chrome extension ID input
- Default quick video presets (avatar, genre, format, hook style, overlay config)
- Auto-post to TikTok toggle

---

## Data Model (Prisma Schema)

Keeping from existing schema:

| Model | Purpose |
|-------|---------|
| `Product` | Scraped or manually entered products |
| `VideoJob` | Video pipeline job per scene |
| `ContentMatrix` | Tiga Segi matrix per product (targets × scenarios × USPs) |
| `GalleryVideo` | Completed generated videos |
| `GalleryImage` | Completed generated images |
| `Setting` | Key-value config store |
| `ScrapeRequest` | Async scrape job tracking |

**Removed from existing schema:**
- `VideoTemplate` — video studio feature, not needed
- `CustomPrompt` — prompt tools feature, not needed
- `ImageJob` — standalone image generation, not needed

---

## Chrome Extension

Forked from the existing extension into `extension/` inside the new project. Keeps all automation scripts:
- `google-flow.js` — Google Flow image/video generation automation
- `tiktok-studio.js` — TikTok Studio upload + caption + product linking automation
- `background.js` — service worker, job queue polling, health checks
- `sidepanel.html/js` — real-time job monitor panel

The extension connects to the new app's API (`localhost` port configured in Settings).

---

## What Gets Removed (vs Existing App)

| Removed | Reason |
|---------|--------|
| `/tools` route | Prompt tools — out of scope |
| `/content-tools` route | Content generation tools — out of scope |
| `/image-tools` route | Standalone image generation — out of scope |
| `/video-studio` route | Multi-scene studio — out of scope |
| `/video-studio-v2` route | Studio v2 — out of scope |
| `/custom-video` route | Custom video — out of scope |
| All corresponding API routes | Not needed |
| CSV / bulk import on Products | Simplicity — URL scrape + manual form sufficient |
| `VideoTemplate`, `CustomPrompt`, `ImageJob` DB models | Not needed |
| Sidebar links for removed pages | Sidebar shows 5 links only |

---

## Key Flows

### Job Pipeline (unchanged from existing)

```
pending → generating_image → generating_video → ready → posting → posted
                                                              ↓
                                                          failed (retryable / fatal / timeout)
```

Retry logic: exponential backoff (10s → 20s → 40s, max 120s, max 3 retries).

### Tiga Segi Matrix

- Stored per product in `ContentMatrix`
- Phase 1: Single USP combos (Target × Scenario × USP)
- Phase 2: Double USP combos
- Auto-progresses through combinations on each Quick Video generation
- Progress shown on product card ("X/Y combos used")

---

## Build Approach

1. Copy entire existing project into `Tiktok Affiliate Simple/`
2. Delete removed routes, API handlers, and DB models
3. Trim sidebar to 5 links
4. Update app name to "Quick Flow" (or similar)
5. Fork extension into new `extension/` folder, update manifest name/ID
6. Run `prisma migrate` with updated schema
7. Test end-to-end: scrape product → quick video → preview/edit → queue → extension processes → gallery

---

## Out of Scope

- Dashboard page
- Grok integration (`grok-flow.js` removed from extension)
- Telegram notifications
- Docker / containerization setup (can be added later)
- Multi-user / authentication
