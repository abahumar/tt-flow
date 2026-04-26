export const VIDEO_TYPES = {
  fungsi_produk: "Fungsi Produk",
  review: "Review Style",
  unboxing: "Unboxing Style",
  problem_solution: "Problem-Solution",
} as const;

export type VideoType = keyof typeof VIDEO_TYPES;

const PRODUCT_FIDELITY_SUFFIX =
  " IMPORTANT: The product must be an EXACT copy of the product from the uploaded reference image — same packaging, label, colors, text, shape. Do NOT generate a different or imagined version of the product.";

const IMAGE_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a professional product showcase photo. " +
    "Keep the product EXACTLY as shown in the reference — same shape, color, design, branding, and details. " +
    "Place it on a clean white/light background with studio lighting, showing the product in use demonstrating its function. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
  review:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a realistic product review style photo. " +
    "Keep the product EXACTLY as shown in the reference — same shape, color, design, branding, and details. " +
    "Display the product attractively with warm lighting in a lifestyle setting. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
  unboxing:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create an exciting unboxing scene. " +
    "Keep the product EXACTLY as shown in the reference — same shape, color, design, branding, and details. " +
    "Show the product being revealed from packaging with tissue paper and box, overhead angle, clean background. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
  problem_solution:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a before-and-after style image. " +
    "Keep the product EXACTLY as shown in the reference — same shape, color, design, branding, and details. " +
    "Left side shows a common problem, right side shows the solution with the product prominently displayed. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
};

const CLOTHING_IMAGE_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a professional fashion showcase photo with a model WEARING the clothing item. " +
    "Keep the clothing EXACTLY as shown in the reference — same color, pattern, fabric, design, and branding. " +
    "Model in a confident standing pose on a clean white/light background with studio lighting, showing how the clothing fits and drapes on the body. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
  review:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a realistic fashion review style photo with a model WEARING the clothing item. " +
    "Keep the clothing EXACTLY as shown in the reference — same color, pattern, fabric, design, and branding. " +
    "Model in a natural lifestyle setting with warm lighting, showing the clothing in everyday context with a relaxed pose. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
  unboxing:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create an exciting clothing reveal scene with a model WEARING the clothing item. " +
    "Keep the clothing EXACTLY as shown in the reference — same color, pattern, fabric, design, and branding. " +
    "Model doing a casual try-on pose with packaging visible nearby, clean background, showing the first impression of the outfit. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
  problem_solution:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a before-and-after style image. " +
    "Keep the clothing EXACTLY as shown in the reference — same color, pattern, fabric, design, and branding. " +
    "Left side shows a plain/unstylish outfit, right side shows a model WEARING the product looking stylish and confident. " +
    "Product: {title}. {description}" +
    PRODUCT_FIDELITY_SUFFIX,
};

const VIDEO_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk:
    "Create a short 15-second product demonstration video of {title}. " +
    "Show the product being used step by step, highlighting its key function. " +
    "Smooth camera movements, good lighting, engaging pace. Price: {price}",
  review:
    "Create a 15-second product review style video of {title}. " +
    "Start with the product reveal, show different angles, and end with a satisfied reaction. " +
    "Include text overlay spots for rating. Price: {price}",
  unboxing:
    "Create a 15-second unboxing video of {title}. " +
    "Start with the sealed package, slowly open it, reveal the product with excitement. " +
    "ASMR-style, close-up shots, satisfying reveal moment. Price: {price}",
  problem_solution:
    "Create a 15-second problem-solution video for {title}. " +
    "Start by showing a common frustration/problem, then introduce the product as the solution. " +
    "Quick transition, dramatic improvement, happy ending. Price: {price}",
};

interface PromptInput {
  title: string;
  description: string;
  price: string;
  videoType: VideoType;
  customImagePrompt?: string;
  customVideoPrompt?: string;
  isClothing?: boolean;
}

export function generateImagePrompt(input: PromptInput): string {
  if (input.customImagePrompt) return input.customImagePrompt;

  const templates = input.isClothing
    ? CLOTHING_IMAGE_TEMPLATES
    : IMAGE_TEMPLATES;
  const template = templates[input.videoType] || templates.fungsi_produk;
  return template
    .replace(/{title}/g, input.title)
    .replace(/{description}/g, input.description || input.title)
    .replace(/{price}/g, input.price || "");
}

export function generateVideoPrompt(input: PromptInput): string {
  if (input.customVideoPrompt) return input.customVideoPrompt;

  const template =
    VIDEO_TEMPLATES[input.videoType] || VIDEO_TEMPLATES.fungsi_produk;
  return template
    .replace(/{title}/g, input.title)
    .replace(/{description}/g, input.description || input.title)
    .replace(/{price}/g, input.price || "");
}

// ---- TikTok Caption & Hashtag Generation ----

const CAPTION_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk: "{title} 🔥 Harga {price}",
  review: "Review {title} ⭐ Worth it!",
  unboxing: "Unboxing {title}! 📦",
  problem_solution: "{title} — solusi terbaik! 💡",
};

interface CaptionInput {
  title: string;
  description: string;
  price: string;
  videoType: VideoType;
}

export function generateTikTokCaption(input: CaptionInput): string {
  const template =
    CAPTION_TEMPLATES[input.videoType] || CAPTION_TEMPLATES.fungsi_produk;
  return template
    .replace(/{title}/g, input.title)
    .replace(/{description}/g, input.description || input.title)
    .replace(/{price}/g, input.price || "terjangkau");
}

interface HashtagInput {
  title: string;
  shopName: string;
  videoType: VideoType;
}

const VIDEO_TYPE_HASHTAGS: Record<VideoType, string[]> = {
  fungsi_produk: ["tutorial", "tipsdantrik"],
  review: ["reviewjujur", "reviewproduk"],
  unboxing: ["unboxing", "unboxinghaul"],
  problem_solution: ["solusi", "lifehack"],
};

export function generateTikTokHashtags(input: HashtagInput): string[] {
  const tags: string[] = ["fyp", "tiktokshop", "rekomendasitiktok"];

  // Add video-type specific hashtags
  const typeTags = VIDEO_TYPE_HASHTAGS[input.videoType] || [];
  tags.push(...typeTags);

  // Add product-specific words from title
  const words = input.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  for (const word of words.slice(0, 2)) {
    if (!tags.includes(word)) tags.push(word);
  }

  // Add shop name if available
  if (input.shopName) {
    const shopTag = input.shopName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (shopTag.length > 2 && !tags.includes(shopTag)) tags.push(shopTag);
  }

  return tags.slice(0, 8);
}

// ---- SEEIUWTOA Copywriting Formula System ----

export interface FormulaElement {
  code: string;
  name: string;
  purpose: string;
  visualDirection: string;
  dialogDirection: string;
}

const SEEIUWTOA_ELEMENTS: FormulaElement[] = [
  {
    code: "ST",
    name: "Situasi",
    purpose: "HOOK — relatable situation about target audience problem/dream",
    visualDirection:
      "Model shows relatable problem WITHOUT product. Frustrated/emotional expression in everyday setting.",
    dialogDirection:
      "Hook with pain point or dream the audience relates to. 8-22 words. Use one of the hook templates.",
  },
  {
    code: "EX",
    name: "Exaggerate",
    purpose:
      "Amplify the pain or tension. Create empathy and emotional connection.",
    visualDirection:
      "Model shows heightened frustration/emotion. More dramatic expression, body language conveys stress.",
    dialogDirection:
      "Amplify the situation emotionally. 8-22 words. Make audience feel understood.",
  },
  {
    code: "ED",
    name: "Educate",
    purpose:
      "Reveal the root cause or why the dream hasn't been achieved. Include facts.",
    visualDirection:
      "Model in thoughtful/informative pose. Can hold phone showing info or gesture knowingly at camera.",
    dialogDirection:
      "Reveal insight or root cause with a fact. 8-22 words. Educational but casual tone.",
  },
  {
    code: "IN",
    name: "Intro Product",
    purpose: "Introduce the product/brand as the solution.",
    visualDirection:
      "Model reveals product for the first time. Happy/relieved expression. Product clearly visible.",
    dialogDirection:
      "Introduce the product with promoter energy — speak TO the audience. 8-22 words. Example: 'Ni lah produk yang korang dah lama tunggu!', 'Korang kena kenal produk ni!'",
  },
  {
    code: "US",
    name: "Unique Selling Point",
    purpose: "Highlight what makes this product unique vs alternatives.",
    visualDirection:
      "Close-up of product features/details. Model demonstrates or points at key feature.",
    dialogDirection:
      "Highlight specific unique benefits. 8-22 words. What makes it different and better.",
  },
  {
    code: "WHO",
    name: "Siapa",
    purpose:
      "Define who is suitable to use this product. Expand target audience.",
    visualDirection:
      "Model gestures warmly toward camera, inclusive body language. Product held casually.",
    dialogDirection:
      "Describe who benefits. 8-22 words. 'Sesuai untuk...' — expand audience.",
  },
  {
    code: "TR",
    name: "Trust",
    purpose: "Build credibility with testimonials, endorsements, proof.",
    visualDirection:
      "Model shows confident, trustworthy expression. Can gesture as if sharing proof or testimonial.",
    dialogDirection:
      "Assert product credibility with promoter confidence — speak TO the audience. 8-22 words. 'Ribuan customer dah buktikan, confirm berkesan!', 'Dah terbukti, korang pun boleh rasa hasilnya!'",
  },
  {
    code: "OF",
    name: "Offer",
    purpose: "Create urgency with price, promotion, or limited offer.",
    visualDirection:
      "Model presents product with excited/urgent expression. Product prominent, inviting composition.",
    dialogDirection:
      "State the offer/price with urgency. 8-22 words. FORBIDDEN: 'Harga Promosi'. Example: 'Limited offer, grab sebelum habis!'",
  },
  {
    code: "AC",
    name: "Action",
    purpose: "Clear CTA — punchy closing line with urgency.",
    visualDirection:
      "Model presents product directly to camera. Big warm smile, inviting expression. Product very prominent.",
    dialogDirection:
      "CTA closing line. MUST be 8-22 words. FORBIDDEN phrases: 'Harga Promosi', 'Cek Link'. Examples: 'Jom grab sekarang, korang memang tak akan menyesal percaya cakap aku!', 'Serious best gila, cepat grab sebelum habis stok tau!', 'Mesti try ni, confirm korang suka lepas guna!'. Must feel natural and complete.",
  },
];

export const VIDEO_FORMATS = {
  super_short: {
    id: "super_short",
    name: "⚡ Super Short (8s)",
    duration: "8s",
    description: "[Hook jual apa] + [Killer USP] + [Action]",
    suggestedScenes: 3,
    elements: [
      {
        code: "HOOK",
        name: "Hook Jual Apa",
        purpose: "Show what you're selling, grab attention instantly.",
        visualDirection:
          "Model holds product up to camera, excited expression, product clearly visible. Close-up chest-up framing.",
        dialogDirection:
          "Quick hook — what is this product and why should they care. 8-22 words. Example: 'Korang kena try ni, serious berbaloi!'",
      },
      {
        code: "USP",
        name: "Killer USP",
        purpose: "Highlight the unique benefit that makes it stand out.",
        visualDirection:
          "Model demonstrates product key feature, pointing at detail. Medium shot, product in focus.",
        dialogDirection:
          "One killer benefit that differentiates. 8-22 words. Short and punchy. Example: 'Bahan dia premium, tahan lama, tak mudah rosak!'",
      },
      {
        code: "AC",
        name: "Action",
        purpose: "CTA — punchy closing line with urgency.",
        visualDirection:
          "Model holds product beside face, warm inviting smile, product prominent. Chest-up framing.",
        dialogDirection:
          "CTA closing line. MUST be 8-22 words. FORBIDDEN phrases: 'Harga Promosi', 'Cek Link'. Examples: 'Jom grab sekarang, korang memang tak akan menyesal percaya cakap aku!', 'Serious best gila, cepat grab sebelum habis stok tau!'. Must feel natural and complete.",
      },
    ] as FormulaElement[],
  },
  short: {
    id: "short",
    name: "🎬 Short (20s)",
    duration: "20s",
    description: "[Hook Problem] + [Intro Product] + [Killer USP] + [Action]",
    suggestedScenes: 4,
    elements: [
      {
        code: "HOOK",
        name: "Hook Problem",
        purpose: "Show relatable problem/pain point to grab attention.",
        visualDirection:
          "Model looks frustrated/disappointed in everyday setting. No product visible yet.",
        dialogDirection:
          "Hook with a relatable problem. 8-22 words. Use hook templates. Example: 'Penat kan rambut gugur tak henti-henti?'",
      },
      {
        code: "IN",
        name: "Intro Product",
        purpose: "Reveal the product as the solution.",
        visualDirection:
          "Model holds up product with relieved/happy expression. Product clearly shown.",
        dialogDirection:
          "Present product as THE solution with promoter energy. 8-22 words. Example: 'Ini lah produk yang korang kena ada!', 'Korang tak perlu suffer lagi, ada ni sekarang!'",
      },
      {
        code: "USP",
        name: "Killer USP",
        purpose: "Highlight the unique benefit.",
        visualDirection:
          "Close-up of product feature/label. Model points at key detail.",
        dialogDirection:
          "Specific unique benefit. 8-22 words. Example: 'Ada Biotin & Keratin, memang proven berkesan!'",
      },
      {
        code: "AC",
        name: "Action",
        purpose: "CTA — punchy closing line with urgency.",
        visualDirection:
          "Model smiles warmly holding product beside face, inviting expression.",
        dialogDirection:
          "CTA closing line. MUST be 8-22 words. FORBIDDEN phrases: 'Harga Promosi', 'Cek Link'. Examples: 'Jom grab sekarang, korang memang tak akan menyesal percaya cakap aku!', 'Serious best gila, cepat grab sebelum habis stok tau!'. Must feel natural and complete.",
      },
    ] as FormulaElement[],
  },
  complete: {
    id: "complete",
    name: "🎥 Complete (40s)",
    duration: "40s",
    description: "Full SEEIUWTOA: ST+EX+ED+IN+US+WHO+TR+OF+AC",
    suggestedScenes: 5,
    elements: SEEIUWTOA_ELEMENTS,
  },
} as const satisfies Record<
  string,
  {
    id: string;
    name: string;
    duration: string;
    description: string;
    suggestedScenes: number;
    elements: readonly FormulaElement[];
  }
>;

export type VideoFormatId = keyof typeof VIDEO_FORMATS;

// Scene groupings: how elements map to scenes for each format + scene count
const FORMAT_SCENE_MAPPINGS: Record<string, string[][]> = {
  // Super Short: always 3 scenes, 1:1
  super_short_3: [["HOOK"], ["USP"], ["AC"]],

  // Short: always 4 scenes, 1:1
  short_4: [["HOOK"], ["IN"], ["USP"], ["AC"]],

  // Complete: varies by scene count
  complete_3: [
    ["ST", "EX"],
    ["ED", "IN", "US"],
    ["WHO", "TR", "OF", "AC"],
  ],
  complete_4: [
    ["ST", "EX"],
    ["ED", "IN"],
    ["US", "WHO", "TR"],
    ["OF", "AC"],
  ],
  complete_5: [["ST", "EX"], ["ED"], ["IN", "US"], ["WHO", "TR"], ["OF", "AC"]],
  complete_7: [
    ["ST"],
    ["EX"],
    ["ED"],
    ["IN", "US"],
    ["WHO"],
    ["TR"],
    ["OF", "AC"],
  ],
  complete_9: [
    ["ST"],
    ["EX"],
    ["ED"],
    ["IN"],
    ["US"],
    ["WHO"],
    ["TR"],
    ["OF"],
    ["AC"],
  ],
};

export interface SceneInstruction {
  sceneNumber: number;
  label: string;
  elements: FormulaElement[];
  visualDirection: string;
  dialogDirection: string;
}

export function getFormatSceneInstructions(
  formatId: VideoFormatId,
  sceneCount: number,
): SceneInstruction[] {
  const format = VIDEO_FORMATS[formatId];
  if (!format) return [];

  const key = `${formatId}_${sceneCount}`;
  const mapping = FORMAT_SCENE_MAPPINGS[key];

  if (!mapping) {
    // Fallback: use the closest available mapping
    const fallbackKey = `${formatId}_${format.suggestedScenes}`;
    const fallbackMapping = FORMAT_SCENE_MAPPINGS[fallbackKey];
    if (!fallbackMapping) return [];
    return buildSceneInstructions(format.elements, fallbackMapping);
  }

  return buildSceneInstructions(format.elements, mapping);
}

function buildSceneInstructions(
  elements: readonly FormulaElement[],
  mapping: string[][],
): SceneInstruction[] {
  return mapping.map((codes, i) => {
    const matchedElements = codes
      .map((code) => elements.find((e) => e.code === code))
      .filter((e): e is FormulaElement => !!e);

    const label = matchedElements
      .map((e) => `${e.code} (${e.name})`)
      .join(" + ");
    const visualDirection = matchedElements
      .map((e) => e.visualDirection)
      .join(" ");
    const dialogDirection = matchedElements
      .map((e) => e.dialogDirection)
      .join(" ");

    return {
      sceneNumber: i + 1,
      label,
      elements: matchedElements,
      visualDirection,
      dialogDirection,
    };
  });
}

// ---- Hook Templates ----

export const HOOK_TEMPLATES = {
  controversial: [
    "Bukan _________ — sebenarnya _________.",
    "Ramai buat _________ tiap hari... tapi tak sedar itu punca _________.",
    "Kau ingat _________? Sebenarnya _________.",
    "Lagi kau _________, lagi kau _________.",
    "Masalah kau bukan _________ — tapi _________.",
  ],
  curiosity: [
    "Saya baru sedar satu benda pasal _________... selama ni saya buat salah.",
    "Kenapa ada orang _________ walaupun _________?",
    "Ada satu benda pasal _________ saya wish saya tahu awal...",
    "Macam mana _________ boleh bagi _________?",
    "Apa sebenarnya yang orang _________ buat berbeza dalam _________?",
  ],
  story_based: [
    "Dulu saya pun _________... sampai satu hari saya sedar _________.",
    "Saya pernah _________ lama... sampai saya ubah satu benda ni: _________.",
    "Semua berubah bila saya start _________.",
    "Saya ingat _________... rupanya _________.",
    "Saya hampir _________... tapi _________ ubah semua.",
  ],
} as const;

export type HookStyle = keyof typeof HOOK_TEMPLATES;

// Genre → suggested hook style mapping
export const GENRE_HOOK_STYLE: Record<string, HookStyle> = {
  comedy: "controversial",
  pov: "controversial",
  hardsell: "controversial",
  educational: "curiosity",
  review: "curiosity",
  fungsi_produk: "curiosity",
  emotional: "story_based",
  softsell: "story_based",
  vlog: "story_based",
  unboxing: "story_based",
  asmr: "curiosity",
  problem_solution: "story_based",
};

// ---- Gaya Bahasa Santai Tone Directive ----

export const DIALOG_TONE_SANTAI = `
DIALOG TONE — GAYA PROMOTER (KUALA LUMPUR SLANG):
- Write in natural KL (Kuala Lumpur) conversational Bahasa Melayu. Santai, confident, gaya promoter yang enthusiastic.
- JANGAN guna bahasa skema/baku. Tulis macam promoter KL yang excited promote produk.
- WAJIB guna slang KL — contoh: "wei", "lah", "kan", "gila", "memang", "confirm", "serious ah", "best gila", "power", "fuh", "perghhh", "siot", "dah lah", "takkan", "mesti try".
- JANGAN guna slang Indonesia — DILARANG pakai: "banget", "dong", "nih", "sih", "gue/gw", "lu", "emang", "udah", "nggak", "tuh", "deh", "yuk", "kuy", "mager", "baper", "kepo". Ini content untuk audience Malaysia, BUKAN Indonesia.
- Use sapaan yang sesuai: "korang", "sis", "babe", "bestie", "bro", "wei" — tapi JANGAN guna "Wei korang" sebagai pembukaan dialog.
- Use emoji sparingly to add emotion: 😩 😍 🔥 ✅ 💪
- NEVER sound like a textbook or formal announcement.
- GAYA PROMOTER — cakap KEPADA audience (guna "korang"), bukan cerita pengalaman diri sendiri. Promote produk dengan direct, excited, dan confident. Highlight benefit untuk audience, bukan pengalaman peribadi.
- Prioritize: Hook Audience → Highlight Benefits → Drive Action. Ayat mesti feel macam promoter yang genuinely excited tentang produk ini.
- Dialog mesti mudah di sebut untuk AI voice — ayat pendek, direct, natural flow.

ANTI-TESTIMONY (CRITICAL — DILARANG KERAS):
- DILARANG guna ayat testimony/pengalaman peribadi seperti: "Sejak [nama] guna...", "Lepas [nama] pakai...", "Dulu [nama] ada masalah...", "[nama] dah cuba, memang...", "Bila [nama] mula guna..."
- DILARANG struktur: "[avatar] + verb pengalaman + produk + hasil peribadi". Contoh DILARANG: "Sejak pakcik guna ni, pokok pakcik subur." / "Lepas mama pakai, kulit mama glowing."
- GANTIKAN dengan promoter structure: Cakap benefit KEPADA audience. Contoh BETUL: "Korang nak pokok subur? Grab ni sekarang, confirm berkesan!" / "Kulit korang confirm glowing lepas guna ni!"

KATA GANTI DIRI (CRITICAL — WAJIB IKUT):
- DILARANG guna "aku" sebagai kata ganti diri. "Aku" kedengaran kasar dan tidak sesuai untuk content selling.
- UTAMAKAN guna "korang" bila refer kepada audience — ini gaya promoter. Contoh: "Korang kena try ni!", "Ini untuk korang yang nak...", "Korang confirm suka!"
- Guna "saya" bila perlu refer diri sendiri. Contoh: "Saya nak tunjukkan korang...", "Saya dah test, memang power!"
- "Saya" masih boleh digabung dengan slang KL — contoh: "Saya serious cakap lah...", "Saya confirm recommend ni."
- Untuk avatar Makcik/Pakcik, guna kata ganti diri "acik" atau "makcik"/"pakcik". Contoh: "Acik nak recommend ni tau...", "Makcik memang suggest korang cuba...", "Pakcik confirm produk ni best."
- JANGAN sesekali guna "aku", "gue", "gw" — ini DILARANG sepenuhnya.

VARIASI PEMBUKAAN SCENE 1 (HOOK):
- JANGAN mulakan Scene 1 dengan "Aduh" atau "Wei korang". DILARANG guna "Wei korang" sebagai pembukaan. Terlalu overused.
- Pilih pembukaan dari senarai ini secara RAWAK setiap kali generate — WAJIB tukar setiap kali:
  1. Soalan retorik: "Korang pernah tak...?", "Penat tak bila...?"
  2. Fakta mengejutkan: "Tau tak...?", "Ramai tak sedar..."
  3. Cabaran: "Cuba teka...", "Bet korang tak tau..."
  4. Pernyataan bold: "Serious cakap...", "No cap..."
  5. Luahan: "Fuh gila produk ni...", "Perghhh, korang kena tau pasal ni..."
  6. Direct hook: "Korang yang ada masalah _________, ni untuk korang!", "Kalau korang nak _________, grab ni!"
  7. POV: "POV: Korang baru jumpa...", "POV: Bila korang nak..."
  8. Urgency: "Jangan lepas peluang ni...", "Last stock korang, grab cepat..."
- Setiap kali generate, pilih pembukaan yang BERBEZA. Jangan ulang pattern yang sama.
- SEKALI LAGI: JANGAN start dengan "Wei korang". Gunakan variasi lain.

CRITICAL WORD LIMIT PER SCENE:
- Each scene generates ONE ~8 second video clip.
- Dialog per scene SHOULD be around 20 words (roughly 8 seconds of natural speech).
- Maximum 25 words per scene. Minimum 10 words per scene.
- Be clear and direct. Every word must carry meaning.
- Clear > clever. The audience must understand the message in one listen.
`;

// ---- TikTok Product Name (clean, max 30 chars, no special characters) ----

export function generateTikTokProductName(title: string): string {
  // Remove common prefixes like "TT109)" or "SKU123)"
  let clean = title.replace(/^[A-Z]{1,5}\d+\)\s*/i, "");

  // Remove bracketed content like [READY STOCK + TAG PEWA]
  clean = clean.replace(/\[.*?\]/g, "").trim();

  // Remove special characters, keep only letters, numbers, spaces
  clean = clean.replace(/[^a-zA-Z0-9\s]/g, " ");

  // Collapse multiple spaces
  clean = clean.replace(/\s+/g, " ").trim();

  // Capitalize first letter of each word
  clean = clean
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  // Truncate to 30 chars (at word boundary)
  if (clean.length > 30) {
    clean = clean
      .substring(0, 30)
      .replace(/\s+\S*$/, "")
      .trim();
  }

  return (
    clean ||
    title
      .substring(0, 30)
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
  );
}

// ---- TikTok Product Description (with hashtags) ----

const DESCRIPTION_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk: "{title} — Harga {price}. Jom dapatkan sekarang!",
  review: "Review {title} — Harga {price}. Cuba sekarang!",
  unboxing: "Unboxing {title}! Harga {price}. Grab yours!",
  problem_solution: "{title} — Harga {price}. Dapatkan sekarang!",
};

interface DescriptionInput {
  title: string;
  price: string;
  videoType: VideoType;
  hashtags: string[];
}

export function generateTikTokDescription(input: DescriptionInput): string {
  const cleanTitle = generateTikTokProductName(input.title);
  const template =
    DESCRIPTION_TEMPLATES[input.videoType] ||
    DESCRIPTION_TEMPLATES.fungsi_produk;

  let desc = template
    .replace(/{title}/g, cleanTitle)
    .replace(/{price}/g, input.price || "berpatutan");

  // Append hashtags
  if (input.hashtags && input.hashtags.length > 0) {
    const hashtagStr = input.hashtags.map((h) => `#${h}`).join(" ");
    desc = `${desc} ${hashtagStr}`;
  }

  return desc;
}

// ---- Variation Pools ----

export const HOOK_TITLE_POOL = [
  // question
  "Kenapa Kulit Masih Kusam?",
  "Rambut Gugur Tak Henti?",
  "Dah Cuba Semua Cara?",
  "Penat Masalah Sama?",
  "Korang Tahu Tak Ni?",
  // bold_claim
  "Power Gila Produk Ni!",
  "Memang Wajib Ada Ni!",
  "Korang Mesti Try Ni!",
  "Serious Best Gila Ni!",
  "Ini Lah Yang Korang Nak!",
  "Confirm Korang Suka!",
  "Memang Berbaloi Weh!",
  "Korang Kena Cuba Ni!",
  "Produk Ni Memang Gempak!",
  "Jangan Miss Produk Ni!",
  // number_driven
  "3 Hari Nampak Beza!",
  "1 Produk 5 Manfaat!",
  "2 Minggu Dah Nampak!",
  "Dah 10K Orang Cuba!",
  "5 Star Confirm!",
  // urgency
  "Last Stok Alert!",
  "Grab Sebelum Habis!",
  "Jangan Menyesal Nanti!",
  "Terhad, Rebut Sekarang!",
  "Jangan Lepas Peluang Ni!",
  // emotional_payoff
  "Akhirnya Jumpa Jugak!",
  "Masalah Tu Selesai!",
  "Lega Gila Dah!",
  "Tak Sangka Macam Ni!",
  "Ni Lah Jawapannya!",
  // pov
  "POV: Jumpa Produk Ni",
  "POV: Masalah Dah Selesai",
  "POV: Life Changer Alert",
  "POV: Korang Nak Glowing",
  "POV: Bila Dah Try Ni",
  // curiosity
  "Ramai Tak Sedar Ni",
  "Selama Ni Buat Salah?",
  "Ni Baru Korang Tahu!",
  "Rahsia Yang Ramai Simpan",
  "Orang Lain Dah Tahu...",
] as const;

export const DIALOG_CTA_POOL = [
  "Korang kena grab ni sekarang, serious memang berbaloi duit korang!",
  "Stok limited tau, jangan tangguh lagi, grab sekarang jugak!",
  "Dah ramai yang dah grab, korang bila lagi nak try?",
  "Kalau korang nak hasil terbaik, grab ni sekarang jugak!",
  "Power gila produk ni, korang kena try sendiri baru tahu!",
  "Ni peluang korang, jangan lepas, grab selagi ada stok!",
  "Saya recommend ni, korang cuba dulu confirm korang suka!",
  "Korang rugi kalau tak try, serious best gila produk ni!",
  "Fuh memang power, korang kena ada ni dalam hidup korang!",
  "Tak perlu fikir panjang, grab je dulu tau!",
  "Memang worth it, korang grab sekarang sebelum stock habis!",
  "Korang yang tengah tengok ni, ni sign untuk korang grab!",
  "Last chance ni, korang grab sebelum menyesal nanti tau!",
  "Serious tak rugi pun, grab sekarang confirm korang happy!",
  "Kalau korang nak upgrade, start dengan produk ni sekarang!",
  "Jom sama-sama try, memang confirm korang tak akan kecewa!",
  "Korang kena ada ni, grab sekarang jangan lepas peluang!",
  "Best gila, korang grab cepat sebelum habis stok tau!",
  "Ni untuk korang yang nak yang terbaik, grab sekarang!",
  "Korang tengok dulu, pastu confirm terus nak grab jugak!",
] as const;

export const TIKTOK_CAPTION_POOL = [
  "Ni lah produk yang korang dah lama cari!",
  "Korang kena try ni, serious tak akan menyesal!",
  "Fuh, memang power! Grab sekarang sebelum habis stok!",
  "Bila dah jumpa produk macam ni, terus jatuh cinta!",
  "Masalah korang selesai dah dengan produk ni!",
  "Serious game changer! Korang mesti cuba sendiri baru tahu!",
  "Tak sangka boleh lain gila, korang kena try ni!",
  "POV: Bila korang akhirnya jumpa produk yang memang power!",
  "Dah jadi kegemaran ramai, korang bila lagi nak try?",
  "Memang takde alasan untuk tak grab ni sekarang!",
  "Korang yang ada masalah ni, ni lah jawapannya!",
  "Percaya ke tidak, korang cuba dulu baru tau!",
  "Lepas try baru faham kenapa ramai yang suka sangat!",
  "Quality memang tak tipu, korang grab sebelum stock habis!",
  "Ni baru yang korang patut tahu pasal produk ni!",
  "Dah test, memang worth every ringgit tau!",
  "Korang tengah tengok sign untuk grab ni sekarang!",
  "Kalau rasa nak upgrade hidup korang, start dengan ni!",
  "Fuh perghhh, korang kena tengok ni sampai habis!",
  "Tak percaya? Cuba dulu, korang confirm nak lagi!",
] as const;

export const HOOK_TITLE_STYLES = [
  "question",
  "bold_claim",
  "number_driven",
  "urgency",
  "emotional_payoff",
  "pov",
  "curiosity",
] as const;

export const CAPTION_STYLES = [
  "relatable_problem",
  "discovery",
  "social_proof",
  "pov_scenario",
  "fomo_urgency",
  "curiosity_gap",
] as const;

export function pickSamples<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  const result: T[] = [];
  const count = Math.min(n, copy.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * (copy.length - i));
    result.push(copy[idx]);
    copy[idx] = copy[copy.length - i - 1];
  }
  return result;
}

export function pickOne<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}
