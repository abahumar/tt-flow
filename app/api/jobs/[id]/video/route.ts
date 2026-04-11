import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVideoToTelegram } from "@/lib/telegram";
import {
  combineSceneVideos,
  addHookOverlay,
  addTextOverlay,
  addHookAndOverlay,
  type TextOverlay,
} from "@/lib/ffmpeg";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { readFile } from "fs/promises";

const VIDEO_DIR = "/data/videos";

// Allow large video uploads (up to 100MB)
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function ensureVideoDir() {
  if (!existsSync(VIDEO_DIR)) {
    await mkdir(VIDEO_DIR, { recursive: true });
  }
}

// POST: Upload video and process with FFmpeg to remove watermark
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Allow "test" ID for test flows — skip DB lookup
  const isTest = id === "test";
  if (!isTest) {
    const job = await prisma.videoJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
  }

  try {
    await ensureVideoDir();

    const formData = await req.formData();
    const videoFile = formData.get("video") as File | null;

    if (!videoFile) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 },
      );
    }

    // Check for optional sceneIndex (multi-scene jobs)
    const sceneIndexStr = formData.get("sceneIndex") as string | null;
    const sceneIndex =
      sceneIndexStr !== null ? parseInt(sceneIndexStr, 10) : -1;
    const isMultiScene = sceneIndex >= 0;
    const videoId = isMultiScene ? `${id}-s${sceneIndex}` : id;

    // Save raw video
    const rawPath = join(VIDEO_DIR, `${videoId}-raw.mp4`);
    const cleanPath = join(VIDEO_DIR, `${videoId}.mp4`);
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    await writeFile(rawPath, buffer);

    console.log(
      `[Video] Saved raw video for job ${id}: ${rawPath} (${buffer.length} bytes)`,
    );

    // Hide watermark using FFmpeg — zoom in ~8% so the bottom-right
    // "Made with Google" watermark is pushed off-screen.
    // scale up by 8%, then crop back to original dimensions.
    let processedPath = rawPath;
    try {
      execSync(
        `ffmpeg -y -i "${rawPath}" -vf "scale=iw*1.08:ih*1.08,crop=iw/1.08:ih/1.08" -c:v libx264 -preset fast -crf 18 -c:a copy "${cleanPath}"`,
        { timeout: 120000, stdio: "pipe" },
      );
      processedPath = cleanPath;
      console.log(`[Video] Watermark hidden via zoom: ${cleanPath}`);
    } catch (ffmpegErr: unknown) {
      const errorMsg =
        ffmpegErr instanceof Error ? ffmpegErr.message : String(ffmpegErr);
      console.warn(
        `[Video] FFmpeg watermark removal failed, using raw video: ${errorMsg}`,
      );
      // Fall back to raw video if FFmpeg fails
      processedPath = rawPath;
    }

    // Single-scene overlay: apply hook/overlay text if overlayConfig is set
    if (!isMultiScene && !isTest) {
      const jobForOverlay = await prisma.videoJob.findUnique({ where: { id } });
      if (jobForOverlay?.overlayConfig) {
        try {
          const config = JSON.parse(jobForOverlay.overlayConfig);
          const hookTitle = config.hookTitle || "";
          const overlay = config.overlays?.[0];
          const hasHook = !!hookTitle.trim();
          const hasOverlay = overlay && overlay.text?.trim();

          if (hasHook || hasOverlay) {
            const overlayedPath = join(VIDEO_DIR, `${id}-overlayed.mp4`);
            const fontSize = config.overlayFontSize || 28;

            if (hasHook && hasOverlay) {
              addHookAndOverlay({
                inputPath: processedPath,
                outputPath: overlayedPath,
                hookTitle,
                hookSubtitle: config.hookSubtitle || undefined,
                hookDuration: 0.5,
                overlay: {
                  text: String(overlay.text).substring(0, 200),
                  position: ["top", "bottom", "center"].includes(
                    overlay.position,
                  )
                    ? overlay.position
                    : "bottom",
                  fontSize,
                },
                hookBgColor: config.hookBgColor || "E91E63",
                hookTextColor: config.hookTextColor || "FFFFFF",
                hookFontSize: config.hookFontSize || 48,
              });
            } else if (hasHook) {
              addHookOverlay({
                inputPath: processedPath,
                outputPath: overlayedPath,
                title: hookTitle,
                subtitle: config.hookSubtitle || undefined,
                displayDuration: 0.5,
                bgColor: config.hookBgColor || "E91E63",
                textColor: config.hookTextColor || "FFFFFF",
                hookFontSize: config.hookFontSize || 48,
              });
            } else if (hasOverlay) {
              addTextOverlay(processedPath, overlayedPath, {
                text: String(overlay.text).substring(0, 200),
                position: ["top", "bottom", "center"].includes(overlay.position)
                  ? overlay.position
                  : "bottom",
                fontSize,
              });
            }

            // Replace the clean video with the overlayed version
            if (existsSync(overlayedPath)) {
              execSync(`mv "${overlayedPath}" "${processedPath}"`, {
                stdio: "pipe",
              });
              console.log(`[Video] Applied overlay to single-scene job ${id}`);
            }
          }
        } catch (overlayErr) {
          console.warn(
            `[Video] Single-scene overlay failed for job ${id}:`,
            overlayErr,
          );
          // Continue without overlay — video is still usable
        }
      }
    }

    // Update job with the video serve URL
    const videoServeUrl = isMultiScene
      ? `http://localhost:3000/api/jobs/${id}/video?scene=${sceneIndex}`
      : `http://localhost:3000/api/jobs/${id}/video`;
    if (!isTest) {
      // Only update main videoUrl for scene 0 or non-multi-scene
      if (!isMultiScene || sceneIndex === 0) {
        await prisma.videoJob.update({
          where: { id },
          data: { videoUrl: videoServeUrl },
        });
      }
      const job = await prisma.videoJob.findUnique({ where: { id } });

      // Auto-add to gallery so video persists even if the job is deleted
      await prisma.galleryVideo.create({
        data: {
          filename: `${videoId}.mp4`,
          videoType: job?.videoType || "fungsi_produk",
          caption: job?.tiktokCaption || "",
        },
      });

      // Send video to Telegram channel (non-blocking)
      const telegramCaption = job?.tiktokCaption
        ? `${job.tiktokCaption}\n\nType: ${job.videoType || "video"}`
        : `New video created (${job?.videoType || "video"})`;
      sendVideoToTelegram(processedPath, telegramCaption).catch((err) =>
        console.error("[Telegram] Background send failed:", err),
      );

      // Auto-combine: run for all multi-scene jobs after all scene videos are ready
      if (isMultiScene && job?.scenePrompts) {
        try {
          const scenes = JSON.parse(job.scenePrompts);
          const allExist = scenes.every((_: unknown, idx: number) => {
            const sf = join(VIDEO_DIR, `${id}-s${idx}.mp4`);
            const rf = join(VIDEO_DIR, `${id}-s${idx}-raw.mp4`);
            return existsSync(sf) || existsSync(rf);
          });

          if (allExist && scenes.length > 0) {
            console.log(
              `[Video] All ${scenes.length} scenes ready, auto-combining job ${id}`,
            );
            const config = JSON.parse(job.overlayConfig);
            const overlays: (TextOverlay | null)[] = (
              config.overlays || []
            ).map((o: TextOverlay | null) => {
              if (!o || !o.text) return null;
              const pos = ["top", "bottom", "center"].includes(o.position)
                ? o.position
                : "bottom";
              return {
                text: String(o.text).substring(0, 200),
                position: pos,
              } as TextOverlay;
            });

            combineSceneVideos({
              jobId: id,
              sceneCount: scenes.length,
              hookTitle: config.hookTitle || undefined,
              hookSubtitle: config.hookSubtitle || undefined,
              overlays,
              overlayFontSize: config.overlayFontSize || 28,
              hookBgColor: config.hookBgColor || "E91E63",
              hookTextColor: config.hookTextColor || "FFFFFF",
              hookFontSize: config.hookFontSize || 36,
            });

            const combinedVideoUrl = `http://localhost:3000/api/jobs/${id}/video?type=combined`;
            await prisma.videoJob.update({
              where: { id },
              data: { combinedVideoUrl },
            });

            // Add combined video to gallery
            await prisma.galleryVideo.create({
              data: {
                filename: `${id}-combined.mp4`,
                videoType: job.videoType || "combined",
                caption: config.hookTitle
                  ? `${config.hookTitle} — ${job.tiktokCaption || ""}`
                  : job.tiktokCaption || "",
              },
            });

            // Send combined video to Telegram (non-blocking)
            const combinedPath = join(VIDEO_DIR, `${id}-combined.mp4`);
            const combinedCaption = config.hookTitle
              ? `${config.hookTitle} — ${job.tiktokCaption || ""}\n\nType: Combined (${scenes.length} scenes)`
              : `${job.tiktokCaption || ""}\n\nType: Combined (${scenes.length} scenes)`;
            sendVideoToTelegram(combinedPath, combinedCaption).catch((err) =>
              console.error("[Telegram] Combined video send failed:", err),
            );

            console.log(`[Video] Auto-combine complete for job ${id}`);
          }
        } catch (combineErr) {
          console.error(
            `[Video] Auto-combine failed for job ${id}:`,
            combineErr,
          );
          // Non-fatal — individual scene videos still available
        }
      }
    }

    return NextResponse.json({
      success: true,
      videoUrl: videoServeUrl,
      size: buffer.length,
      watermarkRemoved: processedPath === cleanPath,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Video] Upload failed for job ${id}:`, errorMsg);
    return NextResponse.json(
      { error: "Video upload failed: " + errorMsg },
      { status: 500 },
    );
  }
}

// GET: Serve the processed video file
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sceneParam = req.nextUrl.searchParams.get("scene");
  const typeParam = req.nextUrl.searchParams.get("type");

  let videoId: string;
  if (typeParam === "combined") {
    videoId = `${id}-combined`;
  } else if (sceneParam !== null) {
    videoId = `${id}-s${sceneParam}`;
  } else {
    videoId = id;
  }

  await ensureVideoDir();

  // Prefer clean (watermark-removed) version, fall back to raw
  const cleanPath = join(VIDEO_DIR, `${videoId}.mp4`);
  const rawPath = join(VIDEO_DIR, `${videoId}-raw.mp4`);
  const videoPath = existsSync(cleanPath) ? cleanPath : rawPath;

  if (!existsSync(videoPath)) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const videoBuffer = await readFile(videoPath);
  return new NextResponse(videoBuffer, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": videoBuffer.length.toString(),
      "Content-Disposition": `inline; filename="${videoId}.mp4"`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
