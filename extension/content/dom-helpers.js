// DOM helper utilities for content scripts

/**
 * Wait for an element matching a selector to appear in the DOM
 */
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
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

/**
 * Wait for ANY of multiple selectors, returns the first match
 */
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

/**
 * Wait for a specified time
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Set value on an input/textarea in a React/framework-friendly way
 */
function setNativeValue(element, value) {
  // Works with React controlled components by using the native setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  const setter =
    element.tagName === "TEXTAREA"
      ? nativeTextareaValueSetter
      : nativeInputValueSetter;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Set content on a contenteditable element
 */
function setContentEditable(element, text) {
  element.focus();
  // Select all existing content
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  // Use insertText for undo-friendly input that frameworks detect
  document.execCommand("insertText", false, text);

  // Dispatch events frameworks listen to
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: text,
      inputType: "insertText",
    }),
  );
}

/**
 * Simulate human-like typing into an input
 */
function simulateTyping(element, text) {
  element.focus();
  element.value = "";
  element.dispatchEvent(new Event("focus", { bubbles: true }));

  for (const char of text) {
    element.value += char;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Click an element with a full simulated event sequence.
 * Radix UI (used by Google Flow) requires pointer events, not just click.
 * Sequence: pointerdown → mousedown → pointerup → mouseup → click
 */
function simulateClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const commonOpts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
  };

  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      ...commonOpts,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
  element.dispatchEvent(new MouseEvent("mousedown", commonOpts));
  element.dispatchEvent(
    new PointerEvent("pointerup", {
      ...commonOpts,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
  element.dispatchEvent(new MouseEvent("mouseup", commonOpts));
  element.dispatchEvent(new MouseEvent("click", commonOpts));
}

/**
 * Find a button by its text content
 */
function findButtonByText(text) {
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
      return btn;
    }
  }
  return null;
}

/**
 * Find a clickable element by its aria-label (case-insensitive partial match)
 */
function findByAriaLabel(text) {
  const all = document.querySelectorAll("[aria-label]");
  for (const el of all) {
    if (
      el.getAttribute("aria-label").toLowerCase().includes(text.toLowerCase())
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Find a tab/element by text
 */
function findTabByText(text) {
  const candidates = document.querySelectorAll(
    '[role="tab"], [role="button"], button, div[class*="tab"], span[class*="tab"], a[class*="tab"]',
  );
  for (const el of candidates) {
    if (el.textContent.trim().toLowerCase() === text.toLowerCase()) {
      return el;
    }
  }
  // Fallback: partial match
  for (const el of candidates) {
    if (el.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
      return el;
    }
  }
  return null;
}

/**
 * Watch for new elements matching criteria via MutationObserver.
 * Returns the first new element that passes the filter.
 */
function observeNewContent(filter, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (filter(node)) {
            observer.disconnect();
            return resolve(node);
          }
          // Check descendants of added nodes
          const match = node.querySelector?.("*");
          if (match) {
            const descendants = node.querySelectorAll("*");
            for (const desc of descendants) {
              if (filter(desc)) {
                observer.disconnect();
                return resolve(desc);
              }
            }
          }
        }
        // Also check attribute changes on existing nodes
        if (mutation.type === "attributes" && filter(mutation.target)) {
          observer.disconnect();
          return resolve(mutation.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href", "style"],
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error("Timeout waiting for new content"));
    }, timeout);
  });
}

/**
 * Take a snapshot of current images/videos on the page
 */
function snapshotMedia() {
  return {
    images: new Set(
      [...document.querySelectorAll("img")].map((i) => i.src).filter(Boolean),
    ),
    videos: new Set(
      [...document.querySelectorAll("video")]
        .map((v) => v.src || v.querySelector("source")?.src || "")
        .filter(Boolean),
    ),
  };
}
