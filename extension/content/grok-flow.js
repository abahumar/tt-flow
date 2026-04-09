// Grok Flow content script — automates video generation on grok.com/imagine
// Used as a backup video engine when Google Flow is down.
// Image generation still happens on Google Flow; only VIDEO is handled here.
//
// DOM structure (recorded 2026-04-09):
//   - Prompt editor: TipTap/ProseMirror — div.tiptap.ProseMirror
//   - File input: input[name="files"]
//   - Mode tabs: button[role="radio"] with text "Image" / "Video"
//   - Resolution tabs: button[role="radio"] with text "480p" / "720p"
//   - Duration tabs: button[role="radio"] with text "6s" / "10s"
//   - Generate button: button.group.flex containing SVG (submit arrow)
//   - Result page: grok.com/imagine/post/{uuid}
//   - Download: button row with download SVG icon → triggers <a> download

const API_BASE = "http://localhost:3000/api";

console.log(
  "[Grok Flow] Content script loaded on:",
  window.location.href,
);

// ---- Message listener ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case "GROK_GENERATE_VIDEO":
      generateVideo(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "PING":
      sendResponse({ status: "alive", url: window.location.href, engine: "grok" });
      return true;

    default:
      return false;
  }
});

// ---- Utility helpers (self-contained, no dependency on dom-helpers.js) ----

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForElement(selector, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(500);
  }
  throw new Error(`waitForElement("${selector}") timed out after ${timeout}ms`);
}

async function waitForNavigation(urlPattern, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (window.location.href.includes(urlPattern)) {
      return window.location.href;
    }
    await sleep(1000);
  }
  throw new Error(`waitForNavigation("${urlPattern}") timed out after ${timeout}ms`);
}

function simulateClick(el) {
  if (!el) return;
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

// Find a button by its visible text content
function findButtonByText(text) {
  const buttons = document.querySelectorAll("button");
  const lower = text.toLowerCase();
  for (const btn of buttons) {
    if (btn.textContent.trim().toLowerCase().includes(lower)) {
      return btn;
    }
  }
  // Also check spans inside buttons
  const spans = document.querySelectorAll("button span");
  for (const span of spans) {
    if (span.textContent.trim().toLowerCase() === lower) {
      return span.closest("button");
    }
  }
  return null;
}

// Find a radio button by text (for mode/resolution/duration selectors)
function findRadioByText(text) {
  const buttons = document.querySelectorAll('button[role="radio"], button');
  const lower = text.toLowerCase();
  for (const btn of buttons) {
    const btnText = btn.textContent.trim().toLowerCase();
    if (btnText === lower) return btn;
  }
  // Fallback: search spans
  const spans = document.querySelectorAll("button span, div span");
  for (const span of spans) {
    if (span.textContent.trim().toLowerCase() === lower) {
      return span.closest("button") || span;
    }
  }
  return null;
}

// Find the generate/submit button (the arrow SVG button)
function findGenerateButton() {
  // The generate button is within div.absolute.right-2 or similar submit area
  // It's a button.group.flex containing an SVG
  const candidates = document.querySelectorAll("button.group");
  for (const btn of candidates) {
    const svg = btn.querySelector("svg");
    const rect = btn.getBoundingClientRect();
    if (svg && rect.width > 0 && rect.height > 0) {
      // Check it's in the bottom-right area (submit position)
      if (rect.bottom > window.innerHeight * 0.5) {
        return btn;
      }
    }
  }

  // Fallback: look for the submit button near the prompt area
  const promptEl = document.querySelector(".tiptap.ProseMirror");
  if (promptEl) {
    let container = promptEl;
    for (let i = 0; i < 8 && container; i++) {
      container = container.parentElement;
      if (!container) break;
      const btns = container.querySelectorAll("button");
      for (const btn of btns) {
        const svg = btn.querySelector("svg");
        const rect = btn.getBoundingClientRect();
        if (svg && rect.width >= 30 && rect.height >= 30) {
          // Skip if it's a mode/radio button
          if (btn.getAttribute("role") === "radio") continue;
          if (btn.textContent.trim().match(/^(Image|Video|480p|720p|6s|10s)$/i)) continue;
          return btn;
        }
      }
    }
  }

  return null;
}

// Find the prompt input (TipTap ProseMirror editor)
function findPromptInput() {
  return document.querySelector(".tiptap.ProseMirror") ||
    document.querySelector('[contenteditable="true"]');
}

// Fill prompt via TipTap ProseMirror
async function fillPrompt(el, text) {
  // Focus the editor
  el.focus();
  await sleep(200);

  // Clear existing content
  document.execCommand("selectAll", false, null);
  await sleep(100);
  document.execCommand("delete", false, null);
  await sleep(200);

  // Insert text via execCommand (works with TipTap)
  document.execCommand("insertText", false, text);
  await sleep(300);

  // Verify
  const content = el.innerText || el.textContent || "";
  if (!content.includes(text.substring(0, 20))) {
    console.warn("[Grok Flow] execCommand insertion may have failed, trying input event fallback");
    // Fallback: direct DOM manipulation + input event
    el.innerHTML = `<p>${text}</p>`;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(200);
  }

  console.log("[Grok Flow] Prompt filled:", text.substring(0, 60) + "...");
}

// Upload image via the file input
async function uploadImage(imageDataUrl) {
  // Find the file input
  const fileInput = document.querySelector('input[name="files"]');
  if (!fileInput) {
    throw new Error("Could not find file input (input[name='files'])");
  }

  // Convert data URL to File object
  const response = await fetch(imageDataUrl);
  const blob = await response.blob();
  const file = new File([blob], "reference.jpg", { type: blob.type || "image/jpeg" });

  // Create a DataTransfer to set files on the input
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;

  // Dispatch change event
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));

  console.log("[Grok Flow] Image uploaded via file input:", Math.round(blob.size / 1024) + "KB");
  await sleep(2000); // Wait for upload to process
}

// Select a tab option (Video mode, resolution, duration)
async function selectOption(text) {
  const btn = findRadioByText(text);
  if (!btn) {
    console.warn(`[Grok Flow] Could not find option button: "${text}"`);
    return false;
  }
  simulateClick(btn);
  await sleep(500);
  console.log(`[Grok Flow] Selected option: "${text}"`);
  return true;
}

// Wait for video result on the post page
async function waitForVideoResult(timeout = 300000) {
  console.log("[Grok Flow] Waiting for video result (timeout:", timeout / 1000, "s)...");
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Check for video element
    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      const src = video.src || video.querySelector("source")?.src || "";
      if (src && video.getBoundingClientRect().width > 100) {
        console.log("[Grok Flow] Video element found:", src.substring(0, 100));
        return video;
      }
    }

    // Check for download button/link appearing (signals completion)
    const downloadBtns = document.querySelectorAll("button svg, a[download]");
    for (const el of downloadBtns) {
      const btn = el.closest("button") || el;
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Check if there's a video nearby
        const videoNearby = document.querySelector("video");
        if (videoNearby && videoNearby.src) {
          console.log("[Grok Flow] Download controls appeared, video ready");
          return videoNearby;
        }
      }
    }

    await sleep(3000);
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 15 === 0) {
      console.log(`[Grok Flow] Still waiting for video... ${elapsed}s elapsed`);
    }
  }

  throw new Error(`Video generation timed out after ${timeout / 1000}s`);
}

// Download video and upload to backend
async function downloadAndUploadVideo(videoEl, jobId) {
  console.log("[Grok Flow] Downloading video for job:", jobId);

  let videoBlob = null;

  // Strategy 1: Fetch the video element's src
  const videoSrc = videoEl.src || videoEl.querySelector?.("source")?.src;
  if (videoSrc) {
    console.log("[Grok Flow] Fetching video src:", videoSrc.substring(0, 100));
    try {
      const resp = await fetch(videoSrc);
      if (resp.ok) {
        videoBlob = await resp.blob();
        console.log("[Grok Flow] Downloaded via video src:", videoBlob.size, "bytes");
      }
    } catch (e) {
      console.warn("[Grok Flow] Video src fetch failed:", e.message);
    }
  }

  // Strategy 2: Find download link on the page
  if (!videoBlob) {
    const links = document.querySelectorAll('a[download], a[href*=".mp4"], a[href*="video"]');
    for (const link of [...links].reverse()) {
      const href = link.href || link.getAttribute("href") || "";
      if (href && href.startsWith("http")) {
        console.log("[Grok Flow] Trying download link:", href.substring(0, 100));
        try {
          const resp = await fetch(href);
          if (resp.ok) {
            videoBlob = await resp.blob();
            console.log("[Grok Flow] Downloaded via link:", videoBlob.size, "bytes");
            break;
          }
        } catch (e) {
          console.warn("[Grok Flow] Link fetch failed:", e.message);
        }
      }
    }
  }

  // Strategy 3: Click the download button to trigger download, then find the blob
  if (!videoBlob) {
    console.log("[Grok Flow] Trying to click download button...");
    // From recording: download button is in div.flex.flex-col button with SVG
    const actionButtons = document.querySelectorAll("button.inline-flex");
    for (const btn of actionButtons) {
      const svg = btn.querySelector("svg");
      if (svg && btn.getBoundingClientRect().width > 0) {
        // Check if this might be the download button (typically has a specific icon)
        const title = btn.getAttribute("title") || btn.getAttribute("aria-label") || "";
        if (title.toLowerCase().includes("download") || title.toLowerCase().includes("save")) {
          simulateClick(btn);
          await sleep(2000);
          // After clicking, check for new <a> tags
          const newLinks = document.querySelectorAll('a[download], a[href*=".mp4"]');
          for (const link of [...newLinks].reverse()) {
            const href = link.href || "";
            if (href.startsWith("http")) {
              try {
                const resp = await fetch(href);
                if (resp.ok) {
                  videoBlob = await resp.blob();
                  console.log("[Grok Flow] Downloaded after button click:", videoBlob.size, "bytes");
                  break;
                }
              } catch {}
            }
          }
          if (videoBlob) break;
        }
      }
    }
  }

  // Strategy 4: Canvas capture fallback
  if (!videoBlob && videoEl.tagName === "VIDEO") {
    console.log("[Grok Flow] Trying canvas capture...");
    try {
      videoBlob = await captureVideoViaCanvas(videoEl);
      console.log("[Grok Flow] Captured via canvas:", videoBlob.size, "bytes");
    } catch (e) {
      console.warn("[Grok Flow] Canvas capture failed:", e.message);
    }
  }

  if (!videoBlob || videoBlob.size < 1000) {
    throw new Error("Could not download video. All strategies failed.");
  }

  // Upload to backend via background service worker
  console.log("[Grok Flow] Uploading video to backend:", videoBlob.size, "bytes");

  const arrayBuffer = await videoBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      uint8Array.subarray(i, i + chunkSize),
    );
  }
  const base64Video = btoa(binary);

  const result = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "UPLOAD_VIDEO",
        payload: {
          jobId,
          videoBase64: base64Video,
          mimeType: videoBlob.type || "video/mp4",
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      },
    );
  });

  return result;
}

// Simple canvas capture for video (fallback)
async function captureVideoViaCanvas(videoEl) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth || 720;
    canvas.height = videoEl.videoHeight || 1280;

    // We need MediaRecorder for actual video capture
    const stream = videoEl.captureStream?.() || videoEl.mozCaptureStream?.();
    if (!stream) {
      reject(new Error("captureStream not available"));
      return;
    }

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
    recorder.onerror = (e) => reject(e.error || new Error("Recording failed"));

    // Play and record
    videoEl.currentTime = 0;
    videoEl.play();
    recorder.start();

    videoEl.onended = () => {
      recorder.stop();
    };

    // Safety timeout
    setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, 30000);
  });
}

// Update job status via background service worker
async function updateJobStatus(jobId, data) {
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "UPDATE_JOB_STATUS", payload: { jobId, data } },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        },
      );
    });
  } catch (err) {
    console.error("[Grok Flow] Failed to update job status:", err);
  }
}

// =========================================================
// MAIN: Generate video from uploaded image on Grok
// =========================================================

async function generateVideo({ jobId, prompt, referenceImageDataUrl, duration }) {
  console.log("[Grok Flow] === Starting video generation for job:", jobId);
  console.log("[Grok Flow] Prompt:", (prompt || "").substring(0, 100) + "...");
  console.log("[Grok Flow] Reference image provided:", !!referenceImageDataUrl);
  console.log("[Grok Flow] Duration:", duration || "10s");

  try {
    // Step 1: Ensure we're on grok.com/imagine
    if (!window.location.href.includes("grok.com/imagine")) {
      throw new Error("Not on Grok Imagine page. Navigate to https://grok.com/imagine first.");
    }

    // If we're on a post page, navigate back to imagine home
    if (window.location.href.includes("/imagine/post/")) {
      console.log("[Grok Flow] On post page, navigating back to /imagine...");
      window.location.href = "https://grok.com/imagine";
      await sleep(3000);
      await waitForElement(".tiptap.ProseMirror", 15000);
      await sleep(1000);
    }

    // Step 2: Upload the reference image
    if (referenceImageDataUrl) {
      console.log("[Grok Flow] Uploading reference image...");

      // Try clicking the upload area first to open file dialog
      const uploadBtn = findButtonByText("Upload or drop images");
      if (uploadBtn) {
        // Don't click the button — directly set the file input
        console.log("[Grok Flow] Found upload button, using file input directly");
      }

      await uploadImage(referenceImageDataUrl);
    } else {
      console.warn("[Grok Flow] No reference image — video will use prompt only");
    }

    // Step 3: Fill the prompt
    console.log("[Grok Flow] Filling prompt...");
    let promptEl = findPromptInput();
    if (!promptEl) {
      await sleep(2000);
      promptEl = findPromptInput();
    }
    if (!promptEl) {
      throw new Error("Could not find prompt editor (.tiptap.ProseMirror)");
    }

    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, prompt || "Create a smooth cinematic video with gentle movement. 9:16 vertical format.");

    // Step 4: Select "Video" mode
    console.log("[Grok Flow] Selecting Video mode...");
    const videoSelected = await selectOption("Video");
    if (!videoSelected) {
      console.warn("[Grok Flow] Could not find Video button — may already be in Video mode");
    }
    await sleep(500);

    // Step 5: Select resolution (720p)
    console.log("[Grok Flow] Selecting 720p resolution...");
    await selectOption("720p");
    await sleep(300);

    // Step 6: Select duration
    const durationText = duration === 6 || duration === "6s" ? "6s" : "10s";
    console.log(`[Grok Flow] Selecting ${durationText} duration...`);
    await selectOption(durationText);
    await sleep(300);

    // Step 7: Click Generate
    console.log("[Grok Flow] Looking for generate button...");
    let generateBtn = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      generateBtn = findGenerateButton();
      if (generateBtn) break;
      await sleep(1000);
    }
    if (!generateBtn) {
      throw new Error("Could not find the generate/submit button");
    }

    simulateClick(generateBtn);
    console.log("[Grok Flow] Generate clicked! Waiting for redirect to post page...");

    // Step 8: Wait for navigation to post page
    await sleep(3000);
    // Grok redirects to /imagine/post/{uuid}
    const postUrl = await waitForNavigation("/imagine/post/", 30000);
    console.log("[Grok Flow] Redirected to post page:", postUrl);

    // Step 9: Wait for video to be generated
    await sleep(5000); // Initial wait
    const videoEl = await waitForVideoResult(300000); // 5 min timeout

    // Step 10: Download and upload video to backend
    let videoUrl;
    try {
      const uploadResult = await downloadAndUploadVideo(videoEl, jobId);
      videoUrl = uploadResult.videoUrl;
      console.log("[Grok Flow] Video downloaded and uploaded:", videoUrl);
    } catch (downloadErr) {
      console.warn("[Grok Flow] Download failed, trying raw URL:", downloadErr.message);
      videoUrl = videoEl.src || videoEl.querySelector?.("source")?.src;
      if (!videoUrl) {
        throw new Error("Video appeared but could not extract or download it");
      }
    }

    // Step 11: Update job status
    console.log("[Grok Flow] Video generation SUCCESS:", (videoUrl || "").substring(0, 100));
    await updateJobStatus(jobId, { status: "ready", videoUrl });

    // Notify background service worker
    chrome.runtime.sendMessage({
      type: "JOB_PHASE_COMPLETE",
      payload: { jobId, phase: "video", nextStatus: "ready" },
    });

    return { success: true, videoUrl };
  } catch (err) {
    console.error("[Grok Flow] Video generation FAILED:", err.message);
    await updateJobStatus(jobId, {
      status: "failed",
      errorMessage: `[Grok] ${err.message}`,
    });
    return { error: err.message };
  }
}
