import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { existsSync } from "fs";
import { join } from "path";
import { combineSceneVideos, type TextOverlay } from "@/lib/ffmpeg";

const VIDEO_DIR = "/data/videos";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for video processing
export const dynamic = "force-dynamic";

// POST: Combine multi-scene videos into a single video
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Parse scene prompts to determine scene count
  let scenePrompts: { imagePrompt: string; videoPrompt: string }[] = [];
  try {
    scenePrompts = job.scenePrompts ? JSON.parse(job.scenePrompts) : [];
  } catch {
    // ignore parse errors
  }

  if (scenePrompts.length === 0) {
    return NextResponse.json(
      { error: "No multi-scene data found for this job" },
      { status: 400 },
    );
  }

  // Verify all scene videos exist
  const missingScenes: number[] = [];
  for (let i = 0; i < scenePrompts.length; i++) {
    const sceneFile = join(VIDEO_DIR, `${id}-s${i}.mp4`);
    const rawFile = join(VIDEO_DIR, `${id}-s${i}-raw.mp4`);
    if (!existsSync(sceneFile) && !existsSync(rawFile)) {
      missingScenes.push(i);
    }
  }
  if (missingScenes.length > 0) {
    return NextResponse.json(
      {
        error: `Scene videos not found: ${missingScenes.map((s) => `Scene ${s + 1}`).join(", ")}. Generate all scene videos first.`,
      },
      { status: 400 },
    );
  }

  try {
    // Parse request body for overlay options
    const body = await req.json().catch(() => ({}));
    const {
      hookTitle,
      hookSubtitle,
      overlays: rawOverlays,
      hookDuration = 0.5,
      hookBgColor = "E91E63",
      hookTextColor = "FFFFFF",
      overlayFontSize = 48,
      hookFontSize = 64,
    } = body as {
      hookTitle?: string;
      hookSubtitle?: string;
      overlays?: (TextOverlay | null)[];
      hookDuration?: number;
      hookBgColor?: string;
      hookTextColor?: string;
      overlayFontSize?: number;
      hookFontSize?: number;
    };

    // Sanitize overlays — ensure valid position values
    const overlays: (TextOverlay | null)[] = (rawOverlays || []).map(
      (o: TextOverlay | null) => {
        if (!o || !o.text) return null;
        const position = ["top", "bottom", "center"].includes(o.position)
          ? o.position
          : "bottom";
        return {
          text: String(o.text).substring(0, 200),
          position,
        } as TextOverlay;
      },
    );

    console.log(
      `[Combine] Starting for job ${id}: ${scenePrompts.length} scenes, hook=${!!hookTitle}, overlays=${overlays.filter(Boolean).length}`,
    );

    const outputPath = combineSceneVideos({
      jobId: id,
      sceneCount: scenePrompts.length,
      hookTitle: hookTitle ? String(hookTitle).substring(0, 100) : undefined,
      hookSubtitle: hookSubtitle
        ? String(hookSubtitle).substring(0, 150)
        : undefined,
      overlays,
      hookDuration: Math.min(Math.max(hookDuration, 1), 10),
      hookBgColor:
        String(hookBgColor)
          .replace(/[^a-fA-F0-9]/g, "")
          .substring(0, 6) || "000000",
      hookTextColor:
        String(hookTextColor)
          .replace(/[^a-fA-F0-9]/g, "")
          .substring(0, 6) || "FFFFFF",
      overlayFontSize: Math.min(Math.max(overlayFontSize, 16), 120),
      hookFontSize: Math.min(Math.max(hookFontSize, 16), 120),
    });

    // Save overlay config to DB
    const overlayConfig = JSON.stringify({
      hookTitle: hookTitle || "",
      hookSubtitle: hookSubtitle || "",
      overlays,
      hookDuration,
      hookBgColor,
      hookTextColor,
    });

    const combinedVideoUrl = `http://localhost:3000/api/jobs/${id}/video?type=combined`;

    await prisma.videoJob.update({
      where: { id },
      data: { combinedVideoUrl, overlayConfig },
    });

    // Add combined video to gallery
    await prisma.galleryVideo.create({
      data: {
        filename: `${id}-combined.mp4`,
        videoType: job.videoType || "combined",
        caption: hookTitle
          ? `${hookTitle} — ${job.tiktokCaption || ""}`
          : job.tiktokCaption || "",
      },
    });

    console.log(`[Combine] Complete for job ${id}: ${outputPath}`);

    return NextResponse.json({
      success: true,
      combinedVideoUrl,
      outputPath,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Combine] Failed for job ${id}:`, errorMsg);
    return NextResponse.json(
      { error: "Video combining failed: " + errorMsg },
      { status: 500 },
    );
  }
}
