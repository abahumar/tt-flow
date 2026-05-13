import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const IMAGE_DIR = join(process.cwd(), "data", "images", "generated");

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
  try {
    console.log(`[Image] POST /api/jobs/${id}/image`);

    const job = await prisma.videoJob.findUnique({ where: { id } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    await ensureImageDir();

    const body = await req.json() as {
      imageBase64: string;
      mimeType?: string;
      sceneIndex?: number;
    };

    if (!body.imageBase64) {
      return NextResponse.json(
        { error: "No image data provided" },
        { status: 400 },
      );
    }

    const mimeType = body.mimeType || "image/png";
    const sceneIndex = typeof body.sceneIndex === "number" ? body.sceneIndex : -1;
    const isMultiScene = sceneIndex >= 0;

    const ext =
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/webp"
          ? "webp"
          : "png";
    const filename = isMultiScene
      ? `${id}-s${sceneIndex}.${ext}`
      : `${id}.${ext}`;
    const filepath = join(IMAGE_DIR, filename);
    const buffer = Buffer.from(body.imageBase64, "base64");
    await writeFile(filepath, buffer);

    console.log(
      `[Image] Saved generated image for job ${id}${isMultiScene ? ` scene ${sceneIndex}` : ""}: ${filepath} (${buffer.length} bytes)`,
    );

    // Update job's main imageUrl only for scene 0 or non-multi-scene
    const host = req.headers.get("host") || "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${proto}://${host}`;
    const imageServeUrl = isMultiScene
      ? `${baseUrl}/api/jobs/${id}/image?scene=${sceneIndex}`
      : `${baseUrl}/api/jobs/${id}/image`;
    if (!isMultiScene || sceneIndex === 0) {
      await prisma.videoJob.update({
        where: { id },
        data: { imageUrl: imageServeUrl },
      });
    }

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
      sceneIndex: isMultiScene ? sceneIndex : undefined,
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sceneParam = req.nextUrl.searchParams.get("scene");
  const fileId = sceneParam !== null ? `${id}-s${sceneParam}` : id;

  await ensureImageDir();

  // Try common extensions
  for (const ext of ["png", "jpg", "webp"]) {
    const filepath = join(IMAGE_DIR, `${fileId}.${ext}`);
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
