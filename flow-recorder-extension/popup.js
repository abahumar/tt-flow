// Flow Recorder - Popup UI

const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnCopy = document.getElementById("btnCopy");
const btnClear = document.getElementById("btnClear");
const stepsList = document.getElementById("stepsList");
const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");
const stepCount = document.getElementById("stepCount");
const toast = document.getElementById("toast");

let currentSteps = [];
let refreshInterval = null;

// --- Init ---
loadState();

// --- Event listeners ---

btnStart.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_RECORDING" }, (res) => {
    if (res && res.ok) {
      setRecordingUI(true);
      startPolling();
    }
  });
});

btnStop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, (res) => {
    if (res && res.ok) {
      currentSteps = res.steps || [];
      setRecordingUI(false);
      renderSteps();
      stopPolling();
    }
  });
});

btnCopy.addEventListener("click", () => {
  const text = formatStepsAsText(currentSteps);
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copied to clipboard!");
  });
});

btnClear.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_STEPS" }, () => {
    currentSteps = [];
    renderSteps();
  });
});

// --- Functions ---

function loadState() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
    if (!res) return;
    currentSteps = res.steps || [];
    setRecordingUI(res.isRecording);
    renderSteps();
    if (res.isRecording) startPolling();
  });
}

function setRecordingUI(recording) {
  btnStart.disabled = recording;
  btnStop.disabled = !recording;
  btnCopy.disabled = currentSteps.length === 0;
  btnClear.disabled = currentSteps.length === 0;

  if (recording) {
    statusBar.classList.add("recording");
    statusText.textContent = "Recording...";
  } else {
    statusBar.classList.remove("recording");
    statusText.textContent = currentSteps.length > 0 ? "Stopped" : "Idle";
  }
}

function startPolling() {
  stopPolling();
  refreshInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
      if (!res) return;
      currentSteps = res.steps || [];
      renderSteps();
      if (!res.isRecording) {
        setRecordingUI(false);
        stopPolling();
      }
    });
  }, 1000);
}

function stopPolling() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function renderSteps() {
  stepCount.textContent = `${currentSteps.length} steps`;
  btnCopy.disabled = currentSteps.length === 0;
  btnClear.disabled = currentSteps.length === 0;

  stepsList.innerHTML = "";
  for (const step of currentSteps) {
    const div = document.createElement("div");
    div.className = "step";
    div.innerHTML = buildStepHTML(step);
    stepsList.appendChild(div);
  }
  // Auto-scroll to bottom
  stepsList.scrollTop = stepsList.scrollHeight;
}

function buildStepHTML(step) {
  const actionClass = `action-${step.action}`;
  let detail = "";

  switch (step.action) {
    case "navigate":
      detail = step.url || "";
      break;
    case "click":
    case "dblclick":
      detail = step.description || step.selector || "";
      break;
    case "type":
      detail = `${step.description || step.selector}\n→ Value: "${step.value || ""}"`;
      break;
    case "select":
      detail = `${step.description || step.selector}\n→ Selected: "${step.value || ""}"`;
      break;
    case "file_upload":
    case "file_drop":
      const fileNames = (step.files || []).map((f) => f.name).join(", ");
      detail = `${step.description || step.selector}\n→ Files: ${fileNames}`;
      break;
    case "keypress":
      detail = `Key: ${step.key} on ${step.description || step.selector}`;
      break;
    case "scroll":
      detail = `scrollY: ${step.scrollY}px`;
      break;
    case "new_tab":
      detail = `New tab opened → ${step.url || "(blank)"}`;
      break;
    case "tab_switch":
      detail = `Switched to tab → ${step.title || step.url || ""}`;
      break;
    case "tab_closed":
      detail = `Tab closed (id: ${step.tabId})`;
      break;
    case "toggle":
      detail = `${step.description || step.selector}\n→ ${step.checked ? "Checked" : "Unchecked"}`;
      break;
    case "drag_drop":
      detail = `From: ${step.fromDescription}\nTo: ${step.toDescription}`;
      break;
    default:
      detail = JSON.stringify(step);
  }

  return `
    <span class="seq">${step.seq}</span>
    <span class="action-name ${actionClass}">${step.action}</span>
    <div class="detail">${escapeHtml(detail)}</div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML.replace(/\n/g, "<br>");
}

function formatStepsAsText(steps) {
  const lines = ["=== FLOW RECORDING ===", ""];

  for (const step of steps) {
    let line = `Step ${step.seq} [${step.action.toUpperCase()}]`;

    switch (step.action) {
      case "navigate":
        line += ` → ${step.url}`;
        if (step.title) line += ` (${step.title})`;
        break;
      case "click":
      case "dblclick":
        line += ` → ${step.description || step.selector}`;
        if (step.selector) line += `\n   Selector: ${step.selector}`;
        break;
      case "type":
        line += ` → ${step.description || step.selector}`;
        line += `\n   Value: "${step.value || ""}"`;
        if (step.selector) line += `\n   Selector: ${step.selector}`;
        break;
      case "select":
        line += ` → ${step.description || step.selector}`;
        line += `\n   Selected: "${step.value || ""}"`;
        if (step.selector) line += `\n   Selector: ${step.selector}`;
        break;
      case "file_upload":
      case "file_drop":
        line += ` → ${step.description || step.selector}`;
        const files = (step.files || []).map(
          (f) => `${f.name} (${f.type}, ${f.size} bytes)`,
        );
        line += `\n   Files: ${files.join(", ")}`;
        if (step.selector) line += `\n   Selector: ${step.selector}`;
        break;
      case "keypress":
        line += ` → Key "${step.key}" on ${step.description || step.selector}`;
        break;
      case "scroll":
        line += ` → scrollY: ${step.scrollY}px`;
        break;
      case "toggle":
        line += ` → ${step.description || step.selector}`;
        line += `\n   ${step.checked ? "Checked" : "Unchecked"}`;
        break;
      case "drag_drop":
        line += `\n   From: ${step.fromDescription}`;
        line += `\n   To: ${step.toDescription}`;
        break;
    }

    line += `\n   Time: ${step.timestamp}`;
    if (step.pageUrl) line += `\n   Page: ${step.pageUrl}`;

    lines.push(line, "");
  }

  lines.push("=== END RECORDING ===");
  return lines.join("\n");
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}
