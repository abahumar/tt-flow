import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

    // Save raw video
    const rawPath = join(VIDEO_DIR, `${id}-raw.mp4`);
    const cleanPath = join(VIDEO_DIR, `${id}.mp4`);
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

    // Update job with the video serve URL
    const videoServeUrl = `http://localhost:3000/api/jobs/${id}/video`;
    if (!isTest) {
      const job = await prisma.videoJob.update({
        where: { id },
        data: { videoUrl: videoServeUrl },
      });

      // Auto-add to gallery so video persists even if the job is deleted
      await prisma.galleryVideo.create({
        data: {
          filename: `${id}.mp4`,
          videoType: job.videoType,
          caption: job.tiktokCaption,
        },
      });
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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await ensureVideoDir();

  // Prefer clean (watermark-removed) version, fall back to raw
  const cleanPath = join(VIDEO_DIR, `${id}.mp4`);
  const rawPath = join(VIDEO_DIR, `${id}-raw.mp4`);
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
      "Content-Disposition": `inline; filename="${id}.mp4"`,
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
