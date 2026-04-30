# Parallel Video Generation (2 Concurrent Slots)

**Date:** 2026-05-01
**Branch:** `feat/parallel-video-generation-2-concurrent`

## Summary

Replace the boolean mutex (`isProcessingJob`) in the Chrome extension's background.js with a 2-slot semaphore, allowing two video generation jobs to run concurrently. Each slot owns its own browser tabs (Google Flow, Grok). Posting remains sequential.

## Slot System

```
MAX_CONCURRENT_JOBS = 2
activeSlots: Map<slotId, { lockId, jobId, flowTabId, grokTabId }>
pendingPhaseCompleteQueue: Array<{ jobId, nextStatus }>
```

- Slots persist across jobs within a session — tabs stay open and get reused.
- Each slot owns dedicated browser tabs, isolated from other slots.

## Job Routing

| Job Type | Behavior |
|----------|----------|
| Video jobs (image→video, multi-scene) | Use any available slot, up to 2 concurrent |
| Image-only jobs | Acquire a slot but gate on no other image-only running (sequential) |
| Posting | Legacy single lock, unchanged |

## API Fix

`/api/jobs/start-auto` wraps the SELECT + UPDATE in a SQLite transaction to prevent two concurrent callers from claiming the same job.

## Changed Functions (background.js)

| Function | Change |
|----------|--------|
| `acquireProcessingLock` → `acquireSlot` | Returns `{slotId, lockId}` or null if all 2 slots busy |
| `releaseProcessingLock` → `releaseSlot` | Per-slot release, drains phase-complete queue |
| `findGoogleFlowTab` / `ensureGoogleFlowTab` | Accept `excludeTabIds` set so each slot opens its own tab |
| `findGrokTab` / `ensureGrokTab` | Same exclude pattern |
| `healthCheckGoogleFlow` | Accept optional `tabId` to check a specific slot's tab |
| `processImageGeneration(job)` → `(job, ctx)` | Uses `ctx.flowTabId` |
| `processVideoGeneration(job)` → `(job, ctx)` | Uses `ctx.flowTabId` or `ctx.grokTabId` |
| `processVideoGenerationViaGrok(job)` → `(job, ctx)` | Uses `ctx.grokTabId` |
| `processMultiSceneJob(job, prompts)` → `(job, prompts, ctx)` | Uses `ctx.flowTabId` |
| `processImageOnlyJob(job)` → `(job, ctx)` | Uses slot, gates on other image-only |
| `handlePhaseComplete` / `handlePhaseCompleteWithLock` | Looks up slot by jobId to continue |
| `processNextJob` | Acquires slot, passes ctx through pipeline |
| `keepAlive` alarm | Tries to fill all available slots |

## What Doesn't Change

- Content scripts (google-flow.js, grok-flow.js) — stateless per-tab, keyed off jobId
- Side panel, web app UI
- Database schema
- FFmpeg, Telegram, file upload paths
- `processPosting` — stays sequential
