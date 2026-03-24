import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

const VIDEO_DIR = "/data/videos";

// GET: Serve gallery video file
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const video = await prisma.galleryVideo.findUnique({ where: { id } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const cleanPath = join(VIDEO_DIR, video.filename);
  const rawPath = join(VIDEO_DIR, video.filename.replace(".mp4", "-raw.mp4"));
  const videoPath = existsSync(cleanPath) ? cleanPath : rawPath;

  if (!existsSync(videoPath)) {
    return NextResponse.json(
      { error: "Video file not found" },
      { status: 404 },
    );
  }

  const videoBuffer = await readFile(videoPath);
  return new NextResponse(videoBuffer, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": videoBuffer.length.toString(),
      "Content-Disposition": `inline; filename="${video.filename}"`,
    },
  });
}

// DELETE: Remove gallery video and clean up files
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const video = await prisma.galleryVideo.findUnique({ where: { id } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Delete DB record
  await prisma.galleryVideo.delete({ where: { id } });

  // Clean up video files from disk
  const cleanPath = join(VIDEO_DIR, video.filename);
  const rawPath = join(VIDEO_DIR, video.filename.replace(".mp4", "-raw.mp4"));
  if (existsSync(cleanPath)) await unlink(cleanPath).catch(() => {});
  if (existsSync(rawPath)) await unlink(rawPath).catch(() => {});

  return NextResponse.json({ success: true });
}
