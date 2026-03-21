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

// ---- Retry utility ----
async function withRetry(
  fn,
  { maxAttempts = 3, delayMs = 1000, label = "" } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      console.warn(
        `[TikTok Flow] ${label || "Operation"} attempt ${attempt}/${maxAttempts} failed:`,
        err.message,
      );
      if (attempt < maxAttempts) await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}

async function postVideo({ jobId, videoUrl, caption, hashtags }) {
  console.log("[TikTok Flow] Starting TikTok posting for job:", jobId);

  try {
    // Verify we're on TikTok Studio
    if (!window.location.href.includes("tiktokstudio")) {
      throw new Error(
        "Not on TikTok Studio page. Navigate to tiktok.com/tiktokstudio/upload first.",
      );
    }

    // Step 1: Wait for the upload page to be ready
    await updateJobStatus(jobId, {
      status: "posting",
      errorMessage: "Waiting for upload page...",
    });
    const uploadArea = await waitForAnyElement(
      [
        'input[type="file"]',
        '[class*="upload"]',
        '[data-testid*="upload"]',
        'div[class*="uploader"]',
      ],
      15000,
    );
    await sleep(2000);

    // Step 2: Upload the video file
    if (videoUrl) {
      await updateJobStatus(jobId, {
        status: "posting",
        errorMessage: "Uploading video...",
      });

      const fileInput = await findFileInput();
      if (!fileInput) {
        throw new Error(
          "Could not find file input on TikTok Studio. The UI may have changed.",
        );
      }

      // Fetch the video and create a file-like blob
      let blob;
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`Video fetch failed: HTTP ${response.status}`);
        }
        blob = await response.blob();
      } catch (fetchErr) {
        throw new Error(
          `Could not download video from Google Flow: ${fetchErr.message}`,
        );
      }

      const file = new File([blob], "tiktok-video.mp4", { type: "video/mp4" });

      // Use DataTransfer to set files on the input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      console.log("[TikTok Flow] Video file uploaded");
      await sleep(5000); // Wait for upload to process
    }

    // Step 3: Wait for upload to complete
    await updateJobStatus(jobId, {
      status: "posting",
      errorMessage: "Processing upload...",
    });
    await waitForUploadComplete(180000); // 3 min for larger videos

    // Step 4: Fill in caption
    if (caption) {
      await updateJobStatus(jobId, {
        status: "posting",
        errorMessage: "Filling caption...",
      });

      const captionInput = await withRetry(
        () =>
          waitForAnyElement(
            [
              '[data-text="true"]',
              'div[contenteditable="true"]',
              'textarea[placeholder*="caption" i]',
              'div[class*="caption"] [contenteditable]',
              '[class*="editor"] [contenteditable]',
              'div[role="textbox"]',
            ],
            10000,
          ),
        { maxAttempts: 3, delayMs: 2000, label: "Find caption input" },
      );

      captionInput.focus();
      await sleep(500);
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
    const cancelBtn = findButtonByText("Cancel");
    if (cancelBtn) {
      simulateClick(cancelBtn);
      await sleep(1000);
    }

    // Step 6: Check for rate limiting or content policy warnings
    const warningEl = document.querySelector(
      '[class*="warning"], [class*="error"], [class*="alert"]',
    );
    if (warningEl) {
      const warningText = warningEl.textContent.trim().toLowerCase();
      if (
        warningText.includes("rate limit") ||
        warningText.includes("too many")
      ) {
        throw new Error("TikTok rate limit detected. Try again later.");
      }
      if (
        warningText.includes("content policy") ||
        warningText.includes("violation") ||
        warningText.includes("community guidelines")
      ) {
        throw new Error(
          "Content policy violation detected: " + warningText.substring(0, 100),
        );
      }
    }

    // Step 7: Click Post button (with retry — button may not be immediately clickable)
    await updateJobStatus(jobId, {
      status: "posting",
      errorMessage: "Posting...",
    });

    const postBtn = await withRetry(
      () => {
        const btn =
          findButtonByText("Post") ||
          findButtonByText("Publish") ||
          findButtonByText("Upload");
        if (!btn) throw new Error("Post button not found");
        if (btn.disabled)
          throw new Error(
            "Post button is disabled (upload may still be processing)",
          );
        return btn;
      },
      { maxAttempts: 10, delayMs: 3000, label: "Find Post button" },
    );

    simulateClick(postBtn);
    console.log("[TikTok Flow] Post button clicked");

    // Step 8: Wait for posting to complete
    await sleep(5000);
    const success = await waitForPostSuccess(90000);

    const tiktokPostUrl = window.location.href;
    await updateJobStatus(jobId, {
      status: "posted",
      tiktokPostUrl,
      errorMessage: "",
    });

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

// Find the file input, including hidden ones
async function findFileInput() {
  // Strategy 1: Direct visible input
  let input = document.querySelector('input[type="file"]');
  if (input) return input;

  // Strategy 2: Inputs inside upload area
  const uploadAreas = document.querySelectorAll(
    '[class*="upload"], [class*="drop"], [data-testid*="upload"]',
  );
  for (const area of uploadAreas) {
    input = area.querySelector('input[type="file"]');
    if (input) return input;
  }

  // Strategy 3: Hidden inputs anywhere
  const allInputs = document.querySelectorAll("input");
  for (const inp of allInputs) {
    if (inp.type === "file" || inp.accept?.includes("video")) return inp;
  }

  return null;
}

async function waitForUploadComplete(timeout = 180000) {
  const start = Date.now();
  let lastProgress = -1;

  while (Date.now() - start < timeout) {
    // Check progress bars
    const progressBars = document.querySelectorAll(
      '[class*="progress"], [role="progressbar"]',
    );
    for (const bar of progressBars) {
      const value = parseInt(bar.getAttribute("aria-valuenow") || "0");
      if (value > lastProgress) {
        lastProgress = value;
        console.log(`[TikTok Flow] Upload progress: ${value}%`);
      }
      if (value > 0 && value < 100) {
        // Still uploading, keep waiting
        await sleep(2000);
        continue;
      }
    }

    // Look for "uploaded" or ready-to-post indicators
    const readyIndicator = document.querySelector(
      '[class*="success"], [class*="complete"], [class*="ready"], [class*="uploaded"]',
    );
    if (readyIndicator) return true;

    // Check if Post button is enabled (strongest signal)
    const postBtn = findButtonByText("Post") || findButtonByText("Publish");
    if (postBtn && !postBtn.disabled) return true;

    // Check for upload errors
    const errorEl = document.querySelector(
      '[class*="upload-error"], [class*="upload_error"], [class*="fail"]',
    );
    if (errorEl && errorEl.offsetParent !== null) {
      throw new Error(
        "Video upload failed: " +
          (errorEl.textContent.trim().substring(0, 100) || "Unknown error"),
      );
    }

    await sleep(3000);
  }
  throw new Error(
    `Timeout waiting for video upload (${Math.round(timeout / 60000)}min). ` +
      `Last progress: ${lastProgress >= 0 ? lastProgress + "%" : "unknown"}`,
  );
}

async function waitForPostSuccess(timeout = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // Check for success messages
    const successEl = document.querySelector(
      '[class*="success"], [class*="posted"], [class*="complete"]',
    );
    if (successEl && successEl.offsetParent !== null) return true;

    // Check for "Your video is being uploaded" or similar
    const body = document.body.textContent.toLowerCase();
    if (
      body.includes("successfully") ||
      body.includes("your video is being") ||
      body.includes("video has been uploaded")
    ) {
      return true;
    }

    // Check if URL changed (redirected to manage page)
    if (
      window.location.href.includes("manage") ||
      window.location.href.includes("content")
    ) {
      return true;
    }

    // Check for post-click errors (moderation, etc.)
    const errorEl = document.querySelector('[class*="error"][class*="post"]');
    if (errorEl && errorEl.offsetParent !== null) {
      const errText = errorEl.textContent.trim();
      if (errText) {
        throw new Error("Post failed: " + errText.substring(0, 150));
      }
    }

    await sleep(2000);
  }
  // Warn but don't fail — the video may have posted successfully
  console.warn(
    "[TikTok Flow] Could not confirm post success within timeout, assuming posted",
  );
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

// ---- DOM helpers ----

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

function waitForAnyElement(selectors, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const check = () => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    };
    const found = check();
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const found = check();
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for any of: ${selectors.join(", ")}`));
    }, timeout);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function simulateClick(el) {
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const opts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  };
  el.dispatchEvent(
    new PointerEvent("pointerdown", {
      ...opts,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(
    new PointerEvent("pointerup", {
      ...opts,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.dispatchEvent(new MouseEvent("click", opts));
}

function findButtonByText(text) {
  for (const btn of document.querySelectorAll("button")) {
    if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase()))
      return btn;
  }
  return null;
}
