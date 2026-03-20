import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const settings = await prisma.setting.findMany();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  // body is { key: value, key: value, ... }
  const entries = Object.entries(body);
  for (const [key, value] of entries) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  const settings = await prisma.setting.findMany();
  return NextResponse.json(settings);
}
