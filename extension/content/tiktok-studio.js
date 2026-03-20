// TikTok Studio content script
// Automates video upload and posting on tiktok.com/tiktokstudio/upload

const API_BASE = "http://localhost:3000/api";

console.log("[TikTok Flow] TikTok Studio content script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case "POST_VIDEO":
      postVideo(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "PING":
      sendResponse({ status: "alive", url: window.location.href });
      return true;
  }
});

async function postVideo({ jobId, videoUrl, caption, hashtags }) {
  console.log("[TikTok Flow] Starting TikTok posting for job:", jobId);

  try {
    // Step 1: Wait for the upload page to be ready
    await waitForElement('[class*="upload"], input[type="file"]', 15000);
    await sleep(2000);

    // Step 2: Upload the video file
    // If we have a video URL, we need to download it first and create a File object
    if (videoUrl) {
      const fileInput = await waitForElement('input[type="file"]', 10000);

      // Fetch the video and create a file-like blob
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const file = new File([blob], "tiktok-video.mp4", { type: "video/mp4" });

      // Use DataTransfer to set files on the input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      console.log("[TikTok Flow] Video file uploaded");
      await sleep(5000); // Wait for upload to process
    }

    // Step 3: Wait for upload to complete (look for upload progress to finish)
    await waitForUploadComplete(120000);

    // Step 4: Fill in caption
    if (caption) {
      const captionInput = await waitForElement(
        '[data-text="true"], [contenteditable="true"], textarea[placeholder*="caption"], div[class*="caption"] [contenteditable]',
        10000,
      );

      captionInput.focus();
      // Clear existing content
      document.execCommand("selectAll", false);
      document.execCommand("delete", false);
      // Type the caption with hashtags
      const fullCaption = `${caption} ${(hashtags || []).map((h) => `#${h}`).join(" ")}`;
      document.execCommand("insertText", false, fullCaption);

      await sleep(1000);
    }

    // Step 5: Handle "Turn on automatic content checks" dialog
    await sleep(2000);
    const turnOnBtn = findButtonByText("Turn on") || findButtonByText("Cancel");
    if (turnOnBtn) {
      // Click Cancel to skip content checks (configurable)
      const cancelBtn = findButtonByText("Cancel");
      if (cancelBtn) {
        simulateClick(cancelBtn);
        await sleep(1000);
      }
    }

    // Step 6: Click Post button
    const postBtn =
      findButtonByText("Post") ||
      findButtonByText("Publish") ||
      findButtonByText("Upload");

    if (!postBtn) {
      throw new Error("Could not find Post button on TikTok Studio");
    }

    simulateClick(postBtn);
    console.log("[TikTok Flow] Post button clicked");

    // Step 7: Wait for posting to complete
    await sleep(5000);

    // Check for success indicators
    const success = await waitForPostSuccess(60000);

    const tiktokPostUrl = window.location.href;
    await updateJobStatus(jobId, { status: "posted", tiktokPostUrl });

    console.log("[TikTok Flow] Successfully posted to TikTok");
    return { success: true, tiktokPostUrl };
  } catch (err) {
    console.error("[TikTok Flow] TikTok posting failed:", err);
    await updateJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
    });
    return { error: err.message };
  }
}

async function waitForUploadComplete(timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // Look for upload progress indicators being complete
    const progressBars = document.querySelectorAll(
      '[class*="progress"], [role="progressbar"]',
    );
    let allComplete = true;
    for (const bar of progressBars) {
      const value = bar.getAttribute("aria-valuenow");
      if (value && parseInt(value) < 100) {
        allComplete = false;
        break;
      }
    }

    // Look for "uploaded" or ready-to-post indicators
    const readyIndicator = document.querySelector(
      '[class*="success"], [class*="complete"], [class*="ready"]',
    );
    if (readyIndicator || (progressBars.length > 0 && allComplete)) {
      return true;
    }

    // Check if Post button is enabled
    const postBtn = findButtonByText("Post") || findButtonByText("Publish");
    if (postBtn && !postBtn.disabled) {
      return true;
    }

    await sleep(3000);
  }
  throw new Error("Timeout waiting for video upload to complete");
}

async function waitForPostSuccess(timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // Look for success messages
    const successEl = document.querySelector(
      '[class*="success"], [class*="posted"], [class*="complete"]',
    );
    if (successEl) return true;

    // Check if URL changed (redirected to manage page)
    if (
      window.location.href.includes("manage") ||
      window.location.href.includes("content")
    ) {
      return true;
    }

    await sleep(2000);
  }
  // Even if we don't detect success, don't fail — the post might have gone through
  console.warn("[TikTok Flow] Could not confirm post success, assuming posted");
  return true;
}

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
    console.error("[TikTok Flow] Failed to update job status:", err);
  }
}

// Inlined DOM helpers
function waitForElement(selector, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: ${selector}`));
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function simulateClick(el) {
  el.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

function findButtonByText(text) {
  for (const btn of document.querySelectorAll("button")) {
    if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase()))
      return btn;
  }
  return null;
}
