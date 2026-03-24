// Flow Recorder - Background Service Worker
// Manages recording state and coordinates content script injection

let isRecording = false;
let recordedSteps = [];
let injectedTabs = new Set(); // track all tabs with content script

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_STATE") {
    sendResponse({ isRecording, steps: recordedSteps });
    return true;
  }

  if (msg.type === "START_RECORDING") {
    isRecording = true;
    recordedSteps = [];
    injectedTabs = new Set();

    // Inject into ALL open tabs (not just active one)
    chrome.tabs.query({}, async (tabs) => {
      for (const tab of tabs) {
        await injectRecorder(tab.id, tab.url);
      }

      // Log the currently active tab as first navigate step
      const activeTabs = tabs.filter((t) => t.active);
      if (activeTabs.length > 0) {
        recordedSteps.push({
          seq: 1,
          action: "navigate",
          url: activeTabs[0].url,
          title: activeTabs[0].title,
          tabId: activeTabs[0].id,
          timestamp: new Date().toISOString(),
        });
      }

      sendResponse({ ok: true });
    });
    return true; // async response
  }

  if (msg.type === "STOP_RECORDING") {
    isRecording = false;
    // Tell ALL injected tabs to stop
    for (const tabId of injectedTabs) {
      chrome.tabs.sendMessage(tabId, { type: "STOP_RECORDER" }).catch(() => {});
    }
    injectedTabs.clear();
    sendResponse({ ok: true, steps: recordedSteps });
    return true;
  }

  if (msg.type === "RECORD_STEP") {
    if (!isRecording) return;
    const step = {
      seq: recordedSteps.length + 1,
      ...msg.step,
      timestamp: new Date().toISOString(),
    };
    recordedSteps.push(step);
    console.log(`[Flow Recorder] Step ${step.seq}:`, step.action, step);
    return;
  }

  if (msg.type === "CLEAR_STEPS") {
    recordedSteps = [];
    sendResponse({ ok: true });
    return true;
  }
});

// Inject content script into a tab (safely)
async function injectRecorder(tabId, url) {
  // Skip chrome://, edge://, about:, extension pages
  if (
    !url ||
    url.startsWith("chrome") ||
    url.startsWith("about:") ||
    url.startsWith("edge:")
  )
    return;
  if (injectedTabs.has(tabId)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-recorder.js"],
    });
    injectedTabs.add(tabId);
  } catch (err) {
    // Tab may not be injectable (e.g. chrome web store)
    console.log(
      `[Flow Recorder] Cannot inject into tab ${tabId}:`,
      err.message,
    );
  }
}

// Track tab navigation on ALL tabs while recording
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!isRecording) return;

  if (changeInfo.status === "complete" && tab.url) {
    // Check if URL actually changed from last navigate step for this tab
    const lastNav = [...recordedSteps]
      .reverse()
      .find((s) => s.action === "navigate" && s.tabId === tabId);
    if (!lastNav || lastNav.url !== tab.url) {
      recordedSteps.push({
        seq: recordedSteps.length + 1,
        action: "navigate",
        url: tab.url,
        title: tab.title,
        tabId: tabId,
        timestamp: new Date().toISOString(),
      });
    }

    // Inject or re-inject content script
    injectedTabs.delete(tabId); // allow re-injection after navigation
    await injectRecorder(tabId, tab.url);
  }
});

// Track new tabs created while recording
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!isRecording) return;
  recordedSteps.push({
    seq: recordedSteps.length + 1,
    action: "new_tab",
    tabId: tab.id,
    url: tab.pendingUrl || tab.url || "",
    timestamp: new Date().toISOString(),
  });
});

// Track tab switches while recording
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!isRecording) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    recordedSteps.push({
      seq: recordedSteps.length + 1,
      action: "tab_switch",
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
    });
    // Inject recorder if not already
    await injectRecorder(tab.id, tab.url);
  } catch {}
});

// Track tab close while recording
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isRecording) return;
  injectedTabs.delete(tabId);
  recordedSteps.push({
    seq: recordedSteps.length + 1,
    action: "tab_closed",
    tabId: tabId,
    timestamp: new Date().toISOString(),
  });
});
