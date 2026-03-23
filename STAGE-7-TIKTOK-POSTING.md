# Stage 7: TikTok Studio Posting Wiring

## Overview

Wire the existing `tiktok-studio.js` posting automation into the `background.js` job pipeline so that after video generation completes (`ready`), the system can automatically open TikTok Studio, send the `POST_VIDEO` command with caption/hashtags, and complete the full end-to-end flow.

**Current problem:** All pieces exist but are disconnected:

- `tiktok-studio.js` has a complete `postVideo({ jobId, videoUrl, caption, hashtags })` function (8 steps)
- `background.js` stops at `ready` status — never triggers posting
- `sidepanel.js` `handlePostToTikTok()` opens a TikTok Studio tab + sets status to `posting`, but NEVER sends `POST_VIDEO` to the content script
- No caption/hashtag generation exists — VideoJob schema has no caption/hashtag fields
- No TikTok Studio tab management (find/ensure/health-check) in `background.js`

---

## Phase A: Caption & Hashtag Generation

### Task A1: Add DB fields for caption and hashtags

**File:** `prisma/schema.prisma`

Add two new fields to the `VideoJob` model:

```
tiktokCaption   String   @default("")
tiktokHashtags  String   @default("[]")  // JSON array of hashtag strings
```

Then run migration:

```bash
docker compose exec web npx prisma migrate dev --name add_tiktok_caption_hashtags
```

### Task A2: Add caption/hashtag template functions

**File:** `lib/prompt-templates.ts`

Add two new exported functions:

1. **`generateTikTokCaption({ title, description, price, videoType })`**
   - Returns a short TikTok caption (max ~150 chars)
   - Format: hook line + product name + CTA
   - Templates per `videoType`:
     - `fungsi_produk`: "Cek fungsi {title} ini! 🔥 Harga cuma {price} — link di bio!"
     - `review`: "Review jujur {title} ⭐ Worth it gak? Cek sendiri!"
     - `unboxing`: "Unboxing {title}! 📦 Gak nyangka isinya..."
     - `problem_solution`: "Masalah {problem}? {title} solusinya! 💡"

2. **`generateTikTokHashtags({ title, shopName, videoType })`**
   - Returns `string[]` of 5-8 relevant hashtags
   - Always include: `fyp`, `tiktokshop`, `rekomendasitiktok`
   - Add product-specific words from title (split, filter short words)
   - Add videoType-specific: `reviewjujur`, `unboxing`, `tutorial`, etc.
   - Add shop name if available

### Task A3: Store caption/hashtags on job creation

**File:** `app/api/jobs/route.ts`

In the `POST` handler, after generating `imagePrompt` and `videoPrompt`, also call:

```typescript
const tiktokCaption = generateTikTokCaption({
  title: product.title,
  description: product.description,
  price: product.price,
  videoType: videoType as VideoType,
});
const tiktokHashtags = JSON.stringify(
  generateTikTokHashtags({
    title: product.title,
    shopName: product.shopName,
    videoType: videoType as VideoType,
  }),
);
```

Include both in the `prisma.videoJob.create()` data object.

**Depends on:** A1, A2

---

## Phase B: Background.js Posting Orchestration

### Task B1: Add TikTok Studio tab management functions

**File:** `extension/background.js`

Mirror the existing Google Flow tab pattern. Add three functions:

1. **`findTikTokStudioTab()`**
   - Strategy 1: `chrome.tabs.query({ url: ["https://www.tiktok.com/tiktokstudio/*", "https://tiktok.com/tiktokstudio/*"] })`
   - Strategy 2: Query all tabs, check URL contains `tiktokstudio`
   - Returns `tabId` or `null`

2. **`ensureTikTokStudioTab()`**
   - Call `findTikTokStudioTab()` first
   - If found: PING content script to verify it's alive. If alive, focus tab and return. If not, reload tab.
   - If not found: `chrome.tabs.create({ url: "https://www.tiktok.com/tiktokstudio/upload", active: true })`
   - Wait for `tabs.onUpdated` `status === "complete"` event (timeout 30s)
   - Extra 5s wait for SPA init (same pattern as `ensureGoogleFlowTab()`)
   - Return `tabId`

3. **`healthCheckTikTokStudio()`**
   - Find tab via `findTikTokStudioTab()`
   - If no tab: return `{ ok: false, error: "TikTok Studio tab not found" }`
   - Send `PING` message, expect `{ status: "alive" }` response
   - Return `{ ok: true, tabId }` or `{ ok: false, error: "..." }`

**Reference:** Copy the pattern from `findGoogleFlowTab()` / `ensureGoogleFlowTab()` / `healthCheckGoogleFlow()` in the same file.

### Task B2: Add `processPosting(job)` function

**File:** `extension/background.js`

New async function, following the pattern of `processVideoGeneration(job)`:

```javascript
async function processPosting(job) {
  console.log("[TikTok Flow] === Posting to TikTok for job:", job.id);

  // 1. Health check
  const health = await healthCheckTikTokStudio();
  if (!health.ok) {
    // Try to open/restore the tab
    console.warn(
      "[TikTok Flow] TikTok Studio health check failed, ensuring tab...",
    );
  }

  // 2. Ensure tab exists and is ready
  const tabId = await ensureTikTokStudioTab();
  if (!tabId) {
    await handleJobFailure(job.id, "Could not open TikTok Studio tab", job);
    return;
  }

  // 3. Focus the tab
  chrome.tabs.update(tabId, { active: true });

  // 4. Parse hashtags from JSON
  let hashtags = [];
  try {
    hashtags = JSON.parse(job.tiktokHashtags || "[]");
  } catch {}

  // 5. Send POST_VIDEO to content script
  try {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: "POST_VIDEO",
          payload: {
            jobId: job.id,
            videoUrl: job.videoUrl,
            caption: job.tiktokCaption || job.product?.title || "",
            hashtags: hashtags,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { error: "No response from content script" });
          }
        },
      );
    });

    if (result.error) {
      console.error("[TikTok Flow] Posting failed:", result.error);
      await handleJobFailure(job.id, result.error, job);
    } else {
      console.log("[TikTok Flow] Posting complete:", result.tiktokPostUrl);
    }
  } catch (err) {
    console.error("[TikTok Flow] Posting error:", err);
    await handleJobFailure(job.id, err.message, job);
  }
}
```

**Depends on:** B1

### Task B3: Update `processNextJob()` to route `posting` jobs

**File:** `extension/background.js`

In `processNextJob()`, find this block:

```javascript
if (currentJob.status === "generating_image") {
  await processImageGeneration(currentJob);
} else if (currentJob.status === "generating_video") {
  await processVideoGeneration(currentJob);
}
// "ready" and "posting" states are handled by user trigger from side panel
```

Replace with:

```javascript
if (currentJob.status === "generating_image") {
  await processImageGeneration(currentJob);
} else if (currentJob.status === "generating_video") {
  await processVideoGeneration(currentJob);
} else if (currentJob.status === "posting") {
  await processPosting(currentJob);
}
```

**Depends on:** B2

### Task B4: Update `handlePhaseComplete()` for auto-post

**File:** `extension/background.js`

In `handlePhaseComplete()`, find the `else if (nextStatus === "ready")` block:

```javascript
} else if (nextStatus === "ready") {
  console.log("[TikTok Flow] Video complete, job is ready:", jobId);
  // Video done — TikTok posting will be triggered from sidepanel
}
```

Replace with:

```javascript
} else if (nextStatus === "ready") {
  console.log("[TikTok Flow] Video complete, job is ready:", jobId);

  // Check if auto-post is enabled
  const { autoPostEnabled } = await chrome.storage.local.get("autoPostEnabled");
  if (autoPostEnabled) {
    console.log("[TikTok Flow] Auto-post enabled, starting posting for job:", jobId);
    // Update status to posting
    await fetch(`${API_BASE}/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "posting", startedAt: new Date().toISOString() }),
    });
    const res = await fetch(`${API_BASE}/jobs/${jobId}`);
    const job = await res.json();
    await processPosting(job);
  } else {
    console.log("[TikTok Flow] Auto-post disabled, waiting for manual trigger");
  }
} else if (nextStatus === "posted") {
  console.log("[TikTok Flow] Job posted successfully:", jobId);
  // Continue to next job in queue
}
```

**Depends on:** B2

### Task B5: Add `START_POSTING` message handler

**File:** `extension/background.js`

In the `chrome.runtime.onMessage.addListener` switch/if block, add a new handler:

```javascript
if (message.type === "START_POSTING") {
  const { jobId } = message.payload || {};
  if (!jobId) {
    sendResponse({ error: "No jobId provided" });
    return;
  }

  // Update job status to posting
  fetch(`${API_BASE}/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "posting",
      startedAt: new Date().toISOString(),
    }),
  })
    .then(() => fetch(`${API_BASE}/jobs/${jobId}`))
    .then((res) => res.json())
    .then((job) => processPosting(job))
    .catch((err) => console.error("[TikTok Flow] START_POSTING error:", err));

  sendResponse({ ok: true });
  return true;
}
```

**Depends on:** B2

---

## Phase C: Sidepanel + UI Wiring

### Task C1: Fix `handlePostToTikTok()` in sidepanel

**File:** `extension/sidepanel.js`

Replace the current broken implementation:

```javascript
// BEFORE (broken — opens tab but never sends POST_VIDEO):
function handlePostToTikTok(jobId) {
  chrome.runtime.sendMessage({ type: "OPEN_TIKTOK_STUDIO" });
  chrome.runtime.sendMessage({
    type: "UPDATE_JOB_STATUS",
    payload: { jobId, data: { status: "posting" } },
  });
}
```

With:

```javascript
// AFTER (delegates to background.js which handles tab + posting):
function handlePostToTikTok(jobId) {
  chrome.runtime.sendMessage({
    type: "START_POSTING",
    payload: { jobId },
  });
}
```

**Depends on:** B5

### Task C2: Send `JOB_PHASE_COMPLETE` after posting

**File:** `extension/content/tiktok-studio.js`

In the `postVideo()` function, after the success path (where it calls `updateJobStatus(jobId, { status: "posted", ... })`), add:

```javascript
// Notify background.js that posting is complete so it proceeds to next job
chrome.runtime.sendMessage({
  type: "JOB_PHASE_COMPLETE",
  payload: { jobId, phase: "posting", nextStatus: "posted" },
});
```

Place this right before the `return { success: true, tiktokPostUrl };` line.

**Depends on:** B4

### Task C3: Add auto-post toggle to Settings page

**File:** `app/settings/page.tsx`

Add a new toggle in the settings UI:

- Label: "Auto-post to TikTok"
- Description: "Automatically post videos to TikTok after generation completes. When off, videos pause at 'Ready' status for manual posting."
- Default: OFF
- Stored in `Setting` table as key `autoPostEnabled`, value `"true"` or `"false"`

The settings page already uses a key-value pattern for the `Setting` model — follow the same pattern.

### Task C4: Add auto-post toggle to sidepanel

**File:** `extension/sidepanel.js`

Add a checkbox toggle in the TikTok tab section:

```html
<label class="toggle-row">
  <input type="checkbox" id="autoPostToggle" />
  <span>Auto Post to TikTok</span>
</label>
```

On change, sync to `chrome.storage.local`:

```javascript
document.getElementById("autoPostToggle").addEventListener("change", (e) => {
  chrome.storage.local.set({ autoPostEnabled: e.target.checked });
});
```

On load, restore from storage:

```javascript
chrome.storage.local.get("autoPostEnabled", ({ autoPostEnabled }) => {
  document.getElementById("autoPostToggle").checked = !!autoPostEnabled;
});
```

**Parallel with:** C3

---

## Task Dependency Graph

```
A1 (schema) ──┐
               ├── A3 (store on job create)
A2 (templates) ┘

B1 (tab mgmt) → B2 (processPosting) → B3 (route in processNextJob)
                                      → B4 (handlePhaseComplete auto-post)
                                      → B5 (START_POSTING handler)

B5 → C1 (fix sidepanel handlePostToTikTok)
B4 → C2 (JOB_PHASE_COMPLETE from tiktok-studio.js)

C3 (settings page toggle)  ── parallel
C4 (sidepanel toggle)      ── parallel
```

**Parallelizable:** Phase A and Phase B (steps B1-B2) can be done simultaneously.

---

## Files to Modify

| File                                 | Changes                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`               | Add `tiktokCaption`, `tiktokHashtags` to VideoJob                                                                                                                                        |
| `lib/prompt-templates.ts`            | Add `generateTikTokCaption()`, `generateTikTokHashtags()`                                                                                                                                |
| `app/api/jobs/route.ts`              | Generate and store caption/hashtags on POST                                                                                                                                              |
| `extension/background.js`            | Add `findTikTokStudioTab()`, `ensureTikTokStudioTab()`, `healthCheckTikTokStudio()`, `processPosting()`. Update `processNextJob()`, `handlePhaseComplete()`. Add `START_POSTING` handler |
| `extension/sidepanel.js`             | Fix `handlePostToTikTok()`, add auto-post toggle                                                                                                                                         |
| `extension/content/tiktok-studio.js` | Add `JOB_PHASE_COMPLETE` send after posting                                                                                                                                              |
| `app/settings/page.tsx`              | Add auto-post toggle                                                                                                                                                                     |

---

## Verification Checklist

- [ ] Create a job via API → `tiktokCaption` and `tiktokHashtags` fields are populated
- [ ] Job in `ready` state → click "Post to TikTok" in sidepanel → TikTok Studio opens, receives `POST_VIDEO`, posting proceeds
- [ ] Enable auto-post toggle → run full job → transitions `ready → posting → posted` automatically
- [ ] Close TikTok Studio tab mid-posting → `ensureTikTokStudioTab()` reopens and retries
- [ ] Trigger posting failure → error classification works, retries with backoff, marks `failed` after max retries
- [ ] Full end-to-end: product → queue → image → video → auto-post → `posted`, hands-free
- [ ] After posting completes, background.js picks up the next pending job in queue

---

## Key Decisions

- **Caption stored at job creation** — not generated at posting time, so it's visible/editable in UI
- **Auto-post defaults to OFF** — avoids accidental posts
- **Reuse existing retry/error system** — `classifyError()`, `handleJobFailure()`, `withRetry()` all work for posting
- **Tab management mirrors Google Flow pattern** — `find/ensure/healthCheck` trio
- **No changes to `tiktok-studio.js` core `postVideo()` logic** — it already works, only adding `JOB_PHASE_COMPLETE` notification
