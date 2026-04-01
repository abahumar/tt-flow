import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVideoToTelegram, sendImageToTelegram } from "@/lib/telegram";
import { existsSync } from "fs";
import { join } from "path";

const VIDEO_DIR = "/data/videos";
const IMAGE_DIR = "/data/images/generated";

export async function POST(
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

    const filepath = join(IMAGE_DIR, image.filename);
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { error: "Image file not found on disk" },
        { status: 404 },
      );
    }

    const caption = image.prompt
      ? image.prompt.substring(0, 1024)
      : "Gallery image";
    const result = await sendImageToTelegram(filepath, caption);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // Default: video
  const video = await prisma.galleryVideo.findUnique({ where: { id } });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const cleanPath = join(VIDEO_DIR, video.filename);
  const rawPath = join(VIDEO_DIR, video.filename.replace(".mp4", "-raw.mp4"));
  const videoPath = existsSync(cleanPath) ? cleanPath : rawPath;

  if (!existsSync(videoPath)) {
    return NextResponse.json(
      { error: "Video file not found on disk" },
      { status: 404 },
    );
  }

  const caption = video.caption || `Video (${video.videoType || "video"})`;
  const result = await sendVideoToTelegram(videoPath, caption);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
