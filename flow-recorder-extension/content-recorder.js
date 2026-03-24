// Flow Recorder - Content Script
// Captures user interactions on the page

(() => {
  // Prevent double-injection
  if (window.__flowRecorderInjected) return;
  window.__flowRecorderInjected = true;

  let active = true;

  // --- Helpers ---

  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement)
      return "body";

    // Prefer data-testid, id, aria-label
    if (el.getAttribute("data-testid")) {
      return `[data-testid="${el.getAttribute("data-testid")}"]`;
    }
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }
    if (el.getAttribute("aria-label")) {
      return `[aria-label="${el.getAttribute("aria-label")}"]`;
    }
    if (el.getAttribute("name")) {
      return `${el.tagName.toLowerCase()}[name="${el.getAttribute("name")}"]`;
    }
    if (el.getAttribute("placeholder")) {
      return `${el.tagName.toLowerCase()}[placeholder="${el.getAttribute("placeholder")}"]`;
    }

    // Build a path using tag + nth-child
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 5) {
      let selector = current.tagName.toLowerCase();

      // Add class names (first 2 meaningful ones)
      const classes = Array.from(current.classList)
        .filter((c) => !c.match(/^(css-|sc-|jsx-|__)/)) // skip generated classes
        .slice(0, 2);
      if (classes.length) {
        selector += "." + classes.map((c) => CSS.escape(c)).join(".");
      }

      // Add nth-child if needed for disambiguation
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function getElementDescription(el) {
    // Get a human-readable description of what was interacted with
    const tag = el.tagName.toLowerCase();
    const text = (el.innerText || "").trim().substring(0, 100);
    const ariaLabel = el.getAttribute("aria-label") || "";
    const placeholder = el.getAttribute("placeholder") || "";
    const title = el.getAttribute("title") || "";
    const type = el.getAttribute("type") || "";
    const role = el.getAttribute("role") || "";
    const name = el.getAttribute("name") || "";

    const parts = [tag];
    if (type) parts.push(`type="${type}"`);
    if (role) parts.push(`role="${role}"`);
    if (name) parts.push(`name="${name}"`);
    if (ariaLabel) parts.push(`aria="${ariaLabel}"`);
    if (placeholder) parts.push(`placeholder="${placeholder}"`);
    if (title) parts.push(`title="${title}"`);
    if (text && text.length < 80) parts.push(`text="${text}"`);

    return parts.join(" | ");
  }

  function getElementRect(el) {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function sendStep(step) {
    if (!active) return;
    try {
      chrome.runtime.sendMessage({ type: "RECORD_STEP", step });
    } catch {
      // Extension context invalidated
      cleanup();
    }
  }

  // --- Event Handlers ---

  function onClickCapture(e) {
    const el = e.target;
    sendStep({
      action: "click",
      selector: getSelector(el),
      description: getElementDescription(el),
      rect: getElementRect(el),
      pageUrl: location.href,
    });
  }

  function onDblClickCapture(e) {
    const el = e.target;
    sendStep({
      action: "dblclick",
      selector: getSelector(el),
      description: getElementDescription(el),
      rect: getElementRect(el),
      pageUrl: location.href,
    });
  }

  // Track input/textarea changes with debounce
  const inputTimers = new WeakMap();

  function onInputCapture(e) {
    const el = e.target;
    if (
      !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) &&
      !el.getAttribute("contenteditable")
    )
      return;

    // Debounce: wait 800ms after last keystroke
    clearTimeout(inputTimers.get(el));
    inputTimers.set(
      el,
      setTimeout(() => {
        const value =
          el.tagName === "SELECT"
            ? el.options[el.selectedIndex]?.text || el.value
            : (el.value || el.innerText || "").substring(0, 500);

        sendStep({
          action: el.tagName === "SELECT" ? "select" : "type",
          selector: getSelector(el),
          description: getElementDescription(el),
          value: value,
          pageUrl: location.href,
        });
      }, 800),
    );
  }

  function onChangeCapture(e) {
    const el = e.target;

    // File input
    if (el.tagName === "INPUT" && el.type === "file") {
      const files = Array.from(el.files || []).map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      sendStep({
        action: "file_upload",
        selector: getSelector(el),
        description: getElementDescription(el),
        files: files,
        pageUrl: location.href,
      });
      return;
    }

    // Checkbox/radio
    if (
      el.tagName === "INPUT" &&
      (el.type === "checkbox" || el.type === "radio")
    ) {
      sendStep({
        action: "toggle",
        selector: getSelector(el),
        description: getElementDescription(el),
        checked: el.checked,
        value: el.value,
        pageUrl: location.href,
      });
    }
  }

  // Track keyboard shortcuts (Enter, Escape, Tab)
  function onKeydownCapture(e) {
    if (["Enter", "Escape", "Tab"].includes(e.key)) {
      sendStep({
        action: "keypress",
        key: e.key,
        selector: getSelector(e.target),
        description: getElementDescription(e.target),
        pageUrl: location.href,
      });
    }
  }

  // Track scroll (debounced)
  let scrollTimer = null;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      sendStep({
        action: "scroll",
        scrollX: Math.round(window.scrollX),
        scrollY: Math.round(window.scrollY),
        pageUrl: location.href,
      });
    }, 1000);
  }

  // Track drag & drop
  let dragSource = null;

  function onDragStart(e) {
    dragSource = {
      selector: getSelector(e.target),
      description: getElementDescription(e.target),
    };
  }

  function onDrop(e) {
    if (!dragSource) return;

    // Check for file drops
    if (
      e.dataTransfer &&
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      const files = Array.from(e.dataTransfer.files).map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      sendStep({
        action: "file_drop",
        selector: getSelector(e.target),
        description: getElementDescription(e.target),
        files: files,
        pageUrl: location.href,
      });
    } else {
      sendStep({
        action: "drag_drop",
        fromSelector: dragSource.selector,
        fromDescription: dragSource.description,
        toSelector: getSelector(e.target),
        toDescription: getElementDescription(e.target),
        pageUrl: location.href,
      });
    }
    dragSource = null;
  }

  // --- Visual indicator ---
  const badge = document.createElement("div");
  badge.id = "__flow-recorder-badge";
  badge.textContent = "⏺ Recording";
  Object.assign(badge.style, {
    position: "fixed",
    top: "8px",
    right: "8px",
    zIndex: "2147483647",
    background: "#ef4444",
    color: "#fff",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "bold",
    fontFamily: "system-ui, sans-serif",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    pointerEvents: "none",
    animation: "flowRecPulse 1.5s ease-in-out infinite",
  });

  const style = document.createElement("style");
  style.textContent = `
    @keyframes flowRecPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(badge);

  // --- Attach listeners ---
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("dblclick", onDblClickCapture, true);
  document.addEventListener("input", onInputCapture, true);
  document.addEventListener("change", onChangeCapture, true);
  document.addEventListener("keydown", onKeydownCapture, true);
  document.addEventListener("scroll", onScroll, true);
  document.addEventListener("dragstart", onDragStart, true);
  document.addEventListener("drop", onDrop, true);

  // --- Cleanup ---
  function cleanup() {
    active = false;
    window.__flowRecorderInjected = false;
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("dblclick", onDblClickCapture, true);
    document.removeEventListener("input", onInputCapture, true);
    document.removeEventListener("change", onChangeCapture, true);
    document.removeEventListener("keydown", onKeydownCapture, true);
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("dragstart", onDragStart, true);
    document.removeEventListener("drop", onDrop, true);
    badge.remove();
    style.remove();
  }

  // Listen for stop command
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "STOP_RECORDER") {
      cleanup();
    }
  });
})();
