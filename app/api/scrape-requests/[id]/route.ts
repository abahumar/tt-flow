import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH: Extension updates scrape request status (scraping → done/failed)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { status, error } = body;

  const updated = await prisma.scrapeRequest.update({
    where: { id },
    data: {
      status: status || undefined,
      error: error || undefined,
      productId: body.productId || undefined,
    },
  });

  return NextResponse.json(updated);
}
