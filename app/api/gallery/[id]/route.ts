import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

const VIDEO_DIR = "/data/videos";
const IMAGE_DIR = "/data/images/generated";

// GET: Serve gallery video or image file
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type");

  // Image gallery item
  if (type === "image") {
    const image = await prisma.galleryImage.findUnique({ where: { id } });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const filepath = join(IMAGE_DIR, image.filename);
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { error: "Image file not found" },
        { status: 404 },
      );
    }
    const imageBuffer = await readFile(filepath);
    const ext = image.filename.split(".").pop()?.toLowerCase() || "png";
    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": mimeMap[ext] || "image/png",
        "Content-Length": imageBuffer.length.toString(),
        "Content-Disposition": `inline; filename="${image.filename}"`,
      },
    });
  }

  // Video gallery item (default)
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

// DELETE: Remove gallery video or image and clean up files
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type");

  if (type === "image") {
    const image = await prisma.galleryImage.findUnique({ where: { id } });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    await prisma.galleryImage.delete({ where: { id } });
    const filepath = join(IMAGE_DIR, image.filename);
    if (existsSync(filepath)) await unlink(filepath).catch(() => {});
    return NextResponse.json({ success: true });
  }

  const video = await prisma.galleryVideo.findUnique({ where: { id } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  await prisma.galleryVideo.delete({ where: { id } });
  const cleanPath = join(VIDEO_DIR, video.filename);
  const rawPath = join(VIDEO_DIR, video.filename.replace(".mp4", "-raw.mp4"));
  if (existsSync(cleanPath)) await unlink(cleanPath).catch(() => {});
  if (existsSync(rawPath)) await unlink(rawPath).catch(() => {});

  return NextResponse.json({ success: true });
}
