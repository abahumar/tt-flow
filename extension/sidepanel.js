let API_BASE = "http://localhost:3000/api";
let currentTab = "image";

// Load configured API base from storage on startup
chrome.storage.local.get(["apiBase"], (res) => {
  if (res.apiBase) API_BASE = res.apiBase;
  // Populate settings input if already on settings tab
  const input = document.getElementById("apiBaseInput");
  if (input) input.value = res.apiBase || "";
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.apiBase) {
    API_BASE = changes.apiBase.newValue || "http://localhost:3000/api";
  }
});
let pollInterval = null;

// Helper: push a setting change to the DB (fire-and-forget)
function pushSettingToDB(key, value) {
  fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: String(value) }),
  }).catch(() => {
    // Server may be offline — chrome.storage.local is already updated as primary
    console.debug("[SidePanel] Could not sync setting to DB:", key);
  });
}

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const tabName = tab.dataset.tab;
    document
      .querySelectorAll(".content")
      .forEach((c) => (c.style.display = "none"));
    document.getElementById(`tab-${tabName}`).style.display = "block";
    currentTab = tabName;
  });
});

// Poll for job updates
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchAndRender, 3000);
  fetchAndRender();
}

async function fetchAndRender() {
  try {
    const res = await fetch(`${API_BASE}/jobs`);
    const jobs = await res.json();
    renderJobs(jobs);
  } catch (err) {
    console.error("Failed to fetch jobs:", err);
  }
}

function renderJobs(jobs) {
  const activeJob = jobs.find((j) =>
    ["generating_image", "generating_video", "ready", "posting"].includes(
      j.status,
    ),
  );
  const completedJobs = jobs.filter((j) => j.status === "posted");
  const pendingJobs = jobs.filter((j) => j.status === "pending");

  // Image tab
  const imageEl = document.getElementById("image-content");
  if (activeJob && ["generating_image"].includes(activeJob.status)) {
    imageEl.innerHTML = renderActiveJob(activeJob, "image");
  } else if (activeJob) {
    imageEl.innerHTML = renderStepDone("Image generation complete");
  } else {
    imageEl.innerHTML = renderEmpty("No active image generation.");
  }

  // Video tab
  const videoEl = document.getElementById("video-content");
  if (activeJob && activeJob.status === "generating_video") {
    videoEl.innerHTML = renderActiveJob(activeJob, "video");
  } else if (
    activeJob &&
    ["ready", "posting", "posted"].includes(activeJob.status)
  ) {
    videoEl.innerHTML = renderStepDone("Video generation complete");
  } else {
    videoEl.innerHTML = renderEmpty("No active video generation.");
  }

  // TikTok tab
  const tiktokEl = document.getElementById("tiktok-content");
  if (activeJob) {
    tiktokEl.innerHTML = renderTikTokProgress(activeJob);
  } else {
    tiktokEl.innerHTML = renderEmpty("No posting in progress.");
  }

  // History tab
  const historyEl = document.getElementById("history-content");
  if (completedJobs.length > 0) {
    historyEl.innerHTML = completedJobs
      .map(
        (j) => `
      <div class="status-card">
        <div class="product-info">
          <div class="details">
            <div class="title">${escapeHtml(j.product?.title || "Product")}</div>
            <div class="meta">${j.videoType} · ${new Date(j.updatedAt || j.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <span class="status done">✓ Posted</span>
      </div>
    `,
      )
      .join("");
  } else {
    historyEl.innerHTML = renderEmpty("No completed jobs yet.");
  }

  // Progress summary at the bottom of TikTok tab
  const total = jobs.length;
  const posted = completedJobs.length;
  if (total > 0 && currentTab === "tiktok") {
    const bar = document.querySelector("#tiktok-content .progress-bar .fill");
    if (bar) bar.style.width = `${Math.round((posted / total) * 100)}%`;
  }
}

function renderActiveJob(job, phase) {
  const images = JSON.parse(job.product?.images || "[]");
  const imgSrc = images[0] || "";
  const prompt = phase === "image" ? job.imagePrompt : job.videoPrompt;

  return `
    <div class="status-card">
      <div class="product-info">
        ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="">` : ""}
        <div class="details">
          <div class="title">${escapeHtml(job.product?.title || "Product")}</div>
          <div class="meta">${job.videoType}</div>
        </div>
      </div>
      <span class="status active">⟳ ${phase === "image" ? "Generating Image..." : "Generating Video..."}</span>
      <div style="margin-top:8px;font-size:11px;color:#6b7280;word-break:break-word;">
        <strong>Prompt:</strong> ${escapeHtml(prompt).substring(0, 200)}...
      </div>
      <div class="btn-row">
        <button class="btn" data-action="pause">⏸ Pause</button>
        <button class="btn" data-action="skip" data-job-id="${job.id}">⏭ Skip</button>
      </div>
    </div>
  `;
}

function renderTikTokProgress(job) {
  const isReady = ["ready", "posting", "posted"].includes(job.status);
  const isPosting = job.status === "posting";
  const isPosted = job.status === "posted";

  return `
    <div class="status-card">
      <h3>Full Auto: ${escapeHtml(job.product?.title || "Product")}</h3>
      <p style="font-size:11px;color:#9ca3af;margin-bottom:8px;">Progress</p>
      <ul class="progress-steps">
        <li class="${isReady || isPosting || isPosted ? "complete" : job.status === "generating_video" ? "active" : ""}">
          <span class="dot"></span>Save Video — ${isReady || isPosting || isPosted ? "Video saved." : "Waiting..."}
        </li>
        <li class="${isPosting || isPosted ? "complete" : isReady ? "active" : ""}">
          <span class="dot"></span>Prepare Post — ${isPosting || isPosted ? "Ready." : "Waiting..."}
        </li>
        <li class="${isPosted ? "complete" : isPosting ? "active" : ""}">
          <span class="dot"></span>Post to TikTok — ${isPosted ? "Posted!" : isPosting ? "Uploading..." : "Waiting"}
        </li>
      </ul>
      <div class="badge-row">
        ${isReady || isPosting || isPosted ? '<span class="badge badge-green">✓ Saved</span>' : ""}
        ${isPosting || isPosted ? '<span class="badge badge-blue">✓ Ready</span>' : ""}
        ${isPosted ? '<span class="badge badge-green">✓ Posted</span>' : isPosting ? '<span class="badge badge-yellow">Posting...</span>' : ""}
      </div>
      <div class="progress-bar"><div class="fill" style="width:${isPosted ? 100 : isPosting ? 66 : isReady ? 33 : 10}%"></div></div>
      ${isReady ? '<div class="btn-row"><button class="btn btn-primary" data-action="post-tiktok" data-job-id="' + job.id + '">▶ Post to TikTok</button></div>' : ""}
      ${isPosting ? '<div class="btn-row"><button class="btn" data-action="stop-post">■ Stop Post</button></div>' : ""}
    </div>
  `;
}

function renderStepDone(msg) {
  return `<div class="status-card"><span class="status done">✓ ${escapeHtml(msg)}</span></div>`;
}

function renderEmpty(msg) {
  return `<div class="empty-state"><p>${escapeHtml(msg)}</p><p>Start automation from the web app.</p></div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// Actions
function handlePause() {
  chrome.runtime.sendMessage({ type: "PAUSE_AUTO" }, (response) => {
    console.log("Pause toggled:", response);
  });
}

function handleSkip(jobId) {
  chrome.runtime.sendMessage({
    type: "UPDATE_JOB_STATUS",
    payload: {
      jobId,
      data: { status: "failed", errorMessage: "Skipped by user" },
    },
  });
}

function handlePostToTikTok(jobId) {
  chrome.runtime.sendMessage({
    type: "START_POSTING",
    payload: { jobId },
  });
}

function handleStopPost() {
  chrome.runtime.sendMessage({ type: "STOP_POST" });
}

let autoModeOn = false;

function handleToggleAutoMode() {
  autoModeOn = !autoModeOn;
  const btn = document.getElementById("autoModeBtn");

  if (autoModeOn) {
    chrome.runtime.sendMessage({ type: "ENABLE_AUTO_MODE" }, () => {
      btn.textContent = "■ Stop Auto Mode";
      btn.style.background = "#dc2626";
      btn.style.borderColor = "#dc2626";
    });
  } else {
    chrome.runtime.sendMessage({ type: "DISABLE_AUTO_MODE" }, () => {
      btn.textContent = "▶ Start Auto Mode";
      btn.style.background = "#f43f5e";
      btn.style.borderColor = "#f43f5e";
    });
  }
}

function handleScrapeCurrentPage() {
  const resultEl = document.getElementById("scrapeResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#6b7280">Scraping...</div>';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      resultEl.innerHTML =
        '<div class="scrape-result error">No active tab found</div>';
      return;
    }
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: "SCRAPE_PRODUCT" },
      (response) => {
        if (chrome.runtime.lastError) {
          resultEl.innerHTML = `<div class="scrape-result error">Cannot scrape this page. Open a TikTok Shop product page first.</div>`;
          return;
        }
        if (!response) {
          resultEl.innerHTML =
            '<div class="scrape-result error">No response from page</div>';
          return;
        }
        if (response.error) {
          resultEl.innerHTML = `<div class="scrape-result error">${escapeHtml(response.error)}</div>`;
          return;
        }
        if (response.success && response.data) {
          resultEl.innerHTML = `<div style="font-size:11px;color:#059669">✓ Scraped: ${escapeHtml(response.data.title?.substring(0, 60) || "Unknown")}</div>`;
        } else {
          resultEl.innerHTML =
            '<div class="scrape-result error">Scrape returned no data</div>';
        }
      },
    );
  });
}

// Check auto mode status on load
chrome.runtime.sendMessage({ type: "GET_AUTO_STATUS" }, (response) => {
  if (response?.autoMode) {
    autoModeOn = true;
    const btn = document.getElementById("autoModeBtn");
    if (btn) {
      btn.textContent = "■ Stop Auto Mode";
      btn.style.background = "#dc2626";
      btn.style.borderColor = "#dc2626";
    }
  }
});

// Auto-post toggle
chrome.storage.local.get("autoPostEnabled", ({ autoPostEnabled }) => {
  const toggle = document.getElementById("autoPostToggle");
  if (toggle) toggle.checked = !!autoPostEnabled;
});

document.getElementById("autoPostToggle").addEventListener("change", (e) => {
  chrome.storage.local.set({ autoPostEnabled: e.target.checked });
  pushSettingToDB("autoPostEnabled", e.target.checked ? "true" : "false");
});

// Video model selector
chrome.storage.local.get("videoModel", ({ videoModel }) => {
  const select = document.getElementById("videoModelSelect");
  if (select && videoModel) select.value = videoModel;
});

document.getElementById("videoModelSelect").addEventListener("change", (e) => {
  chrome.storage.local.set({ videoModel: e.target.value });
  pushSettingToDB("videoModel", e.target.value);
});

// Video engine selector (Google Flow / Grok)
chrome.storage.local.get("videoEngine", ({ videoEngine }) => {
  const select = document.getElementById("videoEngineSelect");
  if (select && videoEngine) select.value = videoEngine;
});

document.getElementById("videoEngineSelect").addEventListener("change", (e) => {
  chrome.storage.local.set({ videoEngine: e.target.value });
  pushSettingToDB("videoEngine", e.target.value);
  console.log("[SidePanel] Video engine set to:", e.target.value);
});

// ---- Attach event listeners ----
document
  .getElementById("autoModeBtn")
  .addEventListener("click", handleToggleAutoMode);
document
  .getElementById("scrapeBtn")
  .addEventListener("click", handleScrapeCurrentPage);

document.getElementById("testCreateBtn").addEventListener("click", async () => {
  const btn = document.getElementById("testCreateBtn");
  const result = document.getElementById("testCreateResult");
  btn.disabled = true;
  btn.textContent = "⏳ Clicking Create...";
  result.textContent = "";
  try {
    const [tab] = await chrome.tabs.query({ url: "https://labs.google/*" });
    if (!tab) {
      result.textContent = "❌ No Google Flow tab found — open labs.google/fx/tools/flow first";
      return;
    }
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "CLICK_CREATE_BUTTON", tabId: tab.id }, (r) => {
        resolve(r || { error: chrome.runtime.lastError?.message || "No response" });
      });
    });
    if (res?.success) {
      result.textContent = `✅ Clicked: "${res.text}"`;
    } else {
      result.textContent = `❌ ${res?.error || "Unknown error"}`;
    }
  } catch (err) {
    result.textContent = `❌ ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = "🖼️ Test: Click Create (Image)";
  }
});

// Event delegation for dynamically rendered buttons
document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const jobId = btn.dataset.jobId;
  switch (action) {
    case "pause":
      handlePause();
      break;
    case "skip":
      if (jobId) handleSkip(jobId);
      break;
    case "post-tiktok":
      if (jobId) handlePostToTikTok(jobId);
      break;
    case "stop-post":
      handleStopPost();
      break;
  }
});

// Settings tab: load saved API base into input when tab is opened
document.querySelector('[data-tab="settings"]').addEventListener("click", () => {
  chrome.storage.local.get(["apiBase"], (res) => {
    const input = document.getElementById("apiBaseInput");
    if (input) input.value = res.apiBase || "";
  });
});

// Settings tab: save API base URL
document.getElementById("saveApiBaseBtn").addEventListener("click", () => {
  const input = document.getElementById("apiBaseInput");
  const msg = document.getElementById("apiBaseSaveMsg");
  const raw = (input.value || "").trim();
  const value = raw || "http://localhost:3000/api";
  chrome.storage.local.set({ apiBase: value }, () => {
    API_BASE = value;
    msg.textContent = `Saved: ${value}`;
    setTimeout(() => (msg.textContent = ""), 3000);
  });
});

// Start
startPolling();
