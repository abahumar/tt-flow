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

    case "TEST_ACTION":
      handleTestAction(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "PING":
      sendResponse({ status: "alive", url: window.location.href });
      return true;
  }
});

// ---- Test Action Handler (for debugging individual steps) ----
async function handleTestAction({ action }) {
  console.log("[TikTok Flow] TEST_ACTION:", action);

  switch (action) {
    case "product_link":
      await addProductAnchor(
        "Test Product Name",
        "https://www.tiktok.com/view/product/1734236593742775581",
        "Test Clean Product",
        "Review Test Clean Product — worth it sangat! Harga cuma RM29.90. Cuba sekarang! #fyp #tiktokshop",
      );
      return { message: "Product link test complete" };

    case "fill_product_info": {
      // Test product name/description fill using real data from the current job
      // User should manually navigate to "Add product links" page first
      let testName = "";
      let testDesc = "";
      try {
        const res = await fetch(`${API_BASE}/jobs`);
        const jobs = await res.json();
        const activeJob = jobs.find((j) =>
          ["ready", "posting", "generating_video"].includes(j.status),
        );
        if (activeJob) {
          testName = activeJob.tiktokProductName || "";
          testDesc = activeJob.tiktokDescription || "";
          console.log(
            "[TikTok Flow] Using real job data:",
            activeJob.id?.substring(0, 12),
            "name:",
            testName,
            "desc:",
            testDesc?.substring(0, 60),
          );
        } else {
          console.warn("[TikTok Flow] No active job found, using first job");
          if (jobs.length > 0) {
            testName = jobs[0].tiktokProductName || "";
            testDesc = jobs[0].tiktokDescription || "";
          }
        }
      } catch (err) {
        console.error("[TikTok Flow] Failed to fetch job data:", err);
      }
      if (!testName && !testDesc) {
        return { error: "No job data found. Create a job first." };
      }
      console.log("[TikTok Flow] Testing fill product info with real data...");
      const result = await fillProductFields(testName, testDesc);
      return {
        message: `Fill: name=${result.nameOk} [${testName?.substring(0, 20)}], desc=${result.descOk}. Check console.`,
      };
    }

    case "ai_toggle":
      await toggleSettings();
      return { message: "AI toggle test complete" };

    case "fill_caption": {
      // Test filling the main caption (DraftJS editor) on the upload page
      let testCaption = "";
      let testHashtags = [];
      try {
        const res = await fetch(`${API_BASE}/jobs`);
        const jobs = await res.json();
        const job =
          jobs.find((j) =>
            ["ready", "posting", "generating_video"].includes(j.status),
          ) || jobs[0];
        if (job) {
          testCaption = job.tiktokCaption || "";
          testHashtags = job.tiktokHashtags || [];
          console.log(
            "[TikTok Flow] Caption from job:",
            testCaption?.substring(0, 60),
            "hashtags:",
            testHashtags,
          );
        }
      } catch (err) {
        console.error("[TikTok Flow] Failed to fetch job:", err);
      }
      if (!testCaption) {
        return { error: "No caption data in job. Create a job first." };
      }

      // Find the DraftJS caption editor
      const captionEditor =
        document.querySelector(
          'div.caption-editor div[contenteditable="true"]',
        ) ||
        document.querySelector(
          'div[role="combobox"][contenteditable="true"]',
        ) ||
        document.querySelector("div.notranslate.public-DraftEditor-content") ||
        document.querySelector(
          "div.DraftEditor-editorContainer div[contenteditable]",
        ) ||
        document.querySelector('div[class*="caption"] div[contenteditable]') ||
        document.querySelector('div[role="textbox"]');

      if (!captionEditor) {
        // Debug: show what's on the page
        const allCE = document.querySelectorAll("[contenteditable]");
        const allTextbox = document.querySelectorAll(
          '[role="textbox"], [role="combobox"]',
        );
        console.log(
          "[TikTok Flow] No caption editor found. contenteditable:",
          allCE.length,
          "textbox roles:",
          allTextbox.length,
        );
        allCE.forEach((el, i) =>
          console.log(
            `[TikTok Flow]   CE[${i}]:`,
            el.tagName,
            el.className?.substring(0, 60),
          ),
        );
        allTextbox.forEach((el, i) =>
          console.log(
            `[TikTok Flow]   TB[${i}]:`,
            el.tagName,
            el.className?.substring(0, 60),
          ),
        );
        return {
          error: "Caption editor not found. Are you on the upload page?",
        };
      }

      // Fill it
      simulateClick(captionEditor);
      await sleep(500);
      document.execCommand("selectAll", false);
      await sleep(200);
      document.execCommand("delete", false);
      await sleep(300);
      const hashtagStr = (testHashtags || []).map((h) => `#${h}`).join(" ");
      const fullCaption = `${testCaption} ${hashtagStr}`.trim();
      document.execCommand("insertText", false, fullCaption);
      await sleep(500);

      console.log(
        "[TikTok Flow] Caption filled:",
        fullCaption.substring(0, 80),
      );
      return {
        message: `Caption filled: "${fullCaption.substring(0, 50)}..."`,
      };
    }

    case "save_draft": {
      const draftBtn =
        findButtonByText("Save draft") || findButtonByText("Save Draft");
      if (!draftBtn) return { error: "Save draft button not found" };
      simulateClick(draftBtn);
      return { message: "Save draft clicked" };
    }

    case "scan_dom": {
      // Deep DOM scan of the modal to identify all form-like elements
      const modal =
        document.querySelector(".common-modal") ||
        document.querySelector(".TUXModal") ||
        document.querySelector('[role="dialog"]');
      if (!modal) return { error: "No modal found on page" };

      const allElements = modal.querySelectorAll("*");
      const formElements = [];
      const interactiveElements = [];

      allElements.forEach((el) => {
        const tag = el.tagName;
        const cls = el.className?.toString()?.substring(0, 80) || "";
        const role = el.getAttribute("role") || "";
        const ce = el.getAttribute("contenteditable");
        const tabIndex = el.getAttribute("tabindex");
        const placeholder = el.getAttribute("placeholder") || "";
        const dataE2e = el.getAttribute("data-e2e") || "";

        // Log form elements
        if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
          formElements.push({
            tag,
            type: el.type,
            cls,
            placeholder,
            value: el.value?.substring(0, 30),
          });
        }
        // Log contenteditable
        if (ce === "true" || ce === "") {
          formElements.push({
            tag,
            cls,
            contenteditable: true,
            text: el.textContent?.substring(0, 30),
          });
        }
        // Log elements with textbox role
        if (role === "textbox" || role === "combobox") {
          interactiveElements.push({
            tag,
            cls,
            role,
            text: el.textContent?.substring(0, 30),
          });
        }
        // Log elements with tabindex (interactive)
        if (tabIndex !== null && ["DIV", "SPAN", "P"].includes(tag)) {
          interactiveElements.push({ tag, cls, tabIndex, role, dataE2e });
        }
        // Log class-based clues for text input areas
        if (
          cls.includes("TextArea") ||
          cls.includes("textarea") ||
          cls.includes("Description") ||
          cls.includes("description") ||
          cls.includes("editor") ||
          cls.includes("Editor")
        ) {
          interactiveElements.push({
            tag,
            cls: cls.substring(0, 100),
            role,
            placeholder,
          });
        }
      });

      console.log("[TikTok Flow] === DOM SCAN RESULTS ===");
      console.log("[TikTok Flow] Total elements in modal:", allElements.length);
      console.log(
        "[TikTok Flow] Form elements:",
        JSON.stringify(formElements, null, 2),
      );
      console.log(
        "[TikTok Flow] Interactive elements:",
        JSON.stringify(interactiveElements, null, 2),
      );

      // Also scan immediate children structure (first 3 levels deep)
      const structure = [];
      function scanTree(el, depth) {
        if (depth > 3) return;
        const kids = el.children;
        for (let i = 0; i < kids.length && i < 20; i++) {
          const child = kids[i];
          const cls = child.className?.toString()?.substring(0, 60) || "";
          if (
            cls &&
            (cls.includes("TUX") ||
              cls.includes("product") ||
              cls.includes("Product") ||
              cls.includes("description") ||
              cls.includes("Description") ||
              cls.includes("form") ||
              cls.includes("Form") ||
              cls.includes("field") ||
              cls.includes("Field"))
          ) {
            structure.push(
              "  ".repeat(depth) + `<${child.tagName} class="${cls}">`,
            );
            scanTree(child, depth + 1);
          }
        }
      }
      scanTree(modal, 0);
      console.log("[TikTok Flow] Key structure:\n" + structure.join("\n"));

      return {
        message: `Scan: ${allElements.length} elements, ${formElements.length} form elements, ${interactiveElements.length} interactive. Check console for full details.`,
      };
    }

    case "full_post":
      // Run all steps: product link → AI toggle → save draft
      console.log("[TikTok Flow] Running full post test...");
      try {
        await addProductAnchor(
          "Test Product Name",
          "https://www.tiktok.com/view/product/1734236593742775581",
          "Test Clean Product",
          "Review Test Clean Product — worth it sangat! Harga cuma RM29.90. Cuba sekarang! #fyp #tiktokshop",
        );
        console.log("[TikTok Flow] ✓ Product link done");
      } catch (e) {
        console.warn("[TikTok Flow] Product link failed:", e.message);
      }
      try {
        await toggleSettings();
        console.log("[TikTok Flow] ✓ AI toggle done");
      } catch (e) {
        console.warn("[TikTok Flow] AI toggle failed:", e.message);
      }
      await sleep(1000);
      const btn =
        findButtonByText("Save draft") || findButtonByText("Save Draft");
      if (btn) {
        simulateClick(btn);
        console.log("[TikTok Flow] ✓ Save draft clicked");
      }
      return { message: "Full post test complete" };

    default:
      return { error: "Unknown test action: " + action };
  }
}

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

async function postVideo({
  jobId,
  videoUrl,
  videoBase64,
  caption,
  hashtags,
  productName,
  productUrl,
  tiktokProductName,
  tiktokDescription,
}) {
  console.log("[TikTok Flow] Starting TikTok posting for job:", jobId);

  try {
    // Verify we're on TikTok Studio
    if (!window.location.href.includes("tiktokstudio")) {
      throw new Error(
        "Not on TikTok Studio page. Navigate to tiktok.com/tiktokstudio/upload first.",
      );
    }

    // Step 1: Ensure we're on the upload page
    if (!window.location.href.includes("/upload")) {
      // Navigate to upload page — click Upload button if on content page
      const uploadBtn = findButtonByText("Upload");
      if (uploadBtn) {
        simulateClick(uploadBtn);
        await sleep(3000);
      } else {
        window.location.href =
          "https://www.tiktok.com/tiktokstudio/upload?from=creator_center";
        await sleep(5000);
      }
    }

    await updateJobStatus(jobId, {
      status: "posting",
      errorMessage: "Waiting for upload page...",
    });

    // Wait for upload page to fully load
    await waitForAnyElement(
      [
        'input[type="file"]',
        '[class*="upload"]',
        "div.upload-stage-container",
        "button.upload-stage-btn",
      ],
      15000,
    );
    await sleep(2000);

    // Step 2: Upload the video file
    if (videoBase64 || videoUrl) {
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

      // Convert base64 data (from background.js) or fetch URL to a File
      let blob;
      if (videoBase64) {
        // Video was pre-fetched by background.js to bypass CORS/CSP
        try {
          const byteString = atob(videoBase64.split(",")[1]);
          const mimeType = videoBase64
            .split(",")[0]
            .split(":")[1]
            .split(";")[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          blob = new Blob([ab], { type: mimeType || "video/mp4" });
          console.log(
            `[TikTok Flow] Using base64 video data (${(blob.size / 1024 / 1024).toFixed(1)}MB)`,
          );
        } catch (b64Err) {
          throw new Error(`Failed to decode base64 video: ${b64Err.message}`);
        }
      } else {
        // Fallback: try fetching URL directly (may fail due to CORS/CSP)
        try {
          const response = await fetch(videoUrl);
          if (!response.ok) {
            throw new Error(`Video fetch failed: HTTP ${response.status}`);
          }
          blob = await response.blob();
        } catch (fetchErr) {
          throw new Error(
            `Could not download video: ${fetchErr.message}. Try restarting the job.`,
          );
        }
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

    // Step 4: Fill in caption (DraftJS editor)
    if (caption) {
      await updateJobStatus(jobId, {
        status: "posting",
        errorMessage: "Filling caption...",
      });

      await withRetry(
        async () => {
          // The caption area uses DraftJS — look for the contenteditable div
          const captionEditor = await waitForAnyElement(
            [
              'div.caption-editor div[contenteditable="true"]',
              'div[role="combobox"][contenteditable="true"]',
              "div.notranslate.public-DraftEditor-content",
              "div.DraftEditor-editorContainer div[contenteditable]",
              'div[class*="caption"] div[contenteditable]',
              'div[role="textbox"]',
            ],
            10000,
          );

          // Click to focus the editor
          simulateClick(captionEditor);
          await sleep(500);

          // Select all existing text (auto-filled from filename)
          document.execCommand("selectAll", false);
          await sleep(200);

          // Delete existing content
          document.execCommand("delete", false);
          await sleep(300);

          // Build the full caption with hashtags
          const hashtagStr = (hashtags || []).map((h) => `#${h}`).join(" ");
          const fullCaption = `${caption} ${hashtagStr}`.trim();

          // Insert the new caption text
          document.execCommand("insertText", false, fullCaption);
          await sleep(1000);

          console.log(
            "[TikTok Flow] Caption filled:",
            fullCaption.substring(0, 80),
          );
        },
        { maxAttempts: 3, delayMs: 2000, label: "Fill caption" },
      );
    }

    // Step 5: Add product anchor/link
    if (productName || productUrl) {
      await updateJobStatus(jobId, {
        status: "posting",
        errorMessage: "Adding product link...",
      });

      try {
        await addProductAnchor(
          productName,
          productUrl,
          tiktokProductName,
          tiktokDescription,
        );
        console.log("[TikTok Flow] Product anchor completed, continuing...");
      } catch (anchorErr) {
        console.warn(
          "[TikTok Flow] Product anchor failed (non-fatal):",
          anchorErr.message,
        );
        // Ensure any leftover modal is closed before continuing
        const closeBtn = document.querySelector(
          ".common-modal-footer .TUXButton-label",
        );
        if (closeBtn && closeBtn.textContent.trim() === "Cancel") {
          simulateClick(closeBtn.closest("button"));
          await sleep(2000);
        }
      }
    }

    // Ensure no modal is blocking before proceeding
    await sleep(1000);
    const modalStillOpen = document.querySelector(
      ".TUXModal.common-modal, .common-modal-footer",
    );
    if (modalStillOpen) {
      console.warn(
        "[TikTok Flow] Modal still open, waiting for it to close...",
      );
      for (let i = 0; i < 10; i++) {
        if (
          !document.querySelector(
            ".TUXModal.common-modal, .common-modal-footer",
          )
        )
          break;
        await sleep(1000);
      }
    }

    // Step 6: Toggle AI-generated content and settings
    await updateJobStatus(jobId, {
      status: "posting",
      errorMessage: "Configuring settings...",
    });

    try {
      await toggleSettings();
    } catch (toggleErr) {
      console.warn(
        "[TikTok Flow] Settings toggle failed (non-fatal):",
        toggleErr.message,
      );
    }

    // Step 7: Handle "Turn on automatic content checks" dialog
    await sleep(2000);
    const cancelBtn = findButtonByText("Cancel");
    if (cancelBtn) {
      simulateClick(cancelBtn);
      await sleep(1000);
    }

    // Step 8: Click "Save draft" button (from recording Step 25)
    // Located in div.footer > div.button-group
    await updateJobStatus(jobId, {
      status: "posting",
      errorMessage: "Saving as draft...",
    });

    const draftBtn = await withRetry(
      () => {
        const btn =
          findButtonByText("Save draft") || findButtonByText("Save Draft");
        if (!btn) throw new Error("Save draft button not found");
        if (btn.disabled)
          throw new Error(
            "Save draft button is disabled (upload may still be processing)",
          );
        return btn;
      },
      { maxAttempts: 10, delayMs: 3000, label: "Find Save draft button" },
    );

    simulateClick(draftBtn);
    console.log("[TikTok Flow] Save draft button clicked");

    // Mark as posted IMMEDIATELY after clicking Save draft, before the page
    // redirects to content?tab=draft (which kills this content script).
    // The redirect itself is confirmation that the draft was saved.
    const tiktokPostUrl = window.location.href;
    await updateJobStatus(jobId, {
      status: "posted",
      tiktokPostUrl,
      errorMessage: "",
    });

    // Notify background.js that posting is complete
    try {
      chrome.runtime.sendMessage({
        type: "JOB_PHASE_COMPLETE",
        payload: { jobId, phase: "posting", nextStatus: "posted" },
      });
    } catch (e) {
      // Message port may already be closed if page is navigating — safe to ignore
      console.warn(
        "[TikTok Flow] Could not send JOB_PHASE_COMPLETE (page may be navigating):",
        e.message,
      );
    }

    console.log("[TikTok Flow] Successfully saved draft to TikTok");
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

// ---- Add Product Anchor (from recording) ----
// Click "Add" in anchor section → Next → search by product ID → select radio → Next → Add
async function addProductAnchor(
  productName,
  productUrl,
  tiktokProductName,
  tiktokDescription,
) {
  console.log(
    "[TikTok Flow] Adding product anchor for:",
    productName,
    productUrl,
    "| TikTok name:",
    tiktokProductName,
  );

  // Extract numeric product ID from URL (e.g. 1734236593742775581)
  let productId = "";
  if (productUrl) {
    const idMatch = productUrl.match(/(\d{10,})/);
    if (idMatch) productId = idMatch[1];
  }
  console.log("[TikTok Flow] Product ID:", productId);

  // Blur any currently focused element first to prevent typing into caption
  if (document.activeElement) {
    document.activeElement.blur();
  }
  await sleep(300);

  // Step 1: Click "Add" button ONLY inside anchor-entry/anchor-tag container
  const anchorContainer = document.querySelector(
    "div.anchor-entry-container, div.anchor-tag-container",
  );
  let anchorAddBtn = null;
  if (anchorContainer) {
    anchorAddBtn = anchorContainer.querySelector("button");
  }
  if (!anchorAddBtn) {
    anchorAddBtn = Array.from(document.querySelectorAll("button")).find(
      (btn) => {
        if (btn.textContent.trim() !== "Add") return false;
        if (btn.closest('[class*="caption"]')) return false;
        if (btn.closest('[class*="description"]')) return false;
        if (btn.closest("[contenteditable]")) return false;
        if (btn.closest(".DraftEditor-root")) return false;
        const card = btn.closest("div.card");
        return card && card.querySelector("[class*='anchor']");
      },
    );
  }
  if (!anchorAddBtn)
    throw new Error("Add anchor button not found in anchor section");
  simulateClick(anchorAddBtn);
  console.log("[TikTok Flow] Clicked Add in anchor section");
  await sleep(2000);

  // Wait for the anchor modal to appear
  let modal = null;
  for (let i = 0; i < 10; i++) {
    modal = document.querySelector(
      "div.anchor-modal, .TUXModal, .common-modal",
    );
    if (modal) break;
    await sleep(500);
  }
  if (!modal) {
    console.warn("[TikTok Flow] Modal not found, using document scope");
    modal = document;
  }
  console.log("[TikTok Flow] Modal found:", modal.className?.substring(0, 50));

  // Step 2: Combobox should default to "Products" — verify (inside modal)
  const combobox = modal.querySelector('[role="combobox"]');
  if (combobox) {
    const comboText = combobox.textContent.trim().toLowerCase();
    if (!comboText.includes("product")) {
      simulateClick(combobox);
      await sleep(1000);
      const productOption = Array.from(
        document.querySelectorAll('[role="option"], li'),
      ).find((el) => el.textContent.trim().toLowerCase().includes("product"));
      if (productOption) {
        simulateClick(productOption);
        await sleep(1500);
      }
    }
  }

  // Step 3: Click "Next" button inside the modal
  let nextBtn = findButtonInContainer(modal, "Next");
  if (nextBtn) {
    simulateClick(nextBtn);
    console.log("[TikTok Flow] Clicked first Next");
    await sleep(3000);
  }

  // Re-find modal (it may have changed/re-rendered)
  modal =
    document.querySelector(".TUXModal.common-modal") ||
    document.querySelector(".TUXModal") ||
    document.querySelector(".common-modal") ||
    document;

  // Step 4: Select the first/top product radio button (no search needed)
  // Wait for radio buttons to load in the product list
  let radioSelected = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const allRadios = Array.from(
      document.querySelectorAll('input[type="radio"]'),
    );
    // Filter to only radios inside a modal/dialog
    const modalRadios = allRadios.filter(
      (r) =>
        r.closest(".TUXModal") ||
        r.closest(".common-modal") ||
        r.closest('[role="dialog"]'),
    );
    const radioInputs = modalRadios.length > 0 ? modalRadios : allRadios;

    if (radioInputs.length > 0) {
      const selectedRadio = radioInputs[0];
      const clickTarget =
        selectedRadio.closest("label") ||
        selectedRadio.closest("tr") ||
        selectedRadio.closest('[class*="radio"]') ||
        selectedRadio.closest('[class*="Radio"]') ||
        selectedRadio.closest('[class*="item"]') ||
        selectedRadio.parentElement;
      simulateClick(clickTarget || selectedRadio);
      await sleep(200);
      selectedRadio.checked = true;
      selectedRadio.dispatchEvent(new Event("change", { bubbles: true }));
      selectedRadio.dispatchEvent(new Event("click", { bubbles: true }));
      radioSelected = true;
      console.log(
        "[TikTok Flow] Selected first product radio. Total found:",
        radioInputs.length,
      );
      await sleep(1000);
      break;
    }
    console.log(
      "[TikTok Flow] Waiting for product radio buttons...",
      attempt + 1,
    );
    await sleep(1000);
  }

  if (!radioSelected) {
    console.warn("[TikTok Flow] No product radio buttons found");
  }

  // Step 5: Click "Next" — wait for it to become enabled after radio selection
  let nextClicked = false;
  for (let i = 0; i < 20; i++) {
    const footer = document.querySelector(".common-modal-footer");
    if (footer) {
      const labels = footer.querySelectorAll(".TUXButton-label");
      for (const label of labels) {
        if (label.textContent.trim() === "Next") {
          const btn = label.closest("button");
          const isDisabled =
            btn?.getAttribute("aria-disabled") === "true" || btn?.disabled;
          if (btn && !isDisabled) {
            simulateClick(btn);
            console.log("[TikTok Flow] Clicked second Next");
            nextClicked = true;
            break;
          } else {
            console.log(
              "[TikTok Flow] Next button found but disabled, waiting...",
              i + 1,
            );
          }
        }
      }
    }
    if (nextClicked) {
      await sleep(2000);
      break;
    }
    await sleep(500);
  }
  if (!nextClicked) {
    console.warn("[TikTok Flow] Could not click second Next button");
  }

  // Step 6: Fill in Product Name and Description fields
  // After second Next, we're on the "Add product links" page with Product Name + Description fields
  await sleep(2000);

  const fillResult = await fillProductFields(
    tiktokProductName,
    tiktokDescription,
  );
  console.log("[TikTok Flow] Product fields fill result:", fillResult);

  // Step 7: Click "Add" in modal footer
  // Use same approach: find via common-modal-footer > TUXButton-label
  let addClicked = false;
  for (let i = 0; i < 10; i++) {
    const footer = document.querySelector(".common-modal-footer");
    if (footer) {
      const labels = footer.querySelectorAll(".TUXButton-label");
      for (const label of labels) {
        if (label.textContent.trim() === "Add") {
          const btn = label.closest("button");
          if (btn && btn.getAttribute("aria-disabled") !== "true") {
            simulateClick(btn);
            console.log(
              "[TikTok Flow] Clicked Add in product modal (via footer label)",
            );
            addClicked = true;
            break;
          }
        }
      }
    }
    if (addClicked) {
      await sleep(2000);
      break;
    }
    await sleep(500);
  }
  if (!addClicked) {
    console.warn("[TikTok Flow] Could not find Add button in modal");
  }

  // Wait for the modal to close before returning
  for (let i = 0; i < 15; i++) {
    const modalStillOpen = document.querySelector(
      ".TUXModal.common-modal, .common-modal-footer",
    );
    if (!modalStillOpen) {
      console.log("[TikTok Flow] Product modal closed");
      break;
    }
    console.log("[TikTok Flow] Waiting for product modal to close...", i + 1);
    await sleep(1000);
  }
  await sleep(1000);
}

// ---- Fill Product Name & Description on "Add product links" page ----
async function fillProductFields(productName, description) {
  const result = { nameOk: false, descOk: false };

  // The TUXModal scope has 0 direct inputs — TUX components render inputs deep in the tree.
  // Search globally within document for inputs inside the modal subtree.
  const doc = document;

  // Debug: Log ALL TUXTextInputCore and TUXTextArea elements on the page
  const tuxInputs = doc.querySelectorAll(
    '.TUXTextInputCore-input, [class*="TUXTextInput"] input, [class*="TextInput"] input',
  );
  const tuxTextareas = doc.querySelectorAll(
    '.TUXTextArea-textarea, [class*="TUXTextArea"] textarea, [class*="TextArea"] textarea',
  );
  const allInputs = doc.querySelectorAll(
    ".common-modal input, .TUXModal input",
  );
  const allTextareas = doc.querySelectorAll(
    ".common-modal textarea, .TUXModal textarea",
  );

  console.log(
    "[TikTok Flow] TUX inputs:",
    tuxInputs.length,
    "TUX textareas:",
    tuxTextareas.length,
  );
  console.log(
    "[TikTok Flow] Modal inputs:",
    allInputs.length,
    "Modal textareas:",
    allTextareas.length,
  );

  tuxInputs.forEach((inp, idx) => {
    console.log(
      `[TikTok Flow]   tuxInput[${idx}]: class="${inp.className?.substring(0, 50)}", value="${inp.value?.substring(0, 40)}"`,
    );
  });
  tuxTextareas.forEach((ta, idx) => {
    console.log(
      `[TikTok Flow]   tuxTextarea[${idx}]: class="${ta.className?.substring(0, 50)}", value="${ta.value?.substring(0, 40)}"`,
    );
  });
  allInputs.forEach((inp, idx) => {
    console.log(
      `[TikTok Flow]   modalInput[${idx}]: type=${inp.type}, class="${inp.className?.substring(0, 50)}", value="${inp.value?.substring(0, 40)}"`,
    );
  });
  allTextareas.forEach((ta, idx) => {
    console.log(
      `[TikTok Flow]   modalTextarea[${idx}]: class="${ta.className?.substring(0, 50)}", value="${ta.value?.substring(0, 40)}"`,
    );
  });

  // Fill Product Name (max 30 chars)
  if (productName) {
    // Find the input: prioritize TUXTextInputCore-input inside a modal
    let nameInput =
      doc.querySelector(".common-modal .TUXTextInputCore-input") ||
      doc.querySelector(".TUXModal .TUXTextInputCore-input") ||
      doc.querySelector('.common-modal input[type="text"]') ||
      doc.querySelector('.TUXModal input[type="text"]') ||
      doc.querySelector(
        '.common-modal input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="file"])',
      ) ||
      doc.querySelector(
        '.TUXModal input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="file"])',
      );

    if (nameInput) {
      console.log(
        "[TikTok Flow] Found product name input:",
        nameInput.tagName,
        nameInput.type,
        nameInput.className?.substring(0, 50),
      );
      nameInput.focus();
      await sleep(200);
      // Select all and delete existing content
      nameInput.select();
      document.execCommand("selectAll", false);
      document.execCommand("delete", false);
      await sleep(200);
      // Insert text (React-compatible)
      document.execCommand("insertText", false, productName.substring(0, 30));
      await sleep(300);
      // Native setter as backup for React controlled inputs
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(nameInput, productName.substring(0, 30));
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      console.log(
        "[TikTok Flow] Filled product name:",
        productName.substring(0, 30),
      );
      result.nameOk = true;
      nameInput.blur();
      await sleep(500);
    } else {
      console.warn("[TikTok Flow] Product name input NOT FOUND");
    }
  }

  // Fill Description
  if (description) {
    // Find textarea: TUXTextArea-textarea or standard textarea inside modal
    let descField =
      doc.querySelector(".common-modal .TUXTextArea-textarea") ||
      doc.querySelector(".TUXModal .TUXTextArea-textarea") ||
      doc.querySelector(".common-modal textarea") ||
      doc.querySelector(".TUXModal textarea");

    // Fallback: if only 1 input was found for product name, try the second input
    if (!descField) {
      const modalInputs = doc.querySelectorAll(
        '.common-modal input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="file"]), .TUXModal input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="file"])',
      );
      if (modalInputs.length >= 2) {
        descField = modalInputs[1]; // Second input might be description
        console.log("[TikTok Flow] Using second input as description field");
      }
    }

    // Fallback: contenteditable div
    if (!descField) {
      descField =
        doc.querySelector('.common-modal [contenteditable="true"]') ||
        doc.querySelector('.TUXModal [contenteditable="true"]');
    }

    if (descField) {
      console.log(
        "[TikTok Flow] Found description field:",
        descField.tagName,
        descField.className?.substring(0, 50),
      );
      descField.focus();
      await sleep(200);

      if (descField.tagName === "TEXTAREA" || descField.tagName === "INPUT") {
        descField.select();
        document.execCommand("selectAll", false);
        document.execCommand("delete", false);
        await sleep(200);
        document.execCommand("insertText", false, description);
        await sleep(300);
        const proto =
          descField.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
          setter.call(descField, description);
          descField.dispatchEvent(new Event("input", { bubbles: true }));
          descField.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else {
        // contenteditable
        descField.textContent = "";
        document.execCommand("insertText", false, description);
      }
      console.log(
        "[TikTok Flow] Filled description:",
        description.substring(0, 60),
      );
      result.descOk = true;
      descField.blur();
      await sleep(500);
    } else {
      console.warn("[TikTok Flow] Description field NOT FOUND");
    }
  }

  return result;
}

// Find a button by exact text inside a specific container
function findButtonInContainer(container, text) {
  const buttons = container.querySelectorAll("button");
  for (const btn of buttons) {
    const label = btn.textContent.trim();
    if (label === text) return btn;
  }
  // Looser match
  for (const btn of buttons) {
    if (btn.textContent.trim().toLowerCase() === text.toLowerCase()) return btn;
  }
  return null;
}

// ---- Toggle AI-Generated Content & Settings (from recording Steps 19-23) ----
async function toggleSettings() {
  // Expand "Show more" if settings are collapsed
  const showMoreEl =
    document.querySelector("div.more-collapse.collapsed") ||
    Array.from(document.querySelectorAll("span, div")).find(
      (el) => el.textContent.trim().toLowerCase() === "show more",
    );
  if (showMoreEl) {
    simulateClick(showMoreEl);
    console.log("[TikTok Flow] Clicked Show more to expand settings");
    await sleep(1500);
  }

  // Find the AI-generated content container by exact data-e2e attribute
  const aigcContainer = document.querySelector(
    'div[data-e2e="aigc_container"]',
  );

  if (aigcContainer) {
    // Check if already enabled
    const switchContent = aigcContainer.querySelector(".Switch__content");
    if (switchContent) {
      const isChecked =
        switchContent.getAttribute("aria-checked") === "true" ||
        switchContent.getAttribute("data-state") === "checked";
      if (isChecked) {
        console.log("[TikTok Flow] AI-generated content already enabled");
        return;
      }
      // Click the Switch__content div (the clickable toggle area) — only once!
      simulateClick(switchContent);
      console.log("[TikTok Flow] Enabled AI-generated content toggle");
      await sleep(1000);
    } else {
      console.warn("[TikTok Flow] Switch__content not found in aigc_container");
    }
  } else {
    console.warn(
      "[TikTok Flow] Could not find aigc_container, trying fallback",
    );
    // Fallback: find by text
    const containers = document.querySelectorAll("div.container");
    for (const c of containers) {
      if (c.textContent.includes("AI-generated content")) {
        const sw = c.querySelector(".Switch__content");
        if (sw && sw.getAttribute("aria-checked") !== "true") {
          simulateClick(sw);
          console.log("[TikTok Flow] Enabled AI toggle via fallback");
        }
        break;
      }
    }
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

// Find a TUXButton by label text (TikTok's component library)
function findTUXButtonByText(text) {
  for (const btn of document.querySelectorAll("button.TUXButton")) {
    if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase()))
      return btn;
  }
  return null;
}

// Find a button inside a TUXModal / common-modal by text
function findTUXModalButtonByText(text) {
  const modals = document.querySelectorAll(
    ".TUXModal, .common-modal, [class*='modal'], [class*='Modal']",
  );
  for (const modal of modals) {
    for (const btn of modal.querySelectorAll("button")) {
      if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase()))
        return btn;
    }
  }
  return null;
}

// Wait for draft to be saved (page redirects to content?tab=draft)
async function waitForDraftSaved(timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    // Check if URL changed to draft/content page
    if (
      window.location.href.includes("tab=draft") ||
      window.location.href.includes("/content")
    ) {
      console.log(
        "[TikTok Flow] Draft save confirmed — redirected to:",
        window.location.href,
      );
      return true;
    }

    // Check for success toast/notification
    const body = document.body.textContent.toLowerCase();
    if (
      body.includes("saved") ||
      body.includes("draft") ||
      body.includes("successfully")
    ) {
      // Only if the URL also changed or a success element appears
      const successEl = document.querySelector(
        '[class*="success"], [class*="toast"], [class*="notification"]',
      );
      if (successEl && successEl.offsetParent !== null) {
        return true;
      }
    }

    await sleep(2000);
  }
  // Assume success if no error detected
  console.warn(
    "[TikTok Flow] Could not confirm draft saved within timeout, assuming success",
  );
  return true;
}
