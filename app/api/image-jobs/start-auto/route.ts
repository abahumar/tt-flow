import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: Start processing the next pending image job
export async function POST() {
  const nextJob = await prisma.imageJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  if (!nextJob) {
    return NextResponse.json(
      { error: "No pending image jobs in queue" },
      { status: 404 },
    );
  }

  const job = await prisma.imageJob.update({
    where: { id: nextJob.id },
    data: {
      status: "generating",
      startedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json(job);
}
