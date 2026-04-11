import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const VIDEO_DIR = "/data/videos";
const TMP_DIR = "/tmp/ffmpeg-combine";

function ensureDirs() {
  if (!existsSync(VIDEO_DIR)) mkdirSync(VIDEO_DIR, { recursive: true });
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

// Detect font path available in the container
function getFontPath(): string {
  const candidates = [
    "/usr/share/fonts/noto/NotoSans-Bold.ttf",
    "/usr/share/fonts/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "/usr/share/fonts/TTF/NotoSans-Bold.ttf",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    "/System/Library/Fonts/Helvetica.ttc", // macOS fallback
    "/System/Library/Fonts/SFNSMono.ttf",
  ];
  for (const f of candidates) {
    if (existsSync(f)) return f;
  }
  return ""; // FFmpeg will use its built-in default
}

export interface TextOverlay {
  text: string;
  position: "top" | "bottom" | "center";
  fontSize?: number; // default 48
}

export interface CombineOptions {
  jobId: string;
  sceneCount: number;
  hookTitle?: string;
  hookSubtitle?: string;
  overlays?: (TextOverlay | null)[]; // one per scene, null = no overlay
  hookDuration?: number; // seconds to show hook text, default 0.5
  hookBgColor?: string; // hex without #, default "E91E63" (pink)
  hookTextColor?: string; // hex without #, default "FFFFFF"
  overlayFontSize?: number; // global font size for overlay text, default 28
  hookFontSize?: number; // font size for hook title text, default 36
}

// Strip emojis — FFmpeg drawtext cannot render emoji glyphs
function stripEmojis(text: string): string {
  return text
    .replace(
      /[\u{0080}-\u{00FF}\u{2000}-\u{209F}\u{20A0}-\u{20CF}\u{2100}-\u{214F}\u{2190}-\u{21FF}\u{2200}-\u{22FF}\u{2300}-\u{23FF}\u{2400}-\u{243F}\u{2440}-\u{245F}\u{2460}-\u{24FF}\u{2500}-\u{257F}\u{2580}-\u{259F}\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2900}-\u{297F}\u{2B00}-\u{2BFF}\u{3000}-\u{303F}\u{3200}-\u{32FF}\u{FE00}-\u{FEFF}\u{FE0F}\u{200D}\u{20E3}\u{1F000}-\u{1FFFF}\u{E0020}-\u{E007F}]/gu,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Split text into lines that fit within maxChars per line
function splitLines(text: string, maxChars = 30): string[] {
  const words = stripEmojis(text).split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine && (currentLine + " " + word).length > maxChars) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + " " + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

// Escape text for FFmpeg drawtext filter (single-line only)
function escapeDrawtext(text: string): string {
  return stripEmojis(text)
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, "\\\\:")
    .replace(/%/g, "\\\\%");
}

/**
 * Build stacked drawtext filters — one per line, vertically centered around a Y anchor.
 * Each line gets its own drawtext with box background, so no newline character issues.
 */
function buildMultilineDrawtext(opts: {
  text: string;
  maxChars: number;
  fontOpt: string;
  fontColor: string;
  fontSize: number;
  yExpr: string; // center Y anchor expression (e.g. "h*0.45" or "h*0.65")
  boxColor: string; // e.g. "#E91E63@0.9" or "black@0.6"
  boxBorderW: number;
  lineSpacing: number;
  enableExpr?: string; // e.g. "lt(t,0.5)" or "gte(t,0.5)"
}): string {
  const {
    text,
    maxChars,
    fontOpt,
    fontColor,
    fontSize,
    yExpr,
    boxColor,
    boxBorderW,
    lineSpacing,
    enableExpr,
  } = opts;

  const lines = splitLines(text, maxChars);
  // Total line height = font size + box padding (top+bottom) + spacing between lines
  const lineHeight = fontSize + boxBorderW * 2 + lineSpacing;
  const totalHeight = lines.length * lineHeight;
  const enablePart = enableExpr ? `:enable='${enableExpr}'` : "";

  return lines
    .map((line, i) => {
      const escaped = escapeDrawtext(line);
      // Offset each line from the center anchor
      const offsetY = Math.round(-totalHeight / 2 + i * lineHeight);
      const sign = offsetY >= 0 ? "+" : "";
      return `drawtext=${fontOpt}text='${escaped}':fontcolor=${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yExpr}${sign}${offsetY}:box=1:boxcolor=${boxColor}:boxborderw=${boxBorderW}${enablePart}`;
    })
    .join(",");
}

// Get the Y position expression for drawtext
function getYExpr(position: "top" | "bottom" | "center"): string {
  switch (position) {
    case "top":
      return "h*0.08";
    case "center":
      return "(h-text_h)/2";
    case "bottom":
      return "h*0.65"; // above TikTok UI elements (username, caption, etc)
  }
}

/**
 * Add hook title overlay to the beginning of a video clip.
 * Shows bold text with a colored background strip (like TikTok style)
 * that appears for a few seconds then fades out.
 * The video and audio remain untouched — only text is overlaid.
 */
export function addHookOverlay(options: {
  inputPath: string;
  outputPath: string;
  title: string;
  subtitle?: string;
  displayDuration?: number; // how long to show (default 0.5s)
  bgColor?: string; // hex without #, default "E91E63" (pink)
  textColor?: string; // hex without #, default "FFFFFF"
  hookFontSize?: number; // font size for hook title, default 48
}): void {
  const {
    inputPath,
    outputPath,
    title,
    subtitle,
    displayDuration = 0.5,
    bgColor = "E91E63",
    textColor = "FFFFFF",
    hookFontSize = 48,
  } = options;

  const subtitleSize = Math.round(hookFontSize * 0.5625); // proportional subtitle
  const fontPath = getFontPath();
  const fontOpt = fontPath ? `fontfile='${fontPath}':` : "";

  // Title with colored background strip, centered, shown for displayDuration seconds
  let filter = buildMultilineDrawtext({
    text: title,
    maxChars: 25,
    fontOpt,
    fontColor: `#${textColor}`,
    fontSize: hookFontSize,
    yExpr: "h*0.45",
    boxColor: `#${bgColor}@0.9`,
    boxBorderW: 12,
    lineSpacing: -4,
    enableExpr: `lt(t,${displayDuration})`,
  });

  // Subtitle below title
  if (subtitle) {
    const escapedSub = escapeDrawtext(stripEmojis(subtitle));
    filter += `,drawtext=${fontOpt}text='${escapedSub}':fontcolor=#${textColor}:fontsize=${subtitleSize}:x=(w-text_w)/2:y=h*0.45+90:box=1:boxcolor=#000000@0.5:boxborderw=14:enable='lt(t,${displayDuration})'`;
  }

  const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filter}" -c:v libx264 -preset fast -crf 18 -c:a copy -pix_fmt yuv420p "${outputPath}"`;

  execSync(cmd, { timeout: 120000, stdio: "pipe" });
}

/**
 * Apply both hook title and text overlay on the same video in a single FFmpeg pass.
 * Hook shows first for hookDuration, then overlay text appears after hook disappears.
 */
export function addHookAndOverlay(options: {
  inputPath: string;
  outputPath: string;
  hookTitle: string;
  hookSubtitle?: string;
  hookDuration: number;
  overlay: TextOverlay;
  hookBgColor?: string;
  hookTextColor?: string;
  hookFontSize?: number;
}): void {
  const {
    inputPath,
    outputPath,
    hookTitle,
    hookSubtitle,
    hookDuration,
    overlay,
    hookBgColor = "E91E63",
    hookTextColor = "FFFFFF",
    hookFontSize = 48,
  } = options;

  const subtitleSize = Math.round(hookFontSize * 0.5625);
  const fontPath = getFontPath();
  const fontOpt = fontPath ? `fontfile='${fontPath}':` : "";

  // Hook title: shows from 0 to hookDuration
  let filter = buildMultilineDrawtext({
    text: hookTitle,
    maxChars: 25,
    fontOpt,
    fontColor: `#${hookTextColor}`,
    fontSize: hookFontSize,
    yExpr: "h*0.45",
    boxColor: `#${hookBgColor}@0.9`,
    boxBorderW: 12,
    lineSpacing: -4,
    enableExpr: `lt(t,${hookDuration})`,
  });

  // Hook subtitle
  if (hookSubtitle) {
    const escapedSub = escapeDrawtext(stripEmojis(hookSubtitle));
    filter += `,drawtext=${fontOpt}text='${escapedSub}':fontcolor=#${hookTextColor}:fontsize=${subtitleSize}:x=(w-text_w)/2:y=h*0.45+90:box=1:boxcolor=#000000@0.5:boxborderw=14:enable='lt(t,${hookDuration})'`;
  }

  // Overlay text: appears after hook disappears
  const yExpr = getYExpr(overlay.position);
  const overlaySize = overlay.fontSize || 48;
  filter += `,${buildMultilineDrawtext({
    text: overlay.text,
    maxChars: 30,
    fontOpt,
    fontColor: "white",
    fontSize: overlaySize,
    yExpr,
    boxColor: "black@0.6",
    boxBorderW: 10,
    lineSpacing: -4,
    enableExpr: `gte(t,${hookDuration})`,
  })}`;

  const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filter}" -c:v libx264 -preset fast -crf 18 -c:a copy -pix_fmt yuv420p "${outputPath}"`;

  execSync(cmd, { timeout: 120000, stdio: "pipe" });
}

/**
 * Add a text overlay to a video clip.
 * Renders text with a semi-transparent dark background strip.
 */
export function addTextOverlay(
  inputPath: string,
  outputPath: string,
  overlay: TextOverlay,
): void {
  const fontPath = getFontPath();
  const fontOpt = fontPath ? `fontfile='${fontPath}':` : "";
  const yExpr = getYExpr(overlay.position);
  const size = overlay.fontSize || 48;

  const filter = buildMultilineDrawtext({
    text: overlay.text,
    maxChars: 30,
    fontOpt,
    fontColor: "white",
    fontSize: size,
    yExpr,
    boxColor: "black@0.6",
    boxBorderW: 10,
    lineSpacing: -4,
  });

  const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filter}" -c:v libx264 -preset fast -crf 18 -c:a copy "${outputPath}"`;

  execSync(cmd, { timeout: 120000, stdio: "pipe" });
}

/**
 * Combine multiple video clips into a single video using FFmpeg concat demuxer.
 * All clips must have the same resolution and codec.
 */
export function concatVideos(inputPaths: string[], outputPath: string): void {
  ensureDirs();

  // Create concat list file
  const listPath = join(TMP_DIR, `concat-${Date.now()}.txt`);
  const listContent = inputPaths.map((p) => `file '${p}'`).join("\n");
  writeFileSync(listPath, listContent);

  try {
    // Re-encode to ensure consistent format across all clips, preserving audio
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -ar 44100 -ac 2 -pix_fmt yuv420p "${outputPath}"`;
    execSync(cmd, { timeout: 300000, stdio: "pipe" }); // 5 min timeout for concat
  } finally {
    // Clean up concat list
    try {
      unlinkSync(listPath);
    } catch {
      // ignore
    }
  }
}

/**
 * Normalize a video to 1080x1920 (9:16) with consistent codec settings.
 * Adds a silent audio track if the source has no audio, ensuring all clips
 * can be concatenated without audio stream mismatch issues.
 */
export function normalizeClip(inputPath: string, outputPath: string): void {
  // Check if source has audio
  let hasAudio = false;
  try {
    const probe = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${inputPath}"`,
      { timeout: 10000, stdio: "pipe" },
    )
      .toString()
      .trim();
    hasAudio = probe.includes("audio");
  } catch {
    // If ffprobe fails, assume no audio
  }

  if (hasAudio) {
    // Source has audio — normalize video + re-encode audio
    const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -ar 44100 -ac 2 -pix_fmt yuv420p -r 30 "${outputPath}"`;
    execSync(cmd, { timeout: 120000, stdio: "pipe" });
  } else {
    // No audio — add silent audio track so concat works properly
    const cmd = `ffmpeg -y -i "${inputPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k -ar 44100 -ac 2 -pix_fmt yuv420p -r 30 -shortest "${outputPath}"`;
    execSync(cmd, { timeout: 120000, stdio: "pipe" });
  }
}

/**
 * Main function: combine multi-scene videos into a single final video.
 *
 * Steps:
 * 1. (Optional) Generate intro card with hookTitle
 * 2. Normalize each scene clip to consistent format
 * 3. (Optional) Add text overlay to each scene
 * 4. Concat all clips into one video
 */
export function combineSceneVideos(options: CombineOptions): string {
  ensureDirs();

  const {
    jobId,
    sceneCount,
    hookTitle,
    hookSubtitle,
    overlays = [],
    hookDuration = 0.5,
    hookBgColor = "E91E63",
    hookTextColor = "FFFFFF",
    overlayFontSize = 28,
    hookFontSize = 36,
  } = options;

  const tempFiles: string[] = [];
  const clipPaths: string[] = [];

  try {
    // Process each scene: normalize, add overlays, add hook to first scene
    for (let i = 0; i < sceneCount; i++) {
      const sceneFile = join(VIDEO_DIR, `${jobId}-s${i}.mp4`);
      const rawFile = join(VIDEO_DIR, `${jobId}-s${i}-raw.mp4`);
      const sourceFile = existsSync(sceneFile)
        ? sceneFile
        : existsSync(rawFile)
          ? rawFile
          : null;

      if (!sourceFile) {
        throw new Error(`Scene ${i} video not found: ${sceneFile}`);
      }

      // Normalize to consistent format (preserves audio)
      const normalizedPath = join(TMP_DIR, `${jobId}-norm-${i}.mp4`);
      normalizeClip(sourceFile, normalizedPath);
      tempFiles.push(normalizedPath);

      let currentPath = normalizedPath;

      const overlay = overlays[i];
      const hasOverlay = overlay && overlay.text;
      const hasHook = i === 0 && hookTitle;

      // Apply global font size to overlay if not set per-overlay
      const sizedOverlay = hasOverlay
        ? { ...overlay, fontSize: overlay.fontSize || overlayFontSize }
        : null;

      if (hasHook && sizedOverlay) {
        // First scene with both hook and overlay — single pass:
        // hook shows first, overlay appears after hook disappears
        const comboPath = join(TMP_DIR, `${jobId}-combo-${i}.mp4`);
        addHookAndOverlay({
          inputPath: currentPath,
          outputPath: comboPath,
          hookTitle: hookTitle!,
          hookSubtitle,
          hookDuration,
          overlay: sizedOverlay,
          hookBgColor,
          hookTextColor,
          hookFontSize,
        });
        tempFiles.push(comboPath);
        currentPath = comboPath;
      } else if (hasHook) {
        // First scene with hook only
        const hookPath = join(TMP_DIR, `${jobId}-hook-${i}.mp4`);
        addHookOverlay({
          inputPath: currentPath,
          outputPath: hookPath,
          title: hookTitle!,
          subtitle: hookSubtitle,
          displayDuration: hookDuration,
          bgColor: hookBgColor,
          textColor: hookTextColor,
          hookFontSize,
        });
        tempFiles.push(hookPath);
        currentPath = hookPath;
      } else if (hasOverlay) {
        // Regular scene with overlay text
        const overlayPath = join(TMP_DIR, `${jobId}-overlay-${i}.mp4`);
        addTextOverlay(currentPath, overlayPath, sizedOverlay!);
        tempFiles.push(overlayPath);
        currentPath = overlayPath;
      }

      clipPaths.push(currentPath);
    }

    // Step 4: Concat all clips
    const outputPath = join(VIDEO_DIR, `${jobId}-combined.mp4`);
    if (clipPaths.length === 1) {
      // Only one clip (e.g., single scene no intro) — just copy
      execSync(`cp "${clipPaths[0]}" "${outputPath}"`, { stdio: "pipe" });
    } else {
      concatVideos(clipPaths, outputPath);
    }

    return outputPath;
  } finally {
    // Clean up temp files
    for (const f of tempFiles) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
