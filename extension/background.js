const API_BASE = "http://localhost:3000/api";

// ---- Fetch video model setting from chrome.storage.local ----
async function getVideoModel() {
  try {
    const { videoModel } = await chrome.storage.local.get("videoModel");
    return videoModel || "Veo 3.1 - Fast";
  } catch {
    return "Veo 3.1 - Fast";
  }
}

// ---- Fetch video engine setting (google-flow | grok) ----
async function getVideoEngine() {
  try {
    const { videoEngine } = await chrome.storage.local.get("videoEngine");
    return videoEngine || "google-flow";
  } catch {
    return "google-flow";
  }
}

// ---- Grok Tab Management ----
async function findGrokTab() {
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://grok.com/imagine*"],
    });
    if (tabs.length > 0) return tabs[0].id;
  } catch (e) {
    console.warn("[TikTok Flow] Grok tabs.query failed:", e);
  }
  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.url && tab.url.includes("grok.com/imagine")) {
        return tab.id;
      }
    }
  } catch (e) {
    console.warn("[TikTok Flow] Grok all tabs query failed:", e);
  }
  return null;
}

async function ensureGrokTab() {
  let tabId = await findGrokTab();

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

async function healthCheckGrok() {
  try {
    const tabId = await findGrokTab();
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

// ---- Error Classification ----
// Categorize errors as retryable (transient) or fatal (permanent)
const FATAL_ERROR_PATTERNS = [
  "invalid prompt",
  "not logged in",
  "account suspended",
  "quota exceeded",
  "content policy",
  "safety filter",
  "authentication",
  "forbidden",
  "product not found",
  "tiktok posting failed",
  "add anchor button",
  "could not find",
  "save draft button not found",
  "not on tiktok studio",
];

function classifyError(errorMessage) {
  const lower = (errorMessage || "").toLowerCase();
  for (const pattern of FATAL_ERROR_PATTERNS) {
    if (lower.includes(pattern)) return "fatal";
  }
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "timeout";
  return "retryable";
}

// Job timeout: if a job has been in a processing state for too long, mark it as timed out
const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes per phase

async function checkJobTimeouts() {
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const jobs = await res.json();
    const now = Date.now();
    for (const job of jobs) {
      if (
        [
          "generating_image",
          "generating_video",
          "posting",
          "multi_scene_processing",
        ].includes(job.status) &&
        job.startedAt
      ) {
        const elapsed = now - new Date(job.startedAt).getTime();
        // Multi-scene jobs get a much longer timeout (45 min for ~3 scenes)
        const timeout =
          job.status === "multi_scene_processing"
            ? 45 * 60 * 1000
            : JOB_TIMEOUT_MS;
        if (elapsed > timeout) {
          // Skip if this job is currently being actively processed
          // (it might be about to complete — avoid race with completion handler)
          if (processingJobId === job.id) {
            console.log(
              `[TikTok Flow] Job ${job.id} exceeded timeout but is actively processing — skipping timeout (will check next cycle)`,
            );
            continue;
          }
          console.warn(
            `[TikTok Flow] Job ${job.id} timed out (${Math.round(elapsed / 60000)}min in ${job.status})`,
          );
          contentScriptActiveJobs.delete(job.id);
          await handleJobFailure(
            job.id,
            `Job timed out after ${Math.round(timeout / 60000)} minutes`,
            job,
          );
        }
      }
    }
  } catch (err) {
    console.warn("[TikTok Flow] Timeout check error:", err);
  }
}

// Unified failure handler — no retries, mark as failed and move to next job
async function handleJobFailure(jobId, errorMessage, job) {
  const errorType = classifyError(errorMessage);
  console.log(
    `[TikTok Flow] Job ${jobId} failed: "${errorMessage}" (${errorType}) — marking as failed, moving to next job`,
  );

  await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "failed",
      errorMessage: errorMessage,
      lastError: errorType,
    }),
  });

  // Proceed to next job in queue after a short delay
  if (autoModeEnabled && !isPaused) {
    setTimeout(() => {
      if (!isProcessingJob) {
        processNextJob();
      }
    }, 3000);
  }
}

// Health check: verify Google Flow tab is alive and responsive
async function healthCheckGoogleFlow() {
  const tabId = await findGoogleFlowTab();
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

    case "TEST_ADD_TO_PROMPT":
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

    case "HEALTH_CHECK":
      healthCheckGoogleFlow().then(sendResponse);
      return true;

    case "TEST_SELECT_MODEL":
      // Debug: test model selection on Google Flow tab
      (async () => {
        try {
          const health = await healthCheckGoogleFlow();
          if (!health.ok) {
            sendResponse({
              error:
                "No Google Flow tab found. Open labs.google/fx/tools/flow first.",
            });
            return;
          }
          const modelName = payload?.modelName || "Veo 3.1 - Fast";
          const result = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              health.tabId,
              { type: "TEST_SELECT_MODEL", payload: { modelName } },
              (response) => {
                if (chrome.runtime.lastError) {
                  resolve({ error: chrome.runtime.lastError.message });
                } else {
                  resolve(response || { error: "No response" });
                }
              },
            );
          });
          sendResponse(result);
        } catch (err) {
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "TEST_INSPECT_DOM":
      // Debug: inspect Google Flow DOM
      (async () => {
        try {
          const health = await healthCheckGoogleFlow();
          if (!health.ok) {
            sendResponse({
              error:
                "No Google Flow tab found. Open labs.google/fx/tools/flow first.",
            });
            return;
          }
          const result = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              health.tabId,
              { type: "INSPECT_DOM" },
              (response) => {
                if (chrome.runtime.lastError) {
                  resolve({ error: chrome.runtime.lastError.message });
                } else {
                  resolve(response || { error: "No response" });
                }
              },
            );
          });
          sendResponse(result);
        } catch (err) {
          sendResponse({ error: err.message });
        }
      })();
      return true;

    // ---- Grok Debug Commands ----
    case "GROK_INSPECT_DOM":
    case "GROK_TEST_CLICK_GENERATE":
    case "GROK_TEST_FILL_PROMPT":
    case "GROK_TEST_SELECT_VIDEO":
    case "GROK_TEST_DOWNLOAD_VIDEO":
    case "GROK_TEST_SAVE_VIDEO":
      (async () => {
        try {
          console.log(
            "[TikTok Flow] Grok debug command received:",
            message.type,
          );
          const grokTabId = await findGrokTab();
          console.log("[TikTok Flow] findGrokTab returned:", grokTabId);
          if (!grokTabId) {
            sendResponse({
              error: "No Grok tab found. Open grok.com/imagine first.",
            });
            return;
          }

          // PING the content script first to check if it's alive
          const pingOk = await new Promise((resolve) => {
            chrome.tabs.sendMessage(grokTabId, { type: "PING" }, (resp) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "[TikTok Flow] Grok PING failed:",
                  chrome.runtime.lastError.message,
                );
                resolve(false);
              } else {
                console.log("[TikTok Flow] Grok PING ok:", resp);
                resolve(true);
              }
            });
          });

          // If PING failed, inject the content script programmatically
          if (!pingOk) {
            console.log(
              "[TikTok Flow] Injecting grok-flow.js programmatically...",
            );
            try {
              await chrome.scripting.executeScript({
                target: { tabId: grokTabId },
                files: ["content/grok-flow.js"],
              });
              console.log(
                "[TikTok Flow] Programmatic injection done, waiting 500ms...",
              );
              await new Promise((r) => setTimeout(r, 500));
            } catch (injectErr) {
              console.error(
                "[TikTok Flow] Programmatic injection failed:",
                injectErr,
              );
              sendResponse({
                error: `Content script injection failed: ${injectErr.message}`,
              });
              return;
            }
          }

          const result = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              grokTabId,
              { type: message.type, payload: message.payload || {} },
              (response) => {
                if (chrome.runtime.lastError) {
                  resolve({ error: chrome.runtime.lastError.message });
                } else {
                  resolve(response || { error: "No response from Grok tab" });
                }
              },
            );
          });
          sendResponse(result);
        } catch (err) {
          console.error("[TikTok Flow] Grok debug handler error:", err);
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "START_POSTING":
      (async () => {
        try {
          const { jobId } = payload || {};
          if (!jobId) {
            sendResponse({ error: "No jobId provided" });
            return;
          }
          await fetch(`${API_BASE}/jobs/${jobId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "posting",
              startedAt: new Date().toISOString(),
            }),
          });
          const res = await fetch(`${API_BASE}/jobs/${jobId}`);
          const job = await res.json();
          processPosting(job).catch((err) =>
            console.error("[TikTok Flow] START_POSTING error:", err),
          );
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "RETRY_JOB":
      // Manually retry a specific failed job
      (async () => {
        try {
          await fetch(`${API_BASE}/jobs/${payload.jobId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "pending",
              errorMessage: "",
              lastError: "",
              startedAt: null,
            }),
          });
          sendResponse({ ok: true });
          // Trigger processing if auto mode is on
          if (autoModeEnabled && !isPaused && !isProcessingJob) {
            setTimeout(processNextJob, 1000);
          }
        } catch (err) {
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "GET_VIDEO_ENGINE":
      // Return current video engine setting to content scripts
      (async () => {
        try {
          const engine = await getVideoEngine();
          sendResponse(engine);
        } catch {
          sendResponse("google-flow");
        }
      })();
      return true;

    case "ROUTE_VIDEO_TO_GROK":
      // Route video generation from multi-scene (google-flow.js) to Grok tab
      (async () => {
        try {
          const { jobId, sceneIndex, prompt, referenceImageDataUrl, duration } =
            payload;
          console.log(
            `[TikTok Flow] Routing scene ${sceneIndex} video to Grok for job:`,
            jobId,
          );

          let grokTabId = await findGrokTab();

          if (grokTabId) {
            // Check if Grok tab is on a post page — navigate back to /imagine first
            try {
              const tab = await chrome.tabs.get(grokTabId);
              if (tab.url && tab.url.includes("/imagine/post/")) {
                console.log(
                  "[TikTok Flow] Grok on post page, navigating to /imagine...",
                );
                await chrome.tabs.update(grokTabId, {
                  url: "https://grok.com/imagine",
                  active: true,
                });
                // Wait for page load
                await new Promise((resolve) => {
                  const listener = (updatedTabId, changeInfo) => {
                    if (
                      updatedTabId === grokTabId &&
                      changeInfo.status === "complete"
                    ) {
                      chrome.tabs.onUpdated.removeListener(listener);
                      resolve();
                    }
                  };
                  chrome.tabs.onUpdated.addListener(listener);
                  setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                  }, 20000);
                });
                // Wait for content script to re-inject
                await new Promise((r) => setTimeout(r, 3000));
              }
            } catch (navErr) {
              console.warn(
                "[TikTok Flow] Grok tab nav check failed:",
                navErr.message,
              );
            }
          }

          if (!grokTabId) {
            grokTabId = await ensureGrokTab();
          }
          if (!grokTabId) {
            sendResponse({ error: "Could not open Grok tab" });
            return;
          }

          const csReady = await waitForContentScript(grokTabId, 15000);
          if (!csReady) {
            sendResponse({ error: "Grok content script not responding" });
            return;
          }

          chrome.tabs.update(grokTabId, { active: true });

          const result = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              grokTabId,
              {
                type: "GROK_GENERATE_VIDEO",
                payload: {
                  jobId,
                  prompt: prompt || "Create a smooth cinematic video.",
                  referenceImageDataUrl,
                  duration: duration || "6s",
                  sceneIndex,
                },
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  resolve({ error: chrome.runtime.lastError.message });
                } else {
                  resolve(
                    response || {
                      error: "No response from Grok content script",
                    },
                  );
                }
              },
            );
          });

          sendResponse(result);
        } catch (err) {
          console.error("[TikTok Flow] ROUTE_VIDEO_TO_GROK error:", err);
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "UPLOAD_VIDEO":
      // Upload video from content script to backend (avoids CORS)
      (async () => {
        try {
          const { jobId, videoBase64, mimeType, sceneIndex } = payload;
          // Convert base64 back to binary
          const binaryStr = atob(videoBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType || "video/mp4" });
          const formData = new FormData();
          formData.append(
            "video",
            new File([blob], "video.mp4", { type: mimeType || "video/mp4" }),
          );
          if (typeof sceneIndex === "number") {
            formData.append("sceneIndex", String(sceneIndex));
          }

          const resp = await fetch(`${API_BASE}/jobs/${jobId}/video`, {
            method: "POST",
            body: formData,
          });

          if (!resp.ok) {
            const errText = await resp.text();
            sendResponse({
              error: `Upload failed (${resp.status}): ${errText}`,
            });
            return;
          }

          const result = await resp.json();
          console.log("[TikTok Flow] Video uploaded:", JSON.stringify(result));
          sendResponse(result);
        } catch (err) {
          console.error("[TikTok Flow] Video upload error:", err);
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "FETCH_VIDEO_TEST":
      // Test-only: fetch video and return size/type without uploading
      (async () => {
        try {
          const { videoUrl } = payload;
          console.log(
            "[TikTok Flow] FETCH_VIDEO_TEST:",
            videoUrl?.substring(0, 100),
          );
          const resp = await fetch(videoUrl);
          if (!resp.ok) {
            sendResponse({
              error: `Fetch failed (${resp.status}): ${resp.statusText}`,
            });
            return;
          }
          const blob = await resp.blob();
          console.log(
            "[TikTok Flow] Test fetch OK:",
            blob.size,
            "bytes,",
            blob.type,
          );
          sendResponse({ size: blob.size, type: blob.type || "video/mp4" });
        } catch (err) {
          console.error("[TikTok Flow] FETCH_VIDEO_TEST error:", err);
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "FETCH_AND_UPLOAD_VIDEO":
      // Fetch video from URL (no CORS in service worker) and upload to backend
      // Used by Grok content script when assets.grok.com blocks content script fetch
      (async () => {
        try {
          const { jobId, videoUrl, sceneIndex } = payload;
          console.log(
            "[TikTok Flow] FETCH_AND_UPLOAD_VIDEO:",
            videoUrl?.substring(0, 100),
            "for job:",
            jobId,
          );

          const resp = await fetch(videoUrl);
          if (!resp.ok) {
            sendResponse({
              error: `Fetch failed (${resp.status}): ${resp.statusText}`,
            });
            return;
          }

          const blob = await resp.blob();
          console.log(
            "[TikTok Flow] Fetched video blob:",
            blob.size,
            "bytes, type:",
            blob.type,
          );

          if (blob.size < 1000) {
            sendResponse({ error: `Video too small (${blob.size} bytes)` });
            return;
          }

          const formData = new FormData();
          formData.append(
            "video",
            new File([blob], "video.mp4", { type: blob.type || "video/mp4" }),
          );
          if (typeof sceneIndex === "number") {
            formData.append("sceneIndex", String(sceneIndex));
          }

          const uploadResp = await fetch(`${API_BASE}/jobs/${jobId}/video`, {
            method: "POST",
            body: formData,
          });

          if (!uploadResp.ok) {
            const errText = await uploadResp.text();
            sendResponse({
              error: `Upload failed (${uploadResp.status}): ${errText}`,
            });
            return;
          }

          const result = await uploadResp.json();
          console.log(
            "[TikTok Flow] Video fetched & uploaded:",
            JSON.stringify(result),
          );
          sendResponse(result);
        } catch (err) {
          console.error("[TikTok Flow] FETCH_AND_UPLOAD_VIDEO error:", err);
          sendResponse({ error: err.message });
        }
      })();
      return true;

    case "UPLOAD_IMAGE":
      // Upload generated image from content script to backend (avoids CORS)
      (async () => {
        try {
          const { jobId, imageBase64, mimeType, sceneIndex } = payload;
          const binaryStr = atob(imageBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType || "image/png" });
          const ext = (mimeType || "image/png").split("/")[1] || "png";
          const formData = new FormData();
          formData.append(
            "image",
            new File([blob], `image.${ext}`, {
              type: mimeType || "image/png",
            }),
          );
          if (typeof sceneIndex === "number") {
            formData.append("sceneIndex", String(sceneIndex));
          }

          const resp = await fetch(`${API_BASE}/jobs/${jobId}/image`, {
            method: "POST",
            body: formData,
          });

          if (!resp.ok) {
            const errText = await resp.text();
            sendResponse({
              error: `Image upload failed (${resp.status}): ${errText}`,
            });
            return;
          }

          const result = await resp.json();
          console.log(
            "[TikTok Flow] Generated image uploaded to gallery:",
            JSON.stringify(result),
          );
          sendResponse(result);
        } catch (err) {
          console.error("[TikTok Flow] Image upload error:", err);
          sendResponse({ error: err.message });
        }
      })();
      return true;

    // ---- Image Job Processing ----
    case "START_IMAGE_AUTO":
      // Start processing the next pending image job
      fetch(`${API_BASE}/image-jobs/start-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((r) => r.json())
        .then((job) => {
          if (job.id) {
            processImageJob(job);
          }
          sendResponse(job);
        })
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case "UPLOAD_GENERATED_IMAGE":
      // Upload generated image from content script to backend
      (async () => {
        try {
          const { jobId, imageBase64, mimeType } = payload;
          const binaryStr = atob(imageBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType || "image/png" });
          const ext = (mimeType || "image/png").split("/")[1] || "png";
          const formData = new FormData();
          formData.append(
            "image",
            new File([blob], `image.${ext}`, {
              type: mimeType || "image/png",
            }),
          );

          const resp = await fetch(`${API_BASE}/image-jobs/${jobId}/image`, {
            method: "POST",
            body: formData,
          });

          if (!resp.ok) {
            const errText = await resp.text();
            sendResponse({
              error: `Upload failed (${resp.status}): ${errText}`,
            });
            return;
          }

          const result = await resp.json();
          console.log(
            "[TikTok Flow] Generated image uploaded:",
            JSON.stringify(result),
          );
          sendResponse(result);
        } catch (err) {
          console.error("[TikTok Flow] Image upload error:", err);
          sendResponse({ error: err.message });
        }
      })();
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
        const slateEl = document.querySelector('[data-slate-editor="true"]');
        if (!slateEl) return { error: "Slate editor not found in DOM" };

        // Walk React fiber tree to find Slate editor instance
        const fiberKey = Object.keys(slateEl).find(
          (k) =>
            k.startsWith("__reactFiber$") ||
            k.startsWith("__reactInternalInstance$"),
        );
        if (!fiberKey) return { error: "No React fiber on Slate element" };

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
          .map((n) => (n.children || []).map((c) => c.text || "").join(""))
          .join("\n");

        if (modelText.includes(textToInsert.substring(0, 20))) {
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
    // Check if auto-post is enabled to determine if "ready" jobs are actionable
    const { autoPostEnabled } =
      await chrome.storage.local.get("autoPostEnabled");
    const activeStatuses = autoPostEnabled
      ? ["generating_image", "generating_video", "ready", "posting"]
      : ["generating_image", "generating_video", "posting"];
    return jobs.find((j) => activeStatuses.includes(j.status)) || null;
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

// ---- TikTok Studio Tab Management ----

async function findTikTokStudioTab() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "https://www.tiktok.com/tiktokstudio/*",
        "https://tiktok.com/tiktokstudio/*",
      ],
    });
    if (tabs.length > 0) return tabs[0].id;
  } catch (e) {
    console.warn("[TikTok Flow] TikTok Studio tabs.query failed:", e);
  }

  // Strategy 2: Query all tabs
  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.url && tab.url.includes("tiktokstudio")) {
        return tab.id;
      }
    }
  } catch (e) {
    console.warn("[TikTok Flow] TikTok Studio all tabs query failed:", e);
  }

  return null;
}

async function ensureTikTokStudioTab() {
  let tabId = await findTikTokStudioTab();

  if (tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response?.status === "alive") {
        // If we're on the content page, navigate to upload page
        if (response.url && !response.url.includes("/upload")) {
          await chrome.tabs.update(tabId, {
            url: "https://www.tiktok.com/tiktokstudio/upload?from=creator_center",
            active: true,
          });
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
        } else {
          chrome.tabs.update(tabId, { active: true });
        }
        return tabId;
      }
    } catch {
      // Content script not responding
    }
  }

  // Open a new tab to upload page
  const tab = await chrome.tabs.create({
    url: "https://www.tiktok.com/tiktokstudio/upload?from=creator_center",
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
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });

  // Wait for content script to be injected and responsive
  await waitForContentScript(tabId, 15000);
  return tabId;
}

// Ping content script in a retry loop until it responds
async function waitForContentScript(tabId, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 2000);
        chrome.tabs.sendMessage(tabId, { type: "PING" }, (r) => {
          clearTimeout(t);
          if (chrome.runtime.lastError)
            reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        });
      });
      if (res?.status === "alive") {
        console.log("[TikTok Flow] Content script alive on tab", tabId);
        return true;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.warn("[TikTok Flow] Content script not ready after", timeout, "ms");
  return false;
}

async function healthCheckTikTokStudio() {
  const tabId = await findTikTokStudioTab();
  if (!tabId) return { ok: false, error: "No TikTok Studio tab found" };

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

// ---- TikTok Shop Tab Management ----

async function findTikTokShopTab() {
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://shop.tiktok.com/*"],
    });
    if (tabs.length > 0) return tabs[0].id;
  } catch (e) {
    console.warn("[TikTok Flow] TikTok Shop tabs.query failed:", e);
  }
  return null;
}

async function ensureTikTokShopShowcaseTab() {
  let tabId = await findTikTokShopTab();

  if (tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (response?.status === "alive") {
        // Navigate to showcase page if not already there
        if (!response.url?.includes("streamer/showcase")) {
          await chrome.tabs.update(tabId, {
            url: "https://shop.tiktok.com/streamer/showcase/product/list",
            active: true,
          });
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
        } else {
          chrome.tabs.update(tabId, { active: true });
        }
        return tabId;
      }
    } catch {}
  }

  const tab = await chrome.tabs.create({
    url: "https://shop.tiktok.com/streamer/showcase/product/list",
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

// ---- Job Processing Automation ----
let isProcessingJob = false;
let processingLockId = null; // Unique token for current processing session
let processingJobId = null; // Track which job is being processed
let autoModeEnabled = false;
let isPaused = false;
let currentCustomPromptId = null;
let pendingPhaseComplete = null; // Queue for JOB_PHASE_COMPLETE events that arrive while busy
// Jobs where the message channel closed but the content script is still working.
// These are skipped by processNextJob — JOB_PHASE_COMPLETE will handle continuation.
const contentScriptActiveJobs = new Set();

// Acquire the processing lock. Returns a unique lock ID if acquired, null if already held.
function acquireProcessingLock(reason) {
  if (isProcessingJob) {
    console.log(
      `[TikTok Flow] Lock denied (${reason}): already held by ${processingLockId}`,
    );
    return null;
  }
  isProcessingJob = true;
  processingLockId = `${reason}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  console.log(`[TikTok Flow] Lock acquired: ${processingLockId}`);
  return processingLockId;
}

// Release the processing lock. Only the holder can release it.
function releaseProcessingLock(lockId) {
  if (processingLockId !== lockId) {
    console.warn(
      `[TikTok Flow] Lock release denied: expected ${processingLockId}, got ${lockId}`,
    );
    return false;
  }
  console.log(`[TikTok Flow] Lock released: ${processingLockId}`);
  const wasProcessingAJob = processingJobId !== null;
  isProcessingJob = false;
  processingLockId = null;
  processingJobId = null;

  // Process any queued phase-complete event
  if (pendingPhaseComplete) {
    const pending = pendingPhaseComplete;
    pendingPhaseComplete = null;
    console.log(
      `[TikTok Flow] Processing queued phase-complete: job ${pending.jobId}`,
    );
    setTimeout(
      () => handlePhaseCompleteWithLock(pending.jobId, pending.nextStatus),
      100,
    );
  } else if (wasProcessingAJob && autoModeEnabled && !isPaused) {
    // Only re-schedule immediately if we actually processed a job.
    // When idle (no jobs found), the 24s keepAlive alarm handles periodic polling.
    setTimeout(processNextJob, 3000);
  }
  return true;
}

// Force-release the lock (for DISABLE_AUTO_MODE or emergency recovery)
function forceReleaseProcessingLock(reason) {
  if (isProcessingJob) {
    console.warn(
      `[TikTok Flow] Force-releasing lock (${reason}): was ${processingLockId}`,
    );
  }
  isProcessingJob = false;
  processingLockId = null;
  processingJobId = null;
  pendingPhaseComplete = null;
}

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
      // Check for timed-out jobs every alarm cycle
      checkJobTimeouts();
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
    forceReleaseProcessingLock("disable-auto-mode");
    chrome.storage.local.set({ autoModeEnabled: false, customPromptId: null });
    console.log("[TikTok Flow] Auto mode DISABLED (lock force-released)");
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
    // Clear from content-script-active tracking (channel-closed recovery)
    contentScriptActiveJobs.delete(jobId);
    // If lock is held (e.g. by processNextJob which triggered this phase),
    // the phase is already being handled inline. But if the lock holder is
    // processing THIS job, it means the content script is notifying us of
    // completion while we're already awaiting it — handled inline.
    // If lock is NOT held (e.g. SW restarted), pick it up immediately.
    if (isProcessingJob) {
      // Queue it — will be picked up when lock is released
      if (processingJobId === jobId) {
        console.log(
          `[TikTok Flow] Phase complete for current job ${jobId} — handled inline`,
        );
      } else {
        console.log(
          `[TikTok Flow] Phase complete queued (lock busy with ${processingJobId})`,
        );
        pendingPhaseComplete = { jobId, nextStatus };
      }
    } else {
      handlePhaseCompleteWithLock(jobId, nextStatus);
    }
    sendResponse({ ok: true });
    return true;
  }
});

// Wrapper that acquires lock before handling phase completion
function handlePhaseCompleteWithLock(jobId, nextStatus) {
  const lockId = acquireProcessingLock("phase-complete");
  if (!lockId) {
    console.warn(
      "[TikTok Flow] Could not acquire lock for phase-complete, queuing",
    );
    pendingPhaseComplete = { jobId, nextStatus };
    return;
  }
  processingJobId = jobId;
  handlePhaseComplete(jobId, nextStatus)
    .catch((err) =>
      console.error("[TikTok Flow] Phase complete handler error:", err),
    )
    .finally(() => {
      releaseProcessingLock(lockId);
    });
}

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

    // Check if auto-post is enabled
    const { autoPostEnabled } =
      await chrome.storage.local.get("autoPostEnabled");
    if (autoPostEnabled) {
      console.log(
        "[TikTok Flow] Auto-post enabled, starting posting for job:",
        jobId,
      );
      await fetch(`${API_BASE}/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "posting",
          startedAt: new Date().toISOString(),
        }),
      });
      const res = await fetch(`${API_BASE}/jobs/${jobId}`);
      const job = await res.json();
      await processPosting(job);
    } else {
      console.log(
        "[TikTok Flow] Auto-post disabled, job stays at ready. Will proceed to next pending job.",
      );
    }
  } else if (nextStatus === "posted") {
    console.log("[TikTok Flow] Job posted successfully:", jobId);
    // Continue to next job in queue
  }
}

async function processNextJob() {
  if (isProcessingJob || !autoModeEnabled || isPaused) return;

  const lockId = acquireProcessingLock("process-next-job");
  if (!lockId) return; // Another caller won the race

  try {
    // Check for active jobs (already in-progress)
    const currentJob = await fetchCurrentJob();

    if (!currentJob || contentScriptActiveJobs.has(currentJob.id)) {
      if (currentJob && contentScriptActiveJobs.has(currentJob.id)) {
        console.log(
          `[TikTok Flow] Skipping job ${currentJob.id} — content script is still handling it`,
        );
        return; // Don't start another job; wait for JOB_PHASE_COMPLETE
      }
      // Try to start the next pending job (video or image-only)
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
        return; // finally will release lock
      }
      // Immediately process the newly started job instead of waiting for next alarm
      console.log(
        "[TikTok Flow] Started job via start-auto:",
        data.id,
        "— processing immediately",
      );
      processingJobId = data.id;
      if (data.status === "generating_image") {
        if (data.imageOnly) {
          await processImageOnlyJob(data);
        } else {
          await processImageGeneration(data);
        }
      }
      return;
    }

    processingJobId = currentJob.id;
    console.log(
      "[TikTok Flow] Processing job:",
      currentJob.id,
      "status:",
      currentJob.status,
    );

    if (currentJob.status === "generating_image") {
      if (currentJob.imageOnly) {
        await processImageOnlyJob(currentJob);
      } else {
        await processImageGeneration(currentJob);
      }
    } else if (currentJob.status === "generating_video") {
      await processVideoGeneration(currentJob);
    } else if (currentJob.status === "posting") {
      await processPosting(currentJob);
    } else if (currentJob.status === "ready") {
      // Check auto-post — if enabled, transition to posting
      const { autoPostEnabled } =
        await chrome.storage.local.get("autoPostEnabled");
      if (autoPostEnabled) {
        console.log(
          "[TikTok Flow] Job ready + auto-post on, starting posting:",
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
      // If auto-post off, do nothing — job stays at ready for manual trigger
    }
  } catch (err) {
    console.error("[TikTok Flow] Job processing error:", err);
  } finally {
    releaseProcessingLock(lockId);
    // releaseProcessingLock handles scheduling next job
  }
}

// ---- Grok Video Generation ----
// Routes video gen to Grok when videoEngine is "grok".
// Image generation still uses Google Flow; only the video phase switches.
async function processVideoGenerationViaGrok(job) {
  console.log("[TikTok Flow] === GROK video generation for job:", job.id);

  // Fetch the image to send as reference
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
          "[TikTok Flow] Image fetched for Grok reference (" +
            Math.round(blob.size / 1024) +
            "KB)",
        );
      }
    } catch (e) {
      console.warn("[TikTok Flow] Could not fetch image for Grok:", e.message);
    }
  }

  if (!referenceImageDataUrl) {
    console.warn(
      "[TikTok Flow] No reference image available for Grok video gen",
    );
  }

  // Ensure Grok tab is open
  const grokTabId = await ensureGrokTab();
  if (!grokTabId) {
    await handleJobFailure(
      job.id,
      "Could not open Grok tab for video generation",
      job,
    );
    return;
  }

  // Wait for content script to be ready
  const csReady = await waitForContentScript(grokTabId, 15000);
  if (!csReady) {
    await handleJobFailure(job.id, "Grok content script not responding", job);
    return;
  }

  // Focus the tab
  chrome.tabs.update(grokTabId, { active: true });

  try {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        grokTabId,
        {
          type: "GROK_GENERATE_VIDEO",
          payload: {
            jobId: job.id,
            prompt:
              job.videoPrompt ||
              "Create a smooth cinematic video showcasing this product with gentle movement, 9:16 vertical format.",
            referenceImageDataUrl,
            duration: "10s",
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(
              response || { error: "No response from Grok content script" },
            );
          }
        },
      );
    });

    if (result.error) {
      const isChannelClosed =
        result.error.includes("message channel closed") ||
        result.error.includes("listener indicated an asynchronous response");

      // Check if completion happened despite error
      try {
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        if (freshJob.status === "ready" || freshJob.status === "posted") {
          console.log(
            "[TikTok Flow] Grok video job completed (status:",
            freshJob.status,
            ")",
          );
          const { autoPostEnabled } =
            await chrome.storage.local.get("autoPostEnabled");
          if (autoPostEnabled && freshJob.status === "ready") {
            await fetch(`${API_BASE}/jobs/${job.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "posting",
                startedAt: new Date().toISOString(),
              }),
            });
            const postRes = await fetch(`${API_BASE}/jobs/${job.id}`);
            const postJob = await postRes.json();
            await processPosting(postJob);
          }
          return;
        }
        if (freshJob.status === "failed") {
          console.log("[TikTok Flow] Grok video job already failed.");
          return;
        }
      } catch {
        /* ignore */
      }

      if (isChannelClosed) {
        contentScriptActiveJobs.add(job.id);
        console.log(
          "[TikTok Flow] Grok video: channel closed but content script may still be working.",
        );
        return;
      }

      console.error(
        "[TikTok Flow] Grok video generation failed:",
        result.error,
      );
      await handleJobFailure(job.id, result.error, job);
    } else {
      console.log(
        "[TikTok Flow] Grok video generation complete:",
        (result.videoUrl || "").substring(0, 80),
      );

      const { autoPostEnabled } =
        await chrome.storage.local.get("autoPostEnabled");
      if (autoPostEnabled) {
        console.log(
          "[TikTok Flow] Auto-post enabled, starting posting for job:",
          job.id,
        );
        await fetch(`${API_BASE}/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "posting",
            startedAt: new Date().toISOString(),
          }),
        });
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        await processPosting(freshJob);
      }
    }
  } catch (err) {
    console.error("[TikTok Flow] Grok video generation error:", err);
    await handleJobFailure(job.id, err.message || "Unknown Grok error", job);
  }
}

async function processPosting(job) {
  console.log("[TikTok Flow] === Posting to TikTok for job:", job.id);

  // Phase 1: Add product to TikTok Shop Showcase (optional, best-effort)
  if (job.product?.url) {
    try {
      await updateJobStatusFromBg(job.id, {
        status: "posting",
        errorMessage: "Adding product to showcase...",
      });

      const shopTabId = await ensureTikTokShopShowcaseTab();
      if (shopTabId) {
        await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            shopTabId,
            {
              type: "ADD_TO_SHOWCASE",
              payload: { productUrl: job.product.url },
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "[TikTok Flow] Showcase add failed:",
                  chrome.runtime.lastError.message,
                );
              } else if (response?.error) {
                console.warn(
                  "[TikTok Flow] Showcase add error:",
                  response.error,
                );
              } else {
                console.log("[TikTok Flow] Product added to showcase");
              }
              resolve(response);
            },
          );
        });
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.warn(
        "[TikTok Flow] Showcase step failed (non-fatal):",
        err.message,
      );
    }
  }

  // Phase 2: Post video to TikTok Studio
  const health = await healthCheckTikTokStudio();
  if (!health.ok) {
    console.warn(
      "[TikTok Flow] TikTok Studio health check failed, ensuring tab...",
    );
  }

  const tabId = await ensureTikTokStudioTab();
  if (!tabId) {
    await handleJobFailure(job.id, "Could not open TikTok Studio tab", job);
    return;
  }

  chrome.tabs.update(tabId, { active: true });

  let hashtags = [];
  try {
    hashtags = JSON.parse(job.tiktokHashtags || "[]");
  } catch {}

  // Fetch video in background script (no CORS/CSP restrictions)
  // then pass as base64 to avoid tiktok.com blocking localhost fetches.
  // Always prefer the watermark-removed version from our API.
  let videoBase64 = null;
  if (job.videoUrl) {
    try {
      await updateJobStatusFromBg(job.id, {
        status: "posting",
        errorMessage: "Downloading video for upload...",
      });

      const processedVideoUrl = `${API_BASE}/jobs/${job.id}/video`;
      let videoBlob = null;

      // Step 1: Try fetching the processed (watermark-removed) video from our API
      try {
        const processedResp = await fetch(processedVideoUrl);
        if (processedResp.ok) {
          videoBlob = await processedResp.blob();
          console.log(
            `[TikTok Flow] Using processed video from API (${videoBlob.size} bytes)`,
          );
        }
      } catch (e) {
        console.warn("[TikTok Flow] Processed video fetch failed:", e.message);
      }

      // Step 2: If no processed video, download the raw video and upload for FFmpeg processing
      if (!videoBlob && job.videoUrl !== processedVideoUrl) {
        console.log(
          "[TikTok Flow] No processed video, downloading raw and uploading for watermark removal...",
        );
        await updateJobStatusFromBg(job.id, {
          status: "posting",
          errorMessage: "Processing video to remove watermark...",
        });
        const rawResp = await fetch(job.videoUrl);
        if (!rawResp.ok) {
          throw new Error(`Raw video fetch failed: HTTP ${rawResp.status}`);
        }
        const rawBlob = await rawResp.blob();

        // Upload to our API for FFmpeg watermark removal
        const formData = new FormData();
        formData.append(
          "video",
          new File([rawBlob], "video.mp4", { type: "video/mp4" }),
        );
        const uploadResp = await fetch(processedVideoUrl, {
          method: "POST",
          body: formData,
        });
        if (uploadResp.ok) {
          const uploadResult = await uploadResp.json();
          console.log(
            "[TikTok Flow] Video uploaded and processed, watermark removed:",
            uploadResult.watermarkRemoved,
          );
          // Now fetch the processed version
          const cleanResp = await fetch(processedVideoUrl);
          if (cleanResp.ok) {
            videoBlob = await cleanResp.blob();
          }
        }

        // If processing failed, use the raw video as fallback
        if (!videoBlob) {
          console.warn(
            "[TikTok Flow] FFmpeg processing failed, using raw video",
          );
          videoBlob = rawBlob;
        }
      }

      if (!videoBlob) {
        throw new Error("Could not obtain video from any source");
      }

      videoBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read video blob"));
        reader.readAsDataURL(videoBlob);
      });
      console.log(
        `[TikTok Flow] Video ready as base64 (${(videoBase64.length / 1024 / 1024).toFixed(1)}MB)`,
      );
    } catch (err) {
      console.error("[TikTok Flow] Failed to fetch video in background:", err);
      await handleJobFailure(
        job.id,
        `Video download failed: ${err.message}`,
        job,
      );
      return;
    }
  }

  try {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: "POST_VIDEO",
          payload: {
            jobId: job.id,
            videoBase64: videoBase64,
            caption:
              job.tiktokDescription ||
              job.tiktokCaption ||
              job.product?.title ||
              "",
            hashtags: hashtags,
            productName: job.tiktokProductName || job.product?.title || "",
            productUrl: job.product?.url || "",
            tiktokProductName: job.tiktokProductName || "",
            tiktokDescription: job.tiktokDescription || "",
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
      // The content script may still be finishing (save draft takes time).
      // Wait and poll the API status before declaring failure.
      console.warn("[TikTok Flow] Got error from message port:", result.error);
      let actuallyPosted = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((r) => setTimeout(r, 10000)); // wait 10s between checks
        try {
          const checkRes = await fetch(`${API_BASE}/jobs/${job.id}`);
          const freshJob = await checkRes.json();
          console.log(
            `[TikTok Flow] Status check attempt ${attempt + 1}: ${freshJob.status}`,
          );
          if (freshJob.status === "posted") {
            actuallyPosted = true;
            break;
          }
          if (freshJob.status === "failed") {
            break; // Content script already marked it as failed
          }
        } catch {}
      }
      if (actuallyPosted) {
        console.log(
          "[TikTok Flow] Job actually posted successfully (message port had closed early)",
        );
        return;
      }
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

async function updateJobStatusFromBg(jobId, data) {
  try {
    await fetch(`${API_BASE}/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.warn("[TikTok Flow] Failed to update job status:", err);
  }
}

async function processImageGeneration(job) {
  console.log("[TikTok Flow] === Image generation for job:", job.id);

  // Detect multi-scene job — route to dedicated handler
  let scenePrompts = [];
  try {
    scenePrompts = JSON.parse(job.scenePrompts || "[]");
  } catch {
    /* ignore */
  }
  if (scenePrompts.length > 1) {
    console.log(
      "[TikTok Flow] Multi-scene job detected:",
      scenePrompts.length,
      "scenes",
    );
    await processMultiSceneJob(job, scenePrompts);
    return;
  }

  // Health check before starting
  const health = await healthCheckGoogleFlow();
  let flowTabId = health.ok ? health.tabId : null;

  if (!flowTabId) {
    console.warn("[TikTok Flow] Health check failed:", health.error);
    flowTabId = await ensureGoogleFlowTab();
    if (!flowTabId) {
      await handleJobFailure(
        job.id,
        "Could not open Google Flow tab: " + health.error,
        job,
      );
      return;
    }
  }

  // Navigate to Flow gallery BEFORE sending GENERATE_IMAGE.
  // If we're still on a previous project page, navigating within the content script
  // (back button / history.back) can cause a full page reload that kills the script
  // mid-execution. By navigating here first, the content script starts fresh on the
  // gallery page and can click "New project" without any page reload.
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
        "[TikTok Flow] Tab is on a project page (" +
          tabInfo.url +
          "), navigating to gallery first...",
      );
      await chrome.tabs.update(flowTabId, {
        url: "https://labs.google/fx/tools/flow",
      });
      // Wait for page to fully load
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
      // Wait for content script to be injected and responsive
      for (let ping = 0; ping < 10; ping++) {
        const h = await healthCheckGoogleFlow();
        if (h.ok) {
          flowTabId = h.tabId;
          break;
        }
        console.log(
          "[TikTok Flow] Waiting for content script after gallery nav... attempt",
          ping + 1,
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch (navErr) {
    console.warn("[TikTok Flow] Could not check/navigate tab:", navErr.message);
  }

  // Focus the tab
  chrome.tabs.update(flowTabId, { active: true });

  // Pre-fetch custom product reference images from /api/upload/
  // These replace catalog productImages so they follow the same upload path
  let customRefImages = [];
  try {
    const refArr = JSON.parse(job.referenceImages || "[]");
    if (refArr.length > 0) {
      console.log(
        "[TikTok Flow] Fetching",
        refArr.length,
        "custom reference image(s)...",
      );
      for (const filename of refArr) {
        try {
          const imgUrl = `${API_BASE}/upload/${filename}`;
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const dataUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            customRefImages.push(dataUrl);
            console.log(
              "[TikTok Flow] ✅ Fetched reference:",
              filename,
              "(" + Math.round(blob.size / 1024) + "KB)",
            );
          }
        } catch (fetchErr) {
          console.warn(
            "[TikTok Flow] Could not fetch reference image:",
            filename,
            fetchErr.message,
          );
        }
      }
    }
  } catch {
    // no reference images
  }

  // Extract product images to use as reference in Google Flow
  // Custom uploaded images replace catalog images (same upload path in google-flow.js)
  let productImages = [];
  let studioReferenceImages = [];
  if (customRefImages.length > 0) {
    productImages = customRefImages;
    console.log(
      "[TikTok Flow] Using",
      customRefImages.length,
      "custom reference image(s) as product images — skipping catalog",
    );
  } else {
    try {
      productImages = JSON.parse(job.product?.images || "[]");
    } catch {
      productImages = [];
    }
  }

  // For scenes 2+ in a group, fetch the master scene's generated image as reference
  if (job.masterJobId && job.sceneIndex > 0) {
    try {
      console.log(
        "[TikTok Flow] Scene",
        job.sceneIndex,
        "— fetching master image from job",
        job.masterJobId,
      );
      const masterImgRes = await fetch(
        `${API_BASE}/jobs/${job.masterJobId}/image`,
      );
      if (masterImgRes.ok) {
        const blob = await masterImgRes.blob();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        // Prepend master reference so it's the first image added to prompt
        studioReferenceImages.unshift(dataUrl);
        console.log(
          "[TikTok Flow] ✅ Master reference fetched (" +
            Math.round(blob.size / 1024) +
            "KB)",
        );
      } else {
        console.warn(
          "[TikTok Flow] Master job image not available (status " +
            masterImgRes.status +
            ")",
        );
      }
    } catch (masterErr) {
      console.warn(
        "[TikTok Flow] Could not fetch master job image:",
        masterErr.message,
      );
    }
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
            studioReferenceImages: studioReferenceImages,
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
      // The message channel can close during long operations (image gen takes minutes)
      // even though the content script is still working fine.
      const isChannelClosed =
        result.error.includes("message channel closed") ||
        result.error.includes("listener indicated an asynchronous response");

      // Check if job already advanced (content script updates status directly)
      try {
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        if (freshJob.status === "generating_video") {
          console.log(
            "[TikTok Flow] Job already advanced to generating_video — continuing.",
          );
          await processVideoGeneration(freshJob);
          return;
        }
        if (freshJob.status === "ready" || freshJob.status === "posted") {
          console.log(
            "[TikTok Flow] Job already completed (status:",
            freshJob.status,
            ")",
          );
          return;
        }
        if (freshJob.status === "failed") {
          console.log("[TikTok Flow] Job already marked failed.");
          return;
        }
      } catch (fetchErr) {
        console.warn("[TikTok Flow] Could not re-check job status:", fetchErr);
      }

      if (isChannelClosed) {
        // Content script received the message (returned true) and is still working.
        // Release the lock and let JOB_PHASE_COMPLETE handle continuation.
        // Job timeout (15 min) is the safety net if content script truly fails.
        contentScriptActiveJobs.add(job.id);
        console.log(
          "[TikTok Flow] Channel closed but content script is still working. Releasing lock — JOB_PHASE_COMPLETE will continue.",
        );
        return;
      }

      // Non-channel error — genuinely failed
      console.error("[TikTok Flow] Image generation failed:", result.error);
      await handleJobFailure(job.id, result.error, job);
    } else {
      console.log(
        "[TikTok Flow] Image generation complete:",
        result.imageUrl?.substring(0, 80),
      );
      // Image succeeded — proceed to video generation
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

// ---- Multi-Scene Job Processing ----
// Processes all scenes within one job: image + video for each scene sequentially.
// Scene 1 uses product + studio refs. Scene 2+ uses Scene 1's generated image as reference.
async function processMultiSceneJob(job, scenePrompts) {
  console.log(
    "[TikTok Flow] === Multi-scene job:",
    job.id,
    "scenes:",
    scenePrompts.length,
  );

  const health = await healthCheckGoogleFlow();
  if (!health.ok) {
    const flowTabId = await ensureGoogleFlowTab();
    if (!flowTabId) {
      await handleJobFailure(job.id, "Could not open Google Flow tab", job);
      return;
    }
  }

  // Re-check health to get verified tabId with alive content script
  let flowTabId = null;
  for (let ping = 0; ping < 10; ping++) {
    const h = await healthCheckGoogleFlow();
    if (h.ok) {
      flowTabId = h.tabId;
      break;
    }
    console.log(
      "[TikTok Flow] Waiting for content script... attempt",
      ping + 1,
    );
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!flowTabId) {
    await handleJobFailure(
      job.id,
      "Google Flow content script not responding",
      job,
    );
    return;
  }

  // Navigate to gallery first to avoid content script death during back-navigation
  try {
    const tabInfo = await chrome.tabs.get(flowTabId);
    const isOnGallery =
      tabInfo.url &&
      (tabInfo.url === "https://labs.google/fx/tools/flow" ||
        tabInfo.url === "https://labs.google/fx/tools/flow/" ||
        tabInfo.url.endsWith("/fx/tools/flow") ||
        tabInfo.url.endsWith("/fx/tools/flow/"));
    if (!isOnGallery) {
      console.log("[TikTok Flow] Multi-scene: navigating to gallery first...");
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
        const h = await healthCheckGoogleFlow();
        if (h.ok) {
          flowTabId = h.tabId;
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch (navErr) {
    console.warn(
      "[TikTok Flow] Multi-scene gallery nav error:",
      navErr.message,
    );
  }

  // Pre-fetch custom product reference images from /api/upload/
  let customRefImages = [];
  try {
    const refArr = JSON.parse(job.referenceImages || "[]");
    for (const filename of refArr) {
      try {
        const imgRes = await fetch(`${API_BASE}/upload/${filename}`);
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          customRefImages.push(dataUrl);
        }
      } catch (e) {
        console.warn("[TikTok Flow] Could not fetch ref:", filename, e.message);
      }
    }
  } catch {
    /* no refs */
  }

  // Custom uploaded images replace catalog images (same upload path in google-flow.js)
  let productImages = [];
  let studioReferenceImages = [];
  if (customRefImages.length > 0) {
    productImages = customRefImages;
    console.log(
      "[TikTok Flow] Using",
      customRefImages.length,
      "custom reference image(s) as product images — skipping catalog (multi-scene)",
    );
  } else {
    try {
      productImages = JSON.parse(job.product?.images || "[]");
    } catch {
      productImages = [];
    }
  }

  // Mark job as multi_scene_processing so the polling loop won't pick it up
  // if the service worker restarts during the long multi-scene generation.
  try {
    await fetch(`${API_BASE}/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "multi_scene_processing" }),
    });
    console.log(
      "[TikTok Flow] Job status set to multi_scene_processing — safe from restart",
    );
  } catch (e) {
    console.warn(
      "[TikTok Flow] Could not set multi_scene_processing status:",
      e,
    );
  }

  const multiSceneVideoModel = await getVideoModel();
  try {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        flowTabId,
        {
          type: "GENERATE_MULTI_SCENE",
          payload: {
            jobId: job.id,
            scenes: scenePrompts,
            productImages,
            studioReferenceImages,
            videoModel: multiSceneVideoModel,
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
      const isChannelClosed =
        result.error.includes("message channel closed") ||
        result.error.includes("listener indicated an asynchronous response");
      try {
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        if (freshJob.status === "ready" || freshJob.status === "posted") {
          console.log(
            "[TikTok Flow] Multi-scene job already completed (status:",
            freshJob.status,
            ")",
          );
          return;
        }
        if (freshJob.status === "failed") {
          console.log("[TikTok Flow] Multi-scene job already marked failed.");
          return;
        }
      } catch {
        /* ignore */
      }

      if (isChannelClosed) {
        contentScriptActiveJobs.add(job.id);
        console.log(
          "[TikTok Flow] Multi-scene: channel closed but content script is still working. Releasing lock.",
        );
        return;
      }
      console.error("[TikTok Flow] Multi-scene job failed:", result.error);
      await handleJobFailure(job.id, result.error, job);
    } else {
      console.log(
        "[TikTok Flow] Multi-scene job completed successfully:",
        result.scenesCompleted,
        "scenes",
      );
    }
  } catch (err) {
    console.error("[TikTok Flow] Multi-scene job error:", err);
    await handleJobFailure(job.id, err.message || "Unknown error", job);
  }
}

// ---- Standalone Image-Only Job Processing ----
// Duplicates the video creation flow but stops after image generation.
// Completely standalone — no video generation step.
async function processImageOnlyJob(job) {
  console.log("[TikTok Flow] === Standalone image-only job:", job.id);

  // Step 1: Ensure Google Flow tab is open and content script is alive
  let flowTabId = await findGoogleFlowTab();
  if (flowTabId) {
    const health = await healthCheckGoogleFlow();
    if (!health.ok) {
      console.warn(
        "[TikTok Flow] Google Flow tab found but not responsive, reopening...",
      );
      flowTabId = null;
    }
  }

  if (!flowTabId) {
    console.log("[TikTok Flow] Opening Google Flow tab for image-only job...");
    flowTabId = await ensureGoogleFlowTab();
    if (!flowTabId) {
      await handleJobFailure(job.id, "Could not open Google Flow tab", job);
      return;
    }
  }

  // Focus the tab
  chrome.tabs.update(flowTabId, { active: true });

  // Step 2: Pre-fetch reference image in background (no CORS restrictions here)
  // Content scripts on labs.google can't fetch from localhost due to CORS
  let referenceImages = [];
  if (job.referenceImage) {
    try {
      const imgUrl = `${API_BASE}/upload/${job.referenceImage}`;
      console.log("[TikTok Flow] Fetching reference image:", imgUrl);
      const imgRes = await fetch(imgUrl);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        referenceImages = [dataUrl];
        console.log(
          "[TikTok Flow] Reference image fetched as data URL (" +
            Math.round(blob.size / 1024) +
            "KB)",
        );
      } else {
        console.warn(
          "[TikTok Flow] Reference image fetch failed:",
          imgRes.status,
        );
      }
    } catch (fetchErr) {
      console.warn(
        "[TikTok Flow] Could not fetch reference image:",
        fetchErr.message,
      );
    }
  }

  // Step 3: Send standalone image generation message to content script
  try {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        flowTabId,
        {
          type: "GENERATE_IMAGE_ONLY",
          payload: {
            jobId: job.id,
            prompt: job.imagePrompt,
            referenceImages: referenceImages,
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
      console.warn("[TikTok Flow] Image-only result has error:", result.error);
      const isChannelClosed =
        result.error.includes("message channel closed") ||
        result.error.includes("listener indicated an asynchronous response");
      try {
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        if (freshJob.status === "ready" || freshJob.status === "posted") {
          console.log(
            "[TikTok Flow] Image-only job completed (status:",
            freshJob.status,
            ")",
          );
          return;
        }
        if (freshJob.status === "failed") {
          console.log("[TikTok Flow] Image-only job already failed.");
          return;
        }
      } catch (fetchErr) {
        console.warn("[TikTok Flow] Could not re-check job status:", fetchErr);
      }

      if (isChannelClosed) {
        contentScriptActiveJobs.add(job.id);
        console.log(
          "[TikTok Flow] Image-only: channel closed but content script is still working. Releasing lock.",
        );
        return;
      }
      console.error(
        "[TikTok Flow] Standalone image generation failed:",
        result.error,
      );
      await handleJobFailure(job.id, result.error, job);
    } else {
      console.log(
        "[TikTok Flow] Standalone image generation complete:",
        result.imageUrl?.substring(0, 80),
      );
    }
  } catch (err) {
    console.error("[TikTok Flow] Standalone image generation error:", err);
    await handleJobFailure(job.id, err.message || "Unknown error", job);
  }
}

async function processVideoGeneration(job) {
  console.log("[TikTok Flow] === Video generation for job:", job.id);

  // ---- Check video engine setting: route to Grok if configured ----
  const videoEngine = await getVideoEngine();
  if (videoEngine === "grok") {
    console.log("[TikTok Flow] Video engine is GROK — routing to Grok...");
    await processVideoGenerationViaGrok(job);
    return;
  }

  // Detect gallery-image jobs (no product, came from gallery push)
  const isGalleryImageJob = !job.productId && job.imageUrl;

  // Health check: verify tab is still alive
  const health = await healthCheckGoogleFlow();
  if (!health.ok) {
    if (isGalleryImageJob) {
      // For gallery jobs, we can open a new tab since we're starting fresh
      console.warn(
        "[TikTok Flow] Health check failed, opening new tab for gallery video job...",
      );
      const newTabId = await ensureGoogleFlowTab();
      if (!newTabId) {
        await handleJobFailure(
          job.id,
          "Could not open Google Flow tab for gallery video job",
          job,
        );
        return;
      }
    } else {
      console.warn(
        "[TikTok Flow] Health check failed before video gen:",
        health.error,
      );
      await handleJobFailure(
        job.id,
        "Google Flow tab lost before video generation: " + health.error,
        job,
      );
      return;
    }
  }

  const flowTabId = isGalleryImageJob
    ? health.ok
      ? health.tabId
      : await findGoogleFlowTab()
    : await findGoogleFlowTab();

  if (!flowTabId) {
    await handleJobFailure(
      job.id,
      "Google Flow tab not found. Keep the tab open during generation.",
      job,
    );
    return;
  }

  // Focus the tab
  chrome.tabs.update(flowTabId, { active: true });

  // Gallery image job: fetch image as data URL and use GENERATE_VIDEO_FROM_IMAGE
  if (isGalleryImageJob) {
    console.log(
      "[TikTok Flow] Gallery image job detected — fetching image for reference upload...",
    );

    let referenceImageDataUrl = null;
    try {
      const imgRes = await fetch(job.imageUrl);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        referenceImageDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        console.log(
          "[TikTok Flow] Gallery image fetched as data URL (" +
            Math.round(blob.size / 1024) +
            "KB)",
        );
      } else {
        console.warn(
          "[TikTok Flow] Gallery image fetch failed:",
          imgRes.status,
        );
      }
    } catch (fetchErr) {
      console.warn(
        "[TikTok Flow] Could not fetch gallery image:",
        fetchErr.message,
      );
    }

    try {
      const galleryVideoModel = await getVideoModel();
      const result = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          flowTabId,
          {
            type: "GENERATE_VIDEO_FROM_IMAGE",
            payload: {
              jobId: job.id,
              prompt:
                job.videoPrompt ||
                "Create a smooth cinematic video showcasing this product with gentle camera movement, soft lighting, 9:16 vertical format.",
              referenceImageDataUrl,
              videoModel: galleryVideoModel,
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
        const isChannelClosed =
          result.error.includes("message channel closed") ||
          result.error.includes("listener indicated an asynchronous response");
        try {
          const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
          const freshJob = await freshRes.json();
          if (freshJob.status === "ready" || freshJob.status === "posted") {
            console.log(
              "[TikTok Flow] Gallery video job completed (status:",
              freshJob.status,
              ")",
            );
            return;
          }
          if (freshJob.status === "failed") {
            console.log("[TikTok Flow] Gallery video job already failed.");
            return;
          }
        } catch {
          /* ignore */
        }

        if (isChannelClosed) {
          contentScriptActiveJobs.add(job.id);
          console.log(
            "[TikTok Flow] Gallery video: channel closed but content script is still working. Releasing lock.",
          );
          return;
        }
        console.error(
          "[TikTok Flow] Gallery video generation failed:",
          result.error,
        );
        await handleJobFailure(job.id, result.error, job);
      } else {
        console.log(
          "[TikTok Flow] Gallery video generation complete:",
          result.videoUrl?.substring(0, 80),
        );

        const { autoPostEnabled } =
          await chrome.storage.local.get("autoPostEnabled");
        if (autoPostEnabled) {
          console.log(
            "[TikTok Flow] Auto-post enabled, starting posting for job:",
            job.id,
          );
          await fetch(`${API_BASE}/jobs/${job.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "posting",
              startedAt: new Date().toISOString(),
            }),
          });
          const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
          const freshJob = await freshRes.json();
          await processPosting(freshJob);
        }
      }
    } catch (err) {
      console.error("[TikTok Flow] Gallery video generation error:", err);
      await handleJobFailure(job.id, err.message || "Unknown error", job);
    }
    return;
  }

  // Normal video generation (continues from image step on same project page)
  // IMPORTANT: Use findGoogleFlowTab() instead of ensureGoogleFlowTab().
  // We must stay on the SAME project page where the image was generated.

  const videoModel = await getVideoModel();
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
            videoModel: videoModel,
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
      const isChannelClosed =
        result.error.includes("message channel closed") ||
        result.error.includes("listener indicated an asynchronous response");
      try {
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        if (freshJob.status === "ready" || freshJob.status === "posted") {
          console.log(
            "[TikTok Flow] Video job completed (status:",
            freshJob.status,
            ")",
          );
          const { autoPostEnabled } =
            await chrome.storage.local.get("autoPostEnabled");
          if (autoPostEnabled && freshJob.status === "ready") {
            await fetch(`${API_BASE}/jobs/${job.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "posting",
                startedAt: new Date().toISOString(),
              }),
            });
            const postRes = await fetch(`${API_BASE}/jobs/${job.id}`);
            const postJob = await postRes.json();
            await processPosting(postJob);
          }
          return;
        }
        if (freshJob.status === "failed") {
          console.log("[TikTok Flow] Video job already marked failed.");
          return;
        }
      } catch {
        /* ignore */
      }

      if (isChannelClosed) {
        contentScriptActiveJobs.add(job.id);
        console.log(
          "[TikTok Flow] Video gen: channel closed but content script is still working. Releasing lock.",
        );
        return;
      }
      console.error("[TikTok Flow] Video generation failed:", result.error);
      await handleJobFailure(job.id, result.error, job);
    } else {
      console.log(
        "[TikTok Flow] Video generation complete:",
        result.videoUrl?.substring(0, 80),
      );

      // Check if auto-post is enabled — trigger posting inline
      // (JOB_PHASE_COMPLETE from content script is blocked by isProcessingJob guard)
      const { autoPostEnabled } =
        await chrome.storage.local.get("autoPostEnabled");
      if (autoPostEnabled) {
        console.log(
          "[TikTok Flow] Auto-post enabled, starting posting for job:",
          job.id,
        );
        await fetch(`${API_BASE}/jobs/${job.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "posting",
            startedAt: new Date().toISOString(),
          }),
        });
        const freshRes = await fetch(`${API_BASE}/jobs/${job.id}`);
        const freshJob = await freshRes.json();
        await processPosting(freshJob);
      } else {
        console.log(
          "[TikTok Flow] Auto-post disabled, job is ready for manual posting",
        );
      }
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
