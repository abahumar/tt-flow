# Stage 7: TikTok Posting — Debug Summary

## Current Status

| Step                       | Status   | Notes                                      |
| -------------------------- | -------- | ------------------------------------------ |
| Image Generation (Flow)    | ✅ Works | Full auto pipeline working                 |
| Video Generation (Flow)    | ✅ Works | Includes watermark removal                 |
| Auto-post trigger          | ✅ Fixed | Was not firing, now triggers inline        |
| Add to Showcase (Shop)     | ✅ Works | Product URL paste fixed, adds successfully |
| Open TikTok Studio tab     | ✅ Works | Tab opens, content script responds to PING |
| **Upload video to Studio** | ❌ Fails | **This is the current blocker**            |

---

## The Problem

After successfully adding the product to the TikTok Shop Showcase, the flow opens `https://www.tiktok.com/tiktokstudio/upload?from=creator_center` but **nothing happens after that**. The video never gets uploaded and the job eventually times out or gets stuck.

---

## Likely Root Causes (in order of probability)

### 1. Video URL not accessible from TikTok Studio page

**File:** `extension/content/tiktok-studio.js` — line ~97

```js
const response = await fetch(videoUrl);
```

The `videoUrl` is `http://localhost:3000/api/jobs/{id}/video` — this works fine from the extension background script or the Google Flow tab. But when the TikTok Studio content script runs on `tiktok.com`, the browser may **block the fetch to localhost** due to:

- **Mixed content**: TikTok is HTTPS, localhost is HTTP
- **CORS**: The localhost API may not send CORS headers for tiktok.com origin
- **Content Security Policy**: TikTok's CSP headers may block fetches to localhost

**How to verify:**

1. Open TikTok Studio manually in Chrome
2. Open DevTools Console
3. Run: `fetch('http://localhost:3000/api/jobs').then(r=>r.json()).then(console.log).catch(console.error)`
4. If it fails → this is the problem

**Fix options:**

- **Option A:** Download the video in `background.js` (service worker has no CORS restrictions), convert to base64, and pass it in the `POST_VIDEO` payload instead of a URL
- **Option B:** Use `chrome.scripting.executeScript` in MAIN world to bypass CSP
- **Option C:** Use a blob URL — background.js fetches video, creates object URL, passes that

### 2. File input not found or not triggerable

**File:** `extension/content/tiktok-studio.js` — `findFileInput()` function

The selectors may not match TikTok Studio's current DOM:

```js
'input[type="file"]';
```

From the recording, the file input selector was:

```
div.layout > div.card:nth-of-type(1) > div.upload:nth-of-type(2) > div > input
```

**How to verify:**

1. Open TikTok Studio upload page
2. DevTools Console: `document.querySelector('input[type="file"]')`
3. Check if it exists and is accessible

### 3. Upload area requires a click first

From the recorded flow (Steps 11-12), the user clicked `div.upload-stage-container > button.upload-stage-btn` ("Select video") **before** the file input appeared. The content script may need to click this button first.

**How to verify:**

1. On the TikTok Studio upload page, check if `input[type="file"]` exists immediately or only after clicking "Select video"

### 4. `waitForAnyElement` matches too broadly

```js
'[class*="upload"]';
```

This selector matches basically anything with "upload" in a class name. It might resolve immediately to a wrong element while the actual upload area hasn't loaded yet.

---

## How to Debug

### Quick Console Test

Open TikTok Studio upload page, then in DevTools Console:

```js
// 1. Check if content script is loaded
chrome.runtime?.id; // Should show extension ID if in content script context

// 2. Check file input
document.querySelector('input[type="file"]');

// 3. Check if localhost is reachable
fetch("http://localhost:3000/api/jobs")
  .then((r) => r.status)
  .then(console.log)
  .catch(console.error);
```

### Check Extension Service Worker Logs

1. Go to `chrome://extensions`
2. Click "Inspect views: service worker" on TikTok Affiliate Flow
3. Look for these log messages:
   - `[TikTok Flow] Content script alive on tab` — confirms content script responded
   - `[TikTok Flow] Posting failed:` — shows the actual error message
   - `[TikTok Flow] Auto-retry` — shows if it's retrying

### Check TikTok Studio Tab Console

1. Open the TikTok Studio tab that was opened by the extension
2. Open DevTools Console
3. Look for:
   - `[TikTok Flow] TikTok Studio content script loaded` — confirms injection
   - `[TikTok Flow] Starting TikTok posting for job:` — confirms POST_VIDEO received
   - Any error messages after that

---

## Files Involved

| File                                 | Role                                                |
| ------------------------------------ | --------------------------------------------------- |
| `extension/background.js`            | `processPosting()` → sends POST_VIDEO to tab        |
| `extension/content/tiktok-studio.js` | `postVideo()` → uploads video, fills caption, posts |
| `extension/manifest.json`            | Content script match: `tiktokstudio/*`              |
| `app/api/jobs/[id]/video/route.ts`   | Serves video file at localhost:3000                 |

---

## Most Likely Fix Needed

**Download video in background.js and pass as base64 to content script** — avoids all CORS/CSP/mixed-content issues:

In `processPosting()` in `background.js`, before sending POST_VIDEO:

```js
// Fetch video in background (no CORS restrictions)
const videoResponse = await fetch(job.videoUrl);
const videoBlob = await videoResponse.blob();
const reader = new FileReader();
const videoBase64 = await new Promise((resolve) => {
  reader.onload = () => resolve(reader.result);
  reader.readAsDataURL(videoBlob);
});

// Send base64 video data instead of URL
chrome.tabs.sendMessage(tabId, {
  type: "POST_VIDEO",
  payload: {
    jobId: job.id,
    videoBase64: videoBase64,  // Pass data, not URL
    caption: ...,
    hashtags: ...,
  }
});
```

Then in `tiktok-studio.js`, convert base64 back to File instead of fetching URL.
