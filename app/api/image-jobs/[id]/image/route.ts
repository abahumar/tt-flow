import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const GENERATED_DIR = "/data/images/generated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureDir() {
  if (!existsSync(GENERATED_DIR)) {
    await mkdir(GENERATED_DIR, { recursive: true });
  }
}

// POST: Upload generated image for an image job
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.imageJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Image job not found" }, { status: 404 });
  }

  try {
    await ensureDir();

    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 },
      );
    }

    // Determine extension from MIME type
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const ext = extMap[imageFile.type] || "png";
    const filename = `${id}.${ext}`;
    const filepath = join(GENERATED_DIR, filename);

    const buffer = Buffer.from(await imageFile.arrayBuffer());
    await writeFile(filepath, buffer);

    console.log(
      `[ImageJob] Saved generated image for job ${id}: ${filepath} (${buffer.length} bytes)`,
    );

    // Update job with result and mark completed
    const updatedJob = await prisma.imageJob.update({
      where: { id },
      data: {
        resultImage: filename,
        status: "completed",
      },
    });

    // Also add to gallery
    await prisma.galleryImage.create({
      data: {
        filename,
        prompt: job.imagePrompt,
      },
    });

    return NextResponse.json(updatedJob);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    console.error("[ImageJob] Image upload error:", msg);

    await prisma.imageJob.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: msg,
      },
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
