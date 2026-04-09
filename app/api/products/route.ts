import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { videoJobs: true } } },
  });
  return NextResponse.json(products);
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
