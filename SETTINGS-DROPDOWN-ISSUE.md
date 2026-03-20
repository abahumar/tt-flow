# Settings Dropdown Issue — Image/Video Mode Switching

## Problem

When clicking **Test Generate**, the script fills the prompt and clicks Create **without switching to Image mode first**. Since the last used preset was Video, it generates a video instead of an image.

## Root Cause

The `switchToMode("image")` call is either:

1. **Not finding the settings dropdown trigger** — and silently failing (returns false, code continues anyway)
2. **Opening the dropdown but not finding the Image tab inside it** — and again continuing
3. **The dropdown is closing before the Image tab can be clicked** — timing issue

The code does NOT block on failure — it just warns and proceeds to fill prompt + Create.

## How Google Flow Settings Work (from HTML inspection)

### Step 1: The Settings Trigger Button (on the page)

```html
<button
  type="button"
  id="radix-:r1d:"
  aria-haspopup="menu"
  aria-expanded="false"
  data-state="closed"
  class="sc-16c4830a-1 hxjMEo sc-e7a64add-0 sc-e7a64add-1 gdoOJp cqfBcP sc-46973129-1 hrlPny"
>
  🍌 Nano Banana Pro
  <i class="...google-symbols...">crop_9_16</i>
  x1
</button>
```

- Class includes: `sc-46973129-1`, `sc-16c4830a-1`
- Has `aria-haspopup="menu"`
- Shows current preset: model name + aspect icon + count
- **Radix ID changes every session** (e.g. `radix-:r1d:`, `radix-:r1p:`)

### Step 2: The Popup (appears after clicking trigger)

```html
<div
  data-radix-popper-content-wrapper=""
  dir="ltr"
  style="position: fixed; ..."
>
  <div
    role="menu"
    data-state="open"
    data-radix-menu-content=""
    class="sc-46973129-0 eBvXuZ DropdownMenuContent"
  >
    <!-- Image/Video tabs -->
    <button
      id="radix-:r6t:-trigger-IMAGE"
      class="flow_tab_slider_trigger"
      role="tab"
      aria-selected="true"
      data-state="active"
    >
      <i>image</i>Image
    </button>
    <button
      id="radix-:r6t:-trigger-VIDEO"
      class="flow_tab_slider_trigger"
      role="tab"
      aria-selected="false"
      data-state="inactive"
    >
      <i>videocam</i>Video
    </button>

    <!-- Aspect ratio tabs (change based on Image vs Video) -->
    <button id="radix-:r70:-trigger-PORTRAIT" class="flow_tab_slider_trigger">
      9:16
    </button>
    <button id="radix-:r70:-trigger-LANDSCAPE" class="flow_tab_slider_trigger">
      16:9
    </button>
    <!-- etc -->

    <!-- Count tabs -->
    <button id="radix-:r76:-trigger-1" class="flow_tab_slider_trigger">
      x1
    </button>
    <button id="radix-:r76:-trigger-2" class="flow_tab_slider_trigger">
      x2
    </button>
    <!-- etc -->

    <!-- Model selector (only in Video mode) -->
    <button class="sc-a0dcecfb-1">Veo 3.1 - Fast <i>arrow_drop_down</i></button>
  </div>
</div>
```

### Key Facts

- **ALL config tabs are INSIDE the popup**, not on the main page
- The popup is a Radix `data-radix-popper-content-wrapper` with `position: fixed`
- Tab buttons have class `flow_tab_slider_trigger` and IDs ending with `trigger-IMAGE`, `trigger-VIDEO`, `trigger-PORTRAIT`, `trigger-1`, etc.
- **Radix numeric IDs change every time** — never match by exact ID, only by suffix pattern
- The popup has class `DropdownMenuContent` and attribute `data-radix-menu-content`
- The trigger button has `data-state="closed"` when popup is hidden, changes to `"open"` when visible

## Selectors That Should Work

### Find the trigger button:

```js
// On the page (not in popup)
document.querySelector('button[class*="sc-46973129"][aria-haspopup="menu"]');
// OR near the prompt area
document.querySelector('button[aria-haspopup="menu"][class*="sc-16c4830a"]');
```

### Find the popup when open:

```js
document.querySelector(".DropdownMenuContent");
document.querySelector("[data-radix-menu-content]");
document.querySelector('[role="menu"][data-state="open"]');
```

### Find Image/Video tab inside popup:

```js
// Inside popup - ID ends with trigger-IMAGE or trigger-VIDEO
popup.querySelector('button.flow_tab_slider_trigger[id$="trigger-IMAGE"]');
// Actually $= won't work because IDs end with "trigger-IMAGE" but the full ID
// is like "radix-:r6t:-trigger-IMAGE". Use *= or endsWith() in JS.
```

**IMPORTANT**: `querySelector('[id$="trigger-IMAGE"]')` may not work because `:` in Radix IDs. Use JavaScript:

```js
const tabs = popup.querySelectorAll("button.flow_tab_slider_trigger");
for (const tab of tabs) {
  if (tab.id && tab.id.endsWith("trigger-IMAGE")) {
    /* found it */
  }
}
```

## Current Code Issues to Debug

1. **Is `findSettingsDropdownTrigger()` finding the button?** — Need to verify it returns a real element
2. **Is `openSettingsDropdown()` clicking it and does the popup actually appear?** — The click might not work, or the popup detection might fail
3. **Is `switchToMode("image")` finding the Image tab inside the popup?** — The `popup.querySelector()` might be using CSS selectors that break on Radix `:` IDs
4. **Is the dropdown closing too fast?** — Radix dropdowns auto-close on outside clicks; `simulateClick` might trigger that
5. **Is the code even reaching `switchToMode`?** — The `selectNewProjectMode` runs first with 6 retries and might be interfering

## Required Console Logs to Capture

Run Test Generate and check the Google Flow tab console for these logs:

```
[TikTok Flow] Opening settings dropdown: ...
[TikTok Flow] Settings dropdown opened successfully
[TikTok Flow] switchToMode called for: image
[TikTok Flow] Found image tab inside dropdown: ...
[TikTok Flow] Clicked image tab: ...
[TikTok Flow] Settings dropdown closed
```

If any of these are missing, that's where the problem is.

## File Reference

All automation code is in:
`extension/content/google-flow.js`

Key functions:

- `openSettingsDropdown()` — clicks trigger, waits for popup
- `closeSettingsDropdown()` — Escape key or re-click trigger
- `findDropdownPopup()` — finds `.DropdownMenuContent`
- `findSettingsDropdownTrigger()` — finds `button[class*="sc-46973129"][aria-haspopup="menu"]`
- `switchToMode(mode)` — opens dropdown, clicks Image/Video tab
- `selectTriggerOption(suffix, label)` — clicks aspect/count tabs inside popup
- `trySelectModel(name)` — finds model selector inside popup
- `testGenerate(prompt)` — Test Generate flow
- `testVideoGenerate(prompt)` — Test Video flow
- `generateImage({jobId, prompt})` — Full image generation
- `generateVideo({jobId, prompt, imageUrl})` — Full video generation
