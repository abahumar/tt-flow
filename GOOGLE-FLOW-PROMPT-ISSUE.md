# Google Flow — Prompt Not Registering in Slate.js Editor

## Summary

The Chrome extension automates image generation on [Google Flow](https://labs.google/fx/tools/flow). When the automation fills the prompt text into the editor, **the text appears visually in the DOM but is NOT registered in Slate.js's internal model**. Clicking "Create" results in a **"Prompt must be provided"** error. If the user manually types a character, all the injected text disappears — confirming Slate's model is empty.

---

## Target Element

The prompt input is a Slate.js contenteditable editor:

```
div[data-slate-editor="true"][contenteditable="true"]
```

**Observed DOM structure (empty state):**

```html
<div data-slate-editor="true" contenteditable="true" role="textbox" ...>
  <div data-slate-node="element">
    <span data-slate-node="text">
      <span data-slate-leaf="true">
        <span data-slate-placeholder="true" contenteditable="false" style="..."
          >What do you want to create?</span
        >
        <span data-slate-zero-width="n" data-slate-length="0">
          &#xFEFF;<br />
        </span>
      </span>
    </span>
  </div>
</div>
```

**CSS classes observed on the editor div:**

```
class="sc-cc6342e-0 iTYalL sc-74ba1bc0-5 fnxnpm"
```

---

## The Core Problem

Slate.js maintains its own internal document model (a tree of `Element` and `Text` nodes). The DOM is just a **rendering output** of this model. Any changes made directly to the DOM (innerHTML, execCommand, etc.) are **ignored or overwritten** on Slate's next render cycle.

For text input to be accepted by Slate, ONE of these must happen:

1. **Native `beforeinput` event** — Slate listens for `beforeinput` events and processes them IF `editor.selection` is non-null. `document.execCommand("insertText", false, text)` fires a `beforeinput` event, but it only works if Slate has already synced a valid selection from the DOM.

2. **Direct API call** — `editor.insertText(text)` updates the model directly, but requires access to the Slate editor instance, which is a JavaScript object stored inside React component state/hooks.

**Neither approach is working currently** because:

- **For approach 1:** `editor.selection` is `null`. Slate syncs its selection from the DOM via the `document selectionchange` event, but our `simulateClick()` dispatches synthetic events (`isTrusted: false`), and `.focus()` alone does not reliably produce a `selectionchange` event that Slate processes into a valid `editor.selection`.

- **For approach 2:** The `findSlateEditorInstance()` function walks React's internal fiber tree (`__reactFiber$` / `__reactInternalInstance$`) to find the editor object, but this approach is fragile and **may not be finding the correct instance** depending on how Google Flow's React tree is structured.

---

## What Has Been Tried (All Failed)

| #   | Approach                                                             | Result                                                                                                                  |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `focus()` → `selectAll` → `execCommand("insertText")`                | Text appears in DOM but not in Slate model. Disappears on keystroke.                                                    |
| 2   | Block `selectionchange` during focus, then unblock                   | Slate model sync blocked entirely → "Prompt Not Provided"                                                               |
| 3   | Place caret in `[data-slate-zero-width]` then insert                 | `selectionchange` fires but Slate fails to convert DOM range → `editor.selection` stays `null`                          |
| 4   | Synthetic `ClipboardEvent("paste")`                                  | Slate ignores synthetic paste events (`isTrusted: false`)                                                               |
| 5   | `navigator.clipboard.writeText()` + `execCommand("paste")`           | Browser blocks `execCommand("paste")` in content scripts                                                                |
| 6   | `InputEvent("beforeinput", { inputType: "insertText" })`             | Slate checks `isTrusted` on the event and ignores synthetic ones                                                        |
| 7   | Direct innerHTML / `innerP.textContent = text`                       | DOM-only change, Slate model unchanged                                                                                  |
| 8   | Access Slate editor via React fiber tree → `editor.insertText(text)` | Fiber walking code may not find the editor instance; if it does, `editor.selection` is null so `insertText()` may no-op |

---

## What Needs to Be Fixed

### File: `extension/content/google-flow.js`

### Function: `fillPrompt(promptEl, text)` (around line ~1420)

The function receives:

- `promptEl` — the `div[data-slate-editor="true"]` DOM element
- `text` — the prompt string to insert

**The function must insert `text` into the Slate editor such that:**

1. The text is in Slate's internal model (not just the DOM)
2. The placeholder ("What do you want to create?") disappears
3. Clicking "Create" accepts the prompt without error
4. Manually typing after does NOT cause the text to vanish

### Function: `findSlateEditorInstance(el)` (around line ~1336)

Walks React fiber tree to find the Slate editor object. This may need debugging:

- Verify the fiber key exists on the element
- Verify the walk actually reaches the Slate `<Editable>` / `useSlate()` component
- The editor object should have: `children` (array), `selection` (object or null), `insertText` (function), `apply` (function), `onChange` (function)

---

## Reproduction Steps

1. Open the Chrome extension side panel on `https://labs.google/fx/tools/flow`
2. Add a product with images to the queue in the web dashboard (`localhost:3000/automation`)
3. Click **"Start Full Auto"** or use the **"Full Flow"** test button in the side panel
4. Watch the automation navigate to Google Flow, upload the reference image, then attempt to fill the prompt
5. **Observe:** The prompt text appears in the editor area BUT the placeholder text "What do you want to create?" is still visible behind/alongside it
6. **Observe:** Clicking "Create" gives "Prompt must be provided"
7. **Observe:** Manually clicking the editor and typing a character causes all injected text to vanish

---

## How to Verify a Fix Works

After filling the prompt programmatically:

```javascript
// In browser console, find the Slate editor element:
const el = document.querySelector('[data-slate-editor="true"]');

// Check 1: Placeholder should be gone
const placeholder = el.querySelector("[data-slate-placeholder]");
console.log("Placeholder visible:", placeholder?.style.display !== "none");
// Expected: false (placeholder hidden)

// Check 2: Slate model should contain the text
// Access via React fiber:
const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
// Walk up to find editor... or check:
console.log("DOM text:", el.textContent);
// Expected: The prompt text with NO "What do you want to create?" mixed in

// Check 3: Click Create — should NOT show "Prompt must be provided"

// Check 4: Click into editor, type a character — existing text should remain
```

---

## Key Technical Context

- **Google Flow URL:** `https://labs.google/fx/tools/flow`
- **Framework:** Slate.js (React-based rich text editor)
- **Slate version:** Unknown (Google's bundled version, likely 0.90+)
- **Content script security:** Content scripts run in an isolated world but share the DOM. They can access `window`, dispatch events, and read React fiber internals from DOM element properties (`__reactFiber$xxx`).
- **`isTrusted` restriction:** Browsers set `isTrusted: false` on all programmatically created events. Slate (and many React apps) check this property and ignore untrusted events for security.
- **`execCommand` status:** `execCommand("insertText")` creates a trusted `beforeinput` event, but Slate only processes it when `editor.selection !== null`.

---

## Suggested Investigation Path

1. **Confirm fiber walking works:** Add `console.log` in `findSlateEditorInstance` at each step to verify:
   - The `__reactFiber$` key is found on the element
   - How many fibers are walked before giving up
   - Whether any hooks contain an object with `children` and `insertText`

2. **If editor instance IS found:** Check if `editor.selection` is `null` after setting it. Slate's `editor.selection` setter may require going through `Transforms.select()` instead of direct assignment.

3. **Alternative: Use `Transforms` from Slate:** If the editor instance is found, try:

   ```javascript
   // Select all content
   const { Transforms, Editor } = /* find Slate module exports */;
   Transforms.select(editor, Editor.range(editor, []));
   Transforms.insertText(editor, text);
   ```

   But accessing `Transforms`/`Editor` from the bundled code may require finding them in the webpack module cache.

4. **Alternative: Trigger real user-like input:** The only events with `isTrusted: true` come from actual browser input. Consider using the Chrome DevTools Protocol `Input.dispatchKeyEvent` via the `chrome.debugger` API to send real keystrokes — this creates truly trusted events that Slate will process.

5. **Alternative: Use `chrome.debugger` API** to call `Input.insertText` which creates trusted input events:
   ```javascript
   // In background.js:
   chrome.debugger.attach({ tabId }, "1.3");
   chrome.debugger.sendCommand({ tabId }, "Input.insertText", { text });
   ```
   This requires the `"debugger"` permission in manifest.json.
