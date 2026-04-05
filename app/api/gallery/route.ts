import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const VIDEO_DIR = "/data/videos";
const IMAGE_DIR = "/data/images/generated";

export async function GET() {
  try {
    const [videos, images] = await Promise.all([
      prisma.galleryVideo.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.galleryImage.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    return NextResponse.json({ videos, images });
  } catch {
    return NextResponse.json({ videos: [], images: [] });
  }
}

// Bulk delete videos or images
export async function DELETE(req: NextRequest) {
  try {
    const { ids, type } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    if (type === "image") {
      const images = await prisma.galleryImage.findMany({
        where: { id: { in: ids } },
      });
      await prisma.galleryImage.deleteMany({ where: { id: { in: ids } } });
      for (const image of images) {
        const filepath = join(IMAGE_DIR, image.filename);
        if (existsSync(filepath)) await unlink(filepath).catch(() => {});
      }
      return NextResponse.json({ deleted: images.length });
    }

    // Default: videos
    const videos = await prisma.galleryVideo.findMany({
      where: { id: { in: ids } },
    });
    await prisma.galleryVideo.deleteMany({ where: { id: { in: ids } } });
    for (const video of videos) {
      const cleanPath = join(VIDEO_DIR, video.filename);
      const rawPath = join(
        VIDEO_DIR,
        video.filename.replace(".mp4", "-raw.mp4"),
      );
      if (existsSync(cleanPath)) await unlink(cleanPath).catch(() => {});
      if (existsSync(rawPath)) await unlink(rawPath).catch(() => {});
    }
    return NextResponse.json({ deleted: videos.length });
  } catch {
    return NextResponse.json({ error: "Bulk delete failed" }, { status: 500 });
  }
}
