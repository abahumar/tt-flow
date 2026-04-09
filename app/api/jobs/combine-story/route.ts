import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { existsSync } from "fs";
import { join } from "path";
import {
  normalizeClip,
  concatVideos,
  addHookOverlay,
  addTextOverlay,
  addHookAndOverlay,
  type TextOverlay,
} from "@/lib/ffmpeg";
import { unlinkSync } from "fs";

const VIDEO_DIR = "/data/videos";
const TMP_DIR = "/tmp/ffmpeg-combine";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function ensureDirs() {
  const { mkdirSync } = require("fs");
  if (!existsSync(VIDEO_DIR)) mkdirSync(VIDEO_DIR, { recursive: true });
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * POST: Combine videos from 2+ separate jobs into a single video.
 * Used by Grok 6s story mode where each scene is a separate job.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    jobIds,
    hookTitle,
    hookSubtitle,
    overlays = [],
    hookDuration = 0.5,
    hookBgColor = "E91E63",
    hookTextColor = "FFFFFF",
    overlayFontSize = 28,
    hookFontSize = 36,
  } = body as {
    jobIds: string[];
    hookTitle?: string;
    hookSubtitle?: string;
    overlays?: (TextOverlay | null)[];
    hookDuration?: number;
    hookBgColor?: string;
    hookTextColor?: string;
    overlayFontSize?: number;
    hookFontSize?: number;
  };

  if (!jobIds || !Array.isArray(jobIds) || jobIds.length < 2) {
    return NextResponse.json(
      { error: "At least 2 jobIds required" },
      { status: 400 },
    );
  }

  // Verify all jobs exist
  const jobs = await prisma.videoJob.findMany({
    where: { id: { in: jobIds } },
  });
  if (jobs.length !== jobIds.length) {
    const found = new Set(jobs.map((j) => j.id));
    const missing = jobIds.filter((id) => !found.has(id));
    return NextResponse.json(
      { error: `Jobs not found: ${missing.join(", ")}` },
      { status: 404 },
    );
  }

  // Find video file for each job (in order of jobIds)
  const missingVideos: string[] = [];
  const videoFiles: string[] = [];
  for (const id of jobIds) {
    const cleanPath = join(VIDEO_DIR, `${id}.mp4`);
    const rawPath = join(VIDEO_DIR, `${id}-raw.mp4`);
    if (existsSync(cleanPath)) {
      videoFiles.push(cleanPath);
    } else if (existsSync(rawPath)) {
      videoFiles.push(rawPath);
    } else {
      missingVideos.push(id);
    }
  }

  if (missingVideos.length > 0) {
    return NextResponse.json(
      {
        error: `Videos not ready for jobs: ${missingVideos.join(", ")}. Wait for processing to complete.`,
      },
      { status: 400 },
    );
  }

  ensureDirs();
  const masterJobId = jobIds[0];
  const tempFiles: string[] = [];
  const clipPaths: string[] = [];

  try {
    for (let i = 0; i < videoFiles.length; i++) {
      // Normalize each clip to 1080x1920
      const normalizedPath = join(
        TMP_DIR,
        `${masterJobId}-story-norm-${i}.mp4`,
      );
      normalizeClip(videoFiles[i], normalizedPath);
      tempFiles.push(normalizedPath);

      let currentPath = normalizedPath;

      const overlay = overlays[i];
      const hasOverlay = overlay && overlay.text;
      const hasHook = i === 0 && hookTitle;
      const sizedOverlay = hasOverlay
        ? { ...overlay, fontSize: overlay.fontSize || overlayFontSize }
        : null;

      if (hasHook && sizedOverlay) {
        const comboPath = join(TMP_DIR, `${masterJobId}-story-combo-${i}.mp4`);
        addHookAndOverlay({
          inputPath: currentPath,
          outputPath: comboPath,
          hookTitle: hookTitle!,
          hookSubtitle,
          hookDuration: Math.min(Math.max(hookDuration, 0.3), 5),
          overlay: sizedOverlay,
          hookBgColor,
          hookTextColor,
          hookFontSize,
        });
        tempFiles.push(comboPath);
        currentPath = comboPath;
      } else if (hasHook) {
        const hookPath = join(TMP_DIR, `${masterJobId}-story-hook-${i}.mp4`);
        addHookOverlay({
          inputPath: currentPath,
          outputPath: hookPath,
          title: hookTitle!,
          subtitle: hookSubtitle,
          displayDuration: Math.min(Math.max(hookDuration, 0.3), 5),
          bgColor: hookBgColor,
          textColor: hookTextColor,
          hookFontSize,
        });
        tempFiles.push(hookPath);
        currentPath = hookPath;
      } else if (hasOverlay && sizedOverlay) {
        const overlayPath = join(
          TMP_DIR,
          `${masterJobId}-story-overlay-${i}.mp4`,
        );
        addTextOverlay(currentPath, overlayPath, sizedOverlay);
        tempFiles.push(overlayPath);
        currentPath = overlayPath;
      }

      clipPaths.push(currentPath);
    }

    // Concat all clips
    const outputPath = join(VIDEO_DIR, `${masterJobId}-combined.mp4`);
    if (clipPaths.length === 1) {
      const { execSync } = require("child_process");
      execSync(`cp "${clipPaths[0]}" "${outputPath}"`, { stdio: "pipe" });
    } else {
      concatVideos(clipPaths, outputPath);
    }

    const combinedVideoUrl = `/api/jobs/${masterJobId}/video?type=combined`;

    // Update the master job with combined video URL
    await prisma.videoJob.update({
      where: { id: masterJobId },
      data: { combinedVideoUrl },
    });

    return NextResponse.json({ combinedVideoUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[combine-story] Failed: ${msg}`);
    return NextResponse.json(
      { error: `Combine failed: ${msg}` },
      { status: 500 },
    );
  } finally {
    for (const f of tempFiles) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        // ignore cleanup
      }
    }
  }
}
