import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
