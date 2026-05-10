import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTextWithImages } from "@/lib/ai-client";
import { DIALOG_CTA_POOL } from "@/lib/prompt-templates";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

function pickSamples<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const REFERENCES_DIR = "/data/images/references";

const AVATAR_DNA: Record<string, string[]> = {
  woman_malay_hijab: [
    "A friendly 25-year-old Malay woman with a warm smile. Natural makeup look. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet.",
    "A cheerful 24-year-old Malay woman with dewy skin and subtle lip tint. Sweet and approachable girl-next-door energy. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet.",
    "A confident 27-year-old Malay woman with minimal gold jewelry. Clean, put-together modest fashion influencer vibe. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet.",
  ],
  woman_malay_freehair: [
    "A trendy 20-year-old Malay woman with bright eyes and an energetic smile. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet. Modern fashion-forward modest style with a youthful, approachable vibe.",
    "A stylish 21-year-old Malay woman with defined brows and a playful expression. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet. Cool streetwear-inspired modest look with a fun, confident energy.",
    "A vibrant 19-year-old Malay woman with a warm glow and a carefree smile. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet. Effortlessly trendy Y2K-inspired modest fashion with edgy, youthful attitude.",
  ],
  woman_malay_corporate: [
    "A professional 30-year-old Malay woman with a confident posture. Sophisticated and authoritative look. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe heels or flats, never bare feet.",
    "A poised 28-year-old Malay woman with minimal pearl stud earrings. Sharp, ambitious corporate leader energy. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe heels or flats, never bare feet.",
    "A polished 31-year-old Malay woman with reading glasses resting on her collar. Smart, trustworthy senior executive vibe. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe heels or flats, never bare feet.",
  ],
  woman_malay_elder: [
    "A warm 50-year-old Malay makcik with a gentle motherly smile and laugh lines. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe flats or socks, never bare feet. Kind and trustworthy auntie energy.",
    "A cheerful 55-year-old Malay woman with a round friendly face and reading glasses. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe flats or socks, never bare feet. Experienced, wise, and approachable.",
    "A graceful 48-year-old Malay woman with a calm, elegant demeanor. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe flats or socks, never bare feet. Mature beauty with a confident, nurturing presence.",
  ],
  man_malay_casual: [
    "A 26-year-old Malay man with a short textured crop haircut and a slight stubble. Wearing a fitted navy polo shirt and dark chinos. Relaxed and friendly boy-next-door vibe.",
    "A laid-back 24-year-old Malay man with a textured middle-part hairstyle. Clean-shaven with a warm, easygoing smile. Wearing an oversized earth-tone linen shirt. Chill creative-guy energy.",
    "A cool 27-year-old Malay man with a buzz cut and trimmed beard. Wearing a black henley shirt with rolled sleeves and slim olive cargo pants. Confident, put-together vibe.",
  ],
  man_malay_corporate: [
    "A sharp 32-year-old Malay man with a clean-shaven face. Professional and successful appearance.",
    "A distinguished 30-year-old Malay man with neatly combed side-parted hair and a trimmed goatee. Smart-casual corporate entrepreneur look.",
    "A polished 34-year-old Malay man with a clean fade haircut and frameless glasses. Modern tech-CEO sophisticated vibe.",
  ],
  woman_malay_student: [
    "A fresh-faced 20-year-old Malay university student with a bright curious smile. Hijabi, wearing a neat baju kurung casual, inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing sneakers or closed-toe flats, never bare feet. Youthful Gen Z energy.",
    "A bubbly 19-year-old Malay girl with round glasses and a playful grin. Hijabi, wearing a simple pastel baju kurung, inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing sneakers or closed-toe flats, never bare feet. Student budget-queen energy.",
    "A trendy 21-year-old Malay student with a minimalist aesthetic. Hijabi, wearing a simple baju kurung in clean pastel tones, inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing sneakers or closed-toe flats, never bare feet.",
  ],
  woman_malay_mother: [
    "A loving 30-year-old Malay young mother with a warm, nurturing smile. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe flats or socks, never bare feet. Practical and relatable busy-mom energy.",
    "A cheerful 28-year-old Malay ibu muda with gentle eyes and a soft laugh. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe flats or socks, never bare feet. Multitasking supermom vibe.",
    "A radiant 32-year-old Malay mother with a calm, confident demeanor. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe flats or socks, never bare feet. Organised, family-first energy.",
  ],
  woman_malay_beauty: [
    "A glamorous 24-year-old Malay beauty influencer with flawless dewy skin and soft glam makeup. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet.",
    "A polished 22-year-old Malay beauty creator with defined brows and glossy lips. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet.",
    "A radiant 26-year-old Malay beauty enthusiast with a natural glow-up look. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet.",
  ],
  woman_chinese_casual: [
    "A friendly 23-year-old Malay woman with bright eyes and a radiant smile. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet. Fresh, girl-next-door energy with a trendy modest fashion sense.",
    "A cheerful 25-year-old Malay woman with a soft warm glow and subtle lip tint. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet. Sweet and approachable with a modern modest style.",
    "A confident 27-year-old Malay woman with elegant posture and minimal gold jewelry. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe shoes or socks, never bare feet. Clean, put-together modest fashion influencer vibe.",
  ],
  woman_malay_homecook: [
    "A cheerful 35-year-old Malay suri rumah with a warm maternal smile, wearing a simple apron over her outfit. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe house shoes or socks, never bare feet. Homely, kitchen-expert energy.",
    "A skilled 33-year-old Malay home cook with flour-dusted apron and bright eyes. Hijabi, wearing inner sleeve stop below the wrist. Full modest coverage (no skin visible except face and fingers). Feet fully covered — wearing closed-toe house shoes or socks, never bare feet. Passionate foodie-mom vibe.",
    "A creative 30-year-old Malay woman in a cozy kitchen setting with neat hijab. Wearing inner sleeve stop below the wrist. Full modest coverage. Feet fully covered — wearing closed-toe house shoes or socks, never bare feet. Suri rumah content creator energy.",
  ],
  man_malay_elder: [
    "A wise 55-year-old Malay pakcik with a kind smile and a neatly trimmed silver beard. Wearing a casual batik shirt or plain baju melayu. Warm, experienced, trustworthy elder energy.",
    "A friendly 58-year-old Malay man with greying temples and a gentle demeanor. Casual relaxed home outfit. Dependable, respected community-elder vibe.",
    "A sturdy 52-year-old Malay pakcik with a broad smile and calm confident presence. Smart-casual short-sleeve shirt. Practical, no-nonsense senior homeowner energy.",
  ],
  man_malay_father: [
    "A responsible 32-year-old Malay young father with a short neat haircut and trimmed beard. Wearing a casual button-up shirt. Warm, dependable dad energy.",
    "A caring 30-year-old Malay ayah muda with a friendly face and clean-shaven look. Relaxed weekend-dad outfit with rolled sleeves. Hands-on, modern fatherhood vibe.",
    "A strong 34-year-old Malay father with a well-groomed beard and calm confident demeanor. Smart-casual polo shirt. Protective, reliable family-man energy.",
  ],
  couple_malay: [
    "A sweet Malay couple in their mid-20s. The woman is hijabi wearing a neat baju kurung casual, inner sleeve stop below the wrist, full modest coverage, feet fully covered with closed-toe shoes or socks. The man has a neat haircut and trimmed beard. Wholesome, in-love couple energy.",
    "An adorable Malay couple, both 26. She wears a pastel baju kurung with full modest coverage, inner sleeve stop below the wrist, feet fully covered with closed-toe shoes or socks. He has a textured crop and clean-shaven face. Sweet couple aesthetic.",
    "A trendy Malay couple in their late 20s. She is hijabi wearing a smart casual baju kurung, full modest coverage, inner sleeve stop below the wrist, feet fully covered with closed-toe shoes or socks. He sports a buzz cut with subtle stubble. Coordinated casual look.",
  ],
  hands_only: [
    "No face visible. Close-up of well-manicured feminine hands interacting with the product. Clean, aesthetic background. Satisfying ASMR-style product showcase.",
    "No face visible. Close-up of neat masculine hands demonstrating the product. Minimal props, clean surface. Focused product-demo energy.",
    "No face visible. Overhead shot of hands arranging the product on a clean surface. Aesthetic flatlay style with soft natural lighting.",
  ],
  product_only: [
    "No human model. Focus entirely on the product. High-end product photography style with aesthetic home props and clean backgrounds.",
    "No human model. Showcase the product in a beautifully styled room setting. Premium editorial aesthetic with subtle shadows.",
    "No human model. Display the product against a real Malaysian home interior. Minimalist editorial product photography style.",
  ],
};

function pickAvatarDna(avatarId: string): string {
  const variants = AVATAR_DNA[avatarId] || AVATAR_DNA.woman_malay_hijab;
  return variants[Math.floor(Math.random() * variants.length)];
}

async function loadProductImage(
  customImage: string,
  productImages: string[],
): Promise<{ base64: string; mimeType: string } | null> {
  if (customImage) {
    try {
      const imgPath = join(REFERENCES_DIR, customImage);
      if (existsSync(imgPath)) {
        const buf = await readFile(imgPath);
        const ext = customImage.split(".").pop()?.toLowerCase();
        const mimeType =
          ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        console.log(`[home-video] Loaded uploaded image: ${customImage} (${Math.round(buf.length / 1024)}KB)`);
        return { base64: buf.toString("base64"), mimeType };
      }
    } catch (e) {
      console.warn("[home-video] Could not read uploaded image:", e);
    }
  }

  if (productImages[0]) {
    try {
      const res = await fetch(productImages[0]);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const mimeType = res.headers.get("content-type") || "image/jpeg";
        console.log(`[home-video] Fetched catalog image (${Math.round(buf.length / 1024)}KB)`);
        return { base64: buf.toString("base64"), mimeType };
      }
    } catch (e) {
      console.warn("[home-video] Could not fetch catalog image:", e);
    }
  }

  return null;
}

function buildSceneStructure(sceneCount: number): string {
  const hookRule = `Scene 1 dialog MUST be 2-part: (1) state the audience's pain point, (2) immediately tease the product as the solution. Example structure: "Bilik sempit tak tahu nak letak mana? Cuba rak 3 tier ni!" or "Penat tengok bilik bersepah? Ini lah penyelesaian dia!" — NEVER just state the problem alone without the solution tease.`;

  if (sceneCount === 2) {
    return `SCENES (2 scenes × 8s = 16s total):
- Scene 1: Hook — wide shot. ${hookRule}
- Scene 2: USP + CTA — wide shot. State the main benefit first (1 sentence), then immediately follow with a promo-style call to action and price. Dialog MUST follow this order: USP → CTA.`;
  }
  if (sceneCount === 3) {
    return `SCENES (3 scenes × 8s = 24s total):
- Scene 1: Hook — wide shot. ${hookRule}
- Scene 2: USP + Detail — mid shot. Highlight main benefit while showing product quality/material.
- Scene 3: USP + CTA — wide shot. Briefly restate the key benefit, then give a promo-style call to action with price.`;
  }
  if (sceneCount === 5) {
    return `SCENES (5 scenes × 8s = 40s total):
- Scene 1: Hook — wide shot. ${hookRule}
- Scene 2: USP 1 — mid shot. First key benefit, model interacting with furniture.
- Scene 3: USP 2 — mid shot. Second key benefit, different interaction or angle.
- Scene 4: Detail — close-up. Show product quality, material, construction, or a specific feature.
- Scene 5: USP + CTA — wide shot. One-line USP reminder, then promo-style call to action with price.`;
  }
  // Default: 4 scenes
  return `SCENES (4 scenes × 8s = 32s total):
- Scene 1: Hook — wide shot. ${hookRule}
- Scene 2: USP — mid shot. Main benefit, model interacting naturally with furniture.
- Scene 3: Detail — close-up. Show product quality, material, construction, or a specific feature.
- Scene 4: USP + CTA — wide shot. One-line USP reminder, then promo-style call to action with price.`;
}

function buildGenreInstruction(genre: string): string {
  const genres: Record<string, string> = {
    softsell:
      "GENRE: SOFT SELL / LIFESTYLE. Create a warm, aspirational feel. Show how the furniture transforms and elevates the home. Subtle selling — focus on the lifestyle benefit, not the price pitch.",
    hardsell:
      "GENRE: HARD SELL. Be direct and urgent. Lead with price value, quality guarantee, and urgency (limited stock, best price). Every scene pushes toward the purchase decision.",
    lifestyle:
      "GENRE: LIFESTYLE. Create an aspirational day-in-the-home feel. Show real home moments — morning routines, family time, cozy evenings — naturally featuring the furniture. Product is part of the story, not the star.",
    educational:
      "GENRE: EDUCATIONAL / HOW-TO. Teach the audience something useful — how to organise their space, how to style a room, how to maximise small spaces. The furniture is the solution that enables the tip.",
  };
  return genres[genre] || genres.softsell;
}

function buildPrompt(params: {
  title: string;
  description: string;
  price: string;
  usp: string;
  targetAudience: string;
  avatarDna: string;
  genre: string;
  location?: string;
  sceneCount: number;
  hasImage: boolean;
  hasModelImage: boolean;
}): string {
  const {
    title,
    description,
    price,
    usp,
    targetAudience,
    avatarDna,
    genre,
    location,
    sceneCount,
    hasImage,
    hasModelImage,
  } = params;

  const ctaExamples = pickSamples(DIALOG_CTA_POOL, 3).join('"\n  "');

  return `You are a Top Malaysian TikTok Content Creator & Expert Video Director specialising in HOME & FURNITURE products.
Create a high-converting video script in CASUAL BAHASA MALAYSIA (slang) for Google Flow AI image generation.

${buildGenreInstruction(genre)}

PRODUCT INFO:
Name: ${title}
Description: ${description || "See product image"}
Price: ${price || "Check link in bio"}
USP / Key Benefits: ${usp || "See product image"}
Target Audience: ${targetAudience || "Malaysian homeowners and renters"}

AVATAR (model in every scene):
${avatarDna}

${
  hasImage
    ? `IMPORTANT — PRODUCT IMAGE ANALYSIS:
A product image has been provided inline. ANALYZE it carefully to determine:
- furnitureType: the exact type (shelf / rack / bed / wardrobe / table / chair / sofa / trolley / kitchen trolley / plant stand / shoe rack / other)
- style: design aesthetic (modern / industrial / minimalist / rustic / Scandinavian / other)
- colorPalette: exact main colors visible in the image
- material: primary construction (metal / wood / fabric / rattan / plastic / mixed)
- recommendedRooms: up to 3 rooms this furniture naturally belongs in (bedroom / study / living room / kitchen / hallway / patio / bathroom)

Use this analysis to inform room context and background details in every image prompt.
DO NOT invent product features not visible in the image.`
    : `Analyze the product name and description to determine furniture type, style, and suitable rooms.`
}

${buildSceneStructure(sceneCount)}

SCENE VARIETY RULES:
- Default: all scenes in the SAME room, different angles and interactions (wide → mid → close-up → wide)
- Exception: if the furniture suits multiple rooms (rack, shelf, trolley, plant stand), you MAY vary the room across scenes to show versatility — e.g. bedroom, study, patio
- AI decides the best approach based on furniture type

BACKGROUND RULES — CRITICAL (must look like a real Malaysian home, NOT a studio):
- Real ceramic tiles or timber flooring typical of Malaysian homes
- Wooden or aluminium window frames with sheer white curtains, natural daylight streaming in
- Typical Malaysian home details: potted plants on floor or windowsill, framed family photos on walls, rattan furniture accents
- Warm, lived-in feel — NOT a showroom, NOT plain white walls, NOT generic interiors
- Lighting: natural window light only — NOT ring light, NOT studio flash, NOT artificial spot lighting
${location ? `
PRODUCT LOCATION CONSTRAINT (CRITICAL):
- The product MUST be placed in: ${location}
- ALL scenes MUST be set in this location. Do not place the product in any other room or area.
- The roomContext for EVERY scene MUST reflect "${location}".
- Do NOT use recommendedRooms analysis to override this — the user has specified the exact location.` : ''}

MUSLIMAH COMPLIANCE (CRITICAL — applies to ALL women models):
- Women MUST wear inner sleeves extending below the wrist at all times — no wrist or arm skin visible
- Women's feet MUST be covered at all times — wearing closed-toe shoes, flats, heels, sneakers, or socks
- NEVER show bare feet, open-toed sandals, ankles, wrists, or arms on any women model
- This applies to ALL scenes including sitting, lounging, and close-up shots
- Model is ALWAYS inside the house — she MUST wear room shoes (house slippers) in EVERY scene. Never bare feet, never outdoor shoes, never just socks.
- Every image prompt for women MUST include the phrase "wearing inner sleeve stop below the wrist" and "wearing room shoes (house slippers)"

MODEL INTERACTION RULES:
- Model stands beside, gestures toward, or naturally interacts with the furniture
- Match interaction to furniture type:
  * Shelf / rack / bookshelf: arranging items on tiers, pointing to compartments, loading folded clothes or shoes or plants
  * Bed / daybed: sitting on edge, smoothing bedsheet, lounging naturally with a pillow
  * Sofa / rocking chair: seated comfortably, smiling naturally, gesturing at the piece
  * Dining / study table: placing items on surface, wiping it, sitting and working/eating
  * Wardrobe / cabinet: opening doors, hanging clothes, showing organised interior
  * Trolley / kitchen cart: pushing it slightly, placing items on shelves, showing mobility
  * Plant stand: placing a potted plant on it, adjusting decor around it
- Model NEVER wears the furniture. No clothing or wearable logic applies.
- Model faces camera naturally — warm, approachable, NOT stiff or catalogue-posed
- Women models MUST ALWAYS wear baju kurung — casual or smart casual baju kurung only. No other outfit type is allowed.

IMAGE PROMPT RULES (for Google Flow):
- Always 9:16 vertical composition
- Always include: "real Malaysian home interior, natural window light"
- For close-up scenes: describe what is being shown (e.g. "close-up of the metal frame joint, hands gripping the bar to show sturdiness")
- Append to every image prompt: "9:16 vertical composition, real Malaysian home interior, natural window light, authentic UGC smartphone look"

MODEL CONSISTENCY RULE (CRITICAL — applies to ALL scenes):
- Scene 1 MUST include an explicit outfit anchor: choose ONE specific baju kurung color and style and write it as a short phrase, e.g. "wearing a soft teal baju kurung casual" or "wearing a dusty rose smart-casual baju kurung"
- Every Scene 2, 3, 4 image prompt MUST copy that exact outfit phrase from Scene 1 verbatim — do NOT change the color, style, or wording in any subsequent scene
- This ensures the model looks identical across all scenes. Changing even one word of the outfit phrase causes the AI image generator to change the clothing.

REFERENCE IMAGE USAGE (CRITICAL):
${hasModelImage
  ? `- A MODEL REFERENCE PHOTO is uploaded to Google Flow. In EVERY scene's image prompt, include the model's age and general type from the AVATAR description above, then append "from image reference" — e.g. "A friendly 25-year-old Malay woman in hijab from image reference, seated on..." or "A warm 50-year-old Malay makcik from image reference, standing beside...". The age MUST always be included so the image generator knows the character's age range. DO NOT re-describe face features or skin tone — the reference photo covers those. ALWAYS include the outfit anchor phrase (from MODEL CONSISTENCY RULE above) in every scene regardless.`
  : `- No model reference photo. Describe the model fully in Scene 1 using the AVATAR details above including exact age and the outfit anchor phrase. Scenes 2+ must copy the exact outfit anchor phrase from Scene 1 and repeat the age and general description.`
}
${hasImage
  ? `- A PRODUCT REFERENCE PHOTO is uploaded to Google Flow. In EVERY scene's image prompt, describe the furniture briefly and append "from image reference" directly after — e.g. "a 3-tier black metal rack from image reference, placed in...". Do NOT re-invent the product details — match what is visible in the reference photo.`
  : `- No product reference photo. Describe the furniture accurately using the product name and analysis. Be specific about color, material, and form.`
}
${hasModelImage && hasImage
  ? `- TWO reference images are provided (model + product). Both MUST be referenced in every image prompt using "from image reference" as shown above.`
  : ``
}

DIALOG RULES:
- Casual Bahasa Melayu slang, 8-22 words per scene (minimum 8 — shorter causes video generation errors)
- Use "korang" not "anda", "best" not "bagus", "memang" for emphasis, "je" not "sahaja"
- PROMOTER TONE — speak TO the audience directly, not personal testimony
- Hook (Scene 1) dialog is ALWAYS 2-part: pain point → product solution tease. NEVER end on the problem alone.

CTA DIALOG RULES (CRITICAL — applies to the last/CTA scene):
- FORBIDDEN: "Check link kat bio", "Link kat bio", "Klik link", "DM kami", "Pergi website" — NEVER use these. They do not work in TikTok Shop videos.
- MUST follow PROMO pattern: acknowledge an ongoing promotion → state price if known → direct grab action
- Use tone reference from these samples (do NOT copy directly — adapt to the furniture product):
  "${ctaExamples}"
- Always end with urgency or scarcity signal: "grab sekarang", "jangan lepas", "stok limited", "promo jap je"

TIKTOK CAPTION:
- 2-3 sentences in casual BM, 80-120 characters
- Include price if known
- End with a question or CTA

HASHTAGS:
- 8-12 relevant hashtags in a single string: mix product-specific + home niche (#homedecor #homeorganization #perabotmurah #rumahcantik #homemalaysia) + trending BM tags (#viraltiktok #tiktokshopmalaysia)

HOOK TITLE:
- Max 6 words, ALL CAPS, punchy — for the video's text overlay card
- Example: "RAK MURAH BILIK JADI CANTIK!" or "KATIL BARU BILIK AUTO UPGRADE!"

VIDEO PROMPT RULES (CRITICAL — furniture videos):
- DEFAULT: static camera, NO movement — describe the scene as a still, locked-off shot. e.g. "Static shot. Model stands beside the rack, smiling at camera."
- Movement is ONLY allowed when the model performs a specific physical action on the furniture:
  * Opening/closing a drawer or cabinet door → describe the hand action, camera stays static
  * Pulling out a shelf or tray → describe the pull motion
  * Sitting down onto a sofa or bed → describe the sit motion
  * Pushing a trolley → describe the push motion
- Camera itself MUST remain static in ALL scenes — no pan, no zoom, no dolly, no tilt, no handheld shake
- Write videoPrompt as: "[Camera: static locked-off] [Model action if any]. [Scene description]."
- Example (no action): "Camera: static locked-off. Model stands beside the 3-tier rack, smiling warmly at camera."
- Example (with action): "Camera: static locked-off. Model opens the top drawer slowly, revealing the interior."

Return ONLY valid JSON — no markdown fences, no extra text:
{
  "analysis": {
    "furnitureType": "...",
    "style": "...",
    "colorPalette": ["..."],
    "material": "...",
    "recommendedRooms": ["..."]
  },
  "hookTitle": "...",
  "tiktokCaption": "...",
  "tiktokHashtags": "...",
  "scenes": [
    {
      "sceneNumber": 1,
      "shotType": "wide | mid | close-up",
      "roomContext": "bedroom | study | living room | kitchen | hallway | patio",
      "dialog": "BM casual dialog...",
      "imagePrompt": "Full detailed image prompt for Google Flow...",
      "videoPrompt": "Camera: static locked-off. [Model action if any]. [Scene description].",
      "overlayText": "Short overlay caption max 6 words"
    }
  ]
}`;
}

interface HomeVideoScene {
  sceneNumber: number;
  shotType: string;
  roomContext: string;
  dialog: string;
  imagePrompt: string;
  videoPrompt: string;
  overlayText: string;
}

interface AppearanceSettings {
  enableHook: boolean;
  hookBgColor: string;
  hookTextColor: string;
  hookFontSize: number;
  overlayFontSize: number;
  hookStyle?: "background" | "stroke";
  hookPosition?: "top" | "center" | "bottom";
  hookStrokeTextColor?: string;
  hookStrokeBorderColor?: string;
  hookStrokeBorderW?: number;
}

const DEFAULT_APPEARANCE: AppearanceSettings = {
  enableHook: true,
  hookBgColor: "1a1a2e",
  hookTextColor: "FFFFFF",
  hookFontSize: 48,
  overlayFontSize: 28,
  hookStyle: "background",
  hookPosition: "top",
  hookStrokeTextColor: "FFFFFF",
  hookStrokeBorderColor: "000000",
  hookStrokeBorderW: 8,
};

// Append dialog to videoPrompt so Google Flow renders the correct spoken text
function attachDialog(scenes: HomeVideoScene[]): HomeVideoScene[] {
  return scenes.map((s) => ({
    ...s,
    videoPrompt: s.dialog
      ? `${s.videoPrompt} Dialog: "${s.dialog.replace(/"/g, "'")}"`
      : s.videoPrompt,
  }));
}

async function createVideoJob(
  baseUrl: string,
  productId: string,
  genre: string,
  hookTitle: string,
  tiktokCaption: string,
  tiktokHashtags: string,
  scenes: HomeVideoScene[],
  productImage: string,
  appearance: AppearanceSettings = DEFAULT_APPEARANCE,
  refImages: string[] = [],
) {
  const allScenePrompts = scenes.map((s) => ({
    imagePrompt: s.imagePrompt,
    videoPrompt: s.videoPrompt,
  }));

  const overlays = scenes.map((s) =>
    s.overlayText ? { text: s.overlayText, position: "bottom" } : null,
  );

  const overlayConfig = JSON.stringify({
    hookTitle: appearance.enableHook ? hookTitle : "",
    hookSubtitle: "",
    hookBgColor: appearance.hookBgColor,
    hookTextColor: appearance.hookTextColor,
    hookFontSize: appearance.hookFontSize,
    overlays,
    overlayFontSize: appearance.overlayFontSize,
    hookStyle: appearance.hookStyle ?? "background",
    hookPosition: appearance.hookPosition ?? "top",
    hookStrokeTextColor: appearance.hookStrokeTextColor ?? "FFFFFF",
    hookStrokeBorderColor: appearance.hookStrokeBorderColor ?? "000000",
    hookStrokeBorderW: appearance.hookStrokeBorderW ?? 8,
  });

  return fetch(`${baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId,
      videoType: genre,
      userImagePrompt: scenes[0]?.imagePrompt || "",
      userVideoPrompt: scenes[0]?.videoPrompt || "",
      tiktokCaption: tiktokCaption || "",
      tiktokHashtags: tiktokHashtags ? tiktokHashtags.split(" ") : [],
      referenceImage: productImage || undefined,
      referenceImages: refImages.length > 0 ? refImages : undefined,
      scenePrompts: JSON.stringify(allScenePrompts),
      overlayConfig,
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    productId,
    customProduct,          // { title, description, price?, usp?, targetAudience? }
    customImage = "",
    customUsp = "",         // optional USP override (user-entered in left panel)
    avatar = "woman_malay_hijab",
    genre = "softsell",
    location = "",
    sceneCount = 4,
    preview = true,
    editedContent,
    appearanceSettings,
    forceAutoQueue = false,
  } = body;

  if (!productId && !customProduct?.title) {
    return NextResponse.json(
      { error: "Either productId or customProduct.title is required" },
      { status: 400 },
    );
  }

  // Resolve product data — from DB or from inline custom product
  let productData: {
    id: string | null;
    title: string;
    description: string;
    price: string;
    usp: string;
    targetAudience: string;
    avatarId: string | null;
    images: string;
  };

  if (productId) {
    const dbProduct = await prisma.product.findUnique({ where: { id: productId } });
    if (!dbProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    productData = {
      id: dbProduct.id,
      title: dbProduct.title,
      description: dbProduct.description || "",
      price: dbProduct.price || "",
      usp: dbProduct.usp || "",
      targetAudience: dbProduct.targetAudience || "",
      avatarId: dbProduct.avatarId || null,
      images: dbProduct.images || "[]",
    };
  } else {
    productData = {
      id: null,
      title: customProduct.title,
      description: customProduct.description || "",
      price: customProduct.price || "",
      usp: customProduct.usp || "",
      targetAudience: customProduct.targetAudience || "",
      avatarId: null,
      images: "[]",
    };
  }

  const [geminiKeySetting, appearanceSetting, avatarImgSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "gemini_api_key" } }),
    prisma.setting.findUnique({ where: { key: "home_video_settings" } }),
    prisma.setting.findUnique({ where: { key: "avatar_images" } }),
  ]);

  const apiKey = geminiKeySetting?.value || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured. Set it in Settings." },
      { status: 400 },
    );
  }

  // Merge DB appearance settings with any override from request body
  let dbAppearance: Partial<AppearanceSettings> = {};
  if (appearanceSetting?.value) {
    try { dbAppearance = JSON.parse(appearanceSetting.value); } catch {}
  }
  const appearance: AppearanceSettings = {
    ...DEFAULT_APPEARANCE,
    ...dbAppearance,
    ...(appearanceSettings || {}),
  };

  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Resolve avatar: user's explicit selection takes precedence over product's stored avatarId
  const avatarId = avatar || productData.avatarId || "woman_malay_hijab";
  let effectiveModelImage = body.modelImage || "";
  if (!effectiveModelImage && avatarId !== "product_only" && avatarId !== "hands_only") {
    try {
      const avatarImagesMap = avatarImgSetting?.value
        ? (JSON.parse(avatarImgSetting.value) as Record<string, string>)
        : {};
      effectiveModelImage = avatarImagesMap[avatarId] || "";
    } catch {}
  }
  // referenceImages: model image goes here; product image goes in referenceImage field
  const referenceImages: string[] = effectiveModelImage ? [effectiveModelImage] : [];

  let productImages: string[] = [];
  try {
    productImages = JSON.parse(productData.images || "[]");
  } catch {}
  // Custom products have no catalog images — only use the uploaded image
  const effectiveProductImage = customImage || productImages[0] || "";

  // ─── CONFIRM MODE: editedContent provided — skip AI, create job from edited scenes ───
  if (editedContent) {
    const { hookTitle, tiktokCaption, tiktokHashtags, scenes } = editedContent;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json(
        { error: "editedContent.scenes is required" },
        { status: 400 },
      );
    }

    try {
      const jobRes = await createVideoJob(
        baseUrl,
        productData.id || "",
        genre,
        hookTitle || "",
        tiktokCaption || "",
        tiktokHashtags || "",
        scenes,
        effectiveProductImage,
        appearance,
        referenceImages,
      );
      const jobData = await jobRes.json();
      if (!jobRes.ok) {
        return NextResponse.json(
          { error: jobData.error || "Job creation failed" },
          { status: 500 },
        );
      }
      return NextResponse.json({ jobId: jobData.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: `Job creation failed: ${msg}` }, { status: 500 });
    }
  }

  // ─── GENERATE MODE: analyze image + generate scenes ───
  const avatarDna = pickAvatarDna(avatarId);

  const imageData = await loadProductImage(customImage, productImages);

  const prompt = buildPrompt({
    title: productData.title,
    description: productData.description,
    price: productData.price,
    usp: customUsp.trim() || productData.usp,
    targetAudience: productData.targetAudience,
    avatarDna,
    genre,
    location: location || undefined,
    sceneCount: Number(sceneCount),
    hasImage: !!imageData,
    hasModelImage: !!effectiveModelImage,
  });

  let rawText: string;
  try {
    rawText = await generateTextWithImages(
      prompt,
      imageData ? [imageData] : [],
      {
        provider: "gemini",
        geminiApiKey: apiKey,
        temperature: 1.0,
        responseFormat: "json",
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 500 });
  }

  let aiData: {
    analysis?: {
      furnitureType?: string;
      style?: string;
      colorPalette?: string[];
      material?: string;
      recommendedRooms?: string[];
    };
    hookTitle?: string;
    tiktokCaption?: string;
    tiktokHashtags?: string;
    scenes?: HomeVideoScene[];
  };

  try {
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    aiData = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON. Please try again." },
      { status: 500 },
    );
  }

  if (!aiData.scenes?.length) {
    return NextResponse.json({ error: "AI returned no scenes. Please try again." }, { status: 500 });
  }

  // Append dialog to videoPrompt so Google Flow renders the correct spoken text
  const scenes = attachDialog(aiData.scenes);

  if (preview && !forceAutoQueue) {
    return NextResponse.json({
      preview: true,
      analysis: aiData.analysis || {},
      hookTitle: aiData.hookTitle || "",
      tiktokCaption: aiData.tiktokCaption || "",
      tiktokHashtags: aiData.tiktokHashtags || "",
      scenes,
      effectiveProductImage,
      appearance,
    });
  }

  // Direct queue mode (preview=false)
  try {
    const jobRes = await createVideoJob(
      baseUrl,
      productData.id || "",
      genre,
      aiData.hookTitle || "",
      aiData.tiktokCaption || "",
      aiData.tiktokHashtags || "",
      scenes,
      effectiveProductImage,
      appearance,
      referenceImages,
    );
    const jobData = await jobRes.json();
    if (!jobRes.ok) {
      return NextResponse.json(
        { error: jobData.error || "Job creation failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ jobId: jobData.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Job creation failed: ${msg}` }, { status: 500 });
  }
}
