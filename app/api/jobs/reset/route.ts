import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.videoJob.updateMany({
    where: {
      status: {
        in: ["failed", "generating_image", "generating_video", "posting"],
      },
    },
    data: {
      status: "pending",
      errorMessage: "",
      lastError: "",
      retryCount: 0,
      startedAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
