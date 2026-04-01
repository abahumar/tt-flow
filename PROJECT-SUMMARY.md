# TikTok Affiliate Flow — Project Summary

> **Last Updated**: 31 March 2026

## What Is This?

A local **Next.js web app + Chrome Extension** that automates the full TikTok affiliate video pipeline:

1. **Scrape** product info from TikTok Shop URLs
2. **Generate** AI images & videos via Google Flow (browser automation)
3. **Auto-post** to TikTok via TikTok Studio

Everything runs locally — no cloud deployment, no API costs for AI generation (we automate Google Flow's web UI directly through the Chrome extension).

---

## Tech Stack

| Layer             | Tech                                                     |
| ----------------- | -------------------------------------------------------- |
| Frontend          | Next.js 16.2, React 19, Tailwind CSS 4.2, TypeScript 5.9 |
| Backend           | Next.js API routes (App Router)                          |
| Database          | SQLite via Prisma 6.19.2                                 |
| Chrome Extension  | Manifest V3, side panel, content scripts                 |
| AI Generation     | Google Flow (Veo 3.1 for video, Imagen for images)       |
| Prompt Generation | Gemini API                                               |
| Media Processing  | FFmpeg (watermark removal)                               |
| Scraping          | Cheerio 1.2.0                                            |
| Container         | Docker + Docker Compose                                  |

---

## Development Timeline

| Date        | Milestone                                                            |
| ----------- | -------------------------------------------------------------------- |
| 21 Mar 2026 | Initial commit + working pipeline foundation                         |
| 23 Mar 2026 | **Stage 6**: Video download + watermark removal (FFmpeg)             |
| 24 Mar 2026 | **Stage 7**: TikTok posting flow, gallery, caption/hashtag support   |
| 24 Mar 2026 | Fix race conditions with mutex lock system                           |
| 27 Mar 2026 | Standalone Image Creation Tools + gallery support                    |
| 30 Mar 2026 | Saved prompts + bulk product import (multi-URL & CSV)                |
| 31 Mar 2026 | Video Studio: multi-scene generation, templates, avatar selector     |
| 31 Mar 2026 | Automation improvements: job log, video genre, multi-job queue fixes |

---

## Completed Stages

### Stage 1-3: Foundation

- Next.js project setup with TypeScript, App Router, Tailwind CSS
- Prisma + SQLite database schema (Product, VideoJob, Setting)
- Chrome Extension shell (Manifest V3, side panel, content scripts)
- Extension ↔ Web App communication via REST API (`localhost:3000`)
- Product scraping from TikTok Shop URLs
- Google Flow automation rewritten with real DOM selectors from recorder data

### Stage 4: Video Generation (Animate Flow)

- Automated flow: generate image → right-click → "Animate" → video mode → fill prompt → Create
- Full flow button in side panel (end-to-end automation)
- `waitForGenerationComplete()` with polling and existing-image detection

### Stage 5: Product Image Reference Upload

- Upload actual product images as reference in Google Flow before generating
- Ensures generated images match the real product (not imagined)
- Prompt templates updated: "Using the uploaded product image as reference..."

### Stage 6: Video Download + Watermark Removal

- Multi-strategy video download from Google Flow (download link, button, video src, canvas capture)
- Video upload to backend via `POST /api/jobs/{id}/video`
- FFmpeg watermark removal (crops bottom 4% — "Made with Google" watermark)
- Persistent storage in `/data/videos/`

### Stage 7: TikTok Studio Posting

- Auto-generated captions and hashtags from product info
- TikTok Studio automation: video upload, DraftJS caption editor, product anchor linking, comment toggle
- TikTok Shop: add product to showcase
- Auto-post toggle (controllable from Settings page and extension side panel)
- Error handling: content policy detection (fatal), rate limit detection (retryable)

### Error Handling & Retry System

- Error classification: retryable, fatal, timeout
- Auto-retry with exponential backoff (10s → 20s → 40s, max 120s, max 3 retries)
- Job timeout detection (jobs stuck >15 minutes)
- Health checks before starting operations
- `withRetry()` wrapper for flaky DOM operations

### Race Condition Fix

- Mutex lock system to prevent concurrent job processing conflicts

---

## Features Built

### 1. Product Management (`/products`)

- Scrape TikTok Shop product URLs (title, description, price, images, shop name)
- Bulk import: multi-URL paste or CSV upload
- Product catalog with status indicators

### 2. Prompt Tools (`/tools`)

- Generate image/video prompts from product info + marketing angle
- Video types: Fungsi Produk, Review, Unboxing, Problem-Solution
- AI-powered prompt generation via Gemini API

### 3. Image Tools (`/image-tools`)

- Standalone image generation (not tied to products)
- Upload reference image (optional)
- 5 image styles: product showcase, lifestyle, flat lay, creative, social media
- AI-generated prompt variations via Gemini
- Saved prompts library (CustomPrompt model)
- Queue image jobs → Google Flow generates → save to gallery

### 4. Video Studio (`/video-studio`)

- Multi-scene video generation with templates
- **Template System**: Save background + model images with descriptions, reuse across projects
- **Avatar Selector**: Choose model/avatar for scenes
- **Custom Product Input**: Manual product info (not just from catalog)
- **Manual Prompts**: Direct prompt entry without AI generation
- **Optional Background**: Generate without background reference
- Scene generation: 1 master job (scene 0) + N dependent jobs
- Master scene generates base image; dependent scenes reference it
- Dialog inclusion and English dialog options
- All scenes queued at once with `groupId` linking

### 5. Gallery (`/gallery`)

- Combined view of generated videos + images
- Two tabs: Videos and Images
- Download, delete, or reuse gallery items
- Create video from saved image (skips image generation phase)
- Saved video prompts for reuse

### 6. Automation (`/automation`)

- Queue display: Pending / Processing / Done / Failed
- Start Auto button (processes queue sequentially)
- Job log with status history
- Video genre display
- No-retry on failure (latest change)
- Multi-job queue fix
- Individual retry button for failed jobs

### 7. Settings (`/settings`)

- API keys (Gemini, etc.)
- Auto-post toggle
- Extension ID registration

---

## Database Models (9 Total)

| Model             | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| **Product**       | Scraped TikTok products                          |
| **VideoJob**      | Video processing pipeline (image → video → post) |
| **ImageJob**      | Standalone image generation                      |
| **GalleryVideo**  | Saved completed videos                           |
| **GalleryImage**  | Saved completed images                           |
| **VideoTemplate** | Reusable scene templates (background + model)    |
| **CustomPrompt**  | Saved image/video prompt templates               |
| **Setting**       | Key-value config store                           |
| **ScrapeRequest** | Async scrape job tracking                        |

---

## API Routes (30+ Endpoints)

- `/api/products` — CRUD + scrape
- `/api/jobs` — VideoJob CRUD + start-auto + reset
- `/api/image-jobs` — ImageJob CRUD + start-auto
- `/api/gallery` — Combined gallery (videos + images)
- `/api/image-gallery` — Image gallery CRUD
- `/api/video-templates` — Template CRUD
- `/api/custom-prompts` — Saved prompts CRUD
- `/api/prompts` — AI prompt generation
- `/api/settings` — Config management
- `/api/scrape-requests` — Scrape job tracking
- `/api/upload` — File upload/serve

---

## Chrome Extension

### Content Scripts

1. **Google Flow** (`labs.google/fx/*`, `labs.google/flow/*`)
   - Image generation, video generation, reference uploads, mode switching
   - Multi-scene prompt injection
   - Retry logic with exponential backoff

2. **TikTok Studio** (`tiktok.com/tiktokstudio/*`)
   - Video upload, caption/hashtag filling, product anchor linking
   - Content policy & rate limit detection

3. **TikTok Shop** (`shop.tiktok.com/*`, `tiktok.com/*/product/*`)
   - Add product to showcase

### Key Capabilities

- Side panel UI for real-time monitoring
- Background service worker (messaging hub)
- Health checks before operations
- Auto-post toggle
- Timeout detection (15 min threshold)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Side     │  │ Background   │  │ Content Scripts   │  │
│  │ Panel    │  │ Service      │  │ - google-flow.js  │  │
│  │ (UI)     │  │ Worker       │  │ - tiktok-studio.js│  │
│  └──────────┘  └──────┬───────┘  │ - tiktok-shop.js  │  │
│                       │          │ - dom-helpers.js   │  │
│                       │          └──────────────────┘   │
└───────────────────────┼─────────────────────────────────┘
                        │ REST API
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Next.js Web App (Docker)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Pages (9)    │  │ API Routes   │  │ Libraries    │  │
│  │ Dashboard    │  │ /api/jobs    │  │ prisma.ts    │  │
│  │ Products     │  │ /api/products│  │ scraper.ts   │  │
│  │ Tools        │  │ /api/gallery │  │ prompt-      │  │
│  │ Image Tools  │  │ /api/prompts │  │ templates.ts │  │
│  │ Video Studio │  │ /api/settings│  │ telegram.ts  │  │
│  │ Automation   │  │ /api/upload  │  └──────────────┘  │
│  │ Gallery      │  │ ...          │                     │
│  │ Settings     │  └──────────────┘  ┌──────────────┐  │
│  └──────────────┘                    │ Prisma/SQLite│  │
│                                      └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  File Storage    │
              │  /data/videos/   │
              │  /data/images/   │
              │    generated/    │
              │    references/   │
              └──────────────────┘
```

---

## Job Processing Pipeline

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │  start-auto
                         ▼
               ┌──────────────────┐
               │ generating_image │──── imageOnly? ──→ Save to Gallery
               └────────┬─────────┘
                        │
                        ▼
              ┌───────────────────┐
              │ generating_video  │
              └────────┬──────────┘
                       │
                       ▼
                  ┌─────────┐
                  │  ready  │
                  └────┬────┘
                       │  auto-post enabled?
              ┌────────┴────────┐
              │ YES             │ NO
              ▼                 ▼
         ┌─────────┐      [STOPS HERE]
         │ posting │      manual trigger
         └────┬────┘
              │
              ▼
         ┌─────────┐
         │ posted  │
         └─────────┘
```

**Error paths**: Any stage can → `failed` (with retryable/fatal/timeout classification)

---

## Known Issues & Next Steps

1. **TikTok Studio Upload**: Video upload has HTTPS/localhost CORS/CSP issues — needs blob URL workaround via background.js
2. **Settings Sync**: Auto-post flag stored separately in Chrome storage and database — may need sync mechanism
3. **DOM Selector Fragility**: Google Flow uses `sc-*` styled-components classes that change per build — must use text content, ARIA attributes, or Radix IDs instead

---

## File Structure

```
/
├── app/                    # Next.js pages + API routes
│   ├── page.tsx            # Dashboard
│   ├── products/           # Product catalog
│   ├── tools/              # Prompt tools
│   ├── image-tools/        # Standalone image generation
│   ├── video-studio/       # Multi-scene video generation
│   ├── automation/         # Queue management
│   ├── gallery/            # Videos + images gallery
│   ├── settings/           # Configuration
│   └── api/                # 30+ API endpoints
├── components/             # Sidebar, shared UI
├── data/                   # Generated files (images, videos)
├── extension/              # Chrome extension (Manifest V3)
│   ├── background.js       # Service worker
│   ├── sidepanel.js        # Side panel UI
│   └── content/            # Content scripts
├── flow-recorder-extension/ # Debug tool for recording DOM interactions
├── lib/                    # Utilities (prisma, scraper, prompts, telegram)
├── prisma/                 # Schema + migrations
├── docker-compose.yml
└── Dockerfile
```
