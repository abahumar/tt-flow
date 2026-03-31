import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const template = await prisma.videoTemplate.findUnique({ where: { id } });
  if (!template)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const template = await prisma.videoTemplate.update({
    where: { id },
    data: {
      name: body.name,
      backgroundImage: body.backgroundImage,
      backgroundDesc: body.backgroundDesc,
      modelImage: body.modelImage,
      modelDesc: body.modelDesc,
    },
  });
  return NextResponse.json(template);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.videoTemplate.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
