import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

const IMAGE_DIR = "/data/images/generated";

// GET: Serve gallery image file
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const image = await prisma.galleryImage.findUnique({ where: { id } });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const imagePath = join(IMAGE_DIR, image.filename);
  if (!existsSync(imagePath)) {
    return NextResponse.json(
      { error: "Image file not found" },
      { status: 404 },
    );
  }

  const imageBuffer = await readFile(imagePath);

  // Determine content type from extension
  const ext = image.filename.split(".").pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  const contentType = contentTypes[ext || ""] || "image/png";

  return new NextResponse(imageBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": imageBuffer.length.toString(),
      "Content-Disposition": `inline; filename="${image.filename}"`,
    },
  });
}

// DELETE: Remove gallery image and clean up file
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const image = await prisma.galleryImage.findUnique({ where: { id } });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  await prisma.galleryImage.delete({ where: { id } });

  const imagePath = join(IMAGE_DIR, image.filename);
  if (existsSync(imagePath)) await unlink(imagePath).catch(() => {});

  return NextResponse.json({ success: true });
}
