import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  // Build update data — only include fields that are provided
  const data: Record<string, unknown> = {};
  if (body.videoReady !== undefined) data.videoReady = Boolean(body.videoReady);
  if (body.usp !== undefined) data.usp = String(body.usp);
  if (body.targetAudience !== undefined)
    data.targetAudience = String(body.targetAudience);
  if (body.description !== undefined)
    data.description = String(body.description);

  const product = await prisma.product.update({
    where: { id },
    data,
  });
  return NextResponse.json(product);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
