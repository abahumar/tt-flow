import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.videoJob.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          url: true,
          title: true,
          price: true,
          shopName: true,
          images: true,
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const allowedFields = [
    "status",
    "imageUrl",
    "videoUrl",
    "tiktokPostUrl",
    "errorMessage",
    "lastError",
    "retryCount",
    "startedAt",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      data[key] = body[key];
    }
  }

  // If status is changing to a processing state, record startedAt
  if (data.status === "generating_image" && !data.startedAt) {
    data.startedAt = new Date().toISOString();
  }

  const job = await prisma.videoJob.update({
    where: { id },
    data,
  });

  return NextResponse.json(job);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.videoJob.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
