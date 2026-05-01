# Parallel Video Generation (2 Concurrent Slots) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the boolean mutex in background.js with a 2-slot semaphore so two video generation jobs can run simultaneously, each with its own browser tabs.

**Architecture:** Each slot owns dedicated browser tabs (Google Flow, Grok). Slots persist across jobs — tabs stay open and get reused. Posting remains sequential. API race condition in start-auto is fixed with a SQLite transaction.

**Tech Stack:** Chrome Extension MV3, JavaScript (service worker), Next.js API route (TypeScript), SQLite (Prisma)

---

### Task 1: Fix API race condition with atomic job claiming

**Files:**
- Modify: `app/api/jobs/start-auto/route.ts`

**Why:** Two concurrent `POST /api/jobs/start-auto` calls can both SELECT the same pending job before either UPDATEs it. A transaction makes this atomic.

- [ ] **Step 1: Wrap job selection in a Prisma transaction**

Replace the SELECT + UPDATE pattern (lines 35-113) with an interactive transaction that finds and updates within a single atomic unit:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateImagePrompt,
  generateVideoPrompt,
  VideoType,
} from "@/lib/prompt-templates";

const VALID_VIDEO_TYPES = [
  "fungsi_produk",
  "review",
  "unboxing",
  "problem_solution",
];

export async function POST(request: NextRequest) {
  let videoType = "fungsi_produk";
  let customPromptId: string | undefined;
  try {
    const body = await request.json();
    if (body.videoType && VALID_VIDEO_TYPES.includes(body.videoType)) {
      videoType = body.videoType;
    }
    if (body.customPromptId) {
      customPromptId = body.customPromptId;
    }
  } catch {
    // use default videoType if body is empty/invalid
  }

  // Use a transaction to atomically find + claim the next pending job.
  // Two concurrent callers cannot claim the same job.
  const job = await prisma.$transaction(async (tx) => {
    const pendingJobs = await tx.videoJob.findMany({
      where: { status: "pending" },
      orderBy: [{ sceneIndex: "asc" }, { createdAt: "asc" }],
      include: { product: true },
    });

    let nextJob = null;
    for (const j of pendingJobs) {
      if (j.masterJobId) {
        const masterJob = await tx.videoJob.findUnique({
          where: { id: j.masterJobId },
          select: { imageUrl: true, status: true },
        });
        if (!masterJob?.imageUrl) continue;
      }
      nextJob = j;
      break;
    }

    if (!nextJob) return null;

    const nextStatus = nextJob.imageUrl ? "generating_video" : "generating_image";

    return tx.videoJob.update({
      where: { id: nextJob.id },
      data: {
        status: nextStatus,
        videoType,
        startedAt: new Date().toISOString(),
      },
      include: { product: true },
    });
  });

  if (!job) {
    return NextResponse.json(
      { error: "No pending jobs in queue" },
      { status: 404 },
    );
  }

  // Apply custom prompt overrides (outside transaction — read-only after claim)
  if (customPromptId) {
    const customPrompt = await prisma.customPrompt.findUnique({
      where: { id: customPromptId },
    });
    if (customPrompt && job.product) {
      const replacePlaceholders = (template: string) =>
        template
          .replace(/{title}/g, job.product.title)
          .replace(/{description}/g, job.product.description || job.product.title)
          .replace(/{price}/g, job.product.price || "");

      const promptData: { imagePrompt?: string; videoPrompt?: string } = {};
      if (customPrompt.imagePrompt) {
        promptData.imagePrompt = replacePlaceholders(customPrompt.imagePrompt);
      }
      if (customPrompt.videoPrompt) {
        promptData.videoPrompt = replacePlaceholders(customPrompt.videoPrompt);
      }
      if (Object.keys(promptData).length > 0) {
        await prisma.videoJob.update({
          where: { id: job.id },
          data: promptData,
        });
      }
    }
  }

  return NextResponse.json(job);
}
```

- [ ] **Step 2: Verify the route compiles**

Run: `npx tsc --noEmit app/api/jobs/start-auto/route.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/jobs/start-auto/route.ts
git commit -m "fix: make job claiming atomic with transaction in start-auto"
```

---

### Task 2: Replace boolean lock with 2-slot semaphore infrastructure

**Files:**
- Modify: `extension/background.js:1901-1971`

**Why:** The core of the change. The boolean `isProcessingJob` becomes a slot system where up to 2 jobs can hold a slot simultaneously.

- [ ] **Step 1: Replace lock variables with slot system (lines 1901-1971)**

Replace lines 1901-1971:

```javascript
// ---- Job Processing Automation ----
const MAX_CONCURRENT_JOBS = 2;
// activeSlots: Map<slotId, { lockId, jobId, flowTabId, grokTabId }>
const activeSlots = new Map();
let nextSlotNum = 1;
let autoModeEnabled = false;
let isPaused = false;
let currentCustomPromptId = null;
// Queued phase-complete events (array — was single object)
const pendingPhaseCompleteQueue = [];
// Jobs where the message channel closed but the content script is still working.
const contentScriptActiveJobs = new Set();
// Only one image-only job at a time (sequential gating)
let isProcessingImageOnly = false;

// Get tab IDs owned by all slots except the given one.
// Used so a new slot opens its own dedicated tab instead of stealing another slot's tab.
function getOtherSlotTabIds(mySlotId) {
  const ids = new Set();
  for (const [sid, slot] of activeSlots) {
    if (sid !== mySlotId) {
      if (slot.flowTabId) ids.add(slot.flowTabId);
      if (slot.grokTabId) ids.add(slot.grokTabId);
    }
  }
  return ids;
}

// Find which slot is handling a given jobId
function findSlotByJobId(jobId) {
  for (const [sid, slot] of activeSlots) {
    if (slot.jobId === jobId) return sid;
  }
  return null;
}

// Acquire a processing slot. Returns {slotId, lockId} or null if all slots busy.
function acquireProcessingSlot(reason) {
  if (activeSlots.size >= MAX_CONCURRENT_JOBS) {
    console.log(
      `[TikTok Flow] All ${MAX_CONCURRENT_JOBS} slots busy — denied: ${reason}`,
    );
    return null;
  }
  const slotId = `slot-${nextSlotNum++}`;
  const lockId = `${reason}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  activeSlots.set(slotId, { lockId, jobId: null, flowTabId: null, grokTabId: null });
  console.log(`[TikTok Flow] Slot acquired: ${slotId} (${lockId}), active: ${activeSlots.size}/${MAX_CONCURRENT_JOBS}`);
  return { slotId, lockId };
}

// Release a processing slot.
function releaseProcessingSlot(slotId, lockId) {
  const slot = activeSlots.get(slotId);
  if (!slot) {
    console.warn(`[TikTok Flow] Slot release: slot ${slotId} not found`);
    return false;
  }
  if (slot.lockId !== lockId) {
    console.warn(`[TikTok Flow] Slot release denied: expected ${slot.lockId}, got ${lockId}`);
    return false;
  }
  const wasProcessingAJob = slot.jobId !== null;
  activeSlots.delete(slotId);
  console.log(`[TikTok Flow] Slot released: ${slotId}, remaining: ${activeSlots.size}/${MAX_CONCURRENT_JOBS}`);

  // Process any queued phase-complete events
  if (pendingPhaseCompleteQueue.length > 0) {
    const pending = pendingPhaseCompleteQueue.shift();
    console.log(`[TikTok Flow] Processing queued phase-complete: job ${pending.jobId}`);
    setTimeout(
      () => handlePhaseCompleteWithSlot(pending.jobId, pending.nextStatus),
      100,
    );
  }

  // Try to fill available slots
  if (autoModeEnabled && !isPaused && activeSlots.size < MAX_CONCURRENT_JOBS) {
    setTimeout(processNextJob, 3000);
  }
  return true;
}

// Force-release ALL slots (for DISABLE_AUTO_MODE or emergency recovery)
function forceReleaseAllSlots(reason) {
  if (activeSlots.size > 0) {
    console.warn(
      `[TikTok Flow] Force-releasing all ${activeSlots.size} slots (${reason}):`,
      [...activeSlots.keys()].join(", "),
    );
  }
  activeSlots.clear();
  pendingPhaseCompleteQueue.length = 0;
}
```

- [ ] **Step 2: Update references to old variable names**

The old `isProcessingJob`, `processingLockId`, `processingJobId`, `pendingPhaseComplete`, `forceReleaseProcessingLock` are now gone. Any remaining references will be caught in subsequent tasks. For now, the new infrastructure is in place but not yet wired to the rest of the file.

- [ ] **Step 3: Commit**

```bash
git add extension/background.js
git commit -m "refactor: replace boolean lock with 2-slot semaphore infrastructure"
```

---

### Task 3: Refactor tab management for per-slot exclusion

**Files:**
- Modify: `extension/background.js:69-148` (Grok tab management)
- Modify: `extension/background.js:257-280` (healthCheckGoogleFlow)
- Modify: `extension/background.js:1605-1682` (Google Flow tab management)

**Why:** Tab functions currently find "the first" matching tab. With 2 slots, each slot needs its own dedicated tab so jobs don't step on each other. Adding `excludeTabIds` lets each slot skip tabs owned by other slots.

- [ ] **Step 1: Add excludeTabIds to findGrokTab and ensureGrokTab**

Replace lines 69-128:

```javascript
// ---- Grok Tab Management ----
async function findGrokTab(excludeTabIds = new Set()) {
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://grok.com/imagine*"],
    });
    for (const tab of tabs) {
      if (!excludeTabIds.has(tab.id)) return tab.id;
    }
  } catch (e) {
    console.warn("[TikTok Flow] Grok tabs.query failed:", e);
  }
  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.url && tab.url.includes("grok.com/imagine") && !excludeTabIds.has(tab.id)) {
        return tab.id;
      }
    }
  } catch (e) {
    console.warn("[TikTok Flow] Grok all tabs query failed:", e);
  }
  return null;
}

async function ensureGrokTab(excludeTabIds = new Set()) {
  let tabId = await findGrokTab(excludeTabIds);

  if (tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response?.status === "alive") {
        chrome.tabs.update(tabId, { active: true });
        return tabId;
      }
    } catch {
      // Content script not responding
    }
  }

  const tab = await chrome.tabs.create({
    url: "https://grok.com/imagine",
    active: true,
  });
  tabId = tab.id;

  await new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });

  await new Promise((r) => setTimeout(r, 3000));
  return tabId;
}

async function healthCheckGrok(tabId) {
  try {
    if (!tabId) {
      tabId = await findGrokTab();
    }
    if (!tabId) return { ok: false, error: "No Grok tab found" };
    const res = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), 5000);
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (r) => {
        clearTimeout(t);
        if (chrome.runtime.lastError)
          reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });
    if (res?.status === "alive") return { ok: true, tabId };
    return { ok: false, error: "Content script not alive" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
```

- [ ] **Step 2: Add optional tabId param to healthCheckGoogleFlow**

Replace lines 257-280:

```javascript
// Health check: verify Google Flow tab is alive and responsive.
// Accepts an optional tabId — when called from a slot, pass the slot's tab.
async function healthCheckGoogleFlow(tabId) {
  if (!tabId) tabId = await findGoogleFlowTab();
  if (!tabId) return { ok: false, error: "No Google Flow tab found" };

  try {
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Ping timeout")), 5000);
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (res) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });
    if (response?.status === "alive") {
      return { ok: true, tabId, url: response.url };
    }
    return { ok: false, error: "Content script not responding" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
```

- [ ] **Step 3: Add excludeTabIds to findGoogleFlowTab and ensureGoogleFlowTab**

Replace lines 1605-1682:

```javascript
async function findGoogleFlowTab(excludeTabIds = new Set()) {
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://labs.google/fx/*", "https://labs.google/flow/*"],
    });
    for (const tab of tabs) {
      if (!excludeTabIds.has(tab.id)) return tab.id;
    }
  } catch (e) {
    console.warn("[TikTok Flow] tabs.query with url pattern failed:", e);
  }

  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (
        tab.url &&
        (tab.url.includes("labs.google/fx") ||
          tab.url.includes("labs.google/flow")) &&
        !excludeTabIds.has(tab.id)
      ) {
        return tab.id;
      }
    }
  } catch (e) {
    console.warn("[TikTok Flow] tabs.query all failed:", e);
  }

  return null;
}

// Open Google Flow and wait for it to be ready.
// excludeTabIds: set of tab IDs belonging to other slots — skip them.
async function ensureGoogleFlowTab(excludeTabIds = new Set()) {
  let tabId = await findGoogleFlowTab(excludeTabIds);

  if (tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response?.status === "alive") {
        chrome.tabs.update(tabId, { active: true });
        return tabId;
      }
    } catch {
      // Content script not responding, might need reload
    }
  }

  const tab = await chrome.tabs.create({
    url: "https://labs.google/fx/tools/flow",
    active: true,
  });
  tabId = tab.id;

  await new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });

  await new Promise((r) => setTimeout(r, 5000));
  return tabId;
}
```

- [ ] **Step 4: Add slot helper for getting/ensuring a Flow tab for a specific slot**

Add after the ensureGoogleFlowTab function (after line 1682):

```javascript
// Get a Google Flow tab for a specific slot.
// Returns existing tab if alive, otherwise creates a new one (excluding other slots' tabs).
async function ensureFlowTabForSlot(slotId) {
  const slot = activeSlots.get(slotId);
  if (!slot) return null;

  if (slot.flowTabId) {
    const health = await healthCheckGoogleFlow(slot.flowTabId);
    if (health.ok) return slot.flowTabId;
    console.log(`[TikTok Flow] Slot ${slotId}: flow tab ${slot.flowTabId} dead, creating new one`);
    slot.flowTabId = null;
  }

  const excludeIds = getOtherSlotTabIds(slotId);
  const tabId = await ensureGoogleFlowTab(excludeIds);
  if (tabId) {
    slot.flowTabId = tabId;
  }
  return tabId;
}

// Get a Grok tab for a specific slot.
async function ensureGrokTabForSlot(slotId) {
  const slot = activeSlots.get(slotId);
  if (!slot) return null;

  if (slot.grokTabId) {
    const health = await healthCheckGrok(slot.grokTabId);
    if (health.ok) return slot.grokTabId;
    console.log(`[TikTok Flow] Slot ${slotId}: grok tab ${slot.grokTabId} dead, creating new one`);
    slot.grokTabId = null;
  }

  const excludeIds = getOtherSlotTabIds(slotId);
  const tabId = await ensureGrokTab(excludeIds);
  if (tabId) {
    slot.grokTabId = tabId;
  }
  return tabId;
}
```

- [ ] **Step 5: Commit**

```bash
git add extension/background.js
git commit -m "refactor: add per-slot tab management with excludeTabIds"
```

---

### Task 4: Refactor processNextJob for slot-based dispatching

**Files:**
- Modify: `extension/background.js:2184-2279` (processNextJob)
- Modify: `extension/background.js:1398-1412` (fetchCurrentJob)

**Why:** processNextJob must acquire a slot instead of the old boolean lock, then pass the slot context through all processing functions. fetchCurrentJob must skip jobs already being processed by other slots.

- [ ] **Step 1: Update fetchCurrentJob to skip jobs in active slots**

Replace lines 1398-1412:

```javascript
async function fetchCurrentJob() {
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const jobs = await res.json();
    const { autoPostEnabled } =
      await chrome.storage.local.get("autoPostEnabled");
    const activeStatuses = autoPostEnabled
      ? ["generating_image", "generating_video", "ready", "posting"]
      : ["generating_image", "generating_video", "posting"];
    // Get all job IDs currently active in any slot
    const activeJobIds = new Set();
    for (const [, slot] of activeSlots) {
      if (slot.jobId) activeJobIds.add(slot.jobId);
    }
    return jobs.find(
      (j) =>
        activeStatuses.includes(j.status) &&
        !activeJobIds.has(j.id) &&
        !contentScriptActiveJobs.has(j.id),
    ) || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Rewrite processNextJob for slot-based dispatching**

Replace lines 2184-2279:

```javascript
async function processNextJob() {
  if (!autoModeEnabled || isPaused) return;

  const slot = acquireProcessingSlot("process-next-job");
  if (!slot) return; // All slots busy

  const { slotId, lockId } = slot;

  try {
    const currentJob = await fetchCurrentJob();

    if (!currentJob) {
      // Try to start the next pending job
      const startBody = {};
      if (currentCustomPromptId)
        startBody.customPromptId = currentCustomPromptId;
      const res = await fetch(`${API_BASE}/jobs/start-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startBody),
      });
      const data = await res.json();
      if (!data.id) {
        console.log("[TikTok Flow] No jobs to process");
        return;
      }
      console.log(
        `[TikTok Flow] ${slotId}: Started job via start-auto:`,
        data.id,
        "— processing immediately",
      );
      const s = activeSlots.get(slotId);
      if (s) s.jobId = data.id;
      if (data.status === "generating_image") {
        if (data.imageOnly) {
          if (isProcessingImageOnly) {
            console.log(`[TikTok Flow] ${slotId}: Image-only already running, deferring job ${data.id}`);
            return;
          }
          isProcessingImageOnly = true;
          try {
            await processImageOnlyJob(data, { slotId, lockId });
          } finally {
            isProcessingImageOnly = false;
          }
        } else {
          await processImageGeneration(data, { slotId, lockId });
        }
      }
      return;
    }

    const s = activeSlots.get(slotId);
    if (s) s.jobId = currentJob.id;
    console.log(
      `[TikTok Flow] ${slotId}: Processing job:`,
      currentJob.id,
      "status:",
      currentJob.status,
    );

    if (currentJob.status === "generating_image") {
      if (currentJob.imageOnly) {
        if (isProcessingImageOnly) {
          console.log(`[TikTok Flow] ${slotId}: Image-only already running, deferring job ${currentJob.id}`);
          if (s) s.jobId = null;
          return;
        }
        isProcessingImageOnly = true;
        try {
          await processImageOnlyJob(currentJob, { slotId, lockId });
        } finally {
          isProcessingImageOnly = false;
        }
      } else {
        await processImageGeneration(currentJob, { slotId, lockId });
      }
    } else if (currentJob.status === "generating_video") {
      await processVideoGeneration(currentJob, { slotId, lockId });
    } else if (currentJob.status === "posting") {
      await processPosting(currentJob);
    } else if (currentJob.status === "ready") {
      const { autoPostEnabled } =
        await chrome.storage.local.get("autoPostEnabled");
      if (autoPostEnabled) {
        console.log(
          `[TikTok Flow] ${slotId}: Job ready + auto-post on, starting posting:`,
          currentJob.id,
        );
        await fetch(`${API_BASE}/jobs/${currentJob.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "posting",
            startedAt: new Date().toISOString(),
          }),
        });
        const freshRes = await fetch(`${API_BASE}/jobs/${currentJob.id}`);
        const freshJob = await freshRes.json();
        await processPosting(freshJob);
      }
    }
  } catch (err) {
    console.error(`[TikTok Flow] ${slotId}: Job processing error:`, err);
  } finally {
    releaseProcessingSlot(slotId, lockId);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add extension/background.js
git commit -m "refactor: slot-based processNextJob dispatching"
```

---

### Task 5: Refactor processImageGeneration and processMultiSceneJob for slots

**Files:**
- Modify: `extension/background.js:2712-3150` (processImageGeneration + processMultiSceneJob)

**Why:** These functions use `flowTabId` locally. They need to get it from the slot context instead of scanning all tabs. When they call `processVideoGeneration`, they pass the slot context along.

- [ ] **Step 1: Rewrite processImageGeneration signature and tab usage**

Replace the function signature at line 2712 and the tab acquisition at lines 2732-2804:

```javascript
async function processImageGeneration(job, ctx) {
  const { slotId, lockId } = ctx;
  console.log(`[TikTok Flow] ${slotId}: === Image generation for job:`, job.id);

  // Detect multi-scene job — route to dedicated handler
  let scenePrompts = [];
  try {
    scenePrompts = JSON.parse(job.scenePrompts || "[]");
  } catch {
    /* ignore */
  }
  if (scenePrompts.length > 1) {
    console.log(
      `[TikTok Flow] ${slotId}: Multi-scene job detected:`,
      scenePrompts.length,
      "scenes",
    );
    await processMultiSceneJob(job, scenePrompts, ctx);
    return;
  }

  // Get or create a Flow tab for this slot
  let flowTabId = await ensureFlowTabForSlot(slotId);
  if (!flowTabId) {
    await handleJobFailure(
      job.id,
      "Could not open Google Flow tab",
      job,
    );
    return;
  }

  // Navigate to Flow gallery BEFORE sending GENERATE_IMAGE
  try {
    const tabInfo = await chrome.tabs.get(flowTabId);
    const isOnGallery =
      tabInfo.url &&
      (tabInfo.url === "https://labs.google/fx/tools/flow" ||
        tabInfo.url === "https://labs.google/fx/tools/flow/" ||
        tabInfo.url.endsWith("/fx/tools/flow") ||
        tabInfo.url.endsWith("/fx/tools/flow/"));
    if (!isOnGallery) {
      console.log(
        `[TikTok Flow] ${slotId}: Tab is on a project page, navigating to gallery first...`,
      );
      await chrome.tabs.update(flowTabId, {
        url: "https://labs.google/fx/tools/flow",
      });
      await new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === flowTabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 30000);
      });
      for (let ping = 0; ping < 10; ping++) {
        const h = await healthCheckGoogleFlow(flowTabId);
        if (h.ok) break;
        console.log(
          `[TikTok Flow] ${slotId}: Waiting for content script after gallery nav... attempt`,
          ping + 1,
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch (navErr) {
    console.warn(`[TikTok Flow] ${slotId}: Could not check/navigate tab:`, navErr.message);
  }

  // Focus the tab
  chrome.tabs.update(flowTabId, { active: true });
```

The rest of processImageGeneration (lines 2806-3078) stays the same except:
- All `processVideoGeneration(freshJob)` calls become `processVideoGeneration(freshJob, ctx)`
- The `contentScriptActiveJobs.add(job.id)` at line 3046 is fine as-is (uses job ID, not slot)

- [ ] **Step 2: Update processMultiSceneJob**

Replace the signature at line 3085 and the first 40 lines:

```javascript
async function processMultiSceneJob(job, scenePrompts, ctx) {
  const { slotId, lockId } = ctx;
  console.log(
    `[TikTok Flow] ${slotId}: === Multi-scene job:`,
    job.id,
    "scenes:",
    scenePrompts.length,
  );

  let flowTabId = await ensureFlowTabForSlot(slotId);
  if (!flowTabId) {
    await handleJobFailure(job.id, "Could not open Google Flow tab", job);
    return;
  }

  // Verify content script is alive
  let csAlive = false;
  for (let ping = 0; ping < 10; ping++) {
    const h = await healthCheckGoogleFlow(flowTabId);
    if (h.ok) { csAlive = true; break; }
    console.log(
      `[TikTok Flow] ${slotId}: Waiting for content script... attempt`,
      ping + 1,
    );
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!csAlive) {
    await handleJobFailure(
      job.id,
      "Google Flow content script not responding",
      job,
    );
    return;
  }

  // Navigate to gallery first
  try {
    const tabInfo = await chrome.tabs.get(flowTabId);
    const isOnGallery =
      tabInfo.url &&
      (tabInfo.url === "https://labs.google/fx/tools/flow" ||
        tabInfo.url === "https://labs.google/fx/tools/flow/" ||
        tabInfo.url.endsWith("/fx/tools/flow") ||
        tabInfo.url.endsWith("/fx/tools/flow/"));
    if (!isOnGallery) {
      console.log(`[TikTok Flow] ${slotId}: Multi-scene: navigating to gallery first...`);
      await chrome.tabs.update(flowTabId, {
        url: "https://labs.google/fx/tools/flow",
      });
      await new Promise((resolve) => {
        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === flowTabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 30000);
      });
```

The rest of processMultiSceneJob stays the same (it generates images scene by scene within its slot's tab).

- [ ] **Step 3: Commit**

```bash
git add extension/background.js
git commit -m "refactor: slot-aware processImageGeneration and processMultiSceneJob"
```

---

### Task 6: Refactor processVideoGeneration for slots

**Files:**
- Modify: `extension/background.js:3511-3812` (processVideoGeneration)

**Why:** Uses `flowTabId` locally — must use the slot's tab. All `processPosting` calls stay sequential (no ctx needed for posting).

- [ ] **Step 1: Rewrite processVideoGeneration signature and tab usage**

Replace lines 3511-3573:

```javascript
async function processVideoGeneration(job, ctx) {
  const { slotId, lockId } = ctx;
  console.log(`[TikTok Flow] ${slotId}: === Video generation for job:`, job.id);

  // ---- Check video engine setting: route to Grok if configured ----
  const videoEngine = await getVideoEngine();
  if (videoEngine === "grok") {
    console.log(`[TikTok Flow] ${slotId}: Video engine is GROK — routing to Grok...`);
    await processVideoGenerationViaGrok(job, ctx);
    return;
  }

  // Detect gallery-image jobs
  const isGalleryImageJob = !job.productId && job.imageUrl;

  // Get the slot's Flow tab
  let flowTabId = null;
  const slot = activeSlots.get(slotId);
  if (slot && slot.flowTabId) {
    const health = await healthCheckGoogleFlow(slot.flowTabId);
    if (health.ok) {
      flowTabId = slot.flowTabId;
    }
  }

  if (!flowTabId) {
    if (isGalleryImageJob) {
      console.warn(
        `[TikTok Flow] ${slotId}: Health check failed, opening new tab for gallery video job...`,
      );
      flowTabId = await ensureFlowTabForSlot(slotId);
      if (!flowTabId) {
        await handleJobFailure(
          job.id,
          "Could not open Google Flow tab for gallery video job",
          job,
        );
        return;
      }
    } else {
      console.warn(
        `[TikTok Flow] ${slotId}: Health check failed before video gen`,
      );
      await handleJobFailure(
        job.id,
        "Google Flow tab lost before video generation",
        job,
      );
      return;
    }
  }

  // Focus the tab
  chrome.tabs.update(flowTabId, { active: true });
```

The rest of processVideoGeneration (lines 3574-3812) stays the same except:
- All `processPosting(freshJob)` calls remain as-is (posting uses its own lock, not a slot)
- Log messages use `[TikTok Flow]` prefix (no slotId needed in the existing code beyond what we just changed)

- [ ] **Step 2: Commit**

```bash
git add extension/background.js
git commit -m "refactor: slot-aware processVideoGeneration"
```

---

### Task 7: Refactor processVideoGenerationViaGrok for slots

**Files:**
- Modify: `extension/background.js:2284-2448` (processVideoGenerationViaGrok)

**Why:** Uses `grokTabId` locally — must use the slot's Grok tab.

- [ ] **Step 1: Rewrite processVideoGenerationViaGrok signature and tab usage**

Replace lines 2284-2342:

```javascript
async function processVideoGenerationViaGrok(job, ctx) {
  const { slotId, lockId } = ctx;
  console.log(`[TikTok Flow] ${slotId}: === GROK video generation for job:`, job.id);

  // Fetch the image to send as reference (same as before)
  let referenceImageDataUrl = null;
  const imageUrl = job.imageUrl;
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        referenceImageDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        console.log(
          `[TikTok Flow] ${slotId}: Image fetched for Grok reference (` +
            Math.round(blob.size / 1024) +
            "KB)",
        );
      }
    } catch (e) {
      console.warn(`[TikTok Flow] ${slotId}: Could not fetch image for Grok:`, e.message);
    }
  }

  if (!referenceImageDataUrl) {
    console.warn(
      `[TikTok Flow] ${slotId}: No reference image available for Grok video gen`,
    );
  }

  // Get or create a Grok tab for this slot
  const grokTabId = await ensureGrokTabForSlot(slotId);
  if (!grokTabId) {
    await handleJobFailure(
      job.id,
      "Could not open Grok tab for video generation",
      job,
    );
    return;
  }

  // Wait for content script
  const csReady = await waitForContentScript(grokTabId, 15000);
  if (!csReady) {
    await handleJobFailure(job.id, "Grok content script not responding", job);
    return;
  }

  // Focus the tab
  chrome.tabs.update(grokTabId, { active: true });
```

The rest of processVideoGenerationViaGrok (lines 2343-2448) stays the same except:
- `processPosting(freshJob)` calls remain as-is (no slot needed for posting)

- [ ] **Step 2: Commit**

```bash
git add extension/background.js
git commit -m "refactor: slot-aware processVideoGenerationViaGrok"
```

---

### Task 8: Refactor processImageOnlyJob for slots

**Files:**
- Modify: `extension/background.js:3378-3507` (processImageOnlyJob)

**Why:** Must use a slot (counts against concurrent limit) but gated sequentially by `isProcessingImageOnly`.

- [ ] **Step 1: Rewrite processImageOnlyJob signature and tab usage**

Replace lines 3378-3403:

```javascript
async function processImageOnlyJob(job, ctx) {
  const { slotId, lockId } = ctx;
  console.log(`[TikTok Flow] ${slotId}: === Standalone image-only job:`, job.id);

  // Get or create a Flow tab for this slot
  let flowTabId = await ensureFlowTabForSlot(slotId);
  if (!flowTabId) {
    await handleJobFailure(job.id, "Could not open Google Flow tab", job);
    return;
  }

  // Focus the tab
  chrome.tabs.update(flowTabId, { active: true });
```

The rest of processImageOnlyJob stays the same (reference image pre-fetch, GENERATE_IMAGE_ONLY message). Log messages updated with slotId for clarity.

- [ ] **Step 2: Commit**

```bash
git add extension/background.js
git commit -m "refactor: slot-aware processImageOnlyJob"
```

---

### Task 9: Refactor JOB_PHASE_COMPLETE handler and handlePhaseComplete for slots

**Files:**
- Modify: `extension/background.js:2065-2182` (JOB_PHASE_COMPLETE handler + handlePhaseCompleteWithLock)

**Why:** The phase-complete handler must look up which slot owns the job and release that slot when done. The single `pendingPhaseComplete` becomes a queue array.

- [ ] **Step 1: Rewrite JOB_PHASE_COMPLETE handler**

Replace lines 2065-2101:

```javascript
  if (message.type === "JOB_PHASE_COMPLETE") {
    const { jobId, phase, nextStatus } = message.payload || {};
    console.log(
      "[TikTok Flow] JOB_PHASE_COMPLETE: job",
      jobId,
      "phase",
      phase,
      "next",
      nextStatus,
    );
    contentScriptActiveJobs.delete(jobId);

    // Check if this job is owned by an active slot
    const ownerSlotId = findSlotByJobId(jobId);
    if (ownerSlotId) {
      console.log(
        `[TikTok Flow] Phase complete for slot ${ownerSlotId}'s job ${jobId} — handled inline`,
      );
    }

    // If no active slot is processing this job, pick it up fresh
    if (!ownerSlotId && activeSlots.size < MAX_CONCURRENT_JOBS) {
      handlePhaseCompleteWithSlot(jobId, nextStatus);
    } else if (!ownerSlotId) {
      // All slots busy — queue it
      console.log(
        `[TikTok Flow] Phase complete queued (${activeSlots.size}/${MAX_CONCURRENT_JOBS} slots busy)`,
      );
      pendingPhaseCompleteQueue.push({ jobId, nextStatus });
    }
    // If ownerSlotId exists, the slot is already handling this job inline
    // (the processing function already awaits the content script response)

    sendResponse({ ok: true });
    return true;
  }
```

- [ ] **Step 2: Replace handlePhaseCompleteWithLock with handlePhaseCompleteWithSlot**

Replace lines 2104-2122:

```javascript
// Wrapper that acquires a slot before handling phase completion
function handlePhaseCompleteWithSlot(jobId, nextStatus) {
  const slot = acquireProcessingSlot("phase-complete");
  if (!slot) {
    console.warn(
      "[TikTok Flow] Could not acquire slot for phase-complete, queuing",
    );
    pendingPhaseCompleteQueue.push({ jobId, nextStatus });
    return;
  }
  const { slotId, lockId } = slot;
  const s = activeSlots.get(slotId);
  if (s) s.jobId = jobId;
  handlePhaseComplete(jobId, nextStatus, { slotId, lockId })
    .catch((err) =>
      console.error("[TikTok Flow] Phase complete handler error:", err),
    )
    .finally(() => {
      releaseProcessingSlot(slotId, lockId);
    });
}
```

- [ ] **Step 3: Update handlePhaseComplete to accept ctx**

Replace lines 2124-2182:

```javascript
// Handle phase completion — fetch the job and continue to next step
async function handlePhaseComplete(jobId, nextStatus, ctx) {
  console.log(
    "[TikTok Flow] handlePhaseComplete: jobId=",
    jobId,
    "nextStatus=",
    nextStatus,
  );

  if (nextStatus === "generating_video") {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`);
      const job = await res.json();
      if (job.status === "generating_video") {
        console.log("[TikTok Flow] Starting video generation for job:", jobId);
        await processVideoGeneration(job, ctx);
      } else {
        console.warn(
          "[TikTok Flow] Job status is",
          job.status,
          "expected generating_video",
        );
      }
    } catch (err) {
      console.error("[TikTok Flow] Failed to fetch job for video step:", err);
    }
  } else if (nextStatus === "ready") {
    console.log("[TikTok Flow] Video complete, job is ready:", jobId);

    const { autoPostEnabled } =
      await chrome.storage.local.get("autoPostEnabled");
    if (autoPostEnabled) {
      console.log(
        "[TikTok Flow] Auto-post enabled, starting posting for job:",
        jobId,
      );
      try {
        await fetch(`${API_BASE}/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "posting",
            startedAt: new Date().toISOString(),
          }),
        });
        const freshRes = await fetch(`${API_BASE}/jobs/${jobId}`);
        const freshJob = await freshRes.json();
        await processPosting(freshJob);
      } catch (err) {
        console.error("[TikTok Flow] Failed to start posting:", err);
      }
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add extension/background.js
git commit -m "refactor: slot-aware phase completion with queue"
```

---

### Task 10: Update keepAlive, polling, timeouts, force-release, and add posting mutex

**Files:**
- Modify: `extension/background.js:1993-2016` (keepAlive alarm)
- Modify: `extension/background.js:206-254` (checkJobTimeouts — `processingJobId` → slot-aware)
- Modify: `extension/background.js:3816-3820` (setInterval poll)
- Modify: `extension/background.js:2040-2048` (DISABLE_AUTO_MODE)

**Why:** These functions reference old lock variables (`isProcessingJob`, `processingJobId`, `forceReleaseProcessingLock`). Must update to slot-aware equivalents. Also, with 2 slots both potentially finishing video gen simultaneously, we need a posting mutex so `processPosting` doesn't get called concurrently (it shares TikTok Studio/Shop tabs).

- [ ] **Step 0: Add posting mutex**

Add after the slot infrastructure (after `forceReleaseAllSlots` in Task 2's code block):

```javascript
// Posting mutex — only one job posts at a time (shares TikTok Studio/Shop tabs)
let isPosting = false;

async function acquirePostingLock(reason) {
  if (isPosting) {
    console.log(`[TikTok Flow] Posting lock denied (${reason}): already posting`);
    return false;
  }
  isPosting = true;
  console.log(`[TikTok Flow] Posting lock acquired: ${reason}`);
  return true;
}

function releasePostingLock() {
  isPosting = false;
  console.log(`[TikTok Flow] Posting lock released`);
}
```

Then wrap every `processPosting(job)` call with the mutex. Replace all occurrences of:
```javascript
await processPosting(freshJob);
```
with:
```javascript
if (await acquirePostingLock("video-complete")) {
  try {
    await processPosting(freshJob);
  } finally {
    releasePostingLock();
  }
}
```

Locations to update:
- `processNextJob` (posting status branch and ready+auto-post branch)
- `processVideoGeneration` (auto-post after video success, gallery video auto-post)
- `processVideoGenerationViaGrok` (auto-post after Grok video)
- `handlePhaseComplete` (ready + auto-post)

- [ ] **Step 1: Update keepAlive alarm to fill all available slots**

Replace lines 1996-2016:

```javascript
  chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
      // Try to fill all available slots
      if (autoModeEnabled && !isPaused) {
        const availableSlots = MAX_CONCURRENT_JOBS - activeSlots.size;
        for (let i = 0; i < availableSlots; i++) {
          processNextJob();
        }
      }
      checkJobTimeouts();
      _settingsSyncCounter++;
      if (_settingsSyncCounter >= 2) {
        _settingsSyncCounter = 0;
        syncSettingsFromDB();
      }
    }
  });
```

- [ ] **Step 2: Update setInterval poll**

Replace lines 3816-3820:

```javascript
// Poll for jobs every 5 seconds when auto mode is on
setInterval(() => {
  if (autoModeEnabled && !isPaused && activeSlots.size < MAX_CONCURRENT_JOBS) {
    processNextJob();
  }
}, 5000);
```

- [ ] **Step 3: Update DISABLE_AUTO_MODE to use forceReleaseAllSlots**

Replace lines 2040-2048:

```javascript
  if (message.type === "DISABLE_AUTO_MODE") {
    autoModeEnabled = false;
    currentCustomPromptId = null;
    forceReleaseAllSlots("disable-auto-mode");
    isProcessingImageOnly = false;
    chrome.storage.local.set({ autoModeEnabled: false, customPromptId: null });
    console.log("[TikTok Flow] Auto mode DISABLED (all slots force-released)");
    sendResponse({ autoMode: false });
    return true;
  }
```

- [ ] **Step 4: Update GET_STATUS handler (uses isProcessingJob)**

Find and replace the GET_STATUS handler around line 2049-2063:

```javascript
  if (message.type === "GET_STATUS") {
    sendResponse({
      autoMode: autoModeEnabled,
      paused: isPaused,
      processing: activeSlots.size > 0,
      activeSlots: activeSlots.size,
      maxSlots: MAX_CONCURRENT_JOBS,
    });
    return true;
  }
```

- [ ] **Step 5: Update checkJobTimeouts to be slot-aware**

Replace the timeout check at lines 206-211:

```javascript
          // Get all job IDs currently active in slots
          const activeJobIds = new Set();
          for (const [, s] of activeSlots) {
            if (s.jobId) activeJobIds.add(s.jobId);
          }
          if (activeJobIds.has(job.id)) {
            console.log(
              `[TikTok Flow] Job ${job.id} exceeded timeout but is actively processing in a slot — skipping timeout`,
            );
            continue;
          }
```

- [ ] **Step 6: Commit**

```bash
git add extension/background.js
git commit -m "refactor: slot-aware keepAlive, polling, timeouts, and force-release"
```

---

### Task 11: Final verification — check for stale references to old variables

**Files:**
- Verify: `extension/background.js`

**Why:** Ensure no code still references `isProcessingJob`, `processingLockId`, `processingJobId`, `pendingPhaseComplete` (as single object), or `forceReleaseProcessingLock`.

- [ ] **Step 1: Search for stale references**

Run: `grep -n 'isProcessingJob\|processingLockId\|processingJobId\|forceReleaseProcessingLock\|pendingPhaseComplete[^Q]' extension/background.js`

Expected: No matches (or only in comments/strings that are intentional).

- [ ] **Step 2: If any matches found, fix them**

For each match, determine the correct slot-aware replacement.

- [ ] **Step 3: Do a quick sanity check of the file structure**

Run: `wc -l extension/background.js`
Expected: ~3900-4000 lines (modest increase from new helpers).

- [ ] **Step 4: Commit any fixes**

```bash
git add extension/background.js
git commit -m "fix: remove stale references to old lock variables"
```

---

### Task 12: Final commit — verify the branch is clean

**Files:**
- All modified files

- [ ] **Step 1: Check git status**

Run: `git status`
Expected: Only the files we intentionally changed, no untracked surprises.

- [ ] **Step 2: Check diff summary**

Run: `git diff main --stat`
Expected: 2 files changed (`extension/background.js`, `app/api/jobs/start-auto/route.ts`).

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "feat: parallel video generation with 2 concurrent slots"
```
