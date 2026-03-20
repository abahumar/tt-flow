import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prompt = await prisma.customPrompt.findUnique({ where: { id } });
  if (!prompt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(prompt);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { name, imagePrompt, videoPrompt } = body;

  const prompt = await prisma.customPrompt.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: String(name).slice(0, 200) }),
      ...(imagePrompt !== undefined && { imagePrompt: String(imagePrompt) }),
      ...(videoPrompt !== undefined && { videoPrompt: String(videoPrompt) }),
    },
  });

  return NextResponse.json(prompt);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.customPrompt.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
