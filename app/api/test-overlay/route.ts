import { NextRequest, NextResponse } from "next/server";
import { addHookAndOverlay } from "@/lib/ffmpeg";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

const VIDEO_DIR = "/data/videos";

/**
 * GET /api/test-overlay?video=filename.mp4&hook=Hello+World&caption=Some+caption
 *
 * Applies overlay to an existing video and returns the result for quick testing.
 * No job creation needed.
 */
export async function GET(req: NextRequest) {
  const video = req.nextUrl.searchParams.get("video");
  const hook =
    req.nextUrl.searchParams.get("hook") ||
    "Gila excited bila YAIYA Mini Bootcut Slack ni sampai, kualiti dia lain macam!";
  const caption =
    req.nextUrl.searchParams.get("caption") ||
    "Seluar ni memang best, kain dia sejuk dan selesa sangat pakai!";
  const hookFontSize = parseInt(
    req.nextUrl.searchParams.get("hookSize") || "36",
  );
  const captionFontSize = parseInt(
    req.nextUrl.searchParams.get("captionSize") || "28",
  );

  if (!video) {
    return NextResponse.json(
      {
        error: "Provide ?video=filename.mp4",
        hint: "GET /api/test-overlay?video=cmnnrzzmo000hmwl5ljqsxbxv-s0.mp4",
      },
      { status: 400 },
    );
  }

  const inputPath = `${VIDEO_DIR}/${video}`;
  if (!existsSync(inputPath)) {
    return NextResponse.json(
      { error: `Video not found: ${video}` },
      { status: 404 },
    );
  }

  const outputPath = `${VIDEO_DIR}/test-overlay-result.mp4`;

  try {
    addHookAndOverlay({
      inputPath,
      outputPath,
      hookTitle: hook,
      hookDuration: 0.5,
      overlay: {
        text: caption,
        position: "bottom",
        fontSize: captionFontSize,
      },
      hookBgColor: "E91E63",
      hookTextColor: "FFFFFF",
      hookFontSize,
    });

    const videoBuffer = await readFile(outputPath);
    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "inline; filename=test-overlay.mp4",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
