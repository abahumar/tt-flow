# TikTok Affiliate Simple — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new standalone Next.js app at `Tiktok Affiliate Simple/` by copying the existing project and stripping everything except Products, Quick Video, Queue, Gallery, and Settings.

**Architecture:** Copy the entire existing project into a sibling folder, then delete removed routes/APIs/DB models, trim the sidebar to 5 links, and fork the Chrome extension. The existing `Tiktok Affiliate Flow/` app is never touched.

**Tech Stack:** Next.js 16.2, React 19, Tailwind CSS 4.2, Prisma + SQLite, TypeScript, Gemini API, Chrome Extension MV3

---

## File Map

### Created in new project root (`../Tiktok Affiliate Simple/`)
- `app/page.tsx` — redirect to `/quick-video`
- `app/layout.tsx` — updated title "Quick Flow"
- `components/sidebar.tsx` — 5 links only
- `prisma/schema.prisma` — 3 models removed (VideoTemplate, CustomPrompt, ImageJob)
- `extension/manifest.json` — renamed "Quick Flow", grok removed
- `extension/content/grok-flow.js` — deleted

### Deleted from copy
- `app/tools/`, `app/content-tools/`, `app/image-tools/`, `app/video-studio/`, `app/video-studio-v2/`, `app/custom-video/`
- `app/api/custom-video/`
- `app/api/image-jobs/` (all)
- `app/api/video-templates/` (all)
- `app/api/custom-prompts/` (all)
- `app/api/prompts/ai-generate-image/`, `app/api/prompts/ai-generate-content/`, `app/api/prompts/generate/`
- `app/api/test-overlay/`
- `app/api/gallery/[id]/telegram/`
- `lib/telegram.ts`

---

## Task 1: Copy project to new folder

**Files:**
- Create: `../Tiktok Affiliate Simple/` (entire project copy)

- [ ] **Step 1: Copy the project (excluding generated/large artifacts)**

From your terminal, run from `~/Downloads/Personal Project 2026/`:
```bash
rsync -av \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='data' \
  --exclude='prisma/dev.db' \
  --exclude='prisma/dev.db-journal' \
  --exclude='.git' \
  --exclude='.superpowers' \
  --exclude='tsconfig.tsbuildinfo' \
  "Tiktok Affiliate Flow/" "Tiktok Affiliate Simple/"
```

- [ ] **Step 2: Verify copy succeeded**

```bash
ls "Tiktok Affiliate Simple/"
```
Expected output includes: `app/  components/  extension/  lib/  prisma/  package.json  next.config.mjs  tsconfig.json`

- [ ] **Step 3: Update package name**

In `Tiktok Affiliate Simple/package.json`, change:
```json
"name": "tiktok-affiliate-flow",
```
to:
```json
"name": "tiktok-affiliate-simple",
```

- [ ] **Step 4: Create .env file**

Create `Tiktok Affiliate Simple/.env`:
```
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 5: Initialize git repo**

```bash
cd "Tiktok Affiliate Simple"
git init
git add .
git commit -m "chore: initial copy from Tiktok Affiliate Flow"
```

---

## Task 2: Install dependencies and verify dev server

**Files:**
- Modify: `Tiktok Affiliate Simple/` (node_modules populated)

- [ ] **Step 1: Install dependencies**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple"
npm install
```
Expected: no errors, `node_modules/` created.

- [ ] **Step 2: Generate Prisma client**

```bash
npx prisma generate
```
Expected: `✔ Generated Prisma Client`

- [ ] **Step 3: Run database migration**

```bash
npx prisma migrate dev --name init
```
Expected: `✔ Your database is now in sync with your schema.`

- [ ] **Step 4: Start dev server and verify it loads**

```bash
npm run dev
```
Open `http://localhost:3000` — you should see the existing full app (all 12 routes still present at this point). Confirm the page loads with no errors, then stop the server (`Ctrl+C`).

- [ ] **Step 5: Commit**

```bash
git add prisma/dev.db prisma/migrations/
git commit -m "chore: install deps and init database"
```

---

## Task 3: Delete removed page routes

**Files:**
- Delete: `app/tools/page.tsx`
- Delete: `app/content-tools/page.tsx`
- Delete: `app/image-tools/page.tsx`
- Delete: `app/video-studio/page.tsx`
- Delete: `app/video-studio-v2/page.tsx`
- Delete: `app/custom-video/page.tsx`

- [ ] **Step 1: Delete all out-of-scope page directories**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple"
rm -rf app/tools app/content-tools app/image-tools app/video-studio app/video-studio-v2 app/custom-video
```

- [ ] **Step 2: Verify only the 5 needed page folders remain**

```bash
ls app/
```
Expected: `api/  automation/  gallery/  globals.css  layout.tsx  page.tsx  products/  quick-video/  settings/`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove out-of-scope page routes"
```

---

## Task 4: Delete removed API routes

**Files:**
- Delete: `app/api/custom-video/`
- Delete: `app/api/image-jobs/`
- Delete: `app/api/video-templates/`
- Delete: `app/api/custom-prompts/`
- Delete: `app/api/prompts/ai-generate-image/`
- Delete: `app/api/prompts/ai-generate-content/`
- Delete: `app/api/prompts/generate/`
- Delete: `app/api/test-overlay/`
- Delete: `app/api/gallery/[id]/telegram/`
- Delete: `lib/telegram.ts`

- [ ] **Step 1: Delete removed API route directories**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple"
rm -rf \
  app/api/custom-video \
  app/api/image-jobs \
  app/api/video-templates \
  app/api/custom-prompts \
  app/api/prompts/ai-generate-image \
  app/api/prompts/ai-generate-content \
  app/api/prompts/generate \
  app/api/test-overlay \
  "app/api/gallery/[id]/telegram"
```

- [ ] **Step 2: Delete telegram lib**

```bash
rm lib/telegram.ts
```

- [ ] **Step 3: Verify the prompts directory still has ai-generate**

```bash
ls app/api/prompts/
```
Expected: `ai-generate/` (only one folder remains — used by quick-video for Gemini script generation)

- [ ] **Step 4: Verify api directory structure**

```bash
find app/api -type d | sort
```
Expected directories:
```
app/api/gallery
app/api/gallery/[id]
app/api/gallery/combine
app/api/image-gallery
app/api/image-gallery/[id]
app/api/jobs
app/api/jobs/[id]
app/api/jobs/[id]/combine
app/api/jobs/[id]/image
app/api/jobs/[id]/video
app/api/jobs/combine-story
app/api/jobs/reset
app/api/jobs/start-auto
app/api/products
app/api/products/[id]
app/api/products/[id]/matrix
app/api/products/scrape
app/api/prompts
app/api/prompts/ai-generate
app/api/quick-video
app/api/scrape-requests
app/api/scrape-requests/[id]
app/api/scrape-requests/bulk
app/api/settings
app/api/upload
app/api/upload/[filename]
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove out-of-scope API routes and telegram lib"
```

---

## Task 5: Update Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Remove the three unused models from schema.prisma**

Open `prisma/schema.prisma` and delete the entire `CustomPrompt`, `ImageJob`, and `VideoTemplate` model blocks. The file after editing should end with `GalleryImage`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Product {
  id             String     @id @default(cuid())
  url            String     @unique
  title          String
  description    String     @default("")
  images         String     @default("[]")
  price          String     @default("")
  shopName       String     @default("")
  usp            String     @default("")
  targetAudience String     @default("")
  avatarId       String     @default("")
  videoReady     Boolean    @default(false)
  scrapedAt      DateTime   @default(now())
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  videoJobs      VideoJob[]
  contentMatrix  ContentMatrix?
}

model ContentMatrix {
  id         Int      @id @default(autoincrement())
  productId  String   @unique
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  targets    String   @default("[]")
  scenarios  String   @default("[]")
  usps       String   @default("[]")
  usedCombos String   @default("[]")
  phase      Int      @default(1)
  mode       String   @default("gemini")
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model VideoJob {
  id               String    @id @default(cuid())
  productId        String?
  product          Product?  @relation(fields: [productId], references: [id], onDelete: Cascade)
  status           String    @default("pending")
  videoType        String    @default("fungsi_produk")
  imageOnly        Boolean   @default(false)
  referenceImage   String    @default("")
  referenceImages  String    @default("[]")
  imagePrompt      String    @default("")
  videoPrompt      String    @default("")
  imageUrl         String    @default("")
  videoUrl         String    @default("")
  tiktokCaption        String    @default("")
  tiktokHashtags       String    @default("[]")
  tiktokProductName    String    @default("")
  tiktokDescription    String    @default("")
  tiktokPostUrl        String    @default("")
  errorMessage     String    @default("")
  retryCount       Int       @default(0)
  maxRetries       Int       @default(3)
  lastError        String    @default("")
  templateId       String    @default("")
  groupId          String    @default("")
  sceneIndex       Int       @default(0)
  masterJobId      String    @default("")
  scenePrompts     String    @default("")
  combinedVideoUrl String    @default("")
  overlayConfig    String    @default("")
  startedAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model Setting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}

model ScrapeRequest {
  id        String   @id @default(cuid())
  url       String
  status    String   @default("pending")
  error     String   @default("")
  productId String   @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model GalleryVideo {
  id        String   @id @default(cuid())
  filename  String
  videoType String   @default("")
  caption   String   @default("")
  createdAt DateTime @default(now())
}

model GalleryImage {
  id        String   @id @default(cuid())
  filename  String
  prompt    String   @default("")
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Run migration to apply schema changes**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple"
npx prisma migrate dev --name remove-unused-models
```
Expected: `✔ Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```
Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (if there are errors referencing removed models, they will be in the deleted API files — those are already gone).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "chore: remove VideoTemplate, CustomPrompt, ImageJob from schema"
```

---

## Task 6: Update sidebar to 5 links

**Files:**
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: Replace sidebar.tsx with 5-link version**

Replace the entire contents of `components/sidebar.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  Bolt,
  Zap,
  Film,
  Settings,
  Package,
} from "lucide-react";

const nav: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}[] = [
  { href: "/products", label: "Products", icon: ShoppingBag },
  { href: "/quick-video", label: "Quick Video", icon: Bolt },
  { href: "/automation", label: "Queue", icon: Zap },
  { href: "/gallery", label: "Gallery", icon: Film },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
        <Package className="h-6 w-6 text-rose-500" />
        <span className="text-lg font-bold">Quick Flow</span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-rose-50 text-rose-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.badge && (
                <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-400">
        v1.0.0
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/sidebar.tsx
git commit -m "feat: trim sidebar to 5 links, rename app to Quick Flow"
```

---

## Task 7: Update root page and layout metadata

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace root page with redirect to /quick-video**

Replace the entire contents of `app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/quick-video");
}
```

- [ ] **Step 2: Update layout metadata**

In `app/layout.tsx`, replace:
```tsx
export const metadata: Metadata = {
  title: "TikTok Affiliate Flow",
  description: "Automate TikTok affiliate video creation and posting",
};
```
with:
```tsx
export const metadata: Metadata = {
  title: "Quick Flow",
  description: "Quick Video generation for TikTok affiliate products",
};
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: redirect root to /quick-video, update app title to Quick Flow"
```

---

## Task 8: Strip bulk import from Products page

**Files:**
- Modify: `app/products/page.tsx`

- [ ] **Step 1: Remove unused icon imports**

In `app/products/page.tsx`, change the lucide-react import from:
```tsx
import {
  Plus, Trash2, Video, RefreshCw, ExternalLink, Chrome, PenLine,
  Loader2, CheckCircle2, Upload, List, FileText, AlertCircle,
  Check, X, CheckSquare, Square, MinusSquare,
} from "lucide-react";
```
to:
```tsx
import {
  Plus, Trash2, Video, RefreshCw, ExternalLink, Chrome, PenLine,
  Loader2, CheckCircle2, Check, X, CheckSquare, Square, MinusSquare,
} from "lucide-react";
```
(Removed: `Upload`, `List`, `FileText`, `AlertCircle` — only used in bulk import)

- [ ] **Step 2: Remove bulk import state variables**

In `ProductsPage()`, delete these four state lines:
```tsx
const [showBulk, setShowBulk] = useState(false);
const [bulkUrls, setBulkUrls] = useState("");
const [bulkLoading, setBulkLoading] = useState(false);
const [bulkResult, setBulkResult] = useState<{
  created: number;
  skippedExisting: number;
  skippedQueued: number;
  skippedInvalid: number;
  details: { url: string; status: string; reason?: string }[];
} | null>(null);
```

- [ ] **Step 3: Remove bulk import handlers**

Delete the entire `handleBulkImport` function (lines 193–226) and the entire `handleCsvUpload` function (lines 228–256).

- [ ] **Step 4: Remove the "Bulk import" link from the scrape form**

Inside the scrape form's hint row, delete the separator and bulk import button:
```tsx
          <span>·</span>
          <button
            type="button"
            onClick={() => {
              setShowBulk(!showBulk);
              setBulkResult(null);
            }}
            className="flex items-center gap-1 text-purple-500 hover:underline"
          >
            <List className="h-3 w-3" />{" "}
            {showBulk ? "Hide bulk import" : "Bulk import"}
          </button>
```

- [ ] **Step 5: Remove the bulk import JSX section**

Delete the entire block from `{/* Bulk import section */}` through its closing `)}` — this is the purple-bordered panel containing the textarea, CSV import button, and results display (lines 549–666 in the original file).

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple"
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/products/page.tsx
git commit -m "feat: remove bulk import and CSV upload from products page"
```

---

## Task 9: Fork Chrome extension

**Files:**
- Modify: `extension/manifest.json`
- Delete: `extension/content/grok-flow.js`

- [ ] **Step 1: Update extension manifest**

Replace the entire contents of `extension/manifest.json` with:

```json
{
  "manifest_version": 3,
  "name": "Quick Flow",
  "version": "1.0.0",
  "description": "Automate Quick Video generation via Google Flow and posting via TikTok Studio",
  "permissions": [
    "activeTab",
    "sidePanel",
    "storage",
    "scripting",
    "tabs",
    "alarms",
    "debugger"
  ],
  "host_permissions": [
    "https://labs.google/*",
    "https://*.tiktok.com/*",
    "http://localhost:3000/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["https://labs.google/fx/*", "https://labs.google/flow/*"],
      "js": ["content/dom-helpers.js", "content/google-flow.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://www.tiktok.com/tiktokstudio/*",
        "https://tiktok.com/tiktokstudio/*"
      ],
      "js": ["content/dom-helpers.js", "content/tiktok-studio.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://shop.tiktok.com/*",
        "https://www.tiktok.com/*/product/*",
        "https://www.tiktok.com/shop/*",
        "https://vt.tiktok.com/*"
      ],
      "js": ["content/dom-helpers.js", "content/tiktok-shop.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "Quick Flow"
  },
  "externally_connectable": {
    "matches": ["http://localhost:3000/*"]
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Delete grok-flow.js**

```bash
rm "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple/extension/content/grok-flow.js"
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple"
git add extension/
git commit -m "feat: fork extension as Quick Flow, remove grok integration"
```

---

## Task 10: Final verification

- [ ] **Step 1: Start dev server**

```bash
cd "/Users/zamri/Downloads/Personal Project 2026/Tiktok Affiliate Simple"
npm run dev
```

- [ ] **Step 2: Verify root redirect**

Open `http://localhost:3000` — should redirect to `http://localhost:3000/quick-video` automatically.

- [ ] **Step 3: Verify sidebar shows only 5 links**

Check the sidebar shows: Products · Quick Video · Queue · Gallery · Settings. App name should read "Quick Flow".

- [ ] **Step 4: Verify removed routes return 404**

Visit each of these — each should show a Next.js 404:
- `http://localhost:3000/tools`
- `http://localhost:3000/content-tools`
- `http://localhost:3000/image-tools`
- `http://localhost:3000/video-studio`
- `http://localhost:3000/custom-video`

- [ ] **Step 5: Verify Quick Video page loads**

Open `http://localhost:3000/quick-video` — should load the Quick Video page with product grid and preset config bar, no console errors.

- [ ] **Step 6: Verify Products page loads**

Open `http://localhost:3000/products` — should show scrape URL bar, manual add form, and product grid. No bulk import / CSV upload visible.

- [ ] **Step 7: Verify Settings, Queue, Gallery pages load**

- `http://localhost:3000/settings` — loads with no errors
- `http://localhost:3000/automation` — loads queue page
- `http://localhost:3000/gallery` — loads gallery grid

- [ ] **Step 8: Install extension in Chrome**

1. Open Chrome → `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `Tiktok Affiliate Simple/extension/`
4. Extension should appear as "Quick Flow" (not "TikTok Affiliate Flow")
5. Copy the extension ID shown → paste it into Settings page at `http://localhost:3000/settings`

- [ ] **Step 9: Smoke test Quick Video flow**

1. Add a test product via Products page (scrape a TikTok Shop URL or use manual form)
2. Go to Quick Video page — product card should appear
3. Click "⚡ Generate Preview" — AI should generate hook, prompts, dialog
4. Review & edit the slide-out drawer
5. Click "Confirm & Queue" — jobs should appear in Queue page

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "chore: verified end-to-end Quick Flow app"
```

---

## Summary

| Task | What it does |
|------|-------------|
| Task 1 | Copy project to `Tiktok Affiliate Simple/`, init git |
| Task 2 | Install deps, migrate DB, verify dev server |
| Task 3 | Delete 6 removed page routes |
| Task 4 | Delete 9 removed API route groups + telegram lib |
| Task 5 | Update Prisma schema, remove 3 models, re-migrate |
| Task 6 | Trim sidebar to 5 links, rename to "Quick Flow" |
| Task 7 | Root page redirects to /quick-video, update metadata |
| Task 8 | Strip bulk import / CSV upload from Products page |
| Task 9 | Fork extension: rename to "Quick Flow", remove grok |
| Task 10 | Full end-to-end verification + extension install |
