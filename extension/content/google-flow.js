// Google Flow content script — automates image & video generation
// Target: https://labs.google/fx/tools/flow (Google's AI creative studio)
//
// Strategy: Discovery-based selectors with multiple fallback strategies.
// Google Flow is a React/Angular SPA — DOM changes frequently.
// We use ARIA roles, text content, and structural heuristics.

const API_BASE = "http://localhost:3000/api";

console.log(
  "[TikTok Flow] Google Flow content script loaded on:",
  window.location.href,
);

// ---- Retry utility for flaky DOM operations ----
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
        `[TikTok Flow] ${label || fn.name} attempt ${attempt}/${maxAttempts} failed:`,
        err.message,
      );
      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt); // linear backoff
      }
    }
  }
  throw lastError;
}

// ---- Check if we're on a valid Google Flow page ----
function verifyFlowPage() {
  const url = window.location.href;
  if (!url.includes("labs.google")) {
    throw new Error(
      "Not on Google Flow page. Navigate to https://labs.google/fx/tools/flow first.",
    );
  }
  return true;
}

// ---- Message listener ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case "GENERATE_IMAGE":
      generateImage(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GENERATE_IMAGE_ONLY":
      generateImageOnly(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GENERATE_VIDEO":
      generateVideo(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GENERATE_VIDEO_FROM_IMAGE":
      generateVideoFromImage(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "GENERATE_MULTI_SCENE":
      generateMultiScene(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "PING":
      sendResponse({ status: "alive", url: window.location.href });
      return true;

    case "INSPECT_DOM":
      console.log(
        "[TikTok Flow] INSPECT_DOM received, running inspectFlowUI...",
      );
      const inspectResult = inspectFlowUI();
      console.log(
        "[TikTok Flow] INSPECT_DOM result:",
        JSON.stringify(inspectResult).substring(0, 500),
      );
      sendResponse(inspectResult);
      return true;

    case "TEST_SELECT_MODEL":
      (async () => {
        try {
          const modelName = payload?.modelName || "Veo 3.1 - Fast";
          console.log("[TikTok Flow] TEST_SELECT_MODEL:", modelName);

          // Switch to Video mode (opens settings dropdown)
          let switched = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            switched = await switchToMode("video");
            if (switched) break;
            await sleep(1000);
          }
          // Set aspect ratio (dropdown still open)
          await selectTriggerOption("PORTRAIT", "9:16");
          await sleep(500);

          // Select model (dropdown still open — model button is inside it)
          const result = await trySelectModel(modelName);
          await sleep(500);

          // Close the settings dropdown
          await closeSettingsDropdown();

          sendResponse({
            message: result
              ? `Model selected: ${modelName}`
              : `Model not found: ${modelName}`,
          });
        } catch (err) {
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "OPEN_NEW_PROJECT":
      openNewProjectAndResetToImage()
        .then((result) => sendResponse({ success: result }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "TEST_GENERATE":
      testGenerate(
        payload?.prompt ||
          "A beautiful sunset over the ocean, photorealistic, 4K",
        payload?.productImages || [],
      )
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "TEST_VIDEO":
      testVideoGenerate(
        payload?.prompt ||
          "Smooth cinematic camera movement showcasing a product on a table, soft lighting, 9:16 vertical video",
      )
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "ANIMATE_IMAGE":
      animateGeneratedImage(payload?.prompt)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "TEST_FULL_FLOW":
      testFullFlow(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "START_RECORDER":
      startRecorder();
      sendResponse({ status: "recording" });
      return true;

    case "STOP_RECORDER":
      sendResponse({ events: stopRecorder() });
      return true;

    case "GET_RECORDING":
      sendResponse({ events: [...recordedEvents], recording: isRecording });
      return true;

    case "DIAGNOSE_MODE_SWITCH":
      diagnoseModeSwitch()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "TEST_SWITCH_IMAGE":
      testSwitchToImage()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "TEST_ADD_TO_PROMPT":
      testAddToPrompt(payload?.imageUrl)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
  }
});

// ---- Quick test: right-click uploaded reference image → "Add to Prompt" ----
// Assumes a reference image is already uploaded on the page.
// If imageUrl is provided, uploads it first; otherwise just does the right-click → Add to Prompt.
async function testAddToPrompt(imageUrl) {
  console.log("[TikTok Flow] === TEST ADD TO PROMPT ===");

  try {
    if (imageUrl) {
      // Upload first, then Add to Prompt
      console.log(
        "[TikTok Flow] Uploading image first:",
        imageUrl.substring(0, 80),
      );
      await uploadAndAddReferenceToPrompt(imageUrl);
    } else {
      // Just right-click existing reference image and Add to Prompt
      console.log(
        "[TikTok Flow] No imageUrl — right-clicking existing reference image...",
      );
      await clickAddToPromptOnReferenceImage();
    }

    return {
      success: true,
      message:
        "✅ Add to Prompt: right-clicked reference image → clicked 'Add to Prompt' in context menu.",
    };
  } catch (err) {
    console.error("[TikTok Flow] Test Add to Prompt failed:", err.message);
    return { error: err.message };
  }
}

// ---- Diagnose mode switch: dump everything about the current page ----
async function diagnoseModeSwitch() {
  const result = {
    url: window.location.href,
    timestamp: new Date().toISOString(),
    onCreationPage: isOnCreationPage(),
  };

  // 1. All buttons on the page with details
  const allBtns = document.querySelectorAll("button");
  result.totalButtons = allBtns.length;
  result.buttons = [];
  for (const btn of allBtns) {
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue; // skip hidden
    result.buttons.push({
      text: btn.textContent.trim().substring(0, 60),
      id: btn.id || null,
      ariaHaspopup: btn.getAttribute("aria-haspopup"),
      ariaSelected: btn.getAttribute("aria-selected"),
      dataState: btn.getAttribute("data-state"),
      role: btn.getAttribute("role"),
      classList: [...btn.classList].join(" ").substring(0, 80),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    });
  }

  // 2. Settings dropdown trigger search
  result.dropdownTrigger = null;
  const trigger = findSettingsDropdownTrigger();
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    result.dropdownTrigger = {
      text: trigger.textContent.trim().substring(0, 60),
      id: trigger.id,
      classList: [...trigger.classList].join(" ").substring(0, 80),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    };
  }

  // 3. Try opening dropdown and see what's inside
  const popup = await openSettingsDropdown();
  result.dropdownOpened = !!popup;
  if (popup) {
    const popupBtns = popup.querySelectorAll("button");
    result.dropdownButtons = [];
    for (const btn of popupBtns) {
      result.dropdownButtons.push({
        text: btn.textContent.trim().substring(0, 60),
        id: btn.id || null,
        classList: [...btn.classList].join(" ").substring(0, 80),
        dataState: btn.getAttribute("data-state"),
        role: btn.getAttribute("role"),
      });
    }
    result.dropdownHTML = popup.innerHTML.substring(0, 2000);
    await closeSettingsDropdown();
  }

  // 4. Prompt input
  const prompt = findPromptInput();
  result.promptFound = !!prompt;

  // 5. Radix elements
  result.radixElements = [];
  document.querySelectorAll("[id^='radix-']").forEach((el) => {
    result.radixElements.push({
      tag: el.tagName,
      id: el.id,
      text: el.textContent.trim().substring(0, 40),
    });
  });

  console.log(
    "[TikTok Flow] DIAGNOSE result:",
    JSON.stringify(result).substring(0, 3000),
  );
  return result;
}

// ---- Test: ONLY switch to Image mode (no prompt, no Create) ----
// Isolated test to verify the settings dropdown → Image tab switch works.
async function testSwitchToImage() {
  console.log("[TikTok Flow] === TEST SWITCH TO IMAGE ===");

  const steps = [];

  // Step 1: Find settings dropdown trigger
  const trigger = findSettingsDropdownTrigger();
  if (trigger) {
    steps.push({
      step: "Find trigger",
      ok: true,
      detail: trigger.textContent.trim().substring(0, 40),
    });
  } else {
    steps.push({
      step: "Find trigger",
      ok: false,
      detail:
        "NOT FOUND — no button with preset text (crop_*, x1, etc.) or aria-haspopup",
    });
    return { success: false, steps };
  }

  // Step 2: Open settings dropdown
  const popup = await openSettingsDropdown();
  if (popup) {
    const btns = popup.querySelectorAll("button");
    const btnTexts = [...btns]
      .map((b) => b.textContent.trim().substring(0, 30))
      .join(", ");
    steps.push({
      step: "Open dropdown",
      ok: true,
      detail: `${btns.length} buttons: ${btnTexts}`,
    });
  } else {
    steps.push({
      step: "Open dropdown",
      ok: false,
      detail: "Dropdown did NOT open after clicking trigger",
    });
    return { success: false, steps };
  }

  // Step 3: Find Image tab inside dropdown
  const allBtns = popup.querySelectorAll("button");
  let imageTab = null;
  for (const btn of allBtns) {
    if (btn.id && btn.id.endsWith("trigger-IMAGE")) {
      imageTab = btn;
      break;
    }
  }
  if (!imageTab) {
    // Try text match
    for (const btn of allBtns) {
      const text = btn.textContent.trim();
      if (text === "Image" || text === "imageImage" || text.endsWith("Image")) {
        imageTab = btn;
        break;
      }
    }
  }
  // Also search entire page
  if (!imageTab) {
    for (const btn of document.querySelectorAll("button")) {
      if (btn.id && btn.id.endsWith("trigger-IMAGE")) {
        imageTab = btn;
        break;
      }
    }
  }

  if (imageTab) {
    const state =
      imageTab.getAttribute("data-state") ||
      imageTab.getAttribute("aria-selected") ||
      "unknown";
    steps.push({
      step: "Find Image tab",
      ok: true,
      detail: `id=${imageTab.id}, state=${state}, text="${imageTab.textContent.trim().substring(0, 20)}"`,
    });
  } else {
    steps.push({
      step: "Find Image tab",
      ok: false,
      detail: "No button with id ending 'trigger-IMAGE' or text 'Image' found",
    });
    await closeSettingsDropdown();
    return { success: false, steps };
  }

  // Step 4: Click Image tab
  const stateBefore = imageTab.getAttribute("data-state");
  if (stateBefore === "active") {
    steps.push({
      step: "Click Image tab",
      ok: true,
      detail: "Already active — no click needed",
    });
  } else {
    simulateClick(imageTab);
    await sleep(500);
    const stateAfter = imageTab.getAttribute("data-state");
    steps.push({
      step: "Click Image tab",
      ok: true,
      detail: `Clicked! state: ${stateBefore} → ${stateAfter}`,
    });
  }

  // Step 5: Close dropdown
  await closeSettingsDropdown();
  steps.push({ step: "Close dropdown", ok: true, detail: "Done" });

  console.log(
    "[TikTok Flow] TEST SWITCH TO IMAGE result:",
    JSON.stringify(steps),
  );
  return { success: true, steps };
}

// ---- Open a new project and force-reset to Image mode ----
// Called by OPEN_NEW_PROJECT message handler. Ensures the creation page
// always starts in Image mode regardless of last-used settings.
async function openNewProjectAndResetToImage() {
  console.log(
    "[TikTok Flow] Opening new project and resetting to Image mode...",
  );

  const opened = await startNewProject("image");
  if (!opened) {
    throw new Error("Could not open creation interface.");
  }

  // The "New project" dropdown selection often fails silently.
  // Force Image mode via the settings dropdown as a reliable fallback.
  await sleep(1000);
  console.log("[TikTok Flow] Forcing Image mode via settings dropdown...");
  let switched = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    switched = await switchToMode("image");
    if (switched) break;
    console.log(
      "[TikTok Flow] Image mode switch attempt",
      attempt + 1,
      "failed, retrying...",
    );
    await sleep(1000);
  }
  if (!switched) {
    console.warn(
      "[TikTok Flow] Could not force Image mode after 3 attempts — may already be on it",
    );
  }
  await closeSettingsDropdown();
  console.log("[TikTok Flow] New project ready in Image mode");
  return true;
}

// ---- Always navigate to a fresh new project ----
// If already on creation page, go back to gallery first, then click New project.
async function navigateToNewProject(preferMode = "image") {
  console.log(
    "[TikTok Flow] Navigating to a fresh new project... (prefer:",
    preferMode + ")",
  );

  // If we're already on a creation/project page, go back to gallery
  if (isOnCreationPage()) {
    console.log(
      "[TikTok Flow] Already on creation page, going back to gallery...",
    );
    let wentBack = false;
    for (let backAttempt = 0; backAttempt < 3; backAttempt++) {
      const backBtn = findBackButton();
      if (backBtn) {
        simulateClick(backBtn);
        // Wait for gallery to load (creation page should disappear)
        for (let w = 0; w < 10; w++) {
          await sleep(1000);
          if (!isOnCreationPage()) {
            wentBack = true;
            break;
          }
        }
        if (wentBack) break;
        console.log(
          "[TikTok Flow] Still on creation page after back click, retry",
          backAttempt + 1,
        );
      } else {
        console.warn(
          "[TikTok Flow] Back button not found, retry",
          backAttempt + 1,
        );
        await sleep(2000);
      }
    }
    if (!wentBack) {
      // Last resort: use history.back() instead of location.href to avoid full reload
      console.warn("[TikTok Flow] Back button failed — using history.back()");
      window.history.back();
      for (let w = 0; w < 10; w++) {
        await sleep(1000);
        if (!isOnCreationPage()) break;
      }
      await sleep(2000);
    }
  }

  // Now we should be on gallery — click "New project" and select the right mode
  const opened = await startNewProject(preferMode);
  if (!opened) {
    throw new Error(
      "Could not open creation interface. Try clicking 'New project' manually.",
    );
  }
  return true;
}

// ---- Find back/home button to return to gallery ----
function findBackButton() {
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase();
    // Look for arrow_back icon (Material Symbol) or "Go back" / "Back" text
    if (
      text.includes("arrow_back") ||
      text.includes("go back") ||
      text.startsWith("back")
    ) {
      return btn;
    }
    // Also check aria-label
    const label = btn.getAttribute("aria-label")?.toLowerCase() || "";
    if (
      label.includes("back") ||
      label.includes("home") ||
      label.includes("gallery")
    ) {
      return btn;
    }
  }
  return null;
}

// ---- Navigate to creation interface ----
// Google Flow loads on a gallery/home view. Must click "New project" to get
// the creation UI with prompt input, tabs, and Create button.
async function startNewProject(preferMode = "image") {
  console.log(
    "[TikTok Flow] Looking for 'New project' button... (prefer mode:",
    preferMode + ")",
  );

  let newBtn = null;
  const allButtons = document.querySelectorAll("button");

  // Strategy 1: Button containing both "add_2" icon and "New project" text
  for (const btn of allButtons) {
    const text = btn.textContent.trim().toLowerCase();
    if (text.includes("new project")) {
      newBtn = btn;
      break;
    }
  }

  // Strategy 2: Button with add_2 icon text (Material Symbol for "+")
  if (!newBtn) {
    for (const btn of allButtons) {
      const text = btn.textContent.trim();
      if (text.includes("add_2")) {
        newBtn = btn;
        break;
      }
    }
  }

  // Strategy 3: removed — sc-* classes are unreliable across Google builds

  if (!newBtn) {
    console.warn("[TikTok Flow] 'New project' button not found");
    return false;
  }

  console.log(
    "[TikTok Flow] Clicking 'New project':",
    newBtn.textContent.trim().substring(0, 30),
    newBtn.className?.substring(0, 40),
  );
  simulateClick(newBtn);

  // After clicking "New project", a DropdownMenuContent appears
  // with Image and Video options. We must select the right one.
  // Retry detection several times since the dropdown may take time to render.
  let selectedFromDropdown = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(500);
    selectedFromDropdown = await selectNewProjectMode(preferMode);
    if (selectedFromDropdown) {
      console.log(
        "[TikTok Flow] Selected",
        preferMode,
        "from New Project dropdown",
      );
      break;
    }
    console.log(
      "[TikTok Flow] Dropdown not found yet, retry",
      attempt + 1,
      "of 6...",
    );
  }

  // Wait for the creation UI to load (contenteditable prompt should appear)
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const prompt = findPromptInput();
    if (prompt) {
      console.log("[TikTok Flow] Creation interface loaded");
      return true;
    }
  }

  console.warn(
    "[TikTok Flow] Creation interface did not load after clicking New project",
  );
  return false;
}

// ---- Select Image or Video from the "New project" dropdown ----
// When "New project" is clicked, a Radix DropdownMenuContent appears.
// When "New project" is clicked, a Radix DropdownMenuContent appears with Image and Video options.
async function selectNewProjectMode(mode = "image") {
  const targetText = mode === "image" ? "Image" : "Video";
  const iconPrefix = mode === "image" ? "image" : "videocam";

  // Strategy 1: Find by DropdownMenuContent class (app-level, stable)
  let dropdown = document.querySelector(".DropdownMenuContent");

  // Strategy 3: Radix dropdown attributes
  if (!dropdown) dropdown = document.querySelector("[data-radix-menu-content]");
  if (!dropdown)
    dropdown = document.querySelector(
      "[data-radix-popper-content-wrapper] > div",
    );

  // Strategy 4: role="menu"
  if (!dropdown) dropdown = document.querySelector('[role="menu"]');

  // Strategy 5: Any recently appeared floating div with Image/Video text
  if (!dropdown) {
    const allDivs = document.querySelectorAll("div");
    for (const div of allDivs) {
      const text = div.textContent.trim().toLowerCase();
      const rect = div.getBoundingClientRect();
      // Must contain both "image" and "video", be floating (position), reasonably small
      if (
        text.includes("image") &&
        text.includes("video") &&
        rect.width > 50 &&
        rect.width < 400 &&
        rect.height > 30 &&
        rect.height < 400
      ) {
        const style = window.getComputedStyle(div);
        // Floating/absolute/fixed positioned elements (dropdowns/popovers)
        if (
          style.position === "absolute" ||
          style.position === "fixed" ||
          div.id?.startsWith("radix-")
        ) {
          dropdown = div;
          break;
        }
      }
    }
  }

  if (!dropdown) {
    // Debug: Log any elements that contain both Image and Video text
    const candidates = [];
    document.querySelectorAll("div, ul, nav").forEach((el) => {
      const t = el.textContent.trim().toLowerCase();
      if (t.includes("image") && t.includes("video") && t.length < 200) {
        candidates.push({
          tag: el.tagName,
          id: el.id,
          class: el.className?.substring?.(0, 50),
          text: t.substring(0, 60),
        });
      }
    });
    if (candidates.length > 0) {
      console.log(
        "[TikTok Flow] Dropdown candidates found but not matched:",
        JSON.stringify(candidates.slice(0, 5)),
      );
    }
    return false;
  }

  console.log("[TikTok Flow] Dropdown found:", {
    tag: dropdown.tagName,
    id: dropdown.id,
    class: dropdown.className?.substring(0, 60),
    text: dropdown.textContent.trim().substring(0, 80),
  });

  // Find clickable items inside the dropdown
  const buttons = dropdown.querySelectorAll("button, [role='menuitem'], a");
  console.log("[TikTok Flow] Dropdown items found:", buttons.length);

  for (const btn of buttons) {
    const text = btn.textContent.trim();
    console.log(
      "[TikTok Flow]   Item:",
      JSON.stringify(text.substring(0, 40)),
      "tag:",
      btn.tagName,
      "class:",
      btn.className?.substring(0, 40),
    );

    // Match: starts with icon+label (e.g. "imageImage") or just label
    if (
      text.startsWith(iconPrefix + targetText) ||
      text.startsWith(targetText)
    ) {
      console.log(
        "[TikTok Flow] Clicking",
        mode,
        "option:",
        text.substring(0, 30),
      );
      simulateClick(btn);
      await sleep(500);
      return true;
    }
  }

  // Also try matching items by looking at inner text more loosely
  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase();
    if (text.includes(targetText.toLowerCase())) {
      // For "image" mode, make sure "video" doesn't come first in the text
      const imgIdx = text.indexOf("image");
      const vidIdx = text.indexOf("video");
      if (mode === "image" && imgIdx >= 0 && (vidIdx < 0 || imgIdx < vidIdx)) {
        console.log(
          "[TikTok Flow] Clicking",
          mode,
          "option (loose match):",
          btn.textContent.trim().substring(0, 30),
        );
        simulateClick(btn);
        await sleep(500);
        return true;
      }
      if (mode === "video" && vidIdx >= 0 && (imgIdx < 0 || vidIdx < imgIdx)) {
        console.log(
          "[TikTok Flow] Clicking",
          mode,
          "option (loose match):",
          btn.textContent.trim().substring(0, 30),
        );
        simulateClick(btn);
        await sleep(500);
        return true;
      }
    }
  }

  // Fallback: first button = Image, second = Video
  if (buttons.length >= 2) {
    const idx = mode === "image" ? 0 : 1;
    console.log("[TikTok Flow] Fallback: clicking dropdown item index", idx);
    simulateClick(buttons[idx]);
    await sleep(500);
    return true;
  }

  console.warn("[TikTok Flow] Dropdown found but could not select", mode);
  return false;
}

// ---- Check if we're on the creation page vs gallery ----
function isOnCreationPage() {
  return (
    !!findPromptInput() ||
    document.querySelectorAll("button.flow_tab_slider_trigger").length > 0
  );
}

// ---- Prompt input discovery ----
// Google Flow uses a contenteditable <div> with child <p>
// that shows placeholder "What do you want to create"
function findPromptInput() {
  const strategies = [
    // 0. Slate editor attribute (most specific)
    () => {
      const el = document.querySelector('[data-slate-editor="true"]');
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100) return el;
      }
      return null;
    },
    // 1. Contenteditable div containing the known placeholder text
    () => {
      const editables = document.querySelectorAll('[contenteditable="true"]');
      for (const el of editables) {
        const text = el.textContent.trim().toLowerCase();
        if (text.includes("what do you want to create") || text === "") {
          const rect = el.getBoundingClientRect();
          if (rect.width > 100) return el;
        }
      }
      return null;
    },
    // 2. Role-based textbox
    () => document.querySelector('[role="textbox"]'),
    // 5. Largest visible contenteditable div
    () => {
      const editables = document.querySelectorAll('[contenteditable="true"]');
      let best = null;
      let bestArea = 0;
      for (const el of editables) {
        const rect = el.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (rect.width > 50 && area > bestArea) {
          best = el;
          bestArea = area;
        }
      }
      return best;
    },
  ];

  for (const strategy of strategies) {
    try {
      const el = strategy();
      if (el) {
        console.log(
          "[TikTok Flow] Found prompt input:",
          el.tagName,
          el.className?.substring(0, 60),
        );
        return el;
      }
    } catch {}
  }
  return null;
}

// ---- Create button discovery ----
// Google Flow "Create" button has text "Create" and arrow_forward icon
function findGenerateButton() {
  const strategies = [
    // 1. Button containing "Create" text with an icon (arrow_forward)
    () => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const text = btn.textContent.trim();
        if (
          text.includes("Create") &&
          (btn.querySelector("span.material-symbols-outlined") ||
            text.includes("arrow_forward"))
        ) {
          return btn;
        }
      }
      return null;
    },
    // 2. Button with exact text "Create" (excluding "New project" etc.)
    () => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const text = btn.textContent.replace(/arrow_forward/g, "").trim();
        if (text === "Create") return btn;
      }
      return null;
    },
    // 3. Button near the prompt input area
    () => {
      const promptEl = findPromptInput();
      if (!promptEl) return null;
      let container = promptEl.parentElement;
      for (let i = 0; i < 6 && container; i++) {
        const btns = container.querySelectorAll("button");
        for (const btn of btns) {
          const text = btn.textContent.trim().toLowerCase();
          if (text.includes("create") || text.includes("generate")) {
            return btn;
          }
        }
        container = container.parentElement;
      }
      return null;
    },
  ];

  for (const strategy of strategies) {
    try {
      const el = strategy();
      if (el) {
        console.log(
          "[TikTok Flow] Found Create button:",
          el.textContent?.trim().substring(0, 30),
          el.className?.substring(0, 50),
        );
        return el;
      }
    } catch {}
  }
  return null;
}

// ---- Tab/mode switching ----
// Google Flow has TWO possible UI patterns for Image/Video mode switching:
//
// Pattern A: Direct tab buttons — button.flow_tab_slider_trigger with IDs like
//            trigger-IMAGE, trigger-VIDEO (appears after first generation)
//
// Pattern B: Settings dropdown — a button showing current preset text like
//            "Videocrop_9_16x1" or "🍌 Nano Banana Pro crop_9_16 x1".
//            Clicking it opens a dropdown containing the Image/Video tab buttons.
//            This is the default on new project pages.
//
// =========================================================================
// SETTINGS DROPDOWN SYSTEM
// =========================================================================
// Google Flow uses a Radix UI dropdown for ALL configuration:
//   - Image/Video mode (flow_tab_slider_trigger with trigger-IMAGE/trigger-VIDEO)
//   - Aspect ratio (trigger-PORTRAIT, trigger-LANDSCAPE, etc.)
//   - Count (trigger-1, trigger-2, etc.)
//   - Model selector
//
// The dropdown trigger: a button with preset text (crop_*, x1, etc.)
// The popup content: div.DropdownMenuContent or div[data-radix-menu-content]
//   inside a data-radix-popper-content-wrapper
//
// FLOW: openSettingsDropdown() → configure → closeSettingsDropdown()
// =========================================================================

// ---- Open the settings dropdown and return the popup element ----
async function openSettingsDropdown() {
  // Check if dropdown is already open
  let popup = findDropdownPopup();
  if (popup) {
    console.log("[TikTok Flow] Settings dropdown already open");
    return popup;
  }

  // Find and click the trigger button
  const trigger = findSettingsDropdownTrigger();
  if (!trigger) {
    console.warn("[TikTok Flow] Settings dropdown trigger not found");
    return null;
  }

  console.log(
    "[TikTok Flow] Opening settings dropdown:",
    trigger.textContent.trim().substring(0, 40),
  );
  simulateClick(trigger);

  // Wait for popup to appear
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    popup = findDropdownPopup();
    if (popup) {
      console.log("[TikTok Flow] Settings dropdown opened successfully");
      return popup;
    }
  }

  console.warn(
    "[TikTok Flow] Settings dropdown did not open after clicking trigger",
  );
  return null;
}

// ---- Close the settings dropdown ----
async function closeSettingsDropdown() {
  const popup = findDropdownPopup();
  if (!popup) return; // Already closed

  // Press Escape to close the Radix dropdown
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await sleep(300);

  // If still open, click the trigger again to toggle it closed
  if (findDropdownPopup()) {
    const trigger = findSettingsDropdownTrigger();
    if (trigger) {
      simulateClick(trigger);
      await sleep(300);
    }
  }

  console.log("[TikTok Flow] Settings dropdown closed");
}

// ---- Find the dropdown popup content (when open) ----
function findDropdownPopup() {
  // The popup content is div.DropdownMenuContent inside data-radix-popper-content-wrapper
  return (
    document.querySelector(".DropdownMenuContent") ||
    document.querySelector("[data-radix-menu-content]") ||
    document.querySelector('[role="menu"][data-state="open"]')
  );
}

// ---- Find the settings dropdown trigger button on the page ----
// The trigger button shows preset text like "Videocrop_9_16x1" or "Imagecrop_...".
// Opens the DropdownMenuContent with Image/Video tabs and model selector.
function findSettingsDropdownTrigger() {
  // Strategy 1: Button whose text matches preset pattern (crop_, x1, x2, etc.)
  // This is the most reliable — doesn't depend on class names at all.
  const allButtons = document.querySelectorAll("button");
  for (const btn of allButtons) {
    const text = btn.textContent.trim();
    const rect = btn.getBoundingClientRect();
    // Preset button shows mode+aspect+count, e.g. "Videocrop_9_16x1" or "Imagecrop_16_9x2"
    if (rect.width > 50 && rect.height > 20 && rect.width < 300) {
      if (/crop_\d/.test(text) || /(Image|Video).*(x\d)/.test(text)) {
        console.log(
          "[TikTok Flow] Found settings trigger by preset text:",
          text.substring(0, 40),
        );
        return btn;
      }
    }
  }

  // Strategy 2: Any button with aria-haspopup="menu" near the prompt area
  const promptEl = findPromptInput();
  if (promptEl) {
    let container = promptEl.parentElement;
    for (let i = 0; i < 10 && container; i++) {
      const menuBtns = container.querySelectorAll(
        'button[aria-haspopup="menu"]',
      );
      for (const btn of menuBtns) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 30) return btn;
      }
      container = container.parentElement;
    }
  }

  // Strategy 3: Button with Radix ID that contains preset-like text
  for (const btn of allButtons) {
    if (
      btn.id &&
      btn.id.startsWith("radix-") &&
      !btn.id.includes("trigger-IMAGE") &&
      !btn.id.includes("trigger-VIDEO")
    ) {
      const rect = btn.getBoundingClientRect();
      if (rect.width > 50 && rect.width < 300 && rect.y > 400) {
        const text = btn.textContent.trim();
        if (
          text.includes("Image") ||
          text.includes("Video") ||
          text.includes("crop") ||
          text.includes("x1")
        ) {
          console.log(
            "[TikTok Flow] Found settings trigger by Radix ID:",
            btn.id,
            text.substring(0, 30),
          );
          return btn;
        }
      }
    }
  }

  // Strategy 4: Any visible button with aria-haspopup="menu" in lower half of page
  const allMenuBtns = document.querySelectorAll('button[aria-haspopup="menu"]');
  for (const btn of allMenuBtns) {
    const rect = btn.getBoundingClientRect();
    if (rect.width > 40 && rect.height > 20 && rect.y > 300) {
      return btn;
    }
  }

  console.warn("[TikTok Flow] Settings dropdown trigger NOT FOUND");
  return null;
}

// ---- Switch between Image and Video mode ----
// Opens the settings dropdown, clicks the Image or Video tab, leaves dropdown open
// so that subsequent configuration (aspect, count, model) can happen.
// Falls back to searching the entire page if the dropdown approach fails.
async function switchToMode(mode) {
  const triggerSuffix = mode === "image" ? "IMAGE" : "VIDEO";
  const targetText = mode === "image" ? "Image" : "Video";
  console.log("[TikTok Flow] switchToMode called for:", mode);

  // Strategy 1: Try via settings dropdown (tabs are INSIDE it)
  const popup = await openSettingsDropdown();
  if (popup) {
    const found = await findAndClickModeTab(
      popup,
      triggerSuffix,
      targetText,
      mode,
    );
    if (found) return true;
  } else {
    console.warn(
      "[TikTok Flow] Settings dropdown won't open — trying page-level search",
    );
  }

  // Strategy 2: Search the ENTIRE page for Image/Video tabs
  // (tabs may be directly on the page, not inside a dropdown)
  console.log("[TikTok Flow] Searching entire page for", mode, "tab...");
  const found = await findAndClickModeTab(
    document,
    triggerSuffix,
    targetText,
    mode,
  );
  if (found) return true;

  // Strategy 3: Look for ANY button anywhere whose text matches "Image" or "Video"
  // but is small enough to be a tab (not a big CTA button)
  const allButtons = document.querySelectorAll("button");
  for (const btn of allButtons) {
    const text = btn.textContent.trim();
    const rect = btn.getBoundingClientRect();
    // Tab buttons are typically small (< 200px wide) and visible
    if (rect.width > 20 && rect.width < 200 && rect.height > 0) {
      if (
        text === targetText ||
        text === `image${targetText}` ||
        text === `videocam${targetText}`
      ) {
        simulateClick(btn);
        console.log(
          "[TikTok Flow] Clicked",
          mode,
          "tab (page-wide text match):",
          text.substring(0, 30),
        );
        await sleep(500);
        return true;
      }
    }
  }

  console.warn(
    "[TikTok Flow] Could not find",
    mode,
    "tab anywhere on the page",
  );
  return false;
}

// Helper: find and click Image/Video tab within a search root element
async function findAndClickModeTab(
  searchRoot,
  triggerSuffix,
  targetText,
  mode,
) {
  // 1. CSS selector match for flow_tab_slider_trigger with ID suffix
  const tab =
    searchRoot.querySelector(
      `button[id$="trigger-${triggerSuffix}"].flow_tab_slider_trigger`,
    ) ||
    searchRoot.querySelector(
      `button.flow_tab_slider_trigger[id*="trigger-${triggerSuffix}"]`,
    );

  if (tab) {
    if (
      tab.getAttribute("data-state") === "active" ||
      tab.getAttribute("aria-selected") === "true"
    ) {
      console.log("[TikTok Flow] Mode", mode, "is already active");
      return true;
    }
    simulateClick(tab);
    console.log("[TikTok Flow] Clicked", mode, "tab:", tab.id);
    await sleep(500);
    return true;
  }

  // 2. JS-based ID endsWith() loop — handles Radix IDs with colons
  //    e.g. "radix-:r6t:-trigger-IMAGE" where CSS [id$=] may fail
  const allBtns = searchRoot.querySelectorAll("button");
  for (const btn of allBtns) {
    if (btn.id && btn.id.endsWith(`trigger-${triggerSuffix}`)) {
      if (
        btn.getAttribute("data-state") === "active" ||
        btn.getAttribute("aria-selected") === "true"
      ) {
        console.log("[TikTok Flow] Mode", mode, "is already active (JS match)");
        return true;
      }
      simulateClick(btn);
      console.log("[TikTok Flow] Clicked", mode, "tab (JS endsWith):", btn.id);
      await sleep(500);
      return true;
    }
  }

  // 3. Text-based match on tab/trigger buttons
  const tabs = searchRoot.querySelectorAll(
    'button[role="tab"], button.flow_tab_slider_trigger',
  );
  for (const t of tabs) {
    const text = t.textContent.trim();
    if (
      text.endsWith(targetText) ||
      text === targetText ||
      text.startsWith(targetText)
    ) {
      simulateClick(t);
      console.log(
        "[TikTok Flow] Clicked",
        mode,
        "tab (text match):",
        text.substring(0, 30),
      );
      await sleep(500);
      return true;
    }
  }

  return false;
}

// ---- Select a trigger option by ID suffix (e.g. "PORTRAIT", "1") ----
// These buttons are INSIDE the settings dropdown popup.
// The dropdown must be open already (call switchToMode first, which opens it).
async function selectTriggerOption(triggerSuffix, label) {
  console.log(
    "[TikTok Flow] Selecting trigger option:",
    triggerSuffix,
    `(${label})`,
  );

  const popup = findDropdownPopup();
  const searchRoot = popup || document;

  // Strategy 1: flow_tab_slider_trigger with matching ID suffix
  const allTriggers = searchRoot.querySelectorAll(
    "button.flow_tab_slider_trigger",
  );
  for (const btn of allTriggers) {
    if (btn.id && btn.id.endsWith(`trigger-${triggerSuffix}`)) {
      if (btn.getAttribute("data-state") === "active") {
        console.log("[TikTok Flow]", label, "already selected");
        return true;
      }
      simulateClick(btn);
      console.log("[TikTok Flow] Selected", label, "via trigger ID:", btn.id);
      return true;
    }
  }

  // Strategy 2: Any button with matching trigger ID
  const btn = searchRoot.querySelector(
    `button[id*="trigger-${triggerSuffix}"]`,
  );
  if (btn) {
    simulateClick(btn);
    console.log("[TikTok Flow] Selected", label, "via ID pattern");
    return true;
  }

  console.warn("[TikTok Flow] Trigger option not found:", triggerSuffix, label);
  return false;
}

// ---- Select the generated image from the "Start" image picker ----
// Flow: click "Start" area → wait for picker → select the most recent image
async function selectGeneratedImage() {
  console.log("[TikTok Flow] Selecting generated image from Start area...");

  // Step 1: Find and click the "Start" area (by text content)
  let startArea = null;
  const divs = document.querySelectorAll("div");
  for (const div of divs) {
    const text = div.textContent.trim().toLowerCase();
    const rect = div.getBoundingClientRect();
    if (text === "start" && rect.width > 50 && rect.height > 50) {
      startArea = div;
      break;
    }
  }
  // Also try finding an area with "Start" label + image placeholder
  if (!startArea) {
    for (const div of divs) {
      if (
        div.textContent.trim().toLowerCase().startsWith("start") &&
        div.getBoundingClientRect().width > 40
      ) {
        startArea = div;
        break;
      }
    }
  }

  if (!startArea) {
    console.warn("[TikTok Flow] Start area not found — trying fallback");
    // Fallback: look for a button with "Start" text
    const btn = findButtonByText("Start");
    if (btn) {
      simulateClick(btn);
    } else {
      throw new Error("Could not find 'Start' area to open image picker");
    }
  } else {
    simulateClick(startArea);
    console.log("[TikTok Flow] Clicked Start area");
  }

  await sleep(1000);

  // Step 2: Wait for the image picker to appear
  let picker = null;
  for (let i = 0; i < 10; i++) {
    // Check for virtuoso scroller (stable data-testid attribute)
    picker = document.querySelector('[data-testid="virtuoso-scroller"]');
    if (picker) break;
    // Check for any Radix dialog/popover that appeared with images
    const popover = document.querySelector(
      "[data-radix-popper-content-wrapper]",
    );
    if (popover && popover.querySelector("img")) {
      picker = popover;
      break;
    }
    await sleep(500);
  }

  if (!picker) {
    console.warn(
      "[TikTok Flow] Image picker did not appear — may already have image selected",
    );
    return;
  }
  console.log("[TikTok Flow] Image picker appeared");

  await sleep(500);

  // Step 3: Select the most recent image from the picker
  // Try clicking the first image in the virtuoso scroller
  const scroller = document.querySelector('[data-testid="virtuoso-scroller"]');
  if (scroller) {
    const imgs = scroller.querySelectorAll("img");
    if (imgs.length > 0) {
      simulateClick(imgs[0]);
      console.log("[TikTok Flow] Clicked first image in virtuoso scroller");
      await sleep(800);
      return;
    }
    // Try any clickable div inside scroller
    const items = scroller.querySelectorAll("div");
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (rect.width > 30 && rect.height > 30 && item.querySelector("img")) {
        simulateClick(item);
        console.log("[TikTok Flow] Clicked image container in scroller");
        await sleep(800);
        return;
      }
    }
  }

  // Fallback: click any newly appeared img that looks like a thumbnail
  const allImgs = document.querySelectorAll("img");
  for (const img of allImgs) {
    const rect = img.getBoundingClientRect();
    if (rect.width > 40 && rect.width < 300 && rect.height > 40) {
      simulateClick(img);
      console.log("[TikTok Flow] Clicked image thumbnail fallback");
      await sleep(800);
      return;
    }
  }

  console.warn(
    "[TikTok Flow] Could not select an image from the picker — continuing anyway",
  );
}

// ---- Configure video sub-tabs (aspect ratio, count) ----
// Legacy function — kept for compatibility. Prefer selectTriggerOption() directly.
async function configureVideoOptions({
  aspectRatio = "9:16",
  count = "x1",
} = {}) {
  console.log("[TikTok Flow] Configuring video options...");
  await selectTriggerOption("PORTRAIT", aspectRatio);
  await sleep(500);
  await selectTriggerOption("1", count);
}

// ---- Find a button by exact visible text ----
function findButtonByExactText(text) {
  const allButtons = document.querySelectorAll("button");
  for (const btn of allButtons) {
    // Get just the direct text, stripping icon text as much as possible
    const btnText = btn.textContent.trim();
    if (btnText === text) return btn;
    // Also check inner spans
    const spans = btn.querySelectorAll("span");
    for (const span of spans) {
      if (span.textContent.trim() === text) return btn;
    }
  }
  return null;
}

// ---- Find a button by text (exact or partial) ----
function findButtonByText(text) {
  return findButtonByExactText(text) || findButtonContainingText(text);
}

// ---- Find a button containing text ----
function findButtonContainingText(text) {
  const allButtons = document.querySelectorAll("button");
  for (const btn of allButtons) {
    if (btn.textContent.trim().includes(text)) {
      // Prefer smaller/more specific buttons
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 300) return btn;
    }
  }
  return null;
}

// ---- Detect whether an object is a Slate editor instance ----
function isSlateEditor(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    Array.isArray(obj.children) &&
    typeof obj.apply === "function" &&
    typeof obj.onChange === "function" &&
    typeof obj.insertText === "function"
  );
}

// ---- Walk React fiber tree to find the Slate editor instance ----
function findSlateEditorInstance(el) {
  const fiberKey = Object.keys(el).find(
    (k) =>
      k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) {
    console.log("[TikTok Flow] No React fiber found on element");
    return null;
  }

  let fiber = el[fiberKey];
  for (let depth = 0; depth < 60 && fiber; depth++) {
    // Check React hooks chain (memoizedState is a linked list)
    let hook = fiber.memoizedState;
    while (hook) {
      const s = hook.memoizedState;
      if (isSlateEditor(s)) return s;
      // useRef stores value in { current: ... }
      if (s && typeof s === "object" && isSlateEditor(s.current)) {
        return s.current;
      }
      // useReducer/useState: [state, dispatch]
      if (Array.isArray(s)) {
        for (const item of s) {
          if (isSlateEditor(item)) return item;
        }
      }
      // Check queue.lastRenderedState
      if (hook.queue && isSlateEditor(hook.queue.lastRenderedState)) {
        return hook.queue.lastRenderedState;
      }
      hook = hook.next;
    }

    // Check component props
    if (fiber.memoizedProps) {
      const props = fiber.memoizedProps;
      for (const key of Object.keys(props)) {
        if (isSlateEditor(props[key])) return props[key];
      }
    }

    fiber = fiber.return;
  }
  return null;
}

// ---- Get the first text point in a Slate node tree ----
function getSlateFirstPoint(children) {
  function walk(node, path) {
    if ("text" in node) return { path, offset: 0 };
    if (node.children && node.children.length > 0) {
      return walk(node.children[0], [...path, 0]);
    }
    return null;
  }
  if (!children || children.length === 0) return null;
  return walk(children[0], [0]);
}

// ---- Get the last text point in a Slate node tree ----
function getSlateLastPoint(children) {
  function walk(node, path) {
    if ("text" in node) return { path, offset: node.text.length };
    if (node.children && node.children.length > 0) {
      const last = node.children.length - 1;
      return walk(node.children[last], [...path, last]);
    }
    return null;
  }
  if (!children || children.length === 0) return null;
  const last = children.length - 1;
  return walk(children[last], [last]);
}

// ---- Fill prompt into whatever input type we found ----
// Google Flow uses Slate.js with a contenteditable div.
// Slate keeps its own model — DOM-only changes are silently discarded
// on the next render. We access the Slate editor instance through
// React's fiber tree and call editor.insertText() directly.
async function fillPrompt(promptEl, text) {
  console.log(
    "[TikTok Flow] Filling prompt into:",
    promptEl.tagName,
    promptEl.className?.substring(0, 40),
  );

  if (promptEl.tagName === "TEXTAREA" || promptEl.tagName === "INPUT") {
    setNativeValue(promptEl, text);
    await sleep(300);
    return;
  }

  // Find the actual Slate editor element (may be promptEl or a child)
  const slateEl =
    promptEl.querySelector('[data-slate-editor="true"]') || promptEl;

  // Primary approach: ask background to fill via main-world injection or debugger.
  // Main-world runs in the page's actual JS context → reliable Slate API access.
  // Debugger sends truly trusted input events (isTrusted: true).
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "FILL_SLATE_PROMPT", payload: { text } },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        },
      );
    });
    if (result?.success) {
      console.log(
        "[TikTok Flow] Prompt filled via background (" + result.method + ")",
      );
      await sleep(500);
      return;
    }
    console.warn("[TikTok Flow] Background fill failed:", result?.error);
  } catch (err) {
    console.warn("[TikTok Flow] Background fill error:", err.message);
  }

  // Fallback: content-script Slate API with proper editor.apply for selection
  const editor = findSlateEditorInstance(slateEl);
  if (editor) {
    console.log(
      "[TikTok Flow] Fallback: Slate via content script. selection:",
      JSON.stringify(editor.selection),
    );
    try {
      const start = getSlateFirstPoint(editor.children);
      const end = getSlateLastPoint(editor.children);
      const newSel =
        start && end
          ? { anchor: start, focus: end }
          : {
              anchor: { path: [0, 0], offset: 0 },
              focus: { path: [0, 0], offset: 0 },
            };

      // Use editor.apply instead of direct assignment — goes through Slate's
      // operation pipeline so internal state is properly updated.
      editor.apply({
        type: "set_selection",
        properties: editor.selection,
        newProperties: newSel,
      });
      editor.insertText(text);

      console.log("[TikTok Flow] Prompt filled via content-script Slate API");
      await sleep(500);
      return;
    } catch (err) {
      console.warn(
        "[TikTok Flow] Content-script Slate API error:",
        err.message,
      );
    }
  }

  // Last resort: DOM-based approach (known to be unreliable with Slate)
  console.warn(
    "[TikTok Flow] All Slate approaches failed, trying DOM fallback (may not work)",
  );
  slateEl.focus();
  await sleep(500);

  const sel = window.getSelection();
  const zeroWidth = slateEl.querySelector("[data-slate-zero-width]");
  if (zeroWidth) {
    const textNode = zeroWidth.firstChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 0);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  await sleep(500);
  document.execCommand("selectAll", false, null);
  await sleep(300);
  document.execCommand("insertText", false, text);
  await sleep(500);

  console.log("[TikTok Flow] Prompt filled via DOM fallback");
}

// ---- Wait for a generated image result ----
async function waitForImageResult(timeout = 180000) {
  console.log("[TikTok Flow] Watching for generated image...");
  const before = snapshotMedia();

  // Poll + observe for new images
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const allImages = document.querySelectorAll("img");
    for (const img of allImages) {
      if (before.images.has(img.src)) continue;
      // Filter: must be a meaningful generated image
      if (
        img.src &&
        img.src.startsWith("http") &&
        img.naturalWidth > 200 &&
        img.naturalHeight > 200
      ) {
        console.log(
          "[TikTok Flow] New image detected:",
          img.src.substring(0, 100),
        );
        return img;
      }
    }

    // Also check for canvas-rendered results (some tools render to canvas)
    const canvases = document.querySelectorAll("canvas");
    for (const canvas of canvases) {
      if (
        canvas.width > 200 &&
        canvas.height > 200 &&
        !before.images.has("canvas:" + canvas.id)
      ) {
        console.log("[TikTok Flow] Canvas result detected");
        return canvas;
      }
    }

    // Check for download links that appeared
    const downloadLinks = document.querySelectorAll(
      'a[download], a[href*="download"], button[aria-label*="download" i]',
    );
    if (downloadLinks.length > 0) {
      console.log(
        "[TikTok Flow] Download link appeared, generation likely complete",
      );
      // Find the associated image
      for (const img of allImages) {
        if (!before.images.has(img.src) && img.src && img.naturalWidth > 100) {
          return img;
        }
      }
    }

    await sleep(3000);
  }
  throw new Error("Timeout waiting for image generation result");
}

// ---- Wait for a generated video result ----
async function waitForVideoResult(timeout = 360000) {
  console.log("[TikTok Flow] Watching for generated video...");
  const before = snapshotMedia();

  const start = Date.now();
  while (Date.now() - start < timeout) {
    // Check for <video> elements
    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      const src = video.src || video.querySelector("source")?.src || "";
      if (src && !before.videos.has(src)) {
        console.log("[TikTok Flow] New video detected:", src.substring(0, 100));
        return video;
      }
    }

    // Check for blob URLs on video elements (common for preview)
    for (const video of videos) {
      if (
        video.src &&
        video.src.startsWith("blob:") &&
        !before.videos.has(video.src)
      ) {
        console.log("[TikTok Flow] Blob video detected");
        return video;
      }
    }

    // Check for download buttons (video might be ready)
    const downloadBtns = document.querySelectorAll(
      'a[download][href*=".mp4"], a[download][href*="video"], button[aria-label*="download" i]',
    );
    for (const btn of downloadBtns) {
      const href = btn.href || btn.getAttribute("data-href") || "";
      if (href && !before.videos.has(href)) {
        console.log(
          "[TikTok Flow] Video download link appeared:",
          href.substring(0, 100),
        );
        // Create a synthetic video-like object with the download URL
        return { src: href, tagName: "A", isDownloadLink: true };
      }
    }

    await sleep(5000);
  }
  throw new Error("Timeout waiting for video generation result");
}

// ---- Extract the usable URL from a result element ----
function extractMediaUrl(element) {
  if (!element) return null;

  // Direct src
  if (element.src && element.src.startsWith("http")) return element.src;
  if (element.src && element.src.startsWith("blob:")) return element.src;

  // Video source element
  const source = element.querySelector?.("source");
  if (source?.src) return source.src;

  // Download link href
  if (element.href) return element.href;
  if (element.isDownloadLink && element.src) return element.src;

  // Background image
  const bg = element.style?.backgroundImage;
  if (bg) {
    const match = bg.match(/url\(["']?(.*?)["']?\)/);
    if (match) return match[1];
  }

  // Canvas: convert to data URL
  if (element.tagName === "CANVAS") {
    try {
      return element.toDataURL("image/png");
    } catch {
      console.warn("[TikTok Flow] Canvas tainted, cannot extract data URL");
    }
  }

  return null;
}

// ---- Download generated image and upload to backend for gallery storage ----
// Mirrors downloadAndUploadVideo but for images.
async function downloadAndUploadImage(resultEl, jobId, sceneIndex) {
  console.log(
    "[TikTok Flow] === Downloading generated image for job:",
    jobId,
    sceneIndex !== undefined ? `scene ${sceneIndex}` : "",
  );

  let imageBlob = null;

  // Strategy 1: Fetch the image element's src directly
  const imgSrc = resultEl.src || resultEl.querySelector?.("img")?.src;
  if (imgSrc) {
    console.log("[TikTok Flow] Fetching image src:", imgSrc.substring(0, 100));
    try {
      const resp = await fetch(imgSrc);
      if (resp.ok) {
        imageBlob = await resp.blob();
        console.log(
          "[TikTok Flow] Downloaded image via src:",
          imageBlob.size,
          "bytes",
        );
      }
    } catch (e) {
      console.warn("[TikTok Flow] Image src fetch failed:", e.message);
    }
  }

  // Strategy 2: Canvas capture as fallback
  if (!imageBlob && resultEl.tagName === "IMG") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = resultEl.naturalWidth || resultEl.width;
      canvas.height = resultEl.naturalHeight || resultEl.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(resultEl, 0, 0);
      imageBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      console.log(
        "[TikTok Flow] Captured image via canvas:",
        imageBlob?.size,
        "bytes",
      );
    } catch (e) {
      console.warn("[TikTok Flow] Canvas capture failed:", e.message);
    }
  }

  if (!imageBlob || imageBlob.size < 100) {
    throw new Error("Could not download image bytes.");
  }

  // Convert blob to base64 to send via chrome.runtime.sendMessage
  console.log(
    "[TikTok Flow] Uploading image to backend:",
    imageBlob.size,
    "bytes",
  );
  const arrayBuffer = await imageBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      uint8Array.subarray(i, i + chunkSize),
    );
  }
  const base64Image = btoa(binary);

  const result = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "UPLOAD_IMAGE",
        payload: {
          jobId,
          imageBase64: base64Image,
          mimeType: imageBlob.type || "image/png",
          sceneIndex: sceneIndex !== undefined ? sceneIndex : undefined,
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

  console.log(
    "[TikTok Flow] ✅ Image uploaded to gallery:",
    JSON.stringify(result),
  );
  return { imageUrl: result.imageUrl, imageBlob };
}

// ---- Download video blob and upload to backend for watermark removal ----
// Strategy: fetch the video bytes in-page (where blob: URLs are valid),
// then POST to the backend API which saves and processes with FFmpeg.
async function downloadAndUploadVideo(resultEl, jobId, sceneIndex) {
  console.log(
    "[TikTok Flow] === Downloading video for job:",
    jobId,
    sceneIndex !== undefined ? `scene ${sceneIndex}` : "",
  );

  let videoBlob = null;

  // ---- IMPORTANT: For multi-scene, we MUST prioritise the resultEl ----
  // Strategy 1 & 2 search the ENTIRE page and can grab download links from
  // a *previous* scene's video. So we try resultEl-based strategies first.

  // Strategy A (was 3): Fetch the video element's src (blob: or https:) — MOST RELIABLE for multi-scene
  const videoSrc =
    resultEl.src ||
    resultEl.querySelector?.("source")?.src ||
    (resultEl.isDownloadLink ? resultEl.src : null);

  if (videoSrc) {
    console.log(
      "[TikTok Flow] Fetching video src:",
      videoSrc.substring(0, 100),
    );
    try {
      const resp = await fetch(videoSrc);
      if (resp.ok) {
        videoBlob = await resp.blob();
        console.log(
          "[TikTok Flow] Downloaded via resultEl src:",
          videoBlob.size,
          "bytes",
        );
      }
    } catch (e) {
      console.warn(
        "[TikTok Flow] Video src fetch failed (possibly cross-origin blob):",
        e.message,
      );
    }
  }

  // Strategy B (was 4): Use canvas capture for resultEl (re-encodes, lower quality)
  if (!videoBlob && resultEl.tagName === "VIDEO") {
    console.log("[TikTok Flow] Trying canvas capture on resultEl...");
    try {
      videoBlob = await captureVideoViaCanvas(resultEl);
      console.log(
        "[TikTok Flow] Captured via canvas:",
        videoBlob.size,
        "bytes",
      );
    } catch (e) {
      console.warn("[TikTok Flow] Canvas capture failed:", e.message);
    }
  }

  // Strategy C: If resultEl is a download link (synthetic from waitForVideoResult),
  // its src already points to the correct URL — handled above by (resultEl.isDownloadLink).
  // But if that failed, try to find a download link NEAR the resultEl (scoped search).
  if (!videoBlob && resultEl.isDownloadLink && resultEl.src) {
    // resultEl.src was already tried above; skip to global fallback
    console.log(
      "[TikTok Flow] Download link resultEl src already tried, moving to global fallback",
    );
  }

  // Strategy D (fallback — was 1): Find the LATEST download link on the page.
  // For multi-scene, we take the LAST matching link (newest) instead of the first.
  if (!videoBlob) {
    const downloadLinks = [
      ...document.querySelectorAll(
        'a[download][href*=".mp4"], a[download][href*="video"], a[href*="download"][href*="video"]',
      ),
    ];
    // Reverse so we try the most recently added (last in DOM) link first
    downloadLinks.reverse();
    for (const link of downloadLinks) {
      const href = link.href || link.getAttribute("href") || "";
      if (href && href.startsWith("http")) {
        console.log(
          "[TikTok Flow] Found download link (latest first):",
          href.substring(0, 100),
        );
        try {
          const resp = await fetch(href);
          if (resp.ok) {
            videoBlob = await resp.blob();
            console.log(
              "[TikTok Flow] Downloaded via page link:",
              videoBlob.size,
              "bytes",
            );
            break;
          }
        } catch (e) {
          console.warn("[TikTok Flow] Download link fetch failed:", e.message);
        }
      }
    }
  }

  // Strategy E (fallback — was 2): Click the download/export button if visible
  if (!videoBlob) {
    const downloadBtn =
      findButtonByText("Download") ||
      findButtonByText("Export") ||
      document.querySelector('button[aria-label*="download" i]') ||
      document.querySelector('button[aria-label*="export" i]');
    if (downloadBtn) {
      console.log("[TikTok Flow] Trying download button click...");
      const href = downloadBtn.href || downloadBtn.closest("a")?.href;
      if (href && href.startsWith("http")) {
        try {
          const resp = await fetch(href);
          if (resp.ok) {
            videoBlob = await resp.blob();
            console.log(
              "[TikTok Flow] Downloaded via button href:",
              videoBlob.size,
              "bytes",
            );
          }
        } catch (e) {
          console.warn("[TikTok Flow] Button href fetch failed:", e.message);
        }
      }
    }
  }

  if (!videoBlob || videoBlob.size < 1000) {
    throw new Error(
      "Could not download video bytes. All strategies failed. " +
        "Video element detected but bytes not accessible.",
    );
  }

  // Upload to backend via background service worker (avoids CORS from labs.google → localhost)
  console.log(
    "[TikTok Flow] Uploading video to backend:",
    videoBlob.size,
    "bytes",
  );

  // Convert blob to base64 to send via chrome.runtime.sendMessage
  const arrayBuffer = await videoBlob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = "";
  // Process in chunks to avoid call stack overflow
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
          sceneIndex: sceneIndex !== undefined ? sceneIndex : undefined,
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

  console.log(
    "[TikTok Flow] ✅ Video uploaded and processed:",
    JSON.stringify(result),
  );
  return result;
}

// ---- Canvas-based video capture (fallback for inaccessible blob URLs) ----
// Re-records the video using MediaRecorder + Canvas. Lower quality but works
// even when the blob URL is cross-origin isolated.
function captureVideoViaCanvas(videoEl) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth || 1080;
    canvas.height = videoEl.videoHeight || 1920;
    const ctx = canvas.getContext("2d");

    const stream = canvas.captureStream(30); // 30fps
    // Add audio if the video has it
    if (videoEl.captureStream) {
      try {
        const videoStream = videoEl.captureStream();
        const audioTracks = videoStream.getAudioTracks();
        for (const track of audioTracks) {
          stream.addTrack(track);
        }
      } catch {}
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
    });
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(blob);
    };

    recorder.onerror = reject;

    // Seek to start and play
    videoEl.currentTime = 0;
    videoEl.muted = true;

    videoEl.onended = () => {
      recorder.stop();
    };

    videoEl.onseeked = () => {
      recorder.start();
      videoEl.play();

      // Draw frames
      const drawFrame = () => {
        if (videoEl.paused || videoEl.ended) return;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();
    };

    // Safety timeout
    setTimeout(() => {
      if (recorder.state === "recording") {
        videoEl.pause();
        recorder.stop();
      }
    }, 30000);
  });
}

// ---- Main: Generate Image ----
async function generateImage({
  jobId,
  prompt,
  productImages,
  studioReferenceImages,
}) {
  console.log("[TikTok Flow] === Starting IMAGE generation for job:", jobId);
  console.log("[TikTok Flow] Prompt:", prompt.substring(0, 100) + "...");
  console.log(
    "[TikTok Flow] Product images:",
    (productImages || []).length,
    "images available",
  );
  console.log(
    "[TikTok Flow] Studio reference images:",
    (studioReferenceImages || []).length,
    "images available",
  );

  try {
    verifyFlowPage();
    await sleep(2000);

    // Step 0: ALWAYS start a fresh project — select Image from the dropdown
    await withRetry(() => navigateToNewProject("image"), {
      maxAttempts: 3,
      label: "Navigate to new project",
    });
    await sleep(1500);

    // Step 1: Open settings dropdown → switch to Image mode → close dropdown
    console.log("[TikTok Flow] Ensuring Image mode is selected...");
    let switched = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      switched = await switchToMode("image");
      if (switched) break;
      console.log(
        "[TikTok Flow] Image mode switch attempt",
        attempt + 1,
        "failed, retrying...",
      );
      await sleep(1000);
    }
    if (!switched) {
      console.warn(
        "[TikTok Flow] Could not switch to Image tab after 3 attempts — proceeding anyway",
      );
    }

    // Step 1.1: Set aspect ratio to 9:16 (PORTRAIT) for TikTok
    console.log(
      "[TikTok Flow] Setting image aspect ratio to 9:16 (PORTRAIT)...",
    );
    await selectTriggerOption("PORTRAIT", "9:16");
    await sleep(500);

    await closeSettingsDropdown();
    await sleep(1000);

    // Step 2: Upload reference image → right-click → "Add to Prompt" (same pattern as Animate)
    // Upload product image TWICE for stronger product fidelity (double-reference strategy)
    if (productImages && productImages.length > 0) {
      console.log(
        "[TikTok Flow] Uploading product reference image (1st pass):",
        productImages[0].substring(0, 80),
      );
      await withRetry(() => uploadAndAddReferenceToPrompt(productImages[0]), {
        maxAttempts: 2,
        delayMs: 2000,
        label: "Upload reference image (1st)",
      });
      console.log(
        "[TikTok Flow] ✅ Reference image (1st) uploaded and added to prompt",
      );

      // Re-verify Image mode after Add to Prompt
      switched = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        switched = await switchToMode("image");
        if (switched) break;
        await sleep(1000);
      }
      await closeSettingsDropdown();
      await sleep(1000);

      // Upload same product image a SECOND time to reinforce product fidelity
      // This makes the model give more weight to the product appearance
      console.log(
        "[TikTok Flow] Uploading product reference image (2nd pass - double-reference for fidelity):",
        productImages[0].substring(0, 80),
      );
      await withRetry(() => uploadAndAddReferenceToPrompt(productImages[0]), {
        maxAttempts: 2,
        delayMs: 2000,
        label: "Upload reference image (2nd)",
      });
      console.log(
        "[TikTok Flow] ✅ Reference image (2nd) uploaded and added to prompt",
      );

      // Verify we are still in Image mode after "Add to Prompt"
      console.log(
        "[TikTok Flow] Verifying still in Image mode after Add to Prompt...",
      );
      switched = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        switched = await switchToMode("image");
        if (switched) break;
        await sleep(1000);
      }
      if (!switched) {
        console.warn(
          "[TikTok Flow] Could not confirm Image mode after Add to Prompt — proceeding anyway",
        );
      }
      await closeSettingsDropdown();
      await sleep(1000);
    } else {
      console.warn(
        "[TikTok Flow] No product images available — generating from prompt only",
      );
    }

    // Step 2b: Upload Video Studio reference images (background, model) if available
    if (studioReferenceImages && studioReferenceImages.length > 0) {
      for (let i = 0; i < studioReferenceImages.length; i++) {
        console.log(
          `[TikTok Flow] Uploading studio reference image ${i + 1}/${studioReferenceImages.length}:`,
          studioReferenceImages[i].substring(0, 80),
        );
        await withRetry(
          () => uploadAndAddReferenceToPrompt(studioReferenceImages[i]),
          {
            maxAttempts: 2,
            delayMs: 2000,
            label: `Upload studio reference image ${i + 1}`,
          },
        );
        console.log(
          `[TikTok Flow] ✅ Studio reference image ${i + 1} uploaded and added to prompt`,
        );

        // Re-verify Image mode after each Add to Prompt
        switched = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          switched = await switchToMode("image");
          if (switched) break;
          await sleep(1000);
        }
        await closeSettingsDropdown();
        await sleep(1000);
      }
    }

    // Step 3: Find the prompt input (contenteditable div)
    let promptEl = findPromptInput();
    if (!promptEl) {
      console.log("[TikTok Flow] Prompt not found immediately, waiting...");
      await sleep(3000);
      promptEl = findPromptInput();
    }
    if (!promptEl) {
      throw new Error(
        "Could not find prompt input on Google Flow. " +
          "Make sure you are on https://labs.google/fx/tools/flow and logged in.",
      );
    }

    // Step 4: Click to focus, then fill the prompt
    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, prompt);

    // Step 5: Click Create button (retry up to 5 times)
    let createBtn = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(500);
      createBtn = findGenerateButton();
      if (createBtn) break;
      console.log(
        "[TikTok Flow] Create button not found, retry",
        attempt + 1,
        "of 5...",
      );
      await sleep(1000);
    }
    if (!createBtn) {
      throw new Error("Could not find Create button. The UI may have changed.");
    }
    simulateClick(createBtn);
    console.log("[TikTok Flow] Create clicked, waiting for image result...");

    // Step 6: Wait for the generated image
    await sleep(3000);
    const resultEl = await waitForImageResult(180000); // 3 min timeout

    // Step 7: Extract URL
    const imageUrl = extractMediaUrl(resultEl);
    if (!imageUrl) {
      throw new Error("Image appeared but could not extract URL");
    }

    console.log(
      "[TikTok Flow] Image generation SUCCESS:",
      imageUrl.substring(0, 100),
    );

    await updateJobStatus(jobId, { status: "generating_video", imageUrl });

    // Notify background to immediately start video generation.
    // This is critical because the background service worker may have
    // restarted during the long image generation wait.
    chrome.runtime.sendMessage({
      type: "JOB_PHASE_COMPLETE",
      payload: { jobId, phase: "image", nextStatus: "generating_video" },
    });

    return { success: true, imageUrl };
  } catch (err) {
    console.error("[TikTok Flow] Image generation FAILED:", err.message);
    await updateJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
    });
    return { error: err.message };
  }
}

// ---- Standalone Image Generation (duplicates video flow, stops after image) ----
// This is a standalone function that mirrors the video creation flow
// but stops after image generation. Used for image-only jobs.
async function generateImageOnly({ jobId, prompt, referenceImages }) {
  console.log(
    "[TikTok Flow] === Starting STANDALONE IMAGE generation for job:",
    jobId,
  );
  console.log(
    "[TikTok Flow] Prompt:",
    (prompt || "").substring(0, 100) + "...",
  );
  console.log(
    "[TikTok Flow] Reference images:",
    (referenceImages || []).length,
    "available",
  );

  try {
    verifyFlowPage();
    await sleep(2000);

    // Step 0: Wait for gallery UI to be ready (SPA may still be loading)
    console.log("[TikTok Flow] Waiting for gallery UI to be ready...");
    let galleryReady = false;
    for (let wait = 0; wait < 15; wait++) {
      // Check if we can find "New project" button or are already on creation page
      if (isOnCreationPage()) {
        galleryReady = true;
        break;
      }
      const allButtons = document.querySelectorAll("button");
      for (const btn of allButtons) {
        const text = btn.textContent.trim().toLowerCase();
        if (text.includes("new project") || text.includes("add_2")) {
          galleryReady = true;
          break;
        }
      }
      if (galleryReady) break;
      console.log(
        "[TikTok Flow] Gallery not ready yet, waiting... (" +
          (wait + 1) +
          "/15)",
      );
      await sleep(2000);
    }
    if (!galleryReady) {
      throw new Error(
        "Google Flow gallery did not load. Make sure you are logged in at https://labs.google/fx/tools/flow",
      );
    }

    // Step 1: Navigate to a fresh project — select Image from dropdown
    await withRetry(() => navigateToNewProject("image"), {
      maxAttempts: 5,
      delayMs: 3000,
      label: "Navigate to new image project",
    });
    await sleep(1500);

    // Step 2: Ensure Image mode is selected in settings
    console.log("[TikTok Flow] Ensuring Image mode is selected...");
    let switched = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      switched = await switchToMode("image");
      if (switched) break;
      console.log(
        "[TikTok Flow] Image mode switch attempt",
        attempt + 1,
        "failed, retrying...",
      );
      await sleep(1000);
    }
    if (!switched) {
      console.warn(
        "[TikTok Flow] Could not switch to Image tab after 3 attempts — proceeding anyway",
      );
    }

    // Step 2.1: Set aspect ratio to 9:16 (PORTRAIT) for TikTok
    console.log(
      "[TikTok Flow] Setting image aspect ratio to 9:16 (PORTRAIT)...",
    );
    await selectTriggerOption("PORTRAIT", "9:16");
    await sleep(500);

    await closeSettingsDropdown();
    await sleep(1000);

    // Step 3: Upload reference image if available
    // Upload product image TWICE for stronger product fidelity (double-reference strategy)
    if (referenceImages && referenceImages.length > 0) {
      console.log(
        "[TikTok Flow] Uploading reference image (1st pass):",
        referenceImages[0].substring(0, 80),
      );
      await withRetry(() => uploadAndAddReferenceToPrompt(referenceImages[0]), {
        maxAttempts: 2,
        delayMs: 2000,
        label: "Upload reference image (1st)",
      });
      console.log(
        "[TikTok Flow] ✅ Reference image (1st) uploaded and added to prompt",
      );

      // Re-verify Image mode after Add to Prompt
      switched = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        switched = await switchToMode("image");
        if (switched) break;
        await sleep(1000);
      }
      await closeSettingsDropdown();
      await sleep(1000);

      // Upload same reference image a SECOND time to reinforce product fidelity
      console.log(
        "[TikTok Flow] Uploading reference image (2nd pass - double-reference for fidelity):",
        referenceImages[0].substring(0, 80),
      );
      await withRetry(() => uploadAndAddReferenceToPrompt(referenceImages[0]), {
        maxAttempts: 2,
        delayMs: 2000,
        label: "Upload reference image (2nd)",
      });
      console.log(
        "[TikTok Flow] ✅ Reference image (2nd) uploaded and added to prompt",
      );

      // Verify still in Image mode after "Add to Prompt"
      console.log(
        "[TikTok Flow] Verifying still in Image mode after Add to Prompt...",
      );
      switched = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        switched = await switchToMode("image");
        if (switched) break;
        await sleep(1000);
      }
      if (!switched) {
        console.warn(
          "[TikTok Flow] Could not confirm Image mode after Add to Prompt — proceeding anyway",
        );
      }
      await closeSettingsDropdown();
      await sleep(1000);
    } else {
      console.warn(
        "[TikTok Flow] No reference images — generating from prompt only",
      );
    }

    // Step 4: Find the prompt input (contenteditable div)
    let promptEl = findPromptInput();
    if (!promptEl) {
      console.log("[TikTok Flow] Prompt not found immediately, waiting...");
      await sleep(3000);
      promptEl = findPromptInput();
    }
    if (!promptEl) {
      throw new Error(
        "Could not find prompt input on Google Flow. " +
          "Make sure you are on https://labs.google/fx/tools/flow and logged in.",
      );
    }

    // Step 5: Click to focus, then fill the prompt
    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, prompt);

    // Step 6: Click Create button (retry up to 5 times)
    let createBtn = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(500);
      createBtn = findGenerateButton();
      if (createBtn) break;
      console.log(
        "[TikTok Flow] Create button not found, retry",
        attempt + 1,
        "of 5...",
      );
      await sleep(1000);
    }
    if (!createBtn) {
      throw new Error("Could not find Create button. The UI may have changed.");
    }
    simulateClick(createBtn);
    console.log("[TikTok Flow] Create clicked, waiting for image result...");

    // Step 7: Wait for the generated image
    await sleep(3000);
    const resultEl = await waitForImageResult(180000); // 3 min timeout

    // Step 8: Extract URL
    const imageUrl = extractMediaUrl(resultEl);
    if (!imageUrl) {
      throw new Error("Image appeared but could not extract URL");
    }

    console.log(
      "[TikTok Flow] Standalone image generation SUCCESS:",
      imageUrl.substring(0, 100),
    );

    // Step 9: Download image and upload to backend for gallery storage
    let savedImageUrl = imageUrl;
    try {
      const uploadResult = await downloadAndUploadImage(resultEl, jobId);
      savedImageUrl = uploadResult.imageUrl;
      console.log("[TikTok Flow] Image saved to gallery:", savedImageUrl);
    } catch (uploadErr) {
      console.warn(
        "[TikTok Flow] Image gallery upload failed, using raw URL:",
        uploadErr.message,
      );
    }

    // Mark job as ready — standalone image, no video generation
    await updateJobStatus(jobId, { status: "ready", imageUrl: savedImageUrl });
    chrome.runtime.sendMessage({
      type: "JOB_PHASE_COMPLETE",
      payload: { jobId, phase: "image", nextStatus: "ready" },
    });

    return { success: true, imageUrl: savedImageUrl };
  } catch (err) {
    console.error(
      "[TikTok Flow] Standalone image generation FAILED:",
      err.message,
    );
    await updateJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
    });
    return { error: err.message };
  }
}

// ---- Upload a product reference image in Image creation mode ----
// Google Flow Image mode has a "Start" area (reference image slot).
// Clicking it opens a picker with recent images + "Upload image" button.
// We fetch the product image and upload it so the AI uses it as reference.
async function uploadReferenceImageForImageMode(imageUrl) {
  console.log("[TikTok Flow] Uploading reference image for Image mode...");

  // Step 1: Find and click the "Start" / reference image area
  let startArea = null;

  // Strategy A: Look for div/button containing exact text "Start", "Reference", "Add image"
  const divs = document.querySelectorAll("div, button, span");
  for (const div of divs) {
    const text = div.textContent.trim().toLowerCase();
    const rect = div.getBoundingClientRect();
    if (
      (text === "start" ||
        text === "reference" ||
        text === "add image" ||
        text === "add_photo_alternate" ||
        text === "add_photo_alternate start") &&
      rect.width > 40 &&
      rect.height > 40
    ) {
      startArea = div;
      console.log(
        "[TikTok Flow] Found Start area via text:",
        text,
        `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      );
      break;
    }
  }

  // Strategy B: Look for a material icon "add_photo_alternate" which indicates the upload zone
  if (!startArea) {
    const icons = document.querySelectorAll(
      "i, span.material-icons, span.material-symbols-outlined, [class*='icon']",
    );
    for (const icon of icons) {
      const text = icon.textContent.trim();
      if (
        text === "add_photo_alternate" ||
        text === "add_a_photo" ||
        text === "image"
      ) {
        // Walk up to find a clickable container
        let parent = icon.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const rect = parent.getBoundingClientRect();
          if (rect.width > 40 && rect.height > 40 && rect.width < 500) {
            startArea = parent;
            console.log(
              "[TikTok Flow] Found Start area via material icon:",
              text,
              parent.tagName,
              `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            );
            break;
          }
          parent = parent.parentElement;
        }
        if (startArea) break;
      }
    }
  }

  // Strategy C: Also try labels/buttons
  if (!startArea) {
    startArea =
      findButtonByText("Start") ||
      findButtonByText("Add image") ||
      findButtonByText("Reference");
    if (startArea)
      console.log("[TikTok Flow] Found Start area via button text");
  }

  // Strategy D: look for a clickable area with an upload/image icon near the prompt
  if (!startArea) {
    const promptEl = findPromptInput();
    if (promptEl) {
      let container = promptEl.parentElement;
      for (let i = 0; i < 8 && container; i++) {
        const candidates = container.querySelectorAll(
          'div[role="button"], button, div[tabindex], [data-radix-collection-item]',
        );
        for (const c of candidates) {
          const text = c.textContent.trim().toLowerCase();
          const rect = c.getBoundingClientRect();
          if (
            rect.width > 30 &&
            rect.height > 30 &&
            (text.includes("start") ||
              text.includes("image") ||
              text.includes("upload") ||
              text.includes("add_photo"))
          ) {
            startArea = c;
            console.log(
              "[TikTok Flow] Found Start area via prompt-area search:",
              text.substring(0, 30),
            );
            break;
          }
        }
        if (startArea) break;
        container = container.parentElement;
      }
    }
  }

  // Strategy E: Look for a large empty placeholder area near the prompt (the upload drop zone)
  if (!startArea) {
    const promptEl = findPromptInput();
    if (promptEl) {
      let container = promptEl.parentElement;
      for (let i = 0; i < 8 && container; i++) {
        // Look for a sibling/child div that's roughly square and empty-ish (upload zone)
        const zones = container.querySelectorAll("div");
        for (const z of zones) {
          const rect = z.getBoundingClientRect();
          const text = z.textContent.trim().toLowerCase();
          // Upload zone: ~100-500px, roughly square, with minimal text
          if (
            rect.width > 80 &&
            rect.width < 500 &&
            rect.height > 80 &&
            rect.height < 500 &&
            Math.abs(rect.width - rect.height) < 100 &&
            text.length < 50 &&
            !z.querySelector("textarea, [contenteditable]")
          ) {
            startArea = z;
            console.log(
              "[TikTok Flow] Found Start area via upload zone shape:",
              `${Math.round(rect.width)}x${Math.round(rect.height)}`,
              text.substring(0, 30),
            );
            break;
          }
        }
        if (startArea) break;
        container = container.parentElement;
      }
    }
  }

  if (!startArea) {
    console.warn(
      "[TikTok Flow] Reference image area not found — trying direct file input",
    );
    await tryDirectFileUpload(imageUrl);
    return await verifyReferenceImageUploaded();
  }

  simulateClick(startArea);
  console.log("[TikTok Flow] Clicked reference image area");
  await sleep(1000);

  // Step 2: Look for "Upload image" button in the picker that appeared
  const uploadBtn =
    findButtonByText("Upload image") ||
    findButtonByText("Upload") ||
    findButtonContainingText("Upload");
  if (uploadBtn) {
    simulateClick(uploadBtn);
    console.log("[TikTok Flow] Clicked 'Upload image' button");
    await sleep(800);

    // Step 3: Find file input and inject our product image
    const fileInput =
      document.querySelector('input[type="file"][accept*="image"]') ||
      document.querySelector('input[type="file"]');

    if (fileInput) {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "product-reference.png", {
          type: blob.type || "image/png",
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
        console.log(
          "[TikTok Flow] Product reference image uploaded via file input",
        );
        await sleep(2000);
        return await verifyReferenceImageUploaded();
      } catch (fetchErr) {
        console.warn(
          "[TikTok Flow] Failed to fetch product image:",
          fetchErr.message,
        );
      }
    }
  }

  // Step 4: Fallback — try direct file input injection without clicking Upload button
  console.log("[TikTok Flow] Trying direct file input fallback...");
  await tryDirectFileUpload(imageUrl);
  return await verifyReferenceImageUploaded();
}

// ---- Verify that a reference image was successfully uploaded ----
// Checks the DOM for visual indicators that the reference image is present
// (e.g., a thumbnail, an img element in the Start area, or the area text changing).
async function verifyReferenceImageUploaded() {
  console.log("[TikTok Flow] Verifying reference image upload...");

  // Wait for Google Flow to process the uploaded file (needs time to upload to server)
  await sleep(5000);

  for (let attempt = 0; attempt < 10; attempt++) {
    // Check if the "Start" text is still visible — if so, the image has NOT
    // been processed yet regardless of what other strategies detect.
    let startTextStillShowing = false;
    const startDivs = document.querySelectorAll("div");
    for (const div of startDivs) {
      const text = div.textContent.trim().toLowerCase();
      const rect = div.getBoundingClientRect();
      if (
        text === "start" &&
        rect.width > 40 &&
        rect.height > 40 &&
        rect.width < 300
      ) {
        startTextStillShowing = true;
        break;
      }
    }

    if (startTextStillShowing) {
      console.log(
        `[TikTok Flow] "Start" text still visible — image not processed yet (attempt ${attempt + 1}/10)`,
      );
      await sleep(3000);
      continue;
    }

    // Strategy 1: Look for a thumbnail/preview img near the Start area
    // After a successful upload, Google Flow shows a small preview image.
    // Note: alt may be "Generated image" (same as generated output) — use size to distinguish.
    const refImages = document.querySelectorAll(
      'img[alt*="reference" i], img[alt*="uploaded" i], img[alt*="start" i], img[alt*="Reference" i], img[alt="Generated image"]',
    );
    for (const img of refImages) {
      const rect = img.getBoundingClientRect();
      if (
        rect.width > 20 &&
        rect.height > 20 &&
        rect.width < 500 &&
        rect.height < 500
      ) {
        console.log(
          "[TikTok Flow] ✅ Reference image verified via img alt attribute:",
          img.alt,
          `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
        // Extra wait to ensure Google Flow has fully registered the reference
        await sleep(3000);
        return true;
      }
    }

    // Strategy 2: Check for any new image elements that appeared in the reference area
    // (images with blob: or data: or googleusercontent URLs loaded after upload)
    const allImgs = document.querySelectorAll("img");
    for (const img of allImgs) {
      const src = img.src || "";
      const rect = img.getBoundingClientRect();
      if (
        rect.width > 30 &&
        rect.width < 300 &&
        rect.height > 30 &&
        rect.height < 300 &&
        (src.startsWith("blob:") ||
          src.includes("googleusercontent") ||
          src.startsWith("data:"))
      ) {
        // Found a small-medium image that looks like a reference thumbnail
        console.log(
          "[TikTok Flow] ✅ Reference image verified via thumbnail image",
        );
        // Extra wait to ensure Google Flow has fully registered the reference
        await sleep(3000);
        return true;
      }
    }

    // NOTE: We intentionally do NOT check fileInput.files here.
    // Having files set on the input only means we injected the file,
    // NOT that Google Flow has finished processing/uploading it.

    if (attempt < 9) {
      console.log(
        `[TikTok Flow] Reference image not confirmed yet (attempt ${attempt + 1}/10), waiting...`,
      );
      await sleep(3000);
    }
  }

  console.warn(
    "[TikTok Flow] ❌ Could not verify reference image upload after 10 attempts",
  );
  return false;
}

// ---- Find the uploaded reference image element ----
// After uploading, Google Flow shows a thumbnail. From the recording, this is
// an <a> element (class sc-3ab8616e-0) ~400x400 containing the reference image,
// or an <img> with blob:/googleusercontent/data: src.
function findUploadedReferenceImage() {
  // Strategy 1: <a> or <div> element ~100-500px containing an img (the Radix ContextMenuTrigger container)
  // The context menu trigger is on the container, NOT on the <img> inside.
  // Check both <a> and <div> — Google Flow may use either.
  const containers = document.querySelectorAll(
    "a, div[data-radix-collection-item], div[data-state]",
  );
  for (const el of containers) {
    const rect = el.getBoundingClientRect();
    if (
      rect.width > 100 &&
      rect.width < 500 &&
      rect.height > 100 &&
      rect.height < 500 &&
      el.querySelector("img")
    ) {
      console.log(
        "[TikTok Flow] Found reference image via container with img:",
        el.tagName,
        `${Math.round(rect.width)}x${Math.round(rect.height)} at (${Math.round(rect.x)},${Math.round(rect.y)})`,
        el.className?.substring(0, 30),
      );
      return el;
    }
  }

  // Strategy 1b: <a> element (generic) containing an img
  const links = document.querySelectorAll("a");
  for (const a of links) {
    const rect = a.getBoundingClientRect();
    if (
      rect.width > 100 &&
      rect.width < 500 &&
      rect.height > 100 &&
      rect.height < 500 &&
      a.querySelector("img")
    ) {
      console.log(
        "[TikTok Flow] Found reference image via <a> container with img:",
        `${Math.round(rect.width)}x${Math.round(rect.height)} at (${Math.round(rect.x)},${Math.round(rect.y)})`,
        a.className?.substring(0, 30),
      );
      return a;
    }
  }

  // Strategy 2: img with alt containing "reference", "uploaded", "start", or "Generated image"
  const altImgs = document.querySelectorAll(
    'img[alt*="reference" i], img[alt*="uploaded" i], img[alt*="start" i], img[alt*="Reference" i], img[alt="Generated image"]',
  );
  for (const img of altImgs) {
    const rect = img.getBoundingClientRect();
    if (
      rect.width > 20 &&
      rect.height > 20 &&
      rect.width < 500 &&
      rect.height < 500
    ) {
      // Try to return the closest Radix trigger container instead of bare img
      const radixParent = findRadixTriggerParent(img);
      if (radixParent) return radixParent;
      console.log(
        "[TikTok Flow] Found reference image via alt attribute:",
        img.alt,
        `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      );
      return img;
    }
  }

  // Strategy 3: Small-medium thumbnail with blob/googleusercontent/data URL
  const allImgs = document.querySelectorAll("img");
  for (const img of allImgs) {
    const src = img.src || "";
    const rect = img.getBoundingClientRect();
    if (
      rect.width > 30 &&
      rect.width < 500 &&
      rect.height > 30 &&
      rect.height < 500 &&
      (src.startsWith("blob:") ||
        src.includes("googleusercontent") ||
        src.startsWith("data:"))
    ) {
      // Try to return the closest Radix trigger container instead of bare img
      const radixParent = findRadixTriggerParent(img);
      if (radixParent) return radixParent;
      console.log("[TikTok Flow] Found reference image via thumbnail URL");
      return img;
    }
  }

  return null;
}

// Walk up from an img to find the nearest Radix context menu trigger container
function findRadixTriggerParent(img) {
  let parent = img.parentElement;
  for (let i = 0; i < 6 && parent; i++) {
    const rect = parent.getBoundingClientRect();
    // Look for <a> or a div with Radix attributes that's a reasonable size
    if (
      rect.width > 50 &&
      rect.height > 50 &&
      rect.width < 600 &&
      rect.height < 600
    ) {
      if (
        parent.tagName === "A" ||
        parent.hasAttribute("data-radix-collection-item") ||
        parent.hasAttribute("data-state") ||
        (parent.getAttribute("role") === "button" &&
          parent.querySelector("img"))
      ) {
        console.log(
          "[TikTok Flow] Found Radix trigger parent:",
          parent.tagName,
          parent.className?.substring(0, 40),
          `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
        return parent;
      }
    }
    parent = parent.parentElement;
  }
  return null;
}

// ---- Find the "Add to Prompt" menu item in the right-click Radix context menu ----
// Same context menu as "Animate". After right-clicking an uploaded reference image,
// Google Flow shows a Radix popup menu with items including "Add to Prompt".
// HTML: <button role="menuitem" class="sc-16c4830a-1 ..."><i>add</i>Add to Prompt</button>
// The button text reads "addAdd to Prompt" (material icon "add" + label).
function findAddToPromptMenuItem() {
  // Strategy 1: Look inside any open Radix popup menu for "Add to Prompt"
  const menus = document.querySelectorAll(
    '[role="menu"], [data-radix-menu-content], [data-radix-popper-content-wrapper]',
  );
  for (const menu of menus) {
    const items = menu.querySelectorAll(
      'button[role="menuitem"], [role="menuitem"]',
    );
    for (const item of items) {
      const text = item.textContent.trim().toLowerCase();
      if (
        text.includes("add to prompt") &&
        item.getBoundingClientRect().width > 0
      ) {
        console.log(
          "[TikTok Flow] Found 'Add to Prompt' in Radix context menu:",
          item.textContent.trim().substring(0, 40),
        );
        return item;
      }
    }
  }

  // Strategy 2: Any visible button/menuitem on page containing "add to prompt"
  const candidates = document.querySelectorAll(
    'button[role="menuitem"], [role="menuitem"], button',
  );
  for (const el of candidates) {
    const text = el.textContent.trim().toLowerCase();
    const rect = el.getBoundingClientRect();
    if (rect.width > 20 && rect.height > 10 && text.includes("add to prompt")) {
      console.log(
        "[TikTok Flow] Found 'Add to Prompt' menu item:",
        el.textContent.trim().substring(0, 40),
        `at (${Math.round(rect.x)},${Math.round(rect.y)})`,
      );
      return el;
    }
  }

  return null;
}

// ---- Right-click the uploaded reference image and click "Add to Prompt" ----
// Same pattern as clickAnimateAndWaitForVideoMode:
//   find image → right-click to open Radix context menu → click "Add to Prompt"
async function clickAddToPromptOnReferenceImage() {
  console.log("[TikTok Flow] Looking for uploaded reference image...");

  // Step 1: Find the uploaded reference image
  let refImg = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    refImg = findUploadedReferenceImage();
    if (refImg) break;
    console.log(
      "[TikTok Flow] Reference image not found yet, retry",
      attempt + 1,
      "of 10...",
    );
    await sleep(1500);
  }
  if (!refImg) {
    throw new Error("Uploaded reference image not found on page.");
  }

  console.log(
    "[TikTok Flow] Found reference image:",
    refImg.tagName,
    refImg.className?.substring(0, 40),
    `${Math.round(refImg.getBoundingClientRect().width)}x${Math.round(refImg.getBoundingClientRect().height)}`,
  );

  // Scroll image into view
  refImg.scrollIntoView({ block: "center", behavior: "instant" });
  await sleep(500);

  // Step 2: Right-click to open context menu and find "Add to Prompt"
  // Uses same multi-strategy approach as triggerContextMenuOnImage (Animate flow)
  console.log(
    "[TikTok Flow] Right-clicking reference image to open context menu...",
  );
  let addToPromptItem = null;

  for (let bigAttempt = 0; bigAttempt < 3; bigAttempt++) {
    // Strategy A: Right-click directly on the found element
    console.log("[TikTok Flow] Strategy A: right-click on element itself...");
    simulateRightClick(refImg);
    await sleep(1500);
    addToPromptItem = findAddToPromptMenuItem();
    if (addToPromptItem) break;

    // Strategy B: Right-click parent containers (Radix trigger may be on wrapper)
    let parent = refImg.parentElement;
    for (let i = 0; i < 5 && parent && !addToPromptItem; i++) {
      const rect = parent.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        console.log(
          "[TikTok Flow] Strategy B: right-click parent level",
          i + 1,
          parent.tagName,
          parent.className?.substring(0, 30),
        );
        simulateRightClick(parent);
        await sleep(1500);
        addToPromptItem = findAddToPromptMenuItem();
        if (addToPromptItem) break;
      }
      parent = parent.parentElement;
    }
    if (addToPromptItem) break;

    // Strategy C: If refImg is an <img>, find its closest <a> or Radix trigger ancestor
    if (refImg.tagName === "IMG") {
      const closestLink = refImg.closest("a");
      if (closestLink) {
        console.log(
          "[TikTok Flow] Strategy C: right-click closest <a> ancestor...",
          closestLink.className?.substring(0, 30),
        );
        simulateRightClick(closestLink);
        await sleep(1500);
        addToPromptItem = findAddToPromptMenuItem();
        if (addToPromptItem) break;
      }
      // Also try Radix trigger parent
      const radixTrigger = findRadixTriggerParent(refImg);
      if (radixTrigger && radixTrigger !== closestLink) {
        console.log(
          "[TikTok Flow] Strategy C2: right-click Radix trigger parent...",
          radixTrigger.tagName,
          radixTrigger.className?.substring(0, 30),
        );
        simulateRightClick(radixTrigger);
        await sleep(1500);
        addToPromptItem = findAddToPromptMenuItem();
        if (addToPromptItem) break;
      }
    }

    // Strategy D: Hover to trigger overlay, then check for visible "Add to Prompt"
    console.log("[TikTok Flow] Strategy D: hover to trigger overlay...");
    const hoverTarget = refImg;
    const hoverRect = hoverTarget.getBoundingClientRect();
    const hoverOpts = {
      bubbles: true,
      clientX: hoverRect.left + hoverRect.width / 2,
      clientY: hoverRect.top + hoverRect.height / 2,
    };
    hoverTarget.dispatchEvent(new MouseEvent("mouseover", hoverOpts));
    hoverTarget.dispatchEvent(
      new MouseEvent("mouseenter", { ...hoverOpts, bubbles: false }),
    );
    hoverTarget.dispatchEvent(new MouseEvent("mousemove", hoverOpts));
    await sleep(1000);
    addToPromptItem = findAddToPromptMenuItem();
    if (addToPromptItem) break;

    // Dismiss any menu that opened without "Add to Prompt"
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await sleep(500);

    // Re-find the image (DOM may have changed)
    refImg = findUploadedReferenceImage() || refImg;
    console.log(
      "[TikTok Flow] 'Add to Prompt' not found, big retry",
      bigAttempt + 1,
      "of 3...",
    );
    await sleep(1000);
  }

  if (!addToPromptItem) {
    throw new Error(
      "'Add to Prompt' not found in context menu. The right-click menu may not have opened.",
    );
  }

  // Step 3: Click "Add to Prompt"
  simulateClick(addToPromptItem);
  console.log("[TikTok Flow] ✅ Clicked 'Add to Prompt' in context menu");

  // Wait for Google Flow to attach the reference image to the prompt
  await sleep(3000);
  console.log("[TikTok Flow] ✅ Reference image added to prompt");
  return true;
}

// ---- Right-click the GENERATED image and click "Add to Prompt" ----
// After video generation, the generated image (from image gen step) is still in the DOM.
// We right-click it → select "Add to Prompt" so it becomes a reference for the next image.
// This keeps us on the SAME project page — no navigation needed.
async function clickAddToPromptOnGeneratedImage() {
  console.log("[TikTok Flow] Looking for generated image to Add to Prompt...");

  // Step 1: Find the generated image
  let genImg = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    genImg = findGeneratedImage();
    if (genImg) break;
    console.log(
      "[TikTok Flow] Generated image not found yet, retry",
      attempt + 1,
      "of 10...",
    );
    await sleep(1500);
  }
  if (!genImg) {
    throw new Error(
      "Generated image not found for Add to Prompt. The image may no longer be in the DOM.",
    );
  }

  console.log(
    "[TikTok Flow] Found generated image for Add to Prompt:",
    genImg.tagName,
    `${Math.round(genImg.getBoundingClientRect().width)}x${Math.round(genImg.getBoundingClientRect().height)}`,
  );

  // Scroll image into view
  genImg.scrollIntoView({ block: "center", behavior: "instant" });
  await sleep(500);

  // Step 2: Right-click to open context menu and find "Add to Prompt"
  let addToPromptItem = null;

  for (let bigAttempt = 0; bigAttempt < 3; bigAttempt++) {
    // Strategy A: Right-click directly on the image
    simulateRightClick(genImg);
    await sleep(1500);
    addToPromptItem = findAddToPromptMenuItem();
    if (addToPromptItem) break;

    // Strategy B: Right-click parent containers
    let parent = genImg.parentElement;
    for (let i = 0; i < 5 && parent && !addToPromptItem; i++) {
      const rect = parent.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        console.log(
          "[TikTok Flow] AddToPrompt Strategy B: right-click parent level",
          i + 1,
        );
        simulateRightClick(parent);
        await sleep(1500);
        addToPromptItem = findAddToPromptMenuItem();
        if (addToPromptItem) break;
      }
      parent = parent.parentElement;
    }
    if (addToPromptItem) break;

    // Strategy C: Hover to trigger overlay
    const hoverRect = genImg.getBoundingClientRect();
    const hoverOpts = {
      bubbles: true,
      clientX: hoverRect.left + hoverRect.width / 2,
      clientY: hoverRect.top + hoverRect.height / 2,
    };
    genImg.dispatchEvent(new MouseEvent("mouseover", hoverOpts));
    genImg.dispatchEvent(
      new MouseEvent("mouseenter", { ...hoverOpts, bubbles: false }),
    );
    genImg.dispatchEvent(new MouseEvent("mousemove", hoverOpts));
    await sleep(1000);
    addToPromptItem = findAddToPromptMenuItem();
    if (addToPromptItem) break;

    // Dismiss stale menu
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await sleep(500);

    // Re-find image (DOM may have changed)
    genImg = findGeneratedImage() || genImg;
    console.log(
      "[TikTok Flow] 'Add to Prompt' on generated image not found, retry",
      bigAttempt + 1,
      "of 3...",
    );
    await sleep(1000);
  }

  if (!addToPromptItem) {
    throw new Error(
      "'Add to Prompt' not found in context menu for the generated image.",
    );
  }

  // Step 3: Click "Add to Prompt"
  simulateClick(addToPromptItem);
  console.log("[TikTok Flow] ✅ Clicked 'Add to Prompt' on generated image");

  // Wait for Flow to attach the image as reference to the prompt
  await sleep(3000);
  console.log("[TikTok Flow] ✅ Generated image added to prompt as reference");
  return true;
}

// ---- Upload reference image and click "Add to Prompt" ----
// Full flow: upload → wait → right-click image → click "Add to Prompt" in context menu.
// Same pattern as Animate: the Radix context menu has both "Animate" and "Add to Prompt".
async function uploadAndAddReferenceToPrompt(imageUrl) {
  console.log("[TikTok Flow] === UPLOAD & ADD REFERENCE TO PROMPT ===");
  console.log("[TikTok Flow] Image URL:", imageUrl.substring(0, 80));

  // Step 1: Upload the reference image (via Start area / file input)
  const uploadSuccess = await uploadReferenceImageForImageMode(imageUrl);
  if (!uploadSuccess) {
    throw new Error(
      "Reference image upload failed — cannot proceed without the product image as reference.",
    );
  }
  console.log("[TikTok Flow] ✅ Reference image uploaded");

  // Step 2: Wait for upload to fully process
  await sleep(2000);

  // Step 3: Try right-click → "Add to Prompt". If this fails, the image was already
  // uploaded via the Start area which auto-attaches it as reference — proceed anyway.
  try {
    await clickAddToPromptOnReferenceImage();
  } catch (addErr) {
    console.warn(
      "[TikTok Flow] ⚠️ 'Add to Prompt' right-click failed:",
      addErr.message,
    );
    console.log(
      "[TikTok Flow] Image was uploaded via Start area — it should already be attached as reference. Proceeding...",
    );

    // Dismiss any stale context menu
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await sleep(500);

    // As a last resort, try clicking the reference image thumbnail directly
    // (clicking it in some Google Flow versions toggles it as prompt reference)
    const refImg = findUploadedReferenceImage();
    if (refImg) {
      console.log(
        "[TikTok Flow] Fallback: clicking reference image thumbnail directly...",
      );
      simulateClick(refImg);
      await sleep(1500);
    }
  }
  return true;
}

// ---- Find the generated image element on the page ----
// Google Flow renders generated images with alt="Generated image".
function findGeneratedImage() {
  // Strategy 1: alt="Generated image" (most reliable)
  const img = document.querySelector('img[alt="Generated image"]');
  if (img) {
    const rect = img.getBoundingClientRect();
    if (rect.width > 50 && rect.height > 50) {
      console.log(
        "[TikTok Flow] Found generated image via alt attribute:",
        `${Math.round(rect.width)}x${Math.round(rect.height)} at (${Math.round(rect.x)},${Math.round(rect.y)})`,
      );
      return img;
    }
  }
  // Strategy 2: Any large image with a Google Flow media URL
  const allImgs = document.querySelectorAll("img");
  for (const i of allImgs) {
    const rect = i.getBoundingClientRect();
    if (
      rect.width > 200 &&
      rect.height > 200 &&
      i.src &&
      (i.src.includes("media.getMediaUrlRedirect") ||
        i.src.includes("/fx/api/"))
    ) {
      console.log("[TikTok Flow] Found generated image via URL pattern");
      return i;
    }
  }
  return null;
}

// ---- Right-click an element to open its context menu ----
// Google Flow shows "Animate" in a custom context menu on right-click.
// We try multiple dispatch strategies since synthetic events may not be trusted.
function simulateRightClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  // Scroll element into view first
  element.scrollIntoView({ block: "center", behavior: "instant" });

  const baseOpts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
    button: 2,
    buttons: 2,
  };

  // First hover over the element (triggers mouseover → pointerover)
  element.dispatchEvent(
    new PointerEvent("pointerover", {
      ...baseOpts,
      pointerId: 1,
      pointerType: "mouse",
      button: -1,
      buttons: 0,
    }),
  );
  element.dispatchEvent(
    new MouseEvent("mouseover", { ...baseOpts, button: 0, buttons: 0 }),
  );
  element.dispatchEvent(
    new PointerEvent("pointerenter", {
      ...baseOpts,
      pointerId: 1,
      pointerType: "mouse",
      button: -1,
      buttons: 0,
      bubbles: false,
    }),
  );
  element.dispatchEvent(
    new MouseEvent("mouseenter", {
      ...baseOpts,
      button: 0,
      buttons: 0,
      bubbles: false,
    }),
  );
  element.dispatchEvent(
    new MouseEvent("mousemove", { ...baseOpts, button: 0, buttons: 0 }),
  );

  // Now right-click sequence
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      ...baseOpts,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
  element.dispatchEvent(new MouseEvent("mousedown", baseOpts));
  element.dispatchEvent(
    new PointerEvent("pointerup", {
      ...baseOpts,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
  element.dispatchEvent(new MouseEvent("mouseup", baseOpts));
  element.dispatchEvent(new MouseEvent("contextmenu", baseOpts));
}

// ---- Trigger right-click context menu on the image AND its containers ----
// If the image element doesn't respond, try parent wrappers.
async function triggerContextMenuOnImage(imgElement) {
  // Strategy 1: Right-click on the image itself
  console.log("[TikTok Flow] Strategy 1: right-click on img element...");
  simulateRightClick(imgElement);
  await sleep(1200);
  let menu = findAnimateMenuItem();
  if (menu) return menu;

  // Strategy 2: Right-click on the image's parent container (click target may be a wrapper div)
  let parent = imgElement.parentElement;
  for (let i = 0; i < 4 && parent; i++) {
    const rect = parent.getBoundingClientRect();
    if (rect.width > 50 && rect.height > 50) {
      console.log(
        "[TikTok Flow] Strategy 2: right-click on parent level",
        i + 1,
        parent.tagName,
        parent.className?.substring(0, 30),
      );
      simulateRightClick(parent);
      await sleep(1200);
      menu = findAnimateMenuItem();
      if (menu) return menu;
    }
    parent = parent.parentElement;
  }

  // Strategy 3: Look for hover overlay action buttons that appeared (some UIs show action icons on hover)
  console.log("[TikTok Flow] Strategy 3: looking for hover action overlay...");
  // Hover the image to trigger overlay
  imgElement.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, clientX: 0, clientY: 0 }),
  );
  imgElement.dispatchEvent(
    new MouseEvent("mouseenter", { bubbles: false, clientX: 0, clientY: 0 }),
  );
  await sleep(800);

  // Check for any visible Animate button/icon that appeared
  const allBtns = document.querySelectorAll(
    'button, [role="menuitem"], [role="button"]',
  );
  for (const btn of allBtns) {
    const text = btn.textContent.trim();
    const rect = btn.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      (text === "Animate" ||
        text.includes("Animate") ||
        text === "motion_blur" ||
        text.includes("motion_blur"))
    ) {
      console.log(
        "[TikTok Flow] Found Animate button via hover overlay:",
        text.substring(0, 30),
      );
      return btn;
    }
  }

  // Strategy 4: Look for action icons near the image (some UIs place action buttons near images)
  const imgRect = imgElement.getBoundingClientRect();
  for (const btn of allBtns) {
    const btnRect = btn.getBoundingClientRect();
    // Button overlapping or near the image
    const overlaps =
      btnRect.left < imgRect.right &&
      btnRect.right > imgRect.left &&
      btnRect.top < imgRect.bottom &&
      btnRect.bottom > imgRect.top;
    if (overlaps && btn.textContent.trim().toLowerCase().includes("animat")) {
      console.log("[TikTok Flow] Found Animate action near image");
      return btn;
    }
  }

  return null;
}

// ---- Find the "Animate" option in the context menu ----
// After right-clicking an image, Google Flow shows a custom context menu
// with options like "Animate" (icon "motion_blur").
function findAnimateMenuItem() {
  // Strategy 1: Any button/menuitem containing "Animate" text that's currently visible
  const candidates = document.querySelectorAll(
    'button, [role="menuitem"], [role="option"], div[class*="MenuItem"], a',
  );
  for (const el of candidates) {
    const text = el.textContent.trim();
    const rect = el.getBoundingClientRect();
    if (
      rect.width > 20 &&
      rect.height > 10 &&
      (text === "Animate" ||
        text === "motion_blurAnimate" ||
        text.includes("Animate"))
    ) {
      // Make sure this is in a menu/popup (not something from the main page)
      const style = window.getComputedStyle(
        el.closest(
          '[role="menu"], [data-radix-menu-content], .DropdownMenuContent, div[style*="position"]',
        ) || el,
      );
      console.log(
        "[TikTok Flow] Found Animate menu item:",
        text.substring(0, 40),
        `at (${Math.round(rect.x)},${Math.round(rect.y)})`,
      );
      return el;
    }
  }
  // Strategy 2: Look inside any open Radix/popup menu
  const menus = document.querySelectorAll(
    '[role="menu"], [data-radix-menu-content], .DropdownMenuContent, [data-radix-popper-content-wrapper]',
  );
  for (const menu of menus) {
    const items = menu.querySelectorAll("*");
    for (const item of items) {
      const text = item.textContent.trim();
      if (
        (text === "Animate" || text === "motion_blurAnimate") &&
        item.getBoundingClientRect().width > 0
      ) {
        // Find the closest clickable element
        const clickable =
          item.closest('button, [role="menuitem"], a, div[tabindex]') || item;
        console.log("[TikTok Flow] Found Animate in popup menu");
        return clickable;
      }
    }
  }
  return null;
}

// ---- Click Animate on a generated image and wait for video mode to load ----
// Flow: find generated image → right-click to open context menu → click Animate → wait
async function clickAnimateAndWaitForVideoMode(timeout = 20000) {
  console.log("[TikTok Flow] Looking for generated image to animate...");

  // Step 1: Find the generated image
  let genImg = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    genImg = findGeneratedImage();
    if (genImg) break;
    console.log(
      "[TikTok Flow] Generated image not found yet, retry",
      attempt + 1,
      "of 10...",
    );
    await sleep(1500);
  }
  if (!genImg) {
    throw new Error(
      "Generated image not found. Make sure an image has been generated first.",
    );
  }

  // Scroll image into view and give the page a moment
  genImg.scrollIntoView({ block: "center", behavior: "instant" });
  await sleep(500);

  // Step 2: Try multiple strategies to trigger context menu and find Animate
  console.log("[TikTok Flow] Triggering context menu on generated image...");
  let animateItem = null;

  // Multi-strategy: right-click image, parents, check hover overlays
  for (let bigAttempt = 0; bigAttempt < 3; bigAttempt++) {
    animateItem = await triggerContextMenuOnImage(genImg);
    if (animateItem) break;

    // Dismiss any menu that might have opened without Animate
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await sleep(500);

    // Re-find the image (DOM may have changed)
    genImg = findGeneratedImage() || genImg;
    console.log(
      "[TikTok Flow] Animate not found, big retry",
      bigAttempt + 1,
      "of 3...",
    );
    await sleep(1000);
  }

  if (!animateItem) {
    throw new Error(
      "Animate option not found in context menu. The right-click menu may not have opened.",
    );
  }

  simulateClick(animateItem);
  console.log(
    "[TikTok Flow] Animate clicked, waiting for video creation mode...",
  );

  // Step 3: Wait for the video creation UI to load (prompt input should appear)
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(1000);
    const prompt = findPromptInput();
    if (prompt) {
      console.log(
        "[TikTok Flow] Video creation mode loaded (prompt input found)",
      );
      return true;
    }
  }

  // Even if prompt not found, the page may have transitioned
  console.warn(
    "[TikTok Flow] Prompt input not detected after Animate — proceeding anyway",
  );
  return true;
}

// ---- Multi-Scene Generation ----
// Processes multiple scenes within ONE job on the SAME Flow session.
// Scene 1: new project → uploads product + bg + model refs → generates image → animates to video.
// Scene 2+: STAYS on same page → right-clicks previous generated image → "Add to Prompt"
//           → switches to Image mode → enters new prompt → generates image → animates to video.
// All images and videos are uploaded to backend with sceneIndex for separate storage.
async function generateMultiScene({
  jobId,
  scenes,
  productImages,
  studioReferenceImages,
  videoModel,
}) {
  console.log(
    "[TikTok Flow] === Starting MULTI-SCENE generation for job:",
    jobId,
  );
  console.log("[TikTok Flow] Total scenes:", scenes.length);
  console.log("[TikTok Flow] Video model:", videoModel || "default");

  let scenesCompleted = 0;

  try {
    verifyFlowPage();
    await sleep(2000);

    for (let si = 0; si < scenes.length; si++) {
      const scene = scenes[si];
      console.log(`[TikTok Flow] --- Scene ${si + 1}/${scenes.length} ---`);
      console.log(
        "[TikTok Flow] Image prompt:",
        (scene.imagePrompt || "").substring(0, 80),
      );

      // === IMAGE GENERATION ===

      if (si === 0) {
        // ---- SCENE 1: New project + upload all references ----
        await withRetry(() => navigateToNewProject("image"), {
          maxAttempts: 3,
          label: "Scene 1: Navigate to new project",
        });
        await sleep(1500);

        // Switch to Image mode + 9:16
        let switched = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          switched = await switchToMode("image");
          if (switched) break;
          await sleep(1000);
        }
        await selectTriggerOption("PORTRAIT", "9:16");
        await sleep(500);
        await closeSettingsDropdown();
        await sleep(1000);

        // Upload product image
        if (productImages && productImages.length > 0) {
          await withRetry(
            () => uploadAndAddReferenceToPrompt(productImages[0]),
            {
              maxAttempts: 2,
              delayMs: 2000,
              label: "Upload product image",
            },
          );
          for (let a = 0; a < 3; a++) {
            if (await switchToMode("image")) break;
            await sleep(1000);
          }
          await closeSettingsDropdown();
          await sleep(1000);
        }

        // Upload studio references (background, model)
        if (studioReferenceImages && studioReferenceImages.length > 0) {
          for (let ri = 0; ri < studioReferenceImages.length; ri++) {
            await withRetry(
              () => uploadAndAddReferenceToPrompt(studioReferenceImages[ri]),
              {
                maxAttempts: 2,
                delayMs: 2000,
                label: `Upload studio ref ${ri + 1}`,
              },
            );
            for (let a = 0; a < 3; a++) {
              if (await switchToMode("image")) break;
              await sleep(1000);
            }
            await closeSettingsDropdown();
            await sleep(1000);
          }
        }
      } else {
        // ---- SCENE 2+: Stay on same page, right-click previous generated image ----
        // After the previous scene's video was created, the generated IMAGE is still
        // in the DOM. Right-click it → "Add to Prompt" to use as reference.
        console.log(
          `[TikTok Flow] Scene ${si + 1}: Right-clicking previous generated image → Add to Prompt`,
        );
        await withRetry(() => clickAddToPromptOnGeneratedImage(), {
          maxAttempts: 3,
          delayMs: 2000,
          label: `Scene ${si + 1}: Add generated image to prompt`,
        });

        // Switch to Image mode + 9:16
        for (let a = 0; a < 3; a++) {
          if (await switchToMode("image")) break;
          await sleep(1000);
        }
        await selectTriggerOption("PORTRAIT", "9:16");
        await sleep(500);
        await closeSettingsDropdown();
        await sleep(1000);

        // Re-upload product reference image so Google Flow keeps product consistency
        if (productImages && productImages.length > 0) {
          console.log(
            `[TikTok Flow] Scene ${si + 1}: Re-uploading product reference for consistency`,
          );
          await withRetry(
            () => uploadAndAddReferenceToPrompt(productImages[0]),
            {
              maxAttempts: 2,
              delayMs: 2000,
              label: `Scene ${si + 1}: Re-upload product ref`,
            },
          );
          for (let a = 0; a < 3; a++) {
            if (await switchToMode("image")) break;
            await sleep(1000);
          }
          await closeSettingsDropdown();
          await sleep(1000);
        }
      }

      // Fill image prompt
      let promptEl = findPromptInput();
      if (!promptEl) {
        await sleep(3000);
        promptEl = findPromptInput();
      }
      if (!promptEl)
        throw new Error(`Scene ${si + 1}: Could not find prompt input`);

      simulateClick(promptEl);
      await sleep(300);
      await fillPrompt(promptEl, scene.imagePrompt);

      // Click Create for image
      let createBtn = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(500);
        createBtn = findGenerateButton();
        if (createBtn) break;
        await sleep(1000);
      }
      if (!createBtn)
        throw new Error(`Scene ${si + 1}: Create button not found`);
      simulateClick(createBtn);
      console.log(`[TikTok Flow] Scene ${si + 1}: Image Create clicked`);

      // Wait for UI to transition before polling for result
      await sleep(3000);

      // Wait for image result
      const imgResultEl = await waitForImageResult(180000);
      const imageUrl = extractMediaUrl(imgResultEl);
      if (!imageUrl)
        throw new Error(
          `Scene ${si + 1}: Image appeared but could not extract URL`,
        );

      console.log(
        `[TikTok Flow] Scene ${si + 1}: Image generated:`,
        imageUrl.substring(0, 80),
      );

      // Download and upload to backend with sceneIndex
      const uploadResult = await downloadAndUploadImage(imgResultEl, jobId, si);
      console.log(
        `[TikTok Flow] Scene ${si + 1}: Image uploaded:`,
        uploadResult.imageUrl,
      );

      // === VIDEO GENERATION ===

      // Check if video should be routed to Grok
      let useGrok = false;
      try {
        const result = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: "GET_VIDEO_ENGINE" },
            (response) => {
              if (chrome.runtime.lastError) resolve("google-flow");
              else resolve(response || "google-flow");
            },
          );
        });
        useGrok = result === "grok";
      } catch {
        useGrok = false;
      }

      if (useGrok) {
        // Route video generation to Grok via background.js
        console.log(`[TikTok Flow] Scene ${si + 1}: Routing video to GROK...`);

        // Capture the scene image as data URL directly from the DOM (avoids CORS)
        let sceneImageDataUrl = null;
        try {
          const imgEl =
            imgResultEl.tagName === "IMG"
              ? imgResultEl
              : imgResultEl.querySelector("img");
          if (imgEl) {
            const canvas = document.createElement("canvas");
            canvas.width = imgEl.naturalWidth || imgEl.width || 720;
            canvas.height = imgEl.naturalHeight || imgEl.height || 1280;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(imgEl, 0, 0);
            sceneImageDataUrl = canvas.toDataURL("image/png");
            console.log(
              `[TikTok Flow] Scene ${si + 1}: Captured image as data URL (${(sceneImageDataUrl.length / 1024).toFixed(0)}KB)`,
            );
          }
        } catch (e) {
          console.warn(
            `[TikTok Flow] Scene ${si + 1}: Could not capture image for Grok:`,
            e.message,
          );
        }

        const grokResult = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "ROUTE_VIDEO_TO_GROK",
              payload: {
                jobId,
                sceneIndex: si,
                prompt: scene.videoPrompt,
                referenceImageDataUrl: sceneImageDataUrl,
                duration: "6s",
              },
            },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({ error: chrome.runtime.lastError.message });
              } else {
                resolve(response || { error: "No response" });
              }
            },
          );
        });

        if (grokResult.error) {
          // "message channel closed" can happen if Grok tab navigated —
          // but video may still have been uploaded. Check before failing.
          const isChannelClosed =
            grokResult.error.includes("message channel closed") ||
            grokResult.error.includes(
              "listener indicated an asynchronous response",
            );
          if (isChannelClosed) {
            console.log(
              `[TikTok Flow] Scene ${si + 1}: Grok channel closed (may still be processing). Waiting 30s for video upload...`,
            );
            // Give Grok time to finish uploading the video even though the channel closed
            await sleep(30000);
          } else {
            throw new Error(
              `Scene ${si + 1}: Grok video failed: ${grokResult.error}`,
            );
          }
        }

        console.log(`[TikTok Flow] Scene ${si + 1}: Grok video routing done`);
      } else {
        // Animate the generated image (right-click → Animate)
        await withRetry(() => clickAnimateAndWaitForVideoMode(), {
          maxAttempts: 3,
          delayMs: 2000,
          label: `Scene ${si + 1}: Animate for video`,
        });
        await sleep(2000);

        // Set 9:16 for video and select model
        await openSettingsDropdown();
        await sleep(500);
        await selectTriggerOption("PORTRAIT", "9:16");
        await sleep(500);
        if (videoModel) {
          await trySelectModel(videoModel);
          await sleep(500);
        }
        await closeSettingsDropdown();
        await sleep(500);

        // Fill video prompt
        let videoPromptEl = findPromptInput();
        if (!videoPromptEl) {
          await sleep(3000);
          videoPromptEl = findPromptInput();
        }
        if (!videoPromptEl)
          throw new Error(`Scene ${si + 1}: Video prompt input not found`);

        simulateClick(videoPromptEl);
        await sleep(300);
        await fillPrompt(videoPromptEl, scene.videoPrompt);

        // Click Create for video
        await sleep(500);
        const videoCreateBtn = findGenerateButton();
        if (!videoCreateBtn)
          throw new Error(`Scene ${si + 1}: Video Create button not found`);
        simulateClick(videoCreateBtn);
        console.log(`[TikTok Flow] Scene ${si + 1}: Video Create clicked`);

        // Wait for UI to transition before polling for result
        await sleep(3000);

        // Wait for video result
        const videoResultEl = await waitForVideoResult(360000);

        // Download and upload video with sceneIndex
        let videoUrl;
        try {
          const videoUploadResult = await downloadAndUploadVideo(
            videoResultEl,
            jobId,
            si,
          );
          videoUrl = videoUploadResult.videoUrl;
          console.log(
            `[TikTok Flow] Scene ${si + 1}: Video uploaded:`,
            videoUrl,
          );
        } catch (dlErr) {
          console.warn(
            `[TikTok Flow] Scene ${si + 1}: Video download failed:`,
            dlErr.message,
          );
          videoUrl = extractMediaUrl(videoResultEl);
        }
      } // end else (Google Flow video)

      scenesCompleted++;
      console.log(`[TikTok Flow] Scene ${si + 1}/${scenes.length} COMPLETE`);

      // Update job status to show progress
      await updateJobStatus(jobId, {
        errorMessage: `Multi-scene progress: ${scenesCompleted}/${scenes.length} scenes completed`,
      });

      // Brief pause before starting next scene
      if (si < scenes.length - 1) {
        console.log(
          `[TikTok Flow] Waiting 3s before starting Scene ${si + 2}...`,
        );
        await sleep(3000);
      }
    }

    // All scenes done — mark job as ready
    console.log(
      "[TikTok Flow] === All",
      scenesCompleted,
      "scenes completed for job:",
      jobId,
    );
    await updateJobStatus(jobId, {
      status: "ready",
      errorMessage: "",
    });

    return { success: true, scenesCompleted };
  } catch (err) {
    console.error(
      "[TikTok Flow] Multi-scene FAILED at scene:",
      scenesCompleted + 1,
      err.message,
    );
    await updateJobStatus(jobId, {
      status: "failed",
      errorMessage: `Scene ${scenesCompleted + 1} failed: ${err.message} (${scenesCompleted}/${scenes.length} completed)`,
    });
    return { error: err.message };
  }
}

// ---- Generate Video from Gallery Image ----
// Opens a new VIDEO project directly, uploads the gallery image into the
// "Start" slot (first frame), enters the video prompt, and generates.
// This skips image generation entirely — uses our gallery image as-is.
async function generateVideoFromImage({
  jobId,
  prompt,
  referenceImageDataUrl,
  videoModel,
}) {
  console.log(
    "[TikTok Flow] === Starting VIDEO FROM IMAGE generation for job:",
    jobId,
  );
  console.log(
    "[TikTok Flow] Prompt:",
    (prompt || "").substring(0, 100) + "...",
  );
  console.log(
    "[TikTok Flow] Reference image provided:",
    !!referenceImageDataUrl,
  );
  console.log("[TikTok Flow] Video model:", videoModel || "default");

  try {
    verifyFlowPage();
    await sleep(2000);

    // Step 1: Navigate to a fresh project in IMAGE mode first.
    // Google Flow remembers the last-used mode. "Add to Prompt" for reference
    // images only works reliably in Image mode. We upload + add reference in
    // Image mode, then switch to Video mode before clicking Create.
    await withRetry(() => navigateToNewProject("image"), {
      maxAttempts: 5,
      delayMs: 3000,
      label: "Navigate to new image project",
    });
    await sleep(1500);

    // Step 2: Ensure IMAGE mode is selected (so the reference upload UI is correct)
    console.log("[TikTok Flow] Ensuring Image mode for reference upload...");
    let switched = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      switched = await switchToMode("image");
      if (switched) break;
      await sleep(1000);
    }
    if (!switched) {
      console.warn(
        "[TikTok Flow] Could not switch to Image mode — proceeding anyway",
      );
    }

    // Step 2.1: Set aspect ratio to 9:16 (PORTRAIT)
    console.log("[TikTok Flow] Setting aspect ratio to 9:16 (PORTRAIT)...");
    await selectTriggerOption("PORTRAIT", "9:16");
    await sleep(500);
    await closeSettingsDropdown();
    await sleep(500);

    // Step 3: Upload the gallery image as a reference and "Add to Prompt"
    // (same pattern as generateImageOnly — this is the proven working flow)
    if (referenceImageDataUrl) {
      console.log(
        "[TikTok Flow] Uploading gallery image as reference in Image mode...",
      );
      await withRetry(
        () => uploadAndAddReferenceToPrompt(referenceImageDataUrl),
        {
          maxAttempts: 3,
          delayMs: 2000,
          label: "Upload gallery image and add to prompt",
        },
      );
      console.log(
        "[TikTok Flow] ✅ Gallery image uploaded and added to prompt",
      );
      await sleep(1000);
    } else {
      console.warn(
        "[TikTok Flow] No reference image — video will generate from prompt only",
      );
    }

    // Step 4: Switch to VIDEO mode for generation
    console.log("[TikTok Flow] Switching to Video mode for generation...");
    switched = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      switched = await switchToMode("video");
      if (switched) break;
      await sleep(1000);
    }
    if (!switched) {
      console.warn(
        "[TikTok Flow] Could not switch to Video mode — proceeding anyway",
      );
    }

    // Step 4.1: Set video model if specified
    if (videoModel) {
      await openSettingsDropdown();
      await sleep(500);
      await trySelectModel(videoModel);
      await sleep(500);
      await closeSettingsDropdown();
      await sleep(500);
    }

    // Step 5: Find and fill the video prompt
    let promptEl = findPromptInput();
    if (!promptEl) {
      await sleep(3000);
      promptEl = findPromptInput();
    }
    if (!promptEl) {
      throw new Error("Could not find prompt input for video generation.");
    }

    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, prompt);

    // Step 6: Click Create for video
    let createBtn = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(500);
      createBtn = findGenerateButton();
      if (createBtn) break;
      await sleep(1000);
    }
    if (!createBtn) {
      throw new Error("Could not find Create button for video.");
    }
    simulateClick(createBtn);
    console.log("[TikTok Flow] Video Create clicked, waiting for result...");

    // Step 7: Wait for video result
    await sleep(3000);
    const resultEl = await waitForVideoResult(360000); // 6 min timeout

    // Step 8: Download and upload video
    let videoUrl;
    try {
      const uploadResult = await downloadAndUploadVideo(resultEl, jobId);
      videoUrl = uploadResult.videoUrl;
      console.log("[TikTok Flow] Video downloaded and processed:", videoUrl);
    } catch (downloadErr) {
      console.warn(
        "[TikTok Flow] Video download failed, using raw URL:",
        downloadErr.message,
      );
      videoUrl = extractMediaUrl(resultEl);
      if (!videoUrl) {
        throw new Error("Video appeared but could not extract or download it");
      }
    }

    console.log(
      "[TikTok Flow] Video from image SUCCESS:",
      videoUrl.substring(0, 100),
    );
    await updateJobStatus(jobId, { status: "ready", videoUrl });

    chrome.runtime.sendMessage({
      type: "JOB_PHASE_COMPLETE",
      payload: { jobId, phase: "video", nextStatus: "ready" },
    });

    return { success: true, videoUrl };
  } catch (err) {
    console.error("[TikTok Flow] Video from image FAILED:", err.message);
    await updateJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
    });
    return { error: err.message };
  }
}

// ---- Upload image into the "Start" slot for Video mode ----
// Google Flow Video mode has a "Start" area where you set the first frame.
// We click it, find the upload option, and inject our gallery image.
async function uploadStartImageForVideo(imageDataUrl) {
  console.log(
    "[TikTok Flow] Looking for Start/reference area in Video mode...",
  );

  // Step 1: Find and click the "Start" / reference image area
  let startArea = null;
  const divs = document.querySelectorAll("div");
  for (const div of divs) {
    const text = div.textContent.trim().toLowerCase();
    const rect = div.getBoundingClientRect();
    if (
      (text === "start" ||
        text === "reference" ||
        text === "add image" ||
        text === "first frame") &&
      rect.width > 40 &&
      rect.height > 40
    ) {
      startArea = div;
      break;
    }
  }
  if (!startArea) {
    startArea =
      findButtonByText("Start") ||
      findButtonByText("Add image") ||
      findButtonByText("Reference") ||
      findButtonByText("First frame");
  }
  // Fallback: look near the prompt area for clickable upload targets
  if (!startArea) {
    const promptEl = findPromptInput();
    if (promptEl) {
      let container = promptEl.parentElement;
      for (let i = 0; i < 8 && container; i++) {
        const candidates = container.querySelectorAll(
          'div[role="button"], button, div[tabindex]',
        );
        for (const c of candidates) {
          const text = c.textContent.trim().toLowerCase();
          const rect = c.getBoundingClientRect();
          if (
            rect.width > 30 &&
            rect.height > 30 &&
            (text.includes("start") ||
              text.includes("image") ||
              text.includes("upload") ||
              text.includes("add_photo") ||
              text.includes("first frame"))
          ) {
            startArea = c;
            break;
          }
        }
        if (startArea) break;
        container = container.parentElement;
      }
    }
  }

  if (!startArea) {
    console.warn(
      "[TikTok Flow] Start area not found — trying direct file input",
    );
    await tryDirectFileUpload(imageDataUrl);
    return await verifyReferenceImageUploaded();
  }

  simulateClick(startArea);
  console.log("[TikTok Flow] Clicked Start area in Video mode");
  await sleep(1000);

  // Step 2: Look for "Upload image" button in the picker
  const uploadBtn =
    findButtonByText("Upload image") ||
    findButtonByText("Upload") ||
    findButtonContainingText("Upload");
  if (uploadBtn) {
    simulateClick(uploadBtn);
    console.log("[TikTok Flow] Clicked 'Upload image' button");
    await sleep(800);
  }

  // Step 3: Find file input and inject our gallery image
  const fileInput =
    document.querySelector('input[type="file"][accept*="image"]') ||
    document.querySelector('input[type="file"]');

  if (fileInput) {
    try {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const file = new File([blob], "gallery-image.png", {
        type: blob.type || "image/png",
      });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));
      console.log("[TikTok Flow] Gallery image uploaded via file input");
      await sleep(2000);
      return await verifyReferenceImageUploaded();
    } catch (fetchErr) {
      console.warn(
        "[TikTok Flow] Failed to inject gallery image:",
        fetchErr.message,
      );
    }
  }

  // Fallback: try direct file input injection
  console.log("[TikTok Flow] Trying direct file input fallback...");
  await tryDirectFileUpload(imageDataUrl);
  return await verifyReferenceImageUploaded();
}

// ---- Main: Generate Video ----
// Right-clicks the generated image → Animate → fills video prompt → Create.
// Stays on the SAME project page as the image generation (no new project).
async function generateVideo({ jobId, prompt, imageUrl, videoModel }) {
  console.log("[TikTok Flow] === Starting VIDEO generation for job:", jobId);
  console.log("[TikTok Flow] Prompt:", prompt.substring(0, 100) + "...");
  console.log("[TikTok Flow] Video model:", videoModel || "default");

  try {
    verifyFlowPage();
    await sleep(2000);

    // Step 1: Click "Animate" on the generated image (with retry)
    await withRetry(() => clickAnimateAndWaitForVideoMode(), {
      maxAttempts: 3,
      delayMs: 2000,
      label: "Click Animate for video mode",
    });
    await sleep(2000);

    // Step 1.5: Ensure 9:16 (PORTRAIT) aspect ratio for video and select model
    console.log(
      "[TikTok Flow] Setting video aspect ratio to 9:16 (PORTRAIT)...",
    );
    await openSettingsDropdown();
    await sleep(500);
    await selectTriggerOption("PORTRAIT", "9:16");
    await sleep(500);
    if (videoModel) {
      await trySelectModel(videoModel);
      await sleep(500);
    }
    await closeSettingsDropdown();
    await sleep(500);

    // Step 2: Find and fill the video prompt
    let promptEl = findPromptInput();
    if (!promptEl) {
      await sleep(3000);
      promptEl = findPromptInput();
    }
    if (!promptEl) {
      throw new Error("Could not find prompt input for video generation.");
    }

    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, prompt);

    // Step 3: Click Create
    await sleep(500);
    const createBtn = findGenerateButton();
    if (!createBtn) {
      throw new Error("Could not find Create button for video");
    }
    simulateClick(createBtn);
    console.log("[TikTok Flow] Video Create clicked, waiting for result...");

    // Step 4: Wait for video result (videos take longer)
    await sleep(3000);
    const resultEl = await waitForVideoResult(360000); // 6 min timeout

    // Step 5: Download video blob and upload to backend for watermark removal
    let videoUrl;
    try {
      const uploadResult = await downloadAndUploadVideo(resultEl, jobId);
      videoUrl = uploadResult.videoUrl;
      console.log(
        "[TikTok Flow] Video downloaded and processed:",
        videoUrl,
        "watermark removed:",
        uploadResult.watermarkRemoved,
      );
    } catch (downloadErr) {
      // Fallback: store the raw URL if download/upload fails
      console.warn(
        "[TikTok Flow] Video download failed, using raw URL:",
        downloadErr.message,
      );
      videoUrl = extractMediaUrl(resultEl);
      if (!videoUrl) {
        throw new Error("Video appeared but could not extract or download it");
      }
    }

    console.log(
      "[TikTok Flow] Video generation SUCCESS:",
      videoUrl.substring(0, 100),
    );
    await updateJobStatus(jobId, { status: "ready", videoUrl });

    // Notify background that video is ready
    chrome.runtime.sendMessage({
      type: "JOB_PHASE_COMPLETE",
      payload: { jobId, phase: "video", nextStatus: "ready" },
    });

    return { success: true, videoUrl };
  } catch (err) {
    console.error("[TikTok Flow] Video generation FAILED:", err.message);
    await updateJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
    });
    return { error: err.message };
  }
}

// ---- Quick test: fill prompt and click Create (no job tracking) ----
async function testGenerate(prompt, productImages) {
  console.log("[TikTok Flow] === TEST GENERATE ===");
  console.log("[TikTok Flow] Prompt:", prompt);
  console.log(
    "[TikTok Flow] Product images:",
    (productImages || []).length,
    "available",
  );

  try {
    // Step 0: Create a new project (navigates to gallery if needed, clicks "New project" → Image)
    console.log("[TikTok Flow] Step 0: Creating new project...");
    const projectCreated = await navigateToNewProject("image");
    if (!projectCreated) {
      throw new Error("Step 0 FAILED: Could not create a new project.");
    }
    await sleep(1500);
    console.log("[TikTok Flow] Step 0 OK: New project created");

    // Step 1: Switch to Image mode via settings dropdown
    console.log("[TikTok Flow] Step 1: Switching to Image mode...");
    let switched = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      switched = await switchToMode("image");
      if (switched) break;
      console.log(
        "[TikTok Flow] Image mode switch attempt",
        attempt + 1,
        "failed, retrying...",
      );
      await sleep(1000);
    }
    if (!switched) {
      await closeSettingsDropdown();
      throw new Error(
        "Step 1 FAILED: Could not switch to Image mode after 3 attempts.",
      );
    }

    // Step 1.1: Set aspect ratio to 9:16 (PORTRAIT) for TikTok
    console.log(
      "[TikTok Flow] Setting image aspect ratio to 9:16 (PORTRAIT)...",
    );
    await selectTriggerOption("PORTRAIT", "9:16");
    await sleep(500);

    await closeSettingsDropdown();
    await sleep(500);
    console.log("[TikTok Flow] Step 1 OK: Image mode selected (9:16 PORTRAIT)");

    // Step 1.5: Upload product reference image → right-click → "Add to Prompt" (same pattern as Animate)
    if (productImages && productImages.length > 0) {
      console.log(
        "[TikTok Flow] Step 1.5: Uploading product reference image...",
      );
      await uploadAndAddReferenceToPrompt(productImages[0]);
      console.log(
        "[TikTok Flow] Step 1.5 OK: Reference image uploaded and added to prompt",
      );

      // Ensure still in Image mode after "Add to Prompt"
      console.log("[TikTok Flow] Step 1.6: Verifying Image mode...");
      let reSwitched = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        reSwitched = await switchToMode("image");
        if (reSwitched) break;
        await sleep(1000);
      }
      await closeSettingsDropdown();
      await sleep(1000);
      console.log("[TikTok Flow] Step 1.6 OK: Image mode confirmed");
    }

    // Step 2: Find and fill the prompt
    console.log("[TikTok Flow] Step 2: Inserting prompt...");
    let promptEl = findPromptInput();
    if (!promptEl) {
      await sleep(2000);
      promptEl = findPromptInput();
    }
    if (!promptEl) throw new Error("Step 2 FAILED: Prompt input not found");

    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, prompt);

    const filledText = promptEl.textContent.trim();
    if (!filledText || filledText.toLowerCase().includes("what do you want")) {
      console.warn("[TikTok Flow] Prompt may not have been filled correctly!");
    } else {
      console.log("[TikTok Flow] Step 2 OK: Prompt filled");
    }

    // Step 3: Click Create to generate image
    console.log("[TikTok Flow] Step 3: Clicking Create...");
    await sleep(500);
    const createBtn = findGenerateButton();
    if (!createBtn) throw new Error("Step 3 FAILED: Create button not found");

    simulateClick(createBtn);
    console.log("[TikTok Flow] Step 3 OK: Create clicked!");

    return {
      success: true,
      message:
        "✅ Image mode set → Prompt filled → Create clicked. Watch Google Flow for result.",
    };
  } catch (err) {
    console.error("[TikTok Flow] Test generate failed:", err.message);
    return { error: err.message };
  }
}

// ---- Quick test: video generation via Animate (no job tracking) ----
// Stays in the SAME project — must have an image created/visible first!
// Clicks "Animate" on the image → fills prompt → clicks Create.
async function testVideoGenerate(prompt) {
  console.log("[TikTok Flow] === TEST VIDEO GENERATE (Animate flow) ===");
  console.log("[TikTok Flow] Prompt:", prompt);

  try {
    // Step 1: Wait for image generation to complete first.
    console.log("[TikTok Flow] Waiting for image generation to complete...");
    await waitForGenerationComplete(180000); // 3 min max wait
    console.log(
      "[TikTok Flow] Generation appears complete, proceeding to Animate...",
    );
    await sleep(1500);

    // Step 2: Click "Animate" button on the generated image
    // This auto-switches to video creation with image pre-selected.
    await clickAnimateAndWaitForVideoMode();
    await sleep(2000);

    // Step 3: Find and fill prompt
    console.log("[TikTok Flow] Inserting video prompt...");
    let promptEl = findPromptInput();
    if (!promptEl) {
      await sleep(3000);
      promptEl = findPromptInput();
    }
    if (!promptEl) throw new Error("Prompt input not found after Animate");

    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, prompt);

    // Verify
    const filledText = promptEl.textContent.trim();
    if (!filledText || filledText.toLowerCase().includes("what do you want")) {
      console.warn(
        "[TikTok Flow] Video prompt may not have been filled correctly!",
      );
    } else {
      console.log(
        "[TikTok Flow] Video prompt text:",
        JSON.stringify(filledText.substring(0, 60)),
      );
    }

    // Step 4: Click Create
    await sleep(500);
    const createBtn = findGenerateButton();
    if (!createBtn) throw new Error("Create button not found");

    simulateClick(createBtn);
    console.log("[TikTok Flow] Video Create button clicked!");

    return {
      success: true,
      message:
        "✅ Animate clicked → Video prompt filled → Create clicked. Watch Google Flow for result.",
    };
  } catch (err) {
    console.error("[TikTok Flow] Test video generate failed:", err.message);
    return { error: err.message };
  }
}

// ---- Quick action: Animate image + fill prompt (triggered from side panel) ----
async function animateGeneratedImage(prompt) {
  console.log("[TikTok Flow] === ANIMATE GENERATED IMAGE ===");
  console.log("[TikTok Flow] Prompt:", prompt);

  try {
    // Step 1: Click Animate
    await clickAnimateAndWaitForVideoMode();
    await sleep(2000);

    // Step 2: Fill prompt if provided
    if (prompt) {
      let promptEl = findPromptInput();
      if (!promptEl) {
        await sleep(3000);
        promptEl = findPromptInput();
      }
      if (promptEl) {
        simulateClick(promptEl);
        await sleep(300);
        await fillPrompt(promptEl, prompt);
        console.log("[TikTok Flow] Video prompt filled");
      }
    }

    return {
      success: true,
      message: "✅ Animate clicked — video creation mode ready.",
    };
  } catch (err) {
    console.error("[TikTok Flow] Animate failed:", err.message);
    return { error: err.message };
  }
}

// ---- Full flow test: Image creation → wait → Animate → Video creation ----
async function testFullFlow(payload = {}) {
  const imagePrompt =
    payload?.imagePrompt ||
    "A beautiful product photo of a trendy item on a clean white background, professional lighting, 4K";
  const videoPrompt =
    payload?.videoPrompt ||
    "Smooth cinematic camera pan showcasing a trendy product on a table with soft warm lighting, 9:16 vertical video for TikTok";
  const productImages = payload?.productImages || [];

  console.log("[TikTok Flow] === FULL FLOW TEST ===");
  console.log("[TikTok Flow] Image prompt:", imagePrompt.substring(0, 80));
  console.log("[TikTok Flow] Video prompt:", videoPrompt.substring(0, 80));
  console.log(
    "[TikTok Flow] Product images:",
    productImages.length,
    "available",
  );

  const progress = (step, msg) => {
    console.log(`[TikTok Flow] [${step}] ${msg}`);
  };

  try {
    // ===== PHASE 1: Create Image =====
    progress("1/7", "Creating new project in Image mode...");
    const projectCreated = await navigateToNewProject("image");
    if (!projectCreated) throw new Error("Could not create new project");
    await sleep(1500);

    progress("2/7", "Switching to Image mode (9:16 PORTRAIT)...");
    let switched = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      switched = await switchToMode("image");
      if (switched) break;
      await sleep(1000);
    }

    // Set aspect ratio to 9:16 (PORTRAIT) for TikTok
    await selectTriggerOption("PORTRAIT", "9:16");
    await sleep(500);

    await closeSettingsDropdown();
    await sleep(500);

    // Upload product reference image → right-click → "Add to Prompt" (same pattern as Animate)
    if (productImages.length > 0) {
      progress("3/7", "Uploading product reference image...");
      await uploadAndAddReferenceToPrompt(productImages[0]);
      progress("3/7", "✅ Reference image uploaded and added to prompt");

      // Ensure still in Image mode after "Add to Prompt"
      let reSwitched = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        reSwitched = await switchToMode("image");
        if (reSwitched) break;
        await sleep(1000);
      }
      await closeSettingsDropdown();
      await sleep(1000);
    } else {
      progress("3/7", "No product images — skipping reference upload");
    }

    progress("4/7", "Filling image prompt and clicking Create...");
    let promptEl = findPromptInput();
    if (!promptEl) {
      await sleep(2000);
      promptEl = findPromptInput();
    }
    if (!promptEl) throw new Error("Prompt input not found for image");
    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, imagePrompt);
    await sleep(500);
    const createBtn = findGenerateButton();
    if (!createBtn) throw new Error("Create button not found");
    simulateClick(createBtn);

    // ===== PHASE 2: Wait for image generation =====
    progress(
      "5/7",
      "Waiting for image generation to complete (up to 3 min)...",
    );
    const imageReady = await waitForGenerationComplete(180000);
    if (!imageReady) {
      console.warn(
        "[TikTok Flow] Image generation may not have completed, proceeding anyway...",
      );
    }
    progress("5/7", "Image generation complete!");
    await sleep(2000);

    // ===== PHASE 3: Animate → Video =====
    progress("6/7", "Clicking Animate on generated image...");
    await clickAnimateAndWaitForVideoMode();
    await sleep(2000);

    // Ensure 9:16 (PORTRAIT) aspect ratio for video
    progress("6.5/7", "Setting video aspect ratio to 9:16 (PORTRAIT)...");
    await openSettingsDropdown();
    await sleep(500);
    await selectTriggerOption("PORTRAIT", "9:16");
    await sleep(500);
    await closeSettingsDropdown();
    await sleep(500);

    progress("7/7", "Filling video prompt and clicking Create...");
    promptEl = findPromptInput();
    if (!promptEl) {
      await sleep(3000);
      promptEl = findPromptInput();
    }
    if (!promptEl) throw new Error("Prompt input not found for video");
    simulateClick(promptEl);
    await sleep(300);
    await fillPrompt(promptEl, videoPrompt);
    await sleep(500);
    const videoCreateBtn = findGenerateButton();
    if (!videoCreateBtn) throw new Error("Create button not found for video");
    simulateClick(videoCreateBtn);

    // ===== PHASE 4: Wait for video result =====
    progress(
      "8/9",
      "Waiting for video generation to complete (up to 6 min)...",
    );
    await sleep(5000);
    const videoResultEl = await waitForVideoResult(360000);
    progress("8/9", "Video generation complete!");

    // ===== PHASE 5: Download video and upload to backend =====
    progress("9/9", "Downloading video and uploading to backend...");
    let videoUrl = null;
    try {
      // Use a test job ID — try to find a ready/pending job, or use "test"
      const testJobId = payload?.jobId || "test";
      const uploadResult = await downloadAndUploadVideo(
        videoResultEl,
        testJobId,
      );
      videoUrl = uploadResult.videoUrl;
      progress(
        "9/9",
        `✅ Video uploaded! Watermark zoom: ${uploadResult.watermarkRemoved}`,
      );
    } catch (downloadErr) {
      console.warn(
        "[TikTok Flow] Video download/upload failed:",
        downloadErr.message,
      );
      videoUrl = extractMediaUrl(videoResultEl);
      progress("9/9", "⚠️ Download failed, raw URL: " + (videoUrl || "none"));
    }

    progress(
      "DONE",
      "Full flow complete! Image → Animate → Video → Downloaded.",
    );
    return {
      success: true,
      videoUrl,
      message:
        "\u2705 Full flow: Image → Animate → Video → Download. " +
        (videoUrl ? "Video: " + videoUrl : "Check Google Flow for result."),
    };
  } catch (err) {
    console.error("[TikTok Flow] Full flow test failed:", err.message);
    return { error: err.message };
  }
}

// ---- Wait for the current generation (image/video) to complete ----
// Polls for signs that generation is done: new images, download buttons,
// or the tabs changing state.
async function waitForGenerationComplete(timeout = 180000) {
  // Quick check: if a generated image already exists, no need to wait
  const existingGenImage = findGeneratedImage();
  if (existingGenImage) {
    console.log(
      "[TikTok Flow] Generated image already present — skipping wait",
    );
    return true;
  }

  const start = Date.now();
  const beforeImages = new Set();
  document.querySelectorAll("img").forEach((img) => beforeImages.add(img.src));

  while (Date.now() - start < timeout) {
    // Check for new images that appeared (generation result)
    const currentImages = document.querySelectorAll("img");
    for (const img of currentImages) {
      if (!beforeImages.has(img.src) && img.src && img.src.startsWith("http")) {
        if (img.naturalWidth > 100 && img.naturalHeight > 100) {
          console.log(
            "[TikTok Flow] New generated image detected:",
            img.src.substring(0, 80),
          );
          return true;
        }
      }
    }

    // Check for download/share buttons that appear after generation
    const downloadBtns = document.querySelectorAll(
      'button[aria-label*="download" i], button[aria-label*="Download" i], a[download]',
    );
    if (downloadBtns.length > 0) {
      console.log(
        "[TikTok Flow] Download button appeared — generation complete",
      );
      return true;
    }

    // Check if Image/Video tabs appeared (they show up after first generation)
    const tabs = document.querySelectorAll("button.flow_tab_slider_trigger");
    if (tabs.length > 0) {
      console.log(
        "[TikTok Flow] Tab buttons appeared — generation likely complete",
      );
      return true;
    }

    // Check for any button with "Video" in its ID (tabs rendering)
    const videoTrigger = document.querySelector('button[id*="trigger-VIDEO"]');
    if (videoTrigger) {
      console.log("[TikTok Flow] Video trigger appeared — generation complete");
      return true;
    }

    await sleep(3000);
  }

  console.warn(
    "[TikTok Flow] Timed out waiting for generation to complete — proceeding anyway",
  );
  return false;
}

// ---- Try to upload/select a reference image for video generation ----
// Google Flow video mode has a "Start" area that opens
// an image picker with recent images in a virtuoso scroller + "Upload image" option
async function tryUploadReferenceImage(imageUrl) {
  try {
    // Step 1: Click the "Start" area to open the image picker
    let startArea = null;
    const divs = document.querySelectorAll("div");
    for (const div of divs) {
      if (
        div.textContent.trim().toLowerCase() === "start" &&
        div.getBoundingClientRect().width > 40
      ) {
        startArea = div;
        break;
      }
    }
    if (!startArea) startArea = findButtonByText("Start");

    if (!startArea) {
      console.log(
        "[TikTok Flow] No 'Start' area found — trying direct file upload",
      );
      return await tryDirectFileUpload(imageUrl);
    }

    simulateClick(startArea);
    await sleep(800);

    // Step 2: Check if "Upload image" option is available
    const uploadBtn =
      findButtonByText("Upload image") || findButtonByText("Upload");
    if (uploadBtn) {
      simulateClick(uploadBtn);
      await sleep(500);

      // Look for the file input that should appear
      const fileInput =
        document.querySelector('input[type="file"][accept*="image"]') ||
        document.querySelector('input[type="file"]');

      if (fileInput) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "reference.png", {
          type: blob.type || "image/png",
        });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
        console.log("[TikTok Flow] Reference image uploaded via file input");
        await sleep(2000);
        return;
      }
    }

    // Step 3: Fallback — select the most recent image from the virtuoso list
    const scroller = document.querySelector(
      '[data-testid="virtuoso-scroller"]',
    );
    if (scroller) {
      const imageItems = scroller.querySelectorAll("img");
      if (imageItems.length > 0) {
        simulateClick(imageItems[0]);
        console.log("[TikTok Flow] Selected most recent image from gallery");
        await sleep(1000);
        return;
      }
    }

    console.log(
      "[TikTok Flow] Could not upload or select reference image — continuing without",
    );
  } catch (err) {
    console.warn("[TikTok Flow] Reference image upload failed:", err.message);
  }
}

// ---- Direct file upload fallback ----
async function tryDirectFileUpload(imageUrl) {
  try {
    const fileInput =
      document.querySelector('input[type="file"][accept*="image"]') ||
      document.querySelector('input[type="file"]');

    if (!fileInput) {
      console.log("[TikTok Flow] No file input found — skipping upload");
      return;
    }

    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const file = new File([blob], "reference.png", {
      type: blob.type || "image/png",
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    console.log("[TikTok Flow] Reference image uploaded via direct file input");
    await sleep(2000);
  } catch (err) {
    console.warn("[TikTok Flow] Direct file upload failed:", err.message);
  }
}

// ---- Try to select a specific AI model ----
// The model selector is a button[aria-haspopup="menu"] INSIDE the settings dropdown.
// It shows the current model name (e.g. "Veo 3.1 - Lite") with an arrow_drop_down icon.
// Clicking it opens a nested menu with model options.
// The settings dropdown MUST be open before calling this.
async function trySelectModel(modelName = "Veo 3.1 - Fast") {
  try {
    console.log("[TikTok Flow] Selecting model:", modelName);
    const popup = findDropdownPopup();
    const searchRoot = popup || document;

    // Step 1: Find the model trigger button (aria-haspopup="menu" with model name text)
    let modelTrigger = null;
    const menuBtns = searchRoot.querySelectorAll(
      'button[aria-haspopup="menu"]',
    );
    for (const btn of menuBtns) {
      const text = btn.textContent.trim();
      if (/Veo|Imagen|Flash|Nano/.test(text)) {
        modelTrigger = btn;
        break;
      }
    }

    if (!modelTrigger) {
      // Fallback: any button in the popup whose text contains known model names
      const allBtns = searchRoot.querySelectorAll("button");
      for (const btn of allBtns) {
        const text = btn.textContent.trim();
        if (/Veo|Imagen|Flash/.test(text) && /arrow_drop_down/.test(text)) {
          modelTrigger = btn;
          break;
        }
      }
    }

    if (!modelTrigger) {
      console.log(
        "[TikTok Flow] No model selector found in dropdown — using default",
      );
      return false;
    }

    const currentModel = modelTrigger.textContent
      .replace("arrow_drop_down", "")
      .trim();
    console.log("[TikTok Flow] Current model:", currentModel);

    // Check if already selected
    if (currentModel.includes(modelName)) {
      console.log("[TikTok Flow] Model already selected:", modelName);
      return true;
    }

    // Step 2: Click the model trigger to open the nested model menu
    simulateClick(modelTrigger);
    await sleep(800);

    // Step 3: Find and click the desired model option in the nested menu
    const optionSelectors = [
      '[role="menuitemradio"]',
      '[role="menuitem"]',
      '[role="option"]',
      "[data-radix-collection-item]",
    ];

    for (const sel of optionSelectors) {
      const options = document.querySelectorAll(sel);
      for (const opt of options) {
        const text = opt.textContent.trim();
        if (text.includes(modelName)) {
          const clickTarget =
            opt.closest(
              'button, [role="menuitemradio"], [role="menuitem"], [data-radix-collection-item]',
            ) || opt;
          simulateClick(clickTarget);
          console.log("[TikTok Flow] Selected model:", text.substring(0, 40));
          await sleep(500);
          return true;
        }
      }
    }

    // Step 4: Also try matching any visible button/div with model name text
    const allElements = document.querySelectorAll("button, div[role], span");
    for (const el of allElements) {
      const text = el.textContent.trim();
      const rect = el.getBoundingClientRect();
      if (
        text === modelName &&
        rect.width > 20 &&
        rect.height > 10 &&
        rect.width < 400
      ) {
        const clickTarget = el.closest("button") || el;
        simulateClick(clickTarget);
        console.log("[TikTok Flow] Selected model via element match:", text);
        await sleep(500);
        return true;
      }
    }

    // Close the model submenu if we didn't find the option
    simulateClick(modelTrigger);
    await sleep(300);
    console.log(
      "[TikTok Flow] Model option not found:",
      modelName,
      "— using default",
    );
    return false;
  } catch (err) {
    console.warn("[TikTok Flow] Model selection failed:", err.message);
    return false;
  }
}

// ---- Report status back to web app API ----
// Routes through the background service worker because content scripts
// on HTTPS pages (labs.google.com) cannot fetch HTTP localhost (mixed content).
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

// ---- Diagnostic: inspect current Flow UI for debugging ----
function inspectFlowUI() {
  const onCreation = isOnCreationPage();
  const promptInput = findPromptInput();
  const createBtn = findGenerateButton();

  // Detect "New project" button (gallery page)
  let newProjectBtn = null;
  for (const btn of document.querySelectorAll("button")) {
    const text = btn.textContent.trim().toLowerCase();
    if (text.includes("new project") || text.includes("add_2")) {
      newProjectBtn = btn;
      break;
    }
  }
  if (!newProjectBtn) {
    // Fallback: button with add icon
    for (const btn of document.querySelectorAll("button")) {
      if (btn.textContent.trim().includes("add_2")) {
        newProjectBtn = btn;
        break;
      }
    }
  }

  // Check for contenteditable divs (the real prompt input)
  const editables = [
    ...document.querySelectorAll('[contenteditable="true"]'),
  ].map((el) => ({
    tag: el.tagName,
    class: el.className?.substring(0, 60) || "",
    text: el.textContent?.trim().substring(0, 40) || "(empty)",
    size: `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
    visible: el.offsetParent !== null,
  }));

  // Check for Radix tab triggers (flow_tab_slider_trigger)
  const tabTriggers = [
    ...document.querySelectorAll(
      "button.flow_tab_slider_trigger, [role='tab']",
    ),
  ].map((t) => ({
    id: t.id || "(none)",
    text: t.textContent.trim().substring(0, 20),
    selected: t.getAttribute("aria-selected") || t.getAttribute("data-state"),
    class: t.className?.substring(0, 50) || "",
  }));

  // Check for model selector (button with known model names inside it)
  let modelBtn = null;
  const modelButtons = [];
  for (const btn of document.querySelectorAll("button")) {
    const text = btn.textContent.trim();
    if (
      /Nano|Veo|Flash|Imagen/.test(text) &&
      btn.getBoundingClientRect().width > 30
    ) {
      if (!modelBtn) modelBtn = btn;
      modelButtons.push({
        text: text.substring(0, 40),
        id: btn.id || "",
        class: btn.className?.substring(0, 50) || "",
        state: btn.getAttribute("data-state") || "",
      });
    }
  }
  const modelInfo = modelBtn
    ? {
        found: true,
        text: modelBtn.textContent.trim().substring(0, 40),
        class: modelBtn.className?.substring(0, 50),
        allModels: modelButtons,
      }
    : { found: false };

  // Check for "Start" area (video frame selector)
  let startArea = null;
  for (const div of document.querySelectorAll("div")) {
    if (
      div.textContent.trim().toLowerCase() === "start" &&
      div.getBoundingClientRect().width > 40
    ) {
      startArea = div;
      break;
    }
  }

  // Check for virtuoso scroller (recent images)
  const virtuoso = document.querySelector('[data-testid="virtuoso-scroller"]');

  // All buttons (truncated)
  const buttons = [...document.querySelectorAll("button")]
    .slice(0, 25)
    .map((b) => ({
      text: b.textContent.trim().substring(0, 30),
      id: b.id || "",
      class: b.className?.substring(0, 50) || "",
      size: `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`,
    }));

  return {
    url: window.location.href,
    pageState: onCreation ? "creation" : "gallery",
    newProjectBtn: newProjectBtn
      ? {
          found: true,
          text: newProjectBtn.textContent.trim().substring(0, 30),
          class: newProjectBtn.className?.substring(0, 50),
        }
      : { found: false },
    promptFound: !!promptInput,
    promptTag: promptInput?.tagName,
    promptClass: promptInput?.className?.substring(0, 80),
    createBtnFound: !!createBtn,
    createBtnText: createBtn?.textContent?.trim()?.substring(0, 50),
    contenteditables: editables,
    tabTriggers,
    modelSelector: modelInfo,
    startAreaFound: !!startArea,
    virtuosoFound: !!virtuoso,
    generatedImage: !!findGeneratedImage(),
    animateBtn: !!findAnimateMenuItem(),
    buttons,
  };
}

// ---- Interaction Recorder ----
// Records clicks, input changes, and keypresses so we can extract real selectors

let isRecording = false;
let recordedEvents = [];
let recorderOverlay = null;

function getElementDescriptor(el) {
  if (!el || !el.tagName) return null;
  const rect = el.getBoundingClientRect();
  const descriptor = {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    classes: el.className ? String(el.className).substring(0, 120) : null,
    ariaLabel: el.getAttribute("aria-label") || null,
    ariaRole: el.getAttribute("role") || null,
    placeholder: el.placeholder || null,
    type: el.type || null,
    name: el.name || null,
    textContent: el.textContent?.trim().substring(0, 60) || null,
    dataTestId: el.getAttribute("data-testid") || null,
    hasSvg: !!el.querySelector("svg"),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    },
    // Build a CSS selector path
    selector: buildSelector(el),
    // Parent chain (3 levels up)
    parents: getParentChain(el, 3),
  };
  return descriptor;
}

function buildSelector(el) {
  if (!el || !el.tagName) return "";
  const parts = [];
  let current = el;
  for (let i = 0; i < 4 && current && current !== document.body; i++) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += "#" + current.id;
      parts.unshift(part);
      break;
    }
    if (current.getAttribute("aria-label")) {
      part += `[aria-label="${current.getAttribute("aria-label")}"]`;
      parts.unshift(part);
      break;
    }
    if (current.getAttribute("data-testid")) {
      part += `[data-testid="${current.getAttribute("data-testid")}"]`;
      parts.unshift(part);
      break;
    }
    if (current.className && typeof current.className === "string") {
      const mainClass = current.className
        .split(" ")
        .filter((c) => c.length > 0 && c.length < 40)[0];
      if (mainClass) part += "." + mainClass;
    }
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function getParentChain(el, depth) {
  const chain = [];
  let current = el.parentElement;
  for (let i = 0; i < depth && current && current !== document.body; i++) {
    chain.push({
      tag: current.tagName.toLowerCase(),
      id: current.id || null,
      class: current.className
        ? String(current.className).substring(0, 60)
        : null,
      role: current.getAttribute("role") || null,
    });
    current = current.parentElement;
  }
  return chain;
}

function onRecordClick(e) {
  const el = e.target;
  const desc = getElementDescriptor(el);
  if (!desc) return;

  // Skip clicks on the recorder overlay itself
  if (recorderOverlay && recorderOverlay.contains(el)) return;

  recordedEvents.push({
    type: "click",
    timestamp: Date.now(),
    element: desc,
    url: window.location.href,
  });

  // Flash the element to confirm recording
  const origOutline = el.style.outline;
  el.style.outline = "3px solid #f43f5e";
  setTimeout(() => {
    el.style.outline = origOutline;
  }, 500);

  updateRecorderBadge();
  console.log(
    "[Recorder] Click:",
    desc.tag,
    desc.selector,
    desc.textContent?.substring(0, 30),
  );
}

function onRecordInput(e) {
  const el = e.target;
  const desc = getElementDescriptor(el);
  if (!desc) return;
  if (recorderOverlay && recorderOverlay.contains(el)) return;

  // Debounce: update last input event if same element
  const last = recordedEvents[recordedEvents.length - 1];
  if (
    last &&
    last.type === "input" &&
    last.element.selector === desc.selector
  ) {
    last.value = (el.value || el.textContent || "").substring(0, 200);
    last.timestamp = Date.now();
    return;
  }

  recordedEvents.push({
    type: "input",
    timestamp: Date.now(),
    element: desc,
    value: (el.value || el.textContent || "").substring(0, 200),
    url: window.location.href,
  });

  updateRecorderBadge();
  console.log("[Recorder] Input:", desc.tag, desc.selector);
}

function onRecordFocus(e) {
  const el = e.target;
  const desc = getElementDescriptor(el);
  if (!desc) return;
  if (recorderOverlay && recorderOverlay.contains(el)) return;

  recordedEvents.push({
    type: "focus",
    timestamp: Date.now(),
    element: desc,
    url: window.location.href,
  });
  console.log("[Recorder] Focus:", desc.tag, desc.selector);
}

function createRecorderOverlay() {
  if (recorderOverlay) return;
  recorderOverlay = document.createElement("div");
  recorderOverlay.id = "tiktok-flow-recorder";
  recorderOverlay.style.cssText =
    "position:fixed;top:8px;right:8px;z-index:999999;background:#f43f5e;color:#fff;" +
    "padding:6px 12px;border-radius:20px;font:bold 12px sans-serif;cursor:pointer;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;gap:6px;";
  recorderOverlay.innerHTML = '⏺ <span id="rec-count">0</span> events';
  document.body.appendChild(recorderOverlay);
}

function removeRecorderOverlay() {
  if (recorderOverlay) {
    recorderOverlay.remove();
    recorderOverlay = null;
  }
}

function updateRecorderBadge() {
  const countEl = document.getElementById("rec-count");
  if (countEl) countEl.textContent = recordedEvents.length;
}

function startRecorder() {
  if (isRecording) return;
  isRecording = true;
  recordedEvents = [];
  document.addEventListener("click", onRecordClick, true);
  document.addEventListener("input", onRecordInput, true);
  document.addEventListener("focus", onRecordFocus, true);
  createRecorderOverlay();
  console.log(
    "[Recorder] Started — interact with the page, clicks & inputs will be recorded",
  );
}

function stopRecorder() {
  if (!isRecording) return recordedEvents;
  isRecording = false;
  document.removeEventListener("click", onRecordClick, true);
  document.removeEventListener("input", onRecordInput, true);
  document.removeEventListener("focus", onRecordFocus, true);
  removeRecorderOverlay();
  console.log("[Recorder] Stopped —", recordedEvents.length, "events captured");
  return [...recordedEvents];
}
