import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const IMAGE_DIR = "/data/images/generated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureImageDir() {
  if (!existsSync(IMAGE_DIR)) {
    await mkdir(IMAGE_DIR, { recursive: true });
  }
}

// POST: Upload generated image and save to gallery
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.videoJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  try {
    await ensureImageDir();

    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 },
      );
    }

    const ext =
      imageFile.type === "image/jpeg"
        ? "jpg"
        : imageFile.type === "image/webp"
          ? "webp"
          : "png";
    const filename = `${id}.${ext}`;
    const filepath = join(IMAGE_DIR, filename);
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await writeFile(filepath, buffer);

    console.log(
      `[Image] Saved generated image for job ${id}: ${filepath} (${buffer.length} bytes)`,
    );

    // Update job with the image serve URL
    const imageServeUrl = `http://localhost:3000/api/jobs/${id}/image`;
    await prisma.videoJob.update({
      where: { id },
      data: { imageUrl: imageServeUrl },
    });

    // Add to gallery so image persists even if the job is deleted
    await prisma.galleryImage.create({
      data: {
        filename,
        prompt: job.imagePrompt,
      },
    });

    return NextResponse.json({
      success: true,
      imageUrl: imageServeUrl,
      size: buffer.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Image] Upload failed for job ${id}:`, errorMsg);
    return NextResponse.json(
      { error: "Image upload failed: " + errorMsg },
      { status: 500 },
    );
  }
}

// GET: Serve the generated image file
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await ensureImageDir();

  // Try common extensions
  for (const ext of ["png", "jpg", "webp"]) {
    const filepath = join(IMAGE_DIR, `${id}.${ext}`);
    if (existsSync(filepath)) {
      const imageBuffer = await readFile(filepath);
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        webp: "image/webp",
      };
      return new NextResponse(imageBuffer, {
        headers: {
          "Content-Type": mimeMap[ext],
          "Content-Length": imageBuffer.length.toString(),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  return NextResponse.json({ error: "Image not found" }, { status: 404 });
}
