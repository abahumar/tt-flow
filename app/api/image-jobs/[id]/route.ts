import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Get single image job
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await prisma.imageJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Image job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}

// PATCH: Update image job status/fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "status",
    "imagePrompt",
    "referenceImage",
    "resultImage",
    "errorMessage",
    "retryCount",
    "maxRetries",
    "lastError",
    "startedAt",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      data[key] = body[key];
    }
  }

  const job = await prisma.imageJob.update({
    where: { id },
    data,
  });

  return NextResponse.json(job);
}

// DELETE: Delete image job
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.imageJob.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
