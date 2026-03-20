const API_BASE = "http://localhost:3000/api";

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from web app (externally_connectable)
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    // Reuse the same message handler
    handleMessage(message, sender, sendResponse);
    return true;
  },
);

// Message router between side panel and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

function handleMessage(message, sender, sendResponse) {
  const { type, payload } = message;

  switch (type) {
    case "GET_CURRENT_JOB":
      fetchCurrentJob().then(sendResponse);
      return true;

    case "START_AUTO":
      {
        const startPayload = {};
        if (currentCustomPromptId)
          startPayload.customPromptId = currentCustomPromptId;
        fetch(`${API_BASE}/jobs/start-auto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(startPayload),
        })
          .then((r) => r.json())
          .then(sendResponse)
          .catch((err) => sendResponse({ error: err.message }));
      }
      return true;

    case "UPDATE_JOB_STATUS":
      fetch(`${API_BASE}/jobs/${payload.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.data),
      })
        .then((r) => r.json())
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "SAVE_SCRAPED_PRODUCT":
      fetch(`${API_BASE}/products/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "SEND_TO_CONTENT_SCRIPT":
      // Forward message to the active tab's content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, payload, sendResponse);
        } else {
          sendResponse({ error: "No active tab" });
        }
      });
      return true;

    case "OPEN_GOOGLE_FLOW":
      chrome.tabs.create(
        { url: "https://labs.google/fx/tools/flow" },
        (tab) => {
          sendResponse({ tabId: tab.id });
        },
      );
      return true;

    case "OPEN_TIKTOK_STUDIO":
      chrome.tabs.create(
        { url: "https://www.tiktok.com/tiktokstudio/upload" },
        (tab) => {
          sendResponse({ tabId: tab.id });
        },
      );
      return true;

    case "SCRAPE_PRODUCT":
      // Ask the active tab's content script to scrape product data
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.id) {
          sendResponse({
            error: "No active tab. Open a TikTok Shop product page first.",
          });
          return;
        }
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "SCRAPE_PRODUCT" },
          (result) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                error:
                  "Cannot scrape this page. Make sure you are on a TikTok Shop product page.",
              });
              return;
            }
            if (result?.success) {
              // Send scraped data to web app API
              fetch(`${API_BASE}/products/scrape`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scraped: result.data }),
              })
                .then((r) => r.json())
                .then((data) => sendResponse({ success: true, product: data }))
                .catch((err) => sendResponse({ error: err.message }));
            } else {
              sendResponse({ error: result?.error || "Scraping failed" });
            }
          },
        );
      });
      return true;

    case "SCRAPE_PRODUCT_BY_URL":
      // Open a TikTok Shop URL in a new tab and scrape it
      chrome.tabs.create({ url: payload.url, active: false }, (tab) => {
        const tabId = tab.id;
        // Wait for page to load, then scrape
        const onComplete = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(onComplete);
            // Give it extra time for dynamic content
            setTimeout(() => {
              chrome.tabs.sendMessage(
                tabId,
                { type: "SCRAPE_PRODUCT" },
                (result) => {
                  // Close the tab after scraping
                  chrome.tabs.remove(tabId);
                  if (chrome.runtime.lastError || !result?.success) {
                    sendResponse({ error: result?.error || "Scraping failed" });
                    return;
                  }
                  // Send to API
                  fetch(`${API_BASE}/products/scrape`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scraped: result.data }),
                  })
                    .then((r) => r.json())
                    .then((data) =>
                      sendResponse({ success: true, product: data }),
                    )
                    .catch((err) => sendResponse({ error: err.message }));
                },
              );
            }, 3000);
          }
        };
        chrome.tabs.onUpdated.addListener(onComplete);
      });
      return true;

    case "INSPECT_FLOW":
      // Send INSPECT_DOM to Google Flow tab for debugging
      console.log("[TikTok Flow BG] INSPECT_FLOW received, finding tab...");
      findGoogleFlowTab().then((flowTabId) => {
        console.log("[TikTok Flow BG] findGoogleFlowTab returned:", flowTabId);
        if (!flowTabId) {
          sendResponse({
            error:
              "Google Flow tab not found. Open labs.google/fx/tools/flow first. " +
              "Then reload the extension if the page was open before installing.",
          });
          return;
        }
        chrome.tabs.sendMessage(
          flowTabId,
          { type: "INSPECT_DOM" },
          (response) => {
            console.log(
              "[TikTok Flow BG] INSPECT_DOM response:",
              response,
              "lastError:",
              chrome.runtime.lastError?.message,
            );
            if (chrome.runtime.lastError) {
              sendResponse({
                error:
                  "Content script not responding on Google Flow tab. " +
                  "Try refreshing the Flow page (the extension must inject after page load). " +
                  "Error: " +
                  chrome.runtime.lastError.message,
              });
              return;
            }
            sendResponse(response);
          },
        );
      });
      return true;

    case "OPEN_NEW_PROJECT":
      findGoogleFlowTab().then((flowTabId) => {
        if (!flowTabId) {
          sendResponse({ error: "Google Flow tab not found." });
          return;
        }
        chrome.tabs.sendMessage(
          flowTabId,
          { type: "OPEN_NEW_PROJECT" },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
              return;
            }
            sendResponse(response);
          },
        );
      });
      return true;

    case "TEST_GENERATE":
      findGoogleFlowTab().then((flowTabId) => {
        if (!flowTabId) {
          sendResponse({ error: "Google Flow tab not found." });
          return;
        }
        chrome.tabs.sendMessage(
          flowTabId,
          { type: "TEST_GENERATE", payload },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
              return;
            }
            sendResponse(response);
          },
        );
      });
      return true;

    case "TEST_VIDEO":
    case "TEST_FULL_FLOW":
      findGoogleFlowTab().then((flowTabId) => {
        if (!flowTabId) {
          sendResponse({ error: "Google Flow tab not found." });
          return;
        }
        chrome.tabs.sendMessage(flowTabId, { type, payload }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response);
        });
      });
      return true;

    case "START_RECORDER":
    case "STOP_RECORDER":
    case "GET_RECORDING":
    case "DIAGNOSE_MODE_SWITCH":
    case "TEST_SWITCH_IMAGE":
      // Forward recorder/diagnostic commands to Google Flow tab
      findGoogleFlowTab().then((flowTabId) => {
        if (!flowTabId) {
          sendResponse({ error: "Google Flow tab not found." });
          return;
        }
        chrome.tabs.sendMessage(flowTabId, { type }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response);
        });
      });
      return true;

    case "FILL_SLATE_PROMPT":
      fillSlatePrompt(sender.tab?.id, payload)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
  }
}

// ---- Slate prompt filling via main world injection or chrome.debugger ----

async function fillSlatePrompt(tabId, { text }) {
  if (!tabId) return { error: "No tab ID" };

  // Approach 1: Main world injection (access Slate API directly in page context)
  try {
    const result = await fillSlateViaMainWorld(tabId, text);
    if (result?.success) return result;
    console.warn("[TikTok Flow] Main world fill failed:", result?.error);
  } catch (err) {
    console.warn("[TikTok Flow] Main world fill error:", err.message);
  }

  // Approach 2: Chrome debugger (trusted input events)
  try {
    const result = await fillSlateViaDebugger(tabId, text);
    if (result?.success) return result;
    console.warn("[TikTok Flow] Debugger fill failed:", result?.error);
  } catch (err) {
    console.warn("[TikTok Flow] Debugger fill error:", err.message);
  }

  return { error: "All Slate fill approaches failed" };
}

async function fillSlateViaMainWorld(tabId, text) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (textToInsert) => {
      try {
        const slateEl = document.querySelector(
          '[data-slate-editor="true"]',
        );
        if (!slateEl) return { error: "Slate editor not found in DOM" };

        // Walk React fiber tree to find Slate editor instance
        const fiberKey = Object.keys(slateEl).find(
          (k) =>
            k.startsWith("__reactFiber$") ||
            k.startsWith("__reactInternalInstance$"),
        );
        if (!fiberKey)
          return { error: "No React fiber on Slate element" };

        function isEditor(obj) {
          return (
            obj &&
            typeof obj === "object" &&
            Array.isArray(obj.children) &&
            typeof obj.apply === "function" &&
            typeof obj.onChange === "function" &&
            typeof obj.insertText === "function"
          );
        }

        let editor = null;
        let fiber = slateEl[fiberKey];
        for (let depth = 0; depth < 80 && fiber; depth++) {
          let hook = fiber.memoizedState;
          while (hook) {
            const s = hook.memoizedState;
            if (isEditor(s)) {
              editor = s;
              break;
            }
            if (s && typeof s === "object" && isEditor(s.current)) {
              editor = s.current;
              break;
            }
            if (Array.isArray(s)) {
              for (const item of s) {
                if (isEditor(item)) {
                  editor = item;
                  break;
                }
              }
              if (editor) break;
            }
            if (
              hook.queue?.lastRenderedState &&
              isEditor(hook.queue.lastRenderedState)
            ) {
              editor = hook.queue.lastRenderedState;
              break;
            }
            hook = hook.next;
          }
          if (editor) break;
          if (fiber.memoizedProps) {
            for (const key of Object.keys(fiber.memoizedProps)) {
              if (isEditor(fiber.memoizedProps[key])) {
                editor = fiber.memoizedProps[key];
                break;
              }
            }
            if (editor) break;
          }
          fiber = fiber.return;
        }

        if (!editor)
          return { error: "Slate editor instance not found in React tree" };

        // Helper: first text point in Slate node tree
        function firstPoint(nodes) {
          function walk(node, path) {
            if ("text" in node) return { path, offset: 0 };
            if (node.children?.length)
              return walk(node.children[0], [...path, 0]);
            return null;
          }
          return nodes?.length ? walk(nodes[0], [0]) : null;
        }

        // Helper: last text point in Slate node tree
        function lastPoint(nodes) {
          function walk(node, path) {
            if ("text" in node)
              return { path, offset: (node.text || "").length };
            if (node.children?.length) {
              const i = node.children.length - 1;
              return walk(node.children[i], [...path, i]);
            }
            return null;
          }
          if (!nodes?.length) return null;
          const i = nodes.length - 1;
          return walk(nodes[i], [i]);
        }

        // Set selection using editor.apply (proper Slate operation pipeline)
        const start = firstPoint(editor.children);
        const end = lastPoint(editor.children);
        const newSel =
          start && end
            ? { anchor: start, focus: end }
            : {
                anchor: { path: [0, 0], offset: 0 },
                focus: { path: [0, 0], offset: 0 },
              };

        editor.apply({
          type: "set_selection",
          properties: editor.selection,
          newProperties: newSel,
        });

        // Insert text — replaces selected content via Slate's model
        editor.insertText(textToInsert);

        // Verify the text landed in the model
        const modelText = editor.children
          .map((n) =>
            (n.children || []).map((c) => c.text || "").join(""),
          )
          .join("\n");

        if (
          modelText.includes(textToInsert.substring(0, 20))
        ) {
          return { success: true, method: "main-world-slate-api" };
        }
        return {
          error:
            "Text inserted but verification failed. Model: " +
            modelText.substring(0, 100),
        };
      } catch (err) {
        return { error: "Main world error: " + err.message };
      }
    },
    args: [text],
  });
  return results?.[0]?.result || { error: "No result from executeScript" };
}

async function fillSlateViaDebugger(tabId, text) {
  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, "1.3");
  try {
    // Focus the Slate editor and select all content via Runtime.evaluate
    // (runs in page context, avoids coordinate issues from debugger bar)
    await chrome.debugger.sendCommand(debuggee, "Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector('[data-slate-editor="true"]');
        if (!el) return 'no-editor';
        el.focus();
        window.getSelection().selectAllChildren(el);
        return 'ok';
      })()`,
      returnByValue: true,
    });

    // Wait for Slate to sync the DOM selection change
    await new Promise((r) => setTimeout(r, 500));

    // Send trusted text input — Slate accepts this because isTrusted is true
    await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text });

    await new Promise((r) => setTimeout(r, 300));

    return { success: true, method: "debugger-trusted-input" };
  } finally {
    try {
      await chrome.debugger.detach(debuggee);
    } catch {}
  }
}

async function fetchCurrentJob() {
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const jobs = await res.json();
    return (
      jobs.find((j) =>
        ["generating_image", "generating_video", "ready", "posting"].includes(
          j.status,
        ),
      ) || null
    );
  } catch {
    return null;
  }
}

// ---- Scrape Request Queue Polling ----
let isProcessingScrape = false;

async function pollScrapeRequests() {
  if (isProcessingScrape) return;

  try {
    const res = await fetch(`${API_BASE}/scrape-requests`);
    const pending = await res.json();
    if (!pending.length) return;

    const req = pending[0];
    isProcessingScrape = true;

    // Mark as scraping
    await fetch(`${API_BASE}/scrape-requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "scraping" }),
    });

    // Open the URL in a background tab and scrape
    chrome.tabs.create({ url: req.url, active: false }, (tab) => {
      const tabId = tab.id;

      const onComplete = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onComplete);

          // Wait for dynamic content to load
          setTimeout(() => {
            chrome.tabs.sendMessage(
              tabId,
              { type: "SCRAPE_PRODUCT" },
              async (result) => {
                chrome.tabs.remove(tabId);

                if (chrome.runtime.lastError || !result?.success) {
                  // Mark as failed
                  await fetch(`${API_BASE}/scrape-requests/${req.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      status: "failed",
                      error: result?.error || "Scraping failed",
                    }),
                  });
                  isProcessingScrape = false;
                  return;
                }

                try {
                  // Save product to API
                  const saveRes = await fetch(`${API_BASE}/products/scrape`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scraped: result.data }),
                  });
                  const product = await saveRes.json();

                  // Mark scrape request as done with product ID
                  await fetch(`${API_BASE}/scrape-requests/${req.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      status: "done",
                      productId: product.id,
                    }),
                  });
                } catch (err) {
                  await fetch(`${API_BASE}/scrape-requests/${req.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      status: "failed",
                      error: err.message,
                    }),
                  });
                }
                isProcessingScrape = false;
              },
            );
          }, 3000);
        }
      };

      chrome.tabs.onUpdated.addListener(onComplete);

      // Timeout safety: if tab never finishes loading in 30s, fail
      setTimeout(async () => {
        if (isProcessingScrape) {
          chrome.tabs.onUpdated.removeListener(onComplete);
          try {
            chrome.tabs.remove(tabId);
          } catch {}
          await fetch(`${API_BASE}/scrape-requests/${req.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "failed",
              error: "Timed out waiting for page to load",
            }),
          });
          isProcessingScrape = false;
        }
      }, 30000);
    });
  } catch {
    isProcessingScrape = false;
  }
}

// Poll every 3 seconds
setInterval(pollScrapeRequests, 3000);

// ---- Google Flow Tab & Job Automation ----

// Find an existing Google Flow tab
async function findGoogleFlowTab() {
  // Strategy 1: Try chrome.tabs.query with match patterns
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://labs.google/fx/*", "https://labs.google/flow/*"],
    });
    if (tabs.length > 0) return tabs[0].id;
  } catch (e) {
    console.warn("[TikTok Flow] tabs.query with url pattern failed:", e);
  }

  // Strategy 2: Query all tabs and check URL manually
  // (handles redirects, SPA routing, subpaths we didn't anticipate)
  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (
        tab.url &&
        (tab.url.includes("labs.google/fx") ||
          tab.url.includes("labs.google/flow"))
      ) {
        return tab.id;
      }
    }
  } catch (e) {
    console.warn("[TikTok Flow] tabs.query all failed:", e);
  }

  return null;
}

// Open Google Flow and wait for it to be ready
async function ensureGoogleFlowTab() {
  let tabId = await findGoogleFlowTab();

  if (tabId) {
    // Tab exists — check if content script is alive
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response?.status === "alive") {
        // Focus the tab
        chrome.tabs.update(tabId, { active: true });
        return tabId;
      }
    } catch {
      // Content script not responding, might need reload
    }
  }

  // Open a new tab
  const tab = await chrome.tabs.create({
    url: "https://labs.google/fx/tools/flow",
    active: true,
  });
  tabId = tab.id;

  // Wait for page to fully load
  await new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Timeout after 30s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });

  // Extra wait for SPA to initialize
  await new Promise((r) => setTimeout(r, 5000));

  return tabId;
}

// ---- Job Processing Automation ----
let isProcessingJob = false;
let autoModeEnabled = false;
let isPaused = false;
let currentCustomPromptId = null;

// Restore auto mode state from storage on service worker startup
// (MV3 service workers can be terminated and restarted at any time)
chrome.storage.local.get(
  ["autoModeEnabled", "isPaused", "customPromptId"],
  (data) => {
    if (data.autoModeEnabled) {
      autoModeEnabled = true;
      isPaused = !!data.isPaused;
      currentCustomPromptId = data.customPromptId || null;
      console.log(
        "[TikTok Flow] Restored auto mode from storage: enabled=",
        autoModeEnabled,
        "paused=",
        isPaused,
      );
      if (!isPaused) processNextJob();
    }
  },
);

// Keep service worker alive during long-running operations using alarms
try {
  chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
      // This fires every ~24 seconds to prevent service worker termination
      if (autoModeEnabled && !isPaused && !isProcessingJob) {
        processNextJob();
      }
    }
  });
} catch (e) {
  console.warn("[TikTok Flow] Could not create keepAlive alarm:", e);
}

// Called by side panel or web app to start/stop auto mode
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ENABLE_AUTO_MODE") {
    autoModeEnabled = true;
    isPaused = false;
    currentCustomPromptId = message.customPromptId || null;
    chrome.storage.local.set({
      autoModeEnabled: true,
      isPaused: false,
      customPromptId: currentCustomPromptId,
    });
    console.log(
      "[TikTok Flow] Auto mode ENABLED, customPromptId:",
      currentCustomPromptId,
    );
    processNextJob();
    sendResponse({ autoMode: true });
    return true;
  }
  if (message.type === "DISABLE_AUTO_MODE") {
    autoModeEnabled = false;
    currentCustomPromptId = null;
    chrome.storage.local.set({ autoModeEnabled: false, customPromptId: null });
    console.log("[TikTok Flow] Auto mode DISABLED");
    sendResponse({ autoMode: false });
    return true;
  }
  if (message.type === "PAUSE_AUTO") {
    isPaused = !isPaused;
    chrome.storage.local.set({ isPaused });
    console.log("[TikTok Flow] Auto mode", isPaused ? "PAUSED" : "RESUMED");
    if (!isPaused) processNextJob();
    sendResponse({ paused: isPaused });
    return true;
  }
  if (message.type === "GET_AUTO_STATUS") {
    sendResponse({
      autoMode: autoModeEnabled,
      paused: isPaused,
      processing: isProcessingJob,
    });
    return true;
  }
  if (message.type === "JOB_PHASE_COMPLETE") {
    // Content script notifies us when a phase finishes.
    // This wakes the service worker and immediately continues processing.
    const { jobId, phase, nextStatus } = message.payload || {};
    console.log(
      "[TikTok Flow] JOB_PHASE_COMPLETE: job",
      jobId,
      "phase",
      phase,
      "next",
      nextStatus,
    );
    // Always process — even if autoMode was lost due to SW restart
    if (!isProcessingJob) {
      isProcessingJob = true;
      handlePhaseComplete(jobId, nextStatus)
        .catch((err) =>
          console.error("[TikTok Flow] Phase complete handler error:", err),
        )
        .finally(() => {
          isProcessingJob = false;
          // Continue queue if auto mode is on
          if (autoModeEnabled && !isPaused) {
            setTimeout(processNextJob, 3000);
          }
        });
    }
    sendResponse({ ok: true });
    return true;
  }
});

// Handle phase completion — fetch the job and continue to next step
async function handlePhaseComplete(jobId, nextStatus) {
  console.log(
    "[TikTok Flow] handlePhaseComplete: jobId=",
    jobId,
    "nextStatus=",
    nextStatus,
  );

  if (nextStatus === "generating_video") {
    // Image is done, start video generation
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`);
      const job = await res.json();
      if (job.status === "generating_video") {
        console.log("[TikTok Flow] Starting video generation for job:", jobId);
        await processVideoGeneration(job);
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
    // Video done — TikTok posting will be triggered from sidepanel
  }
}

async function processNextJob() {
  if (isProcessingJob || !autoModeEnabled || isPaused) return;

  try {
    isProcessingJob = true;

    // Check for active jobs (already in-progress)
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
        isProcessingJob = false;
        return;
      }
      // Recurse to pick up the newly started job
      isProcessingJob = false;
      await processNextJob();
      return;
    }

    console.log(
      "[TikTok Flow] Processing job:",
      currentJob.id,
      "status:",
      currentJob.status,
    );

    if (currentJob.status === "generating_image") {
      await processImageGeneration(currentJob);
    } else if (currentJob.status === "generating_video") {
      await processVideoGeneration(currentJob);
    }
    // "ready" and "posting" states are handled by user trigger from side panel
  } catch (err) {
    console.error("[TikTok Flow] Job processing error:", err);
  } finally {
    isProcessingJob = false;
  }

  // Continue processing if auto mode is on
  if (autoModeEnabled && !isPaused) {
    setTimeout(processNextJob, 3000);
  }
}

async function processImageGeneration(job) {
  console.log("[TikTok Flow] === Image generation for job:", job.id);

  const flowTabId = await ensureGoogleFlowTab();
  if (!flowTabId) {
    console.error("[TikTok Flow] Could not open Google Flow");
    return;
  }

  // Extract product images to use as reference in Google Flow
  let productImages = [];
  try {
    productImages = JSON.parse(job.product?.images || "[]");
  } catch {
    productImages = [];
  }

  try {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        flowTabId,
        {
          type: "GENERATE_IMAGE",
          payload: {
            jobId: job.id,
            prompt: job.imagePrompt,
            productImages: productImages,
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
      // Before marking as failed, check if the content script already advanced the job
      // (it calls updateJobStatus directly). The message channel may have timed out
      // even though the content script succeeded.
      console.warn(
        "[TikTok Flow] Image generation result has error:",
        result.error,
      );
      try {
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        if (
          freshJob.status === "generating_video" ||
          freshJob.status === "ready"
        ) {
          console.log(
            "[TikTok Flow] Job already advanced to",
            freshJob.status,
            "— content script succeeded despite message error. Proceeding to video...",
          );
          // Immediately proceed to video generation
          await processVideoGeneration(freshJob);
          return;
        }
      } catch (fetchErr) {
        console.warn("[TikTok Flow] Could not re-check job status:", fetchErr);
      }
      // Job is still stuck — mark as failed
      console.error("[TikTok Flow] Image generation failed:", result.error);
      await fetch(`${API_BASE}/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", errorMessage: result.error }),
      });
    } else {
      console.log(
        "[TikTok Flow] Image generation complete:",
        result.imageUrl?.substring(0, 80),
      );
      // Image succeeded — immediately proceed to video generation
      // Re-fetch the job to get the updated status and imageUrl
      try {
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        if (freshJob.status === "generating_video") {
          console.log("[TikTok Flow] Immediately starting video generation...");
          await processVideoGeneration(freshJob);
        }
      } catch (fetchErr) {
        console.warn(
          "[TikTok Flow] Could not fetch updated job for video step:",
          fetchErr,
        );
        // Will be picked up on the next poll cycle
      }
    }
  } catch (err) {
    console.error("[TikTok Flow] Image generation error:", err);
  }
}

async function processVideoGeneration(job) {
  console.log("[TikTok Flow] === Video generation for job:", job.id);

  // IMPORTANT: Use findGoogleFlowTab() instead of ensureGoogleFlowTab().
  // We must stay on the SAME project page where the image was generated.
  // ensureGoogleFlowTab() might open a new tab (gallery page) and lose the image.
  const flowTabId = await findGoogleFlowTab();
  if (!flowTabId) {
    console.error(
      "[TikTok Flow] Google Flow tab not found for video generation. " +
        "The tab must still be open on the project page.",
    );
    await fetch(`${API_BASE}/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "failed",
        errorMessage:
          "Google Flow tab not found. Keep the tab open during generation.",
      }),
    });
    return;
  }

  // Focus the tab but do NOT navigate — stay on the project page
  chrome.tabs.update(flowTabId, { active: true });

  try {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        flowTabId,
        {
          type: "GENERATE_VIDEO",
          payload: {
            jobId: job.id,
            prompt: job.videoPrompt,
            imageUrl: job.imageUrl,
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
      console.error("[TikTok Flow] Video generation failed:", result.error);
      await fetch(`${API_BASE}/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", errorMessage: result.error }),
      });
    } else {
      console.log(
        "[TikTok Flow] Video generation complete:",
        result.videoUrl?.substring(0, 80),
      );
    }
  } catch (err) {
    console.error("[TikTok Flow] Video generation error:", err);
  }
}

// Poll for jobs every 5 seconds when auto mode is on
// (backup polling — primary trigger is JOB_PHASE_COMPLETE from content script)
setInterval(() => {
  if (autoModeEnabled && !isPaused && !isProcessingJob) {
    processNextJob();
  }
}, 5000);
