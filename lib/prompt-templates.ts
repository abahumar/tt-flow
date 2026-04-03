export const VIDEO_TYPES = {
  fungsi_produk: "Fungsi Produk",
  review: "Review Style",
  unboxing: "Unboxing Style",
  problem_solution: "Problem-Solution",
} as const;

export type VideoType = keyof typeof VIDEO_TYPES;

const IMAGE_TEMPLATES: Record<VideoType, string> = {
  fungsi_produk:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a professional product showcase photo. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Place it on a clean white/light background with studio lighting, showing the product in use demonstrating its function. " +
    "Product: {title}. {description}",
  review:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a realistic product review style photo. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Display the product attractively with warm lighting in a lifestyle setting. " +
    "Product: {title}. {description}",
  unboxing:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create an exciting unboxing scene. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Show the product being revealed from packaging with tissue paper and box, overhead angle, clean background. " +
    "Product: {title}. {description}",
  problem_solution:
    "From the image uploaded, accurate scale, no alter, no redesign. " +
    "Create a before-and-after style image. " +
    "Keep the product EXACTLY as shown — same shape, color, design, branding, and details. " +
    "Left side shows a common problem, right side shows the solution with the product prominently displayed. " +
    "Product: {title}. {description}",
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
}

export function generateImagePrompt(input: PromptInput): string {
  if (input.customImagePrompt) return input.customImagePrompt;

  const template =
    IMAGE_TEMPLATES[input.videoType] || IMAGE_TEMPLATES.fungsi_produk;
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
      "Hook with pain point or dream the audience relates to. MAX 15 words. Use one of the hook templates.",
  },
  {
    code: "EX",
    name: "Exaggerate",
    purpose:
      "Amplify the pain or tension. Create empathy and emotional connection.",
    visualDirection:
      "Model shows heightened frustration/emotion. More dramatic expression, body language conveys stress.",
    dialogDirection:
      "Amplify the situation emotionally. MAX 15 words. Make audience feel understood.",
  },
  {
    code: "ED",
    name: "Educate",
    purpose:
      "Reveal the root cause or why the dream hasn't been achieved. Include facts.",
    visualDirection:
      "Model in thoughtful/informative pose. Can hold phone showing info or gesture knowingly at camera.",
    dialogDirection:
      "Reveal insight or root cause with a fact. MAX 18 words. Educational but casual tone.",
  },
  {
    code: "IN",
    name: "Intro Product",
    purpose: "Introduce the product/brand as the solution.",
    visualDirection:
      "Model reveals product for the first time. Happy/relieved expression. Product clearly visible.",
    dialogDirection:
      "Introduce the product naturally as the solution. MAX 15 words. Like sharing a discovery.",
  },
  {
    code: "US",
    name: "Unique Selling Point",
    purpose: "Highlight what makes this product unique vs alternatives.",
    visualDirection:
      "Close-up of product features/details. Model demonstrates or points at key feature.",
    dialogDirection:
      "Highlight specific unique benefits. MAX 15 words. What makes it different and better.",
  },
  {
    code: "WHO",
    name: "Siapa",
    purpose:
      "Define who is suitable to use this product. Expand target audience.",
    visualDirection:
      "Model gestures warmly toward camera, inclusive body language. Product held casually.",
    dialogDirection:
      "Describe who benefits. MAX 15 words. 'Sesuai untuk...' — expand audience.",
  },
  {
    code: "TR",
    name: "Trust",
    purpose: "Build credibility with testimonials, endorsements, proof.",
    visualDirection:
      "Model shows confident, trustworthy expression. Can gesture as if sharing proof or testimonial.",
    dialogDirection:
      "Share social proof or credibility. MAX 15 words. 'Ramai dah guna...', 'Dah terbukti...'",
  },
  {
    code: "OF",
    name: "Offer",
    purpose: "Create urgency with price, promotion, or limited offer.",
    visualDirection:
      "Model presents product with excited/urgent expression. Product prominent, inviting composition.",
    dialogDirection:
      "State the offer/price with urgency. MAX 12 words. 'Harga promosi terhad...'",
  },
  {
    code: "AC",
    name: "Action",
    purpose: "Clear CTA — click link, beg kuning TikTok, WhatsApp.",
    visualDirection:
      "Model presents product directly to camera. Big warm smile, inviting expression. Product very prominent.",
    dialogDirection:
      "Direct call to action. MAX 8 words. 'Tekan beg kuning sekarang!'",
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
          "Quick hook — what is this product and why should they care. MAX 10 words. Example: 'Korang kena try ni, serious berbaloi!'",
      },
      {
        code: "USP",
        name: "Killer USP",
        purpose: "Highlight the unique benefit that makes it stand out.",
        visualDirection:
          "Model demonstrates product key feature, pointing at detail. Medium shot, product in focus.",
        dialogDirection:
          "One killer benefit that differentiates. MAX 12 words. Short and punchy. Example: 'Bahan dia premium, tahan lama, tak mudah rosak!'",
      },
      {
        code: "AC",
        name: "Action",
        purpose: "CTA — tekan beg kuning / grab sekarang.",
        visualDirection:
          "Model holds product beside face, warm inviting smile, product prominent. Chest-up framing.",
        dialogDirection:
          "Direct CTA. MAX 8 words. Example: 'Tekan beg kuning sekarang!'",
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
          "Hook with a relatable problem. MAX 15 words. Use hook templates. Example: 'Penat kan rambut gugur tak henti-henti?'",
      },
      {
        code: "IN",
        name: "Intro Product",
        purpose: "Reveal the product as the solution.",
        visualDirection:
          "Model holds up product with relieved/happy expression. Product clearly shown.",
        dialogDirection:
          "Introduce product naturally. MAX 15 words. Example: 'Tapi lepas guna ni, semua berubah...'",
      },
      {
        code: "USP",
        name: "Killer USP",
        purpose: "Highlight the unique benefit.",
        visualDirection:
          "Close-up of product feature/label. Model points at key detail.",
        dialogDirection:
          "Specific unique benefit. MAX 12 words. Example: 'Ada Biotin & Keratin, memang proven berkesan!'",
      },
      {
        code: "AC",
        name: "Action",
        purpose: "CTA with urgency.",
        visualDirection:
          "Model smiles warmly holding product beside face, inviting expression.",
        dialogDirection:
          "CTA with urgency. MAX 10 words. Example: 'Grab sekarang, harga promosi terhad je!'",
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
    "Aku baru sedar satu benda pasal _________... selama ni aku buat salah.",
    "Kenapa ada orang _________ walaupun _________?",
    "Ada satu benda pasal _________ aku wish aku tahu awal...",
    "Macam mana _________ boleh bagi _________?",
    "Apa sebenarnya yang orang _________ buat berbeza dalam _________?",
  ],
  story_based: [
    "Dulu aku pun _________... sampai satu hari aku sedar _________.",
    "Aku pernah _________ lama... sampai aku ubah satu benda ni: _________.",
    "Semua berubah bila aku start _________.",
    "Aku ingat _________... rupanya _________.",
    "Aku hampir _________... tapi _________ ubah semua.",
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
DIALOG TONE — GAYA BAHASA SANTAI:
- Write in natural Malaysian conversational Bahasa Melayu. Santai, friendly, tapi masih teratur.
- JANGAN guna bahasa skema/baku. Tulis macam kawan bercakap.
- Use sapaan yang sesuai: "korang", "sis", "babe", "bestie" for younger audience.
- Use emoji sparingly to add emotion: 😩 😍 🔥 ✅ 💪
- NEVER sound like a textbook or formal announcement.
- Seeding produk secara natural — jangan paksa atau hard sell.
- Prioritize: Emotion → Story → Product → Conversion.
- Dialog mesti mudah di sebut untuk AI voice — ayat pendek, direct, natural flow.

CRITICAL WORD LIMIT PER SCENE:
- Each scene generates ONE ~8 second video clip.
- Dialog per scene MUST NOT exceed 15-20 words (roughly 8 seconds of speech).
- Be CONCISE. Every word must carry meaning. Cut filler words ruthlessly.
- If the message needs more words, simplify it — don't exceed the limit.
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
