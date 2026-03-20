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
  ];

  const data: Record<string, string> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      data[key] = body[key];
    }
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
