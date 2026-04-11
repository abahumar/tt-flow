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
 * POST: Combine 2+ gallery videos into a single video.
 * Optionally applies hook title and/or text overlay to the first clip.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    videoIds,
    hookTitle,
    hookSubtitle,
    overlayText,
    overlayPosition = "bottom",
    hookDuration = 0.5,
    hookBgColor = "E91E63",
    hookTextColor = "FFFFFF",
    overlayFontSize = 28,
    hookFontSize = 48,
  } = body as {
    videoIds: string[];
    hookTitle?: string;
    hookSubtitle?: string;
    overlayText?: string;
    overlayPosition?: "top" | "bottom" | "center";
    hookDuration?: number;
    hookBgColor?: string;
    hookTextColor?: string;
    overlayFontSize?: number;
    hookFontSize?: number;
  };

  if (!videoIds || !Array.isArray(videoIds) || videoIds.length < 2) {
    return NextResponse.json(
      { error: "At least 2 video IDs required" },
      { status: 400 },
    );
  }

  // Verify all gallery videos exist
  const galleryVideos = await prisma.galleryVideo.findMany({
    where: { id: { in: videoIds } },
  });
  if (galleryVideos.length !== videoIds.length) {
    const found = new Set(galleryVideos.map((v) => v.id));
    const missing = videoIds.filter((id) => !found.has(id));
    return NextResponse.json(
      { error: `Videos not found: ${missing.join(", ")}` },
      { status: 404 },
    );
  }

  // Build ordered map of id -> filename
  const videoMap = new Map(galleryVideos.map((v) => [v.id, v.filename]));

  // Find video files in order
  const missingFiles: string[] = [];
  const videoFiles: string[] = [];
  for (const id of videoIds) {
    const filename = videoMap.get(id)!;
    const cleanPath = join(VIDEO_DIR, filename);
    const rawPath = join(VIDEO_DIR, filename.replace(".mp4", "-raw.mp4"));
    if (existsSync(cleanPath)) {
      videoFiles.push(cleanPath);
    } else if (existsSync(rawPath)) {
      videoFiles.push(rawPath);
    } else {
      missingFiles.push(id);
    }
  }

  if (missingFiles.length > 0) {
    return NextResponse.json(
      { error: `Video files not found for: ${missingFiles.join(", ")}` },
      { status: 400 },
    );
  }

  ensureDirs();
  const combineId = `gallery-combine-${Date.now()}`;
  const tempFiles: string[] = [];
  const clipPaths: string[] = [];

  // Build overlay for first clip only
  const overlay: TextOverlay | null = overlayText
    ? {
        text: overlayText,
        position: overlayPosition,
        fontSize: overlayFontSize,
      }
    : null;

  try {
    for (let i = 0; i < videoFiles.length; i++) {
      // Normalize each clip to 1080x1920
      const normalizedPath = join(TMP_DIR, `${combineId}-norm-${i}.mp4`);
      normalizeClip(videoFiles[i], normalizedPath);
      tempFiles.push(normalizedPath);

      let currentPath = normalizedPath;

      const hasHook = i === 0 && hookTitle;
      const hasOverlay = i === 0 && overlay;

      if (hasHook && hasOverlay) {
        // First clip: hook + overlay in single pass
        const comboPath = join(TMP_DIR, `${combineId}-combo-${i}.mp4`);
        addHookAndOverlay({
          inputPath: currentPath,
          outputPath: comboPath,
          hookTitle: hookTitle!,
          hookSubtitle,
          hookDuration: Math.min(Math.max(hookDuration, 0.3), 5),
          overlay: overlay!,
          hookBgColor,
          hookTextColor,
          hookFontSize,
        });
        tempFiles.push(comboPath);
        currentPath = comboPath;
      } else if (hasHook) {
        // First clip: hook only
        const hookPath = join(TMP_DIR, `${combineId}-hook-${i}.mp4`);
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
      } else if (hasOverlay) {
        // First clip: overlay only
        const overlayPath = join(TMP_DIR, `${combineId}-overlay-${i}.mp4`);
        addTextOverlay(currentPath, overlayPath, overlay!);
        tempFiles.push(overlayPath);
        currentPath = overlayPath;
      }

      clipPaths.push(currentPath);
    }

    // Concat all clips
    const outputFilename = `${combineId}.mp4`;
    const outputPath = join(VIDEO_DIR, outputFilename);
    if (clipPaths.length === 1) {
      const { execSync } = require("child_process");
      execSync(`cp "${clipPaths[0]}" "${outputPath}"`, { stdio: "pipe" });
    } else {
      concatVideos(clipPaths, outputPath);
    }

    // Save to gallery
    const newVideo = await prisma.galleryVideo.create({
      data: {
        filename: outputFilename,
        videoType: "combined",
        caption: `Combined from ${videoIds.length} videos`,
      },
    });

    return NextResponse.json(newVideo);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[gallery-combine] Failed: ${msg}`);
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
