import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const getAI = () => {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Please check your secrets.");
  }
  return new GoogleGenAI({ apiKey });
};

const parseDataUrl = (dataUrl: string) => {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (matches) {
    return { mimeType: matches[1], data: matches[2] };
  }
  return { mimeType: 'image/jpeg', data: dataUrl };
};

const cleanJson = (text: string) => {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
};

export const generateTikTokScript = async (productName: string, additionalContext: string, personaType: string, genre: string, images: string[], numScenes: number = 5) => {
  const ai = getAI();
  
  let genreInstruction = "";
  switch (genre) {
    case 'comedy':
      genreInstruction = "GENRE: COMEDY/SKETCH. Use humor, exaggerated reactions, funny relatable situations. Tone: Playful, 'Masuk air'.";
      break;
    case 'educational':
      genreInstruction = "GENRE: EDUCATIONAL/TIPS. Focus on value, hacks, 'How-To', and facts. Tone: Helpful, Smart, Trustworthy.";
      break;
    case 'emotional':
      genreInstruction = "GENRE: EMOTIONAL/STORYTELLING. Focus on pain points, feelings, transformation. Tone: Soft, Touching, Relatable.";
      break;
    case 'hardsell':
      genreInstruction = "GENRE: HARD SELL/PROMO. High energy, fast cuts, focus on discounts, urgency and 'Buy Now'. Tone: Hype, Exciting.";
      break;
    case 'softsell':
      genreInstruction = "GENRE: SOFT SELL/LIFESTYLE. Storytelling first, product second. Subtle integration into daily life. Tone: Chill, aesthetic, genuine recommendation like a friend.";
      break;
    case 'pov':
      genreInstruction = "GENRE: POV (POINT OF VIEW). Relatable scenario starting with 'POV: ...'. Direct address to camera. Tone: Conversational, immersive, relatable situation.";
      break;
    case 'asmr':
      genreInstruction = "GENRE: ASMR/SATISFYING. Focus intensely on sounds (tapping, unboxing, applying), textures, and visual satisfaction. Minimal dialogue, high sensory details. Tone: Calm, mesmerizing.";
      break;
    case 'vlog':
      genreInstruction = "GENRE: VLOG/DAY IN LIFE. Documenting a routine where the product fits in naturally. 'A day with me' style. Tone: Casual, authentic, diary-style.";
      break;
  }

  const systemInstruction = `You are a Top Malaysian TikTok Content Creator. Create a high-converting video script in CASUAL BAHASA MALAYSIA (slang).
  
  GENRE: ${genre.toUpperCase()}
  ${genreInstruction}
  PERSONA: ${personaType}
  NUMBER OF SCENES: ${numScenes}
  
  Output JSON format:
  {
    "script_title": "Viral Title",
    "visual_dna": "Description of model appearance",
    "structure": [
      { "time": "0-3s", "stage": "HOOK", "script": "...", "visual_prompt_en": "Detailed visual description for AI image generation" },
      ... (exactly ${numScenes} scenes)
    ]
  }`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: `Product: ${productName}. Context: ${additionalContext}.` },
        ...images.slice(0, 1).map(img => {
          const { mimeType, data } = parseDataUrl(img);
          return { inlineData: { mimeType, data } };
        })
      ]
    },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          script_title: { type: Type.STRING },
          visual_dna: { type: Type.STRING },
          structure: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                stage: { type: Type.STRING },
                script: { type: Type.STRING },
                visual_prompt_en: { type: Type.STRING }
              },
              required: ["time", "stage", "script", "visual_prompt_en"]
            }
          }
        },
        required: ["script_title", "visual_dna", "structure"]
      }
    }
  });

  try {
    return JSON.parse(cleanJson(response.text || "{}"));
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", response.text);
    throw new Error("Gagal memproses skrip. Sila cuba lagi.");
  }
};

export const generateSceneImage = async (prompt: string, visualDna: string, productBase64: string, characterBase64?: string) => {
  const ai = getAI();
  
  const parts: any[] = [
    { text: `Generate a high-quality 9:16 vertical photo. SCENE: ${prompt}. MODEL DNA: ${visualDna}. STYLE: Cinematic, realistic, 8k.` }
  ];

  const product = parseDataUrl(productBase64);
  parts.push({ inlineData: { mimeType: product.mimeType, data: product.data } });

  if (characterBase64) {
    const character = parseDataUrl(characterBase64);
    parts.push({ inlineData: { mimeType: character.mimeType, data: character.data } });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: "9:16"
      }
    }
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (imagePart?.inlineData) {
    return `data:image/png;base64,${imagePart.inlineData.data}`;
  }
  return null;
};

