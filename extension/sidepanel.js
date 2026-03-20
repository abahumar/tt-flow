const API_BASE = "http://localhost:3000/api";
let currentTab = "image";
let pollInterval = null;

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
  chrome.runtime.sendMessage({ type: "OPEN_TIKTOK_STUDIO" });
  chrome.runtime.sendMessage({
    type: "UPDATE_JOB_STATUS",
    payload: { jobId, data: { status: "posting" } },
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

function handleInspectFlow() {
  const resultEl = document.getElementById("inspectResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#6b7280">Inspecting...</div>';

  chrome.runtime.sendMessage({ type: "INSPECT_FLOW" }, (response) => {
    if (response?.error) {
      resultEl.innerHTML = `<div class="scrape-result error">${escapeHtml(response.error)}</div>`;
      return;
    }
    if (!response) {
      resultEl.innerHTML =
        '<div class="scrape-result error">No response — is Google Flow open?</div>';
      return;
    }
    const lines = [
      `URL: ${response.url}`,
      `Page: ${response.pageState === "creation" ? "✓ Creation UI" : "⚠ Gallery (need 'New project')"}`,
      `New project btn: ${response.newProjectBtn?.found ? "✓ " + response.newProjectBtn.text : "✗ Not found"}`,
      `Prompt: ${response.promptFound ? "✓ " + response.promptTag + "." + (response.promptClass || "").substring(0, 30) : "✗ Not found"}`,
      `Create btn: ${response.createBtnFound ? "✓ " + (response.createBtnText || "(no text)") : "✗ Not found"}`,
      `Editables: ${response.contenteditables?.map((e) => e.tag + " " + e.size + " " + e.text.substring(0, 20)).join("; ") || "0"}`,
      `Tabs: ${response.tabTriggers?.map((t) => t.text + (t.selected ? "*" : "")).join(", ") || "none"}`,
      `Model: ${response.modelSelector?.found ? "✓ " + response.modelSelector.text : "✗ Not found"}`,
      `Start area: ${response.startAreaFound ? "✓" : "✗"} | Virtuoso: ${response.virtuosoFound ? "✓" : "✗"}`,
      `Buttons(${response.buttons?.length}): ${response.buttons
        ?.slice(0, 12)
        .map((b) => (b.text || "(icon)").substring(0, 12))
        .join(", ")}`,
    ];
    resultEl.innerHTML = `<div style="font-size:10px;color:#374151;background:#f3f4f6;padding:6px 8px;border-radius:6px;white-space:pre-line">${lines.join("\n")}</div>`;
  });
}

function handleNewProject() {
  const resultEl = document.getElementById("inspectResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#6b7280">Opening new project...</div>';

  chrome.runtime.sendMessage({ type: "OPEN_NEW_PROJECT" }, (response) => {
    if (response?.error) {
      resultEl.innerHTML = `<div class="scrape-result error">${escapeHtml(response.error)}</div>`;
      return;
    }
    if (response?.success) {
      resultEl.innerHTML =
        '<div style="font-size:11px;color:#059669">✓ Creation UI opened! Click 🔍 Inspect to verify.</div>';
    } else {
      resultEl.innerHTML =
        '<div class="scrape-result error">Could not open new project. Try clicking it manually.</div>';
    }
  });
}

function handleTestGenerate() {
  const resultEl = document.getElementById("inspectResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#7c3aed">🧪 Running test... filling prompt and clicking Create</div>';

  chrome.runtime.sendMessage(
    {
      type: "TEST_GENERATE",
      payload: {
        prompt:
          "A beautiful product photo of a trendy item on a clean white background, professional lighting, 4K",
      },
    },
    (response) => {
      if (response?.error) {
        resultEl.innerHTML = `<div class="scrape-result error">✗ Test failed: ${escapeHtml(response.error)}</div>`;
        return;
      }
      if (response?.success) {
        resultEl.innerHTML = `<div style="font-size:11px;color:#059669">✓ ${escapeHtml(response.message)}</div>`;
      } else {
        resultEl.innerHTML =
          '<div class="scrape-result error">Test returned unexpected response</div>';
      }
    },
  );
}

function handleTestFullFlow() {
  const resultEl = document.getElementById("inspectResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#be185d">🚀 Starting full flow: Image → wait → Animate → Video...<br>This will take a few minutes. Watch Google Flow tab.</div>';

  chrome.runtime.sendMessage(
    {
      type: "TEST_FULL_FLOW",
      payload: {
        imagePrompt:
          "A beautiful product photo of a trendy item on a clean white background, professional lighting, 4K",
        videoPrompt:
          "Smooth cinematic camera pan showcasing a trendy product on a table with soft warm lighting, 9:16 vertical video for TikTok",
      },
    },
    (response) => {
      if (response?.error) {
        resultEl.innerHTML = `<div class="scrape-result error">✗ Full flow failed: ${escapeHtml(response.error)}</div>`;
        return;
      }
      if (response?.success) {
        resultEl.innerHTML = `<div style="font-size:11px;color:#059669">✓ ${escapeHtml(response.message)}</div>`;
      } else {
        resultEl.innerHTML =
          '<div class="scrape-result error">Full flow returned unexpected response</div>';
      }
    },
  );
}

function handleTestVideo() {
  const resultEl = document.getElementById("inspectResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#ea580c">🎬 Running video test... Animate → fill prompt → Create</div>';

  chrome.runtime.sendMessage(
    {
      type: "TEST_VIDEO",
      payload: {
        prompt:
          "Smooth cinematic camera pan showcasing a trendy product on a table with soft warm lighting, 9:16 vertical video for TikTok",
      },
    },
    (response) => {
      if (response?.error) {
        resultEl.innerHTML = `<div class="scrape-result error">✗ Video test failed: ${escapeHtml(response.error)}</div>`;
        return;
      }
      if (response?.success) {
        resultEl.innerHTML = `<div style="font-size:11px;color:#059669">✓ ${escapeHtml(response.message)}</div>`;
      } else {
        resultEl.innerHTML =
          '<div class="scrape-result error">Video test returned unexpected response</div>';
      }
    },
  );
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

// ---- Interaction Recorder ----
let recorderOn = false;

function handleToggleRecorder() {
  recorderOn = !recorderOn;
  const btn = document.getElementById("recorderBtn");
  const resultEl = document.getElementById("recorderResult");

  if (recorderOn) {
    chrome.runtime.sendMessage({ type: "START_RECORDER" }, (response) => {
      if (response?.error) {
        resultEl.innerHTML = `<div class="scrape-result error">${escapeHtml(response.error)}</div>`;
        recorderOn = false;
        return;
      }
      btn.textContent = "■ Stop";
      btn.style.background = "#dc2626";
      btn.style.borderColor = "#dc2626";
      resultEl.innerHTML =
        '<div style="font-size:11px;color:#059669">⏺ Recording... Click around on Google Flow, then press Stop.</div>';
    });
  } else {
    chrome.runtime.sendMessage({ type: "STOP_RECORDER" }, (response) => {
      btn.textContent = "⏺ Rec";
      btn.style.background = "#059669";
      btn.style.borderColor = "#059669";

      if (response?.error) {
        resultEl.innerHTML = `<div class="scrape-result error">${escapeHtml(response.error)}</div>`;
        return;
      }

      const events = response?.events || [];
      if (events.length === 0) {
        resultEl.innerHTML =
          '<div style="font-size:11px;color:#6b7280">No events recorded.</div>';
        return;
      }

      resultEl.innerHTML = renderRecordedEvents(events);
    });
  }
}

function handleDiagnose() {
  const resultEl = document.getElementById("inspectResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#0891b2">🩺 Diagnosing mode switch... (opening dropdown, scanning buttons)</div>';

  chrome.runtime.sendMessage({ type: "DIAGNOSE_MODE_SWITCH" }, (response) => {
    if (response?.error) {
      resultEl.innerHTML = `<div class="scrape-result error">${escapeHtml(response.error)}</div>`;
      return;
    }
    if (!response) {
      resultEl.innerHTML =
        '<div class="scrape-result error">No response — is Google Flow open?</div>';
      return;
    }

    const lines = [];
    lines.push(`<b>URL:</b> ${escapeHtml(response.url || "?")}`);
    lines.push(
      `<b>On creation page:</b> ${response.onCreationPage ? "YES" : "NO"}`,
    );
    lines.push(`<b>Prompt found:</b> ${response.promptFound ? "YES" : "NO"}`);
    lines.push(`<b>Total buttons:</b> ${response.totalButtons}`);

    if (response.dropdownTrigger) {
      const t = response.dropdownTrigger;
      lines.push(
        `<b>Dropdown trigger:</b> FOUND "${escapeHtml(t.text)}" [${(t.classList || "").substring(0, 40)}] ${t.rect.w}x${t.rect.h}`,
      );
    } else {
      lines.push(`<b>Dropdown trigger:</b> NOT FOUND`);
    }

    lines.push(
      `<b>Dropdown opened:</b> ${response.dropdownOpened ? "YES" : "NO"}`,
    );

    if (response.dropdownButtons?.length > 0) {
      lines.push(`<b>Dropdown items (${response.dropdownButtons.length}):</b>`);
      response.dropdownButtons.forEach((b, i) => {
        lines.push(
          `  [${i}] "${escapeHtml(b.text)}" id=${b.id || "-"} state=${b.dataState || "-"} class=${(b.classList || "").substring(0, 50)}`,
        );
      });
    }

    const interestingBtns = (response.buttons || []).filter(
      (b) =>
        b.ariaHaspopup ||
        b.role === "tab" ||
        b.dataState ||
        (b.id && b.id.includes("trigger")),
    );
    if (interestingBtns.length > 0) {
      lines.push(`<b>Interesting btns (${interestingBtns.length}):</b>`);
      interestingBtns.forEach((b) => {
        lines.push(
          `  "${escapeHtml(b.text)}" id=${b.id || "-"} popup=${b.ariaHaspopup || "-"} state=${b.dataState || "-"} role=${b.role || "-"} ${b.rect.w}x${b.rect.h}`,
        );
      });
    }

    if (response.radixElements?.length > 0) {
      lines.push(`<b>Radix IDs (${response.radixElements.length}):</b>`);
      response.radixElements.slice(0, 10).forEach((r) => {
        lines.push(`  ${r.tag} #${r.id} "${escapeHtml(r.text)}"`);
      });
    }

    if (response.dropdownHTML) {
      lines.push(`<b>Dropdown HTML (500ch):</b>`);
      lines.push(
        `<code style="font-size:9px;word-break:break-all">${escapeHtml(response.dropdownHTML.substring(0, 500))}</code>`,
      );
    }

    resultEl.innerHTML = `<div style="font-size:10px;color:#374151;background:#f0f9ff;padding:8px;border-radius:6px;white-space:pre-line;max-height:400px;overflow-y:auto;border:1px solid #0891b2">${lines.join("\n")}</div>`;
  });
}

function handleTestSwitchImage() {
  const resultEl = document.getElementById("inspectResult");
  resultEl.innerHTML =
    '<div style="font-size:11px;color:#16a34a">1️⃣ Testing: switch to Image mode...</div>';

  chrome.runtime.sendMessage({ type: "TEST_SWITCH_IMAGE" }, (response) => {
    if (response?.error) {
      resultEl.innerHTML = `<div class="scrape-result error">✗ ${escapeHtml(response.error)}</div>`;
      return;
    }
    if (!response) {
      resultEl.innerHTML =
        '<div class="scrape-result error">No response — is Google Flow open?</div>';
      return;
    }

    const steps = response.steps || [];
    const overall = response.success ? "✓ SUCCESS" : "✗ FAILED";
    const color = response.success ? "#16a34a" : "#dc2626";

    const lines = steps.map((s) => {
      const icon = s.ok ? "✅" : "❌";
      return `${icon} <b>${escapeHtml(s.step)}</b>: ${escapeHtml(s.detail || "")}`;
    });

    resultEl.innerHTML = `<div style="font-size:10px;background:${response.success ? "#f0fdf4" : "#fef2f2"};padding:8px;border-radius:6px;white-space:pre-line;border:1px solid ${color}"><b style="color:${color}">${overall}</b>\n${lines.join("\n")}</div>`;
  });
}

function renderRecordedEvents(events) {
  const lines = events.map((ev, i) => {
    const el = ev.element;
    const label =
      el.ariaLabel || el.textContent || el.placeholder || el.id || "(no label)";
    const shortLabel = label.substring(0, 25);
    const icon = ev.type === "click" ? "👆" : ev.type === "input" ? "⌨️" : "🎯";
    const selector = el.selector || "";
    const value = ev.value ? ` = "${ev.value.substring(0, 30)}"` : "";

    return (
      `<div style="margin-bottom:4px;padding:4px 6px;background:${i % 2 === 0 ? "#f9fafb" : "#fff"};border-radius:4px">` +
      `<div style="font-size:11px"><b>${icon} ${ev.type}</b> → <code style="font-size:10px;background:#e5e7eb;padding:1px 3px;border-radius:2px">${escapeHtml(el.tag)}</code> ${escapeHtml(shortLabel)}${value}</div>` +
      `<div style="font-size:9px;color:#6b7280;word-break:break-all;margin-top:2px">` +
      `${escapeHtml(selector)}` +
      `${el.classes ? "<br>class: " + escapeHtml(el.classes.substring(0, 80)) : ""}` +
      `${el.ariaLabel ? "<br>aria: " + escapeHtml(el.ariaLabel) : ""}` +
      `${el.dataTestId ? "<br>testid: " + escapeHtml(el.dataTestId) : ""}` +
      `${el.rect ? "<br>rect: " + el.rect.w + "x" + el.rect.h + " at (" + el.rect.x + "," + el.rect.y + ")" : ""}` +
      `</div></div>`
    );
  });

  return (
    `<div style="font-size:11px;font-weight:600;margin-bottom:4px">${events.length} events recorded:</div>` +
    `<div style="max-height:300px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;padding:4px">${lines.join("")}</div>`
  );
}

// ---- Attach event listeners (no inline handlers for CSP) ----
document
  .getElementById("autoModeBtn")
  .addEventListener("click", handleToggleAutoMode);
document
  .getElementById("inspectBtn")
  .addEventListener("click", handleInspectFlow);
document
  .getElementById("recorderBtn")
  .addEventListener("click", handleToggleRecorder);
document
  .getElementById("newProjectBtn")
  .addEventListener("click", handleNewProject);
document
  .getElementById("testGenBtn")
  .addEventListener("click", handleTestGenerate);
document
  .getElementById("testFullFlowBtn")
  .addEventListener("click", handleTestFullFlow);
document
  .getElementById("testVideoBtn")
  .addEventListener("click", handleTestVideo);
document
  .getElementById("scrapeBtn")
  .addEventListener("click", handleScrapeCurrentPage);
document
  .getElementById("diagnoseBtn")
  .addEventListener("click", handleDiagnose);
document
  .getElementById("testSwitchImageBtn")
  .addEventListener("click", handleTestSwitchImage);

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

// Start
startPolling();
