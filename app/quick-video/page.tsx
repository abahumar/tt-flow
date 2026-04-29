"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap,
  Loader2,
  CheckCircle2,
  ShoppingBag,
  Settings,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  User,
  AlertCircle,
  RefreshCw,
  Upload,
  X,
  ImageIcon,
  Pencil,
  Check,
} from "lucide-react";
import Link from "next/link";

interface Product {
  id: string;
  url: string;
  title: string;
  description: string;
  price: string;
  shopName: string;
  images: string;
  usp: string;
  targetAudience: string;
  avatarId: string;
  miniUsps: string;
  specialInstruction: string;
}

interface QuickResult {
  jobId: string;
  scenes: number;
  hookTitle: string;
  format: string;
  genre: string;
  avatar: string;
  variationAngle?: string;
  hookStyle?: string;
  matrixCombo?: string;
  matrixPhase?: number;
}

interface MatrixData {
  exists: boolean;
  matrix: {
    targets: string[];
    scenarios: string[];
    usps: string[];
    usedCombos: string[];
    phase: number;
    mode: string;
  } | null;
  nextCombo: {
    combo: string;
    target: string;
    scenario: string;
    usp: string;
    phase: number;
  } | null;
  stats: {
    phase1Total: number;
    phase2Total: number;
    total: number;
    used: number;
    remaining: number;
  };
}

interface PreviewData {
  hookTitle: string;
  tiktokCaption: string;
  variations: {
    imagePrompt?: string;
    videoPrompt?: string;
    tiktokProductName?: string;
    tiktokDescription?: string;
    tiktokCaption?: string;
    tiktokHashtags?: string[];
    overlayText?: string;
    overlayPosition?: string;
  }[];
  format: string;
  genre: string;
  avatar: string;
  variationAngle?: string;
  hookStyle?: string;
  matrixCombo?: string | null;
  matrixPhase?: number | null;
}

interface PresetConfig {
  avatar: string;
  genre: string;
  format: string;
  sceneCount: number;
  includeDialog: boolean;
  enableHook: boolean;
  enableOverlay: boolean;
  hookBgColor: string;
  hookTextColor: string;
  hookFontSize: number;
  overlayFontSize: number;
  temperature: number;
}

const DEFAULT_PRESET: PresetConfig = {
  avatar: "woman_malay_hijab",
  genre: "softsell",
  format: "short",
  sceneCount: 4,
  includeDialog: true,
  enableHook: true,
  enableOverlay: true,
  hookBgColor: "E91E63",
  hookTextColor: "FFFFFF",
  hookFontSize: 48,
  overlayFontSize: 28,
  temperature: 1.5,
};

const AVATARS: Record<string, string> = {
  woman_malay_hijab: "🧕 Wanita Melayu (Bertudung)",
  woman_malay_freehair: "👩 Wanita Melayu (Moden)",
  woman_malay_corporate: "👩‍💼 Wanita Melayu (Korporat)",
  woman_malay_elder: "👵 Makcik Melayu (50+)",
  man_malay_casual: "👨 Lelaki Melayu (Casual)",
  man_malay_corporate: "👨‍💼 Lelaki Melayu (Korporat)",
  man_malay_elder: "👴 Pakcik Melayu (50+)",
  product_only: "📦 Produk Sahaja",
  woman_malay_student: "🎓 Wanita Melayu (Student/Gen Z)",
  woman_malay_mother: "👩‍👧 Ibu Muda Melayu",
  woman_malay_beauty: "💄 Beauty Influencer",
  woman_chinese_casual: "👩 Wanita Cina (Casual)",
  woman_malay_homecook: "🍳 Suri Rumah / Home Cook",
  man_malay_father: "👨‍👦 Ayah Muda",
  couple_malay: "💑 Pasangan Melayu (Couple)",
  hands_only: "🤲 Tangan Sahaja (Hands Only)",
};

const GENRES: Record<string, string> = {
  softsell: "Soft Sell / Lifestyle",
  hardsell: "Hard Sell / Promo",
  comedy: "Comedy / Sketch",
  educational: "Educational / Tips",
  emotional: "Emotional / Storytelling",
  pov: "POV (Point of View)",
  asmr: "ASMR / Satisfying",
  review: "Review Style",
  unboxing: "Unboxing Style",
};

const FORMATS: Record<string, string> = {
  mini: "🔥 Mini (8s+8s) — 2 scenes",
  super_short: "⚡ Super Short (8s) — 3 scenes",
  short: "🎬 Short (20s) — 4 scenes",
  complete: "🎥 Complete (40s) — 5 scenes",
};

const FORMAT_SCENES: Record<string, number> = {
  mini: 2,
  super_short: 3,
  short: 4,
  complete: 5,
};

export default function QuickVideoPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, QuickResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreset, setShowPreset] = useState(false);
  const [preset, setPreset] = useState<PresetConfig>(DEFAULT_PRESET);
  const [savingPreset, setSavingPreset] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(true);

  // Tiga Segi content matrix per product
  const [matrices, setMatrices] = useState<Record<string, MatrixData>>({});
  const [generatingMatrix, setGeneratingMatrix] = useState<string | null>(null);

  // Preview edit state per product
  const [previews, setPreviews] = useState<Record<string, PreviewData>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  // Custom image per product (overrides product scraped image as reference)
  const [customImages, setCustomImages] = useState<
    Record<string, { preview: string; filename: string }>
  >({});
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  // Global model image (custom avatar/model photo)
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelFilename, setModelFilename] = useState("");
  const [uploadingModel, setUploadingModel] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // Avatar images from Settings
  const [avatarImages, setAvatarImages] = useState<Record<string, string>>({});

  // Mini USP editor state per product
  const [uspEdits, setUspEdits] = useState<Record<string, string>>({});
  const [savingUsp, setSavingUsp] = useState<string | null>(null);
  const [specialInstructionEdits, setSpecialInstructionEdits] = useState<Record<string, string>>({});
  const [savingSpecialInstruction, setSavingSpecialInstruction] = useState<string | null>(null);

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.filename;
  };

  const handleCustomImageUpload = async (productId: string, file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) return;
    if (file.size > 10 * 1024 * 1024) return;

    setUploadingImage(productId);
    try {
      const filename = await uploadFile(file);
      setCustomImages((prev) => ({
        ...prev,
        [productId]: {
          preview: URL.createObjectURL(file),
          filename,
        },
      }));
    } catch {
      // ignore
    } finally {
      setUploadingImage(null);
    }
  };

  const clearCustomImage = (productId: string) => {
    setCustomImages((prev) => {
      const next = { ...prev };
      if (next[productId]?.preview)
        URL.revokeObjectURL(next[productId].preview);
      delete next[productId];
      return next;
    });
  };

  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) return;
    setModelFile(file);
    setModelPreview(URL.createObjectURL(file));
    setModelFilename("");
    setUploadingModel(true);
    try {
      const fn = await uploadFile(file);
      setModelFilename(fn);
    } catch {
      // ignore
    } finally {
      setUploadingModel(false);
    }
    e.target.value = "";
  };

  const clearModelImage = () => {
    setModelFile(null);
    if (modelPreview) URL.revokeObjectURL(modelPreview);
    setModelPreview(null);
    setModelFilename("");
  };

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    const prods = await res.json();
    setProducts(prods);
    setLoading(false);
    // Seed USP and special instruction edit state from saved product values
    const initialUsps: Record<string, string> = {};
    const initialInstructions: Record<string, string> = {};
    for (const p of prods) {
      initialUsps[p.id] = p.miniUsps || "";
      initialInstructions[p.id] = p.specialInstruction || "";
    }
    setUspEdits(initialUsps);
    setSpecialInstructionEdits(initialInstructions);
    // Load matrices for all products
    for (const p of prods) {
      fetch(`/api/products/${p.id}/matrix`)
        .then((r) => r.json())
        .then((data) => {
          if (data.exists) setMatrices((m) => ({ ...m, [p.id]: data }));
        })
        .catch(() => {});
    }
  }, []);

  const handleSaveUsp = async (productId: string) => {
    const text = uspEdits[productId] ?? "";
    setSavingUsp(productId);
    await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ miniUsps: text }),
    });
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, miniUsps: text } : p)),
    );
    setUspEdits((prev) => ({ ...prev, [productId]: text }));
    setSavingUsp(null);
  };

  const handleSaveSpecialInstruction = async (productId: string) => {
    const text = specialInstructionEdits[productId] ?? "";
    setSavingSpecialInstruction(productId);
    await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialInstruction: text }),
    });
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, specialInstruction: text } : p)),
    );
    setSavingSpecialInstruction(null);
  };

  // Sync saved miniUsps from products into uspEdits when products load or change
  useEffect(() => {
    setUspEdits((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const p of products) {
        if (p.miniUsps && !updated[p.id]) {
          updated[p.id] = p.miniUsps;
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [products]);

  const handleGenerateMatrix = async (
    productId: string,
    mode: "gemini" | "parse",
  ) => {
    setGeneratingMatrix(productId);
    try {
      const res = await fetch(`/api/products/${productId}/matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (res.ok) {
        // Refetch to get full structure with nextCombo
        const getRes = await fetch(`/api/products/${productId}/matrix`);
        const fullData = await getRes.json();
        setMatrices((m) => ({ ...m, [productId]: fullData }));
      } else {
        setErrors((e) => ({ ...e, [productId]: data.error }));
      }
    } catch {
      setErrors((e) => ({ ...e, [productId]: "Matrix generation failed" }));
    } finally {
      setGeneratingMatrix(null);
    }
  };

  const handleResetMatrix = async (productId: string) => {
    await fetch(`/api/products/${productId}/matrix`, { method: "DELETE" });
    setMatrices((m) => {
      const next = { ...m };
      delete next[productId];
      return next;
    });
  };

  const loadPreset = useCallback(async () => {
    const res = await fetch("/api/settings");
    const settings: { key: string; value: string }[] = await res.json();
    const presetEntry = settings.find((s) => s.key === "quick_video_preset");
    if (presetEntry) {
      try {
        setPreset({ ...DEFAULT_PRESET, ...JSON.parse(presetEntry.value) });
      } catch {
        // ignore
      }
    }
    const geminiKey = settings.find((s) => s.key === "gemini_api_key");
    setHasGeminiKey(!!geminiKey?.value);
    // Load avatar images
    const avatarEntry = settings.find((s) => s.key === "avatar_images");
    if (avatarEntry?.value) {
      try {
        setAvatarImages(JSON.parse(avatarEntry.value));
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    loadPreset();
  }, [fetchProducts, loadPreset]);

  const handleSavePreset = async () => {
    setSavingPreset(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quick_video_preset: JSON.stringify(preset),
      }),
    });
    setSavingPreset(false);
  };

  const handleQuickVideo = async (productId: string) => {
    setGenerating(productId);
    setErrors((e) => {
      const next = { ...e };
      delete next[productId];
      return next;
    });
    // Clear previous result when regenerating
    setResults((r) => {
      const next = { ...r };
      delete next[productId];
      return next;
    });

    try {
      const res = await fetch("/api/quick-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          customImage: customImages[productId]?.filename || "",
          modelImage: modelFilename || "",
          preview: true,
          specialInstruction: specialInstructionEdits[productId]?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({ ...e, [productId]: data.error }));
      } else {
        setPreviews((p) => ({ ...p, [productId]: data }));
      }
    } catch {
      setErrors((e) => ({ ...e, [productId]: "Network error" }));
    } finally {
      setGenerating(null);
    }
  };

  const handleConfirmVideo = async (productId: string) => {
    const previewData = previews[productId];
    if (!previewData) return;

    setConfirming(productId);
    setErrors((e) => {
      const next = { ...e };
      delete next[productId];
      return next;
    });

    try {
      const res = await fetch("/api/quick-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          customImage: customImages[productId]?.filename || "",
          modelImage: modelFilename || "",
          editedContent: {
            hookTitle: previewData.hookTitle,
            tiktokCaption: previewData.tiktokCaption,
            variations: previewData.variations,
            matrixCombo: previewData.matrixCombo,
            matrixPhase: previewData.matrixPhase,
            variationAngle: previewData.variationAngle,
            hookStyle: previewData.hookStyle,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({ ...e, [productId]: data.error }));
      } else {
        setResults((r) => ({ ...r, [productId]: data }));
        setPreviews((p) => {
          const next = { ...p };
          delete next[productId];
          return next;
        });
        // Refresh matrix if combo was used
        if (data.matrixCombo) {
          fetch(`/api/products/${productId}/matrix`)
            .then((r) => r.json())
            .then((d) => setMatrices((m) => ({ ...m, [productId]: d })))
            .catch(() => {});
        }
      }
    } catch {
      setErrors((e) => ({ ...e, [productId]: "Network error" }));
    } finally {
      setConfirming(null);
    }
  };

  const handleCancelPreview = (productId: string) => {
    setPreviews((p) => {
      const next = { ...p };
      delete next[productId];
      return next;
    });
  };

  const handleUpdateAvatar = async (productId: string, avatarId: string) => {
    await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarId }),
    });
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, avatarId } : p)),
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Zap className="h-6 w-6 text-amber-500" />
            Quick Video
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
              Beta
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            One click — AI generates script + queues video job automatically
          </p>
        </div>
        <button
          onClick={() => setShowPreset(!showPreset)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <Settings className="h-4 w-4" />
          Preset
          {showPreset ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Missing API key warning */}
      {!hasGeminiKey && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>
            Gemini API key not set.{" "}
            <Link
              href="/settings"
              className="font-semibold underline hover:text-amber-900"
            >
              Configure in Settings
            </Link>{" "}
            first.
          </span>
        </div>
      )}

      {/* Preset Config (collapsible) */}
      {showPreset && (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-sm font-bold text-amber-800">
            Default Preset (applies to all Quick Videos)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Default Avatar
              </label>
              <select
                value={preset.avatar}
                onChange={(e) =>
                  setPreset((p) => ({ ...p, avatar: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {Object.entries(AVATARS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {avatarImages[k] ? "📷 " : ""}
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Genre
              </label>
              <select
                value={preset.genre}
                onChange={(e) =>
                  setPreset((p) => ({ ...p, genre: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {Object.entries(GENRES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Format
              </label>
              <select
                value={preset.format}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    format: e.target.value,
                    sceneCount: FORMAT_SCENES[e.target.value] || p.sceneCount,
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {Object.entries(FORMATS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preset.includeDialog}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    includeDialog: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
              />
              Include Dialog (BM)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preset.enableHook}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    enableHook: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
              />
              Auto Hook Title
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preset.enableOverlay}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    enableOverlay: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
              />
              Scene Caption Overlay
            </label>
          </div>

          {/* Hook Title Font Size & Background Color */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Hook Font Size
              </label>
              <input
                type="number"
                min={20}
                max={80}
                value={preset.hookFontSize}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    hookFontSize: Math.max(
                      20,
                      Math.min(80, Number(e.target.value) || 48),
                    ),
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Hook Background Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={`#${preset.hookBgColor}`}
                  onChange={(e) =>
                    setPreset((p) => ({
                      ...p,
                      hookBgColor: e.target.value.replace("#", ""),
                    }))
                  }
                  className="h-9 w-10 cursor-pointer rounded border border-gray-300"
                />
                <span className="text-xs text-gray-500">
                  #{preset.hookBgColor}
                </span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Hook Text Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={`#${preset.hookTextColor}`}
                  onChange={(e) =>
                    setPreset((p) => ({
                      ...p,
                      hookTextColor: e.target.value.replace("#", ""),
                    }))
                  }
                  className="h-9 w-10 cursor-pointer rounded border border-gray-300"
                />
                <span className="text-xs text-gray-500">
                  #{preset.hookTextColor}
                </span>
              </div>
            </div>
          </div>

          {/* AI Temperature Slider */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              AI Creativity (Temperature):{" "}
              <span className="font-semibold text-amber-600">
                {preset.temperature.toFixed(1)}
              </span>
            </label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={preset.temperature}
              onChange={(e) =>
                setPreset((p) => ({
                  ...p,
                  temperature: parseFloat(e.target.value),
                }))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-amber-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>0.5 — Focused</span>
              <span>1.0 — Balanced</span>
              <span>2.0 — Creative</span>
            </div>
          </div>

          {/* Model Image Upload (global custom avatar photo) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Custom Model Photo (optional — use your own photo as avatar)
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={modelInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleModelUpload}
                className="hidden"
              />
              {modelPreview ? (
                <div className="relative h-16 w-16 shrink-0">
                  <img
                    src={modelPreview}
                    alt="Model"
                    className="h-full w-full rounded-lg object-cover ring-2 ring-amber-400"
                  />
                  <button
                    onClick={clearModelImage}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white shadow-sm hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {uploadingModel && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => modelInputRef.current?.click()}
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 transition-colors hover:border-amber-400 hover:bg-amber-100"
                >
                  <Upload className="h-5 w-5 text-amber-400" />
                </button>
              )}
              <p className="text-[11px] text-gray-500">
                {modelFilename
                  ? "Model photo ready — will be used as reference for all Quick Videos"
                  : "Upload your own photo to use as avatar model in generated scenes"}
              </p>
            </div>
          </div>

          <button
            onClick={handleSavePreset}
            disabled={savingPreset}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {savingPreset ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Settings className="h-4 w-4" />
            )}
            {savingPreset ? "Saving..." : "Save Preset"}
          </button>
        </div>
      )}

      {/* Product Grid */}
      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading products...</p>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400">
          <ShoppingBag className="mx-auto mb-3 h-8 w-8" />
          <p>No products yet.</p>
          <Link
            href="/products"
            className="mt-2 inline-block text-sm font-medium text-rose-500 hover:underline"
          >
            Add products first →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const images: string[] = JSON.parse(p.images || "[]");
            const result = results[p.id];
            const error = errors[p.id];
            const isGenerating = generating === p.id;

            return (
              <div
                key={p.id}
                className={`overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md ${
                  result
                    ? "border-green-300 ring-1 ring-green-100"
                    : error
                      ? "border-red-300 ring-1 ring-red-100"
                      : "border-gray-200"
                }`}
              >
                {/* Product header */}
                <div className="flex gap-3 p-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {images[0] ? (
                      <img
                        src={images[0]}
                        alt={p.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-tight">
                      {p.title}
                    </h3>
                    <p className="text-sm font-bold text-rose-500">{p.price}</p>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-600"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        View product
                      </a>
                    )}
                  </div>
                </div>

                {/* Info badges */}
                {(p.usp || p.targetAudience) && (
                  <div className="flex flex-wrap gap-1 border-t border-gray-100 px-4 py-1.5">
                    {p.usp && (
                      <span
                        className="truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600"
                        title={p.usp}
                      >
                        USP ✓
                      </span>
                    )}
                    {p.targetAudience && (
                      <span
                        className="truncate rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600"
                        title={p.targetAudience}
                      >
                        Audience ✓
                      </span>
                    )}
                  </div>
                )}

                {/* Tiga Segi Matrix */}
                <div className="border-t border-gray-100 px-4 py-2">
                  {matrices[p.id]?.exists ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-indigo-700">
                          △ Tiga Segi — Phase {matrices[p.id].matrix?.phase}
                        </span>
                        <button
                          onClick={() => handleResetMatrix(p.id)}
                          className="text-[9px] text-gray-400 hover:text-red-500"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{
                              width: `${Math.round(((matrices[p.id].stats?.used || 0) / Math.max(matrices[p.id].stats?.total || 1, 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-500">
                          {matrices[p.id].stats?.used}/
                          {matrices[p.id].stats?.total}
                        </span>
                      </div>
                      {matrices[p.id].nextCombo ? (
                        <p className="text-[9px] text-indigo-500">
                          Next: {matrices[p.id].nextCombo!.target} ×{" "}
                          {matrices[p.id].nextCombo!.scenario}
                        </p>
                      ) : (
                        <p className="text-[9px] text-amber-600">
                          All combos used! Reset to start over.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">
                        △ Tiga Segi
                      </span>
                      <button
                        onClick={() => handleGenerateMatrix(p.id, "gemini")}
                        disabled={generatingMatrix === p.id}
                        className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {generatingMatrix === p.id ? "..." : "Gemini"}
                      </button>
                      <button
                        onClick={() => handleGenerateMatrix(p.id, "parse")}
                        disabled={generatingMatrix === p.id}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
                      >
                        Parse
                      </button>
                    </div>
                  )}
                </div>

                {/* Avatar selector per product */}
                <div className="border-t border-gray-100 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <select
                      value={p.avatarId || ""}
                      onChange={(e) => handleUpdateAvatar(p.id, e.target.value)}
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="">Use default preset</option>
                      {Object.entries(AVATARS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {avatarImages[k] ? "📷 " : ""}
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custom reference image per product */}
                  <div className="mt-2 flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-gray-400" />
                    {customImages[p.id] ? (
                      <div className="flex flex-1 items-center gap-2">
                        <img
                          src={customImages[p.id].preview}
                          alt="Custom ref"
                          className="h-8 w-8 rounded object-cover ring-1 ring-amber-300"
                        />
                        <span className="flex-1 truncate text-[10px] text-green-600">
                          Custom image ready
                        </span>
                        <button
                          onClick={() => clearCustomImage(p.id)}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-1 cursor-pointer items-center gap-1.5 rounded border border-dashed border-gray-200 px-2 py-1 text-[10px] text-gray-500 transition-colors hover:border-amber-300 hover:bg-amber-50">
                        {uploadingImage === p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {uploadingImage === p.id
                          ? "Uploading..."
                          : "Custom product image (optional)"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleCustomImageUpload(p.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Mini USP Editor */}
                <div className="border-t border-gray-100 px-4 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-semibold text-orange-600">
                          🔥 Key Benefits / USP List
                        </span>
                        <span className="ml-1.5 text-[9px] text-gray-400">one per line — AI picks 2–3 to highlight</span>
                      </div>
                      <button
                        onClick={() => handleSaveUsp(p.id)}
                        disabled={savingUsp === p.id}
                        className="flex items-center gap-1 rounded bg-orange-500 px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        {savingUsp === p.id ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Check className="h-2.5 w-2.5" />
                        )}
                        {savingUsp === p.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                    <textarea
                      value={uspEdits[p.id] ?? ""}
                      onChange={(e) =>
                        setUspEdits((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      rows={4}
                      placeholder={"Tulis setiap USP/Benefit dalam satu baris\nContoh: Tekstur ringan, cepat serap\nContoh: Selamat untuk kulit sensitif\nContoh: Kesan nampak dalam 3 hari"}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-[11px] leading-relaxed focus:border-orange-300 focus:outline-none resize-none"
                    />
                    {p.miniUsps && (
                      <p className="text-[9px] text-green-600">
                        ✓ {p.miniUsps.split("\n").filter((l) => l.trim()).length} benefits saved — AI picks 2–3 per generation
                      </p>
                    )}
                  </div>

                {/* Special Instruction (per product) */}
                <div className="border-t border-gray-100 px-4 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-semibold text-purple-600">
                        Special Instruction
                      </span>
                      <span className="ml-1.5 text-[9px] text-gray-400">AI will follow this for every generation</span>
                    </div>
                    <button
                      onClick={() => handleSaveSpecialInstruction(p.id)}
                      disabled={savingSpecialInstruction === p.id}
                      className="flex items-center gap-1 rounded bg-purple-500 px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
                    >
                      {savingSpecialInstruction === p.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Check className="h-2.5 w-2.5" />
                      )}
                      {savingSpecialInstruction === p.id ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <textarea
                    value={specialInstructionEdits[p.id] ?? ""}
                    onChange={(e) =>
                      setSpecialInstructionEdits((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    rows={2}
                    placeholder="e.g. Do not tuck in the shirt. Model must face left."
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-[11px] leading-relaxed placeholder-gray-400 focus:border-purple-300 focus:outline-none resize-none"
                  />
                  {p.specialInstruction && (
                    <p className="text-[9px] text-green-600">
                      ✓ Instruction saved
                    </p>
                  )}
                </div>

                {/* Preview Edit Panel */}
                {previews[p.id] && !result && (
                  <div className="space-y-2.5 border-t border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                        <Pencil className="h-3.5 w-3.5" />
                        Review & Edit
                      </span>
                      <button
                        onClick={() => handleCancelPreview(p.id)}
                        className="text-[10px] text-gray-400 hover:text-red-500"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Hook Title */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-blue-600">
                        Hook Title
                      </label>
                      <input
                        type="text"
                        value={previews[p.id].hookTitle}
                        onChange={(e) =>
                          setPreviews((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...prev[p.id],
                              hookTitle: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    {/* TikTok Caption */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium text-blue-600">
                        TikTok Caption
                      </label>
                      <textarea
                        value={previews[p.id].tiktokCaption}
                        onChange={(e) =>
                          setPreviews((prev) => ({
                            ...prev,
                            [p.id]: {
                              ...prev[p.id],
                              tiktokCaption: e.target.value,
                            },
                          }))
                        }
                        rows={2}
                        className="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    {/* Per-Scene Editor */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-medium text-blue-600">
                        Scenes ({previews[p.id].variations?.length ?? 0})
                      </label>
                      {(previews[p.id].variations ?? []).length === 0 && (
                        <p className="text-[10px] text-gray-400 italic">No scenes generated.</p>
                      )}
                      {(previews[p.id].variations ?? []).map((v, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-blue-200 bg-white p-2.5 space-y-1.5"
                        >
                          <span className="text-[9px] font-bold uppercase tracking-wider text-blue-500">
                            Scene {i + 1}
                          </span>

                          {/* Overlay */}
                          <div>
                            <label className="mb-0.5 block text-[9px] font-medium text-gray-500">
                              Caption Overlay
                            </label>
                            <input
                              type="text"
                              value={v.overlayText || ""}
                              onChange={(e) => {
                                const next = [...(previews[p.id].variations ?? [])];
                                next[i] = { ...next[i], overlayText: e.target.value };
                                setPreviews((prev) => ({ ...prev, [p.id]: { ...prev[p.id], variations: next } }));
                              }}
                              placeholder="On-screen caption"
                              className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-blue-300 focus:outline-none"
                            />
                          </div>

                          {/* Image Prompt */}
                          <div>
                            <label className="mb-0.5 block text-[9px] font-medium text-gray-500">
                              Image Prompt
                            </label>
                            <textarea
                              value={v.imagePrompt || ""}
                              onChange={(e) => {
                                const next = [...(previews[p.id].variations ?? [])];
                                next[i] = { ...next[i], imagePrompt: e.target.value };
                                setPreviews((prev) => ({ ...prev, [p.id]: { ...prev[p.id], variations: next } }));
                              }}
                              rows={3}
                              placeholder="Image generation prompt"
                              className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] leading-relaxed focus:border-blue-300 focus:outline-none"
                            />
                          </div>

                          {/* Video Prompt */}
                          <div>
                            <label className="mb-0.5 block text-[9px] font-medium text-gray-500">
                              Video Prompt
                            </label>
                            <textarea
                              value={v.videoPrompt || ""}
                              onChange={(e) => {
                                const next = [...(previews[p.id].variations ?? [])];
                                next[i] = { ...next[i], videoPrompt: e.target.value };
                                setPreviews((prev) => ({ ...prev, [p.id]: { ...prev[p.id], variations: next } }));
                              }}
                              rows={2}
                              placeholder="Motion description"
                              className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] leading-relaxed focus:border-blue-300 focus:outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Variation angle info */}
                    {previews[p.id].variationAngle && (
                      <p className="text-[9px] text-blue-400">
                        Angle: {previews[p.id].variationAngle}
                      </p>
                    )}

                    {/* Confirm button */}
                    <button
                      onClick={() => handleConfirmVideo(p.id)}
                      disabled={confirming === p.id}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
                    >
                      {confirming === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {confirming === p.id ? "Queuing..." : "Queue Video"}
                    </button>
                  </div>
                )}

                {/* Result / Error feedback */}
                {result && (
                  <div className="border-t border-green-100 bg-green-50 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-green-700">
                      <CheckCircle2 className="h-4 w-4" />
                      {result.scenes} scenes queued
                    </div>
                    {result.hookTitle && (
                      <p className="mt-0.5 truncate text-[11px] text-green-600">
                        Hook: &ldquo;{result.hookTitle}&rdquo;
                      </p>
                    )}
                    {(result.variationAngle || result.hookStyle) && (
                      <p className="mt-0.5 text-[10px] text-green-500">
                        {result.variationAngle && (
                          <span>Angle: {result.variationAngle}</span>
                        )}
                        {result.variationAngle && result.hookStyle && (
                          <span> · </span>
                        )}
                        {result.hookStyle && (
                          <span>Hook: {result.hookStyle}</span>
                        )}
                      </p>
                    )}
                    <Link
                      href="/automation"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-green-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> View in Automation
                    </Link>
                  </div>
                )}
                {error && (
                  <div className="border-t border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-600">
                    {error}
                  </div>
                )}

                {/* Action button */}
                <div className="border-t border-gray-100 p-3">
                  <button
                    onClick={() => handleQuickVideo(p.id)}
                    disabled={
                      isGenerating || !hasGeminiKey || confirming === p.id
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-linear-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : result || previews[p.id] ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isGenerating
                      ? "Generating..."
                      : result
                        ? "Regenerate"
                        : previews[p.id]
                          ? "Regenerate Script"
                          : "Quick Video"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <p>
          <strong>How it works:</strong> Click &quot;Quick Video&quot; → AI
          generates {FORMATS[preset.format]?.split("—")[1]?.trim() || "scenes"}{" "}
          using{" "}
          <span className="font-semibold">
            {GENRES[preset.genre] || preset.genre}
          </span>{" "}
          genre → Job queued in Automation → Chrome Extension processes
          (image→video→combine).
        </p>
        <p className="mt-1">
          Set per-product avatar or change defaults via the{" "}
          <button
            onClick={() => setShowPreset(true)}
            className="font-medium text-amber-600 hover:underline"
          >
            Preset
          </button>{" "}
          config above. After videos are generated, combine them in{" "}
          <Link
            href="/gallery"
            className="font-medium text-amber-600 hover:underline"
          >
            Gallery
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
