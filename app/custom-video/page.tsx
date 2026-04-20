"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap,
  Loader2,
  CheckCircle2,
  Settings,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Upload,
  X,
  ImageIcon,
  Package,
  Trash2,
} from "lucide-react";
import Link from "next/link";

interface CustomProduct {
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
  createdAt: string;
  videoJobs: { id: string; status: string; createdAt: string }[];
}

interface QuickResult {
  jobId: string;
  productId: string;
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
  super_short: "⚡ Super Short (8s) — 3 scenes",
  short: "🎬 Short (20s) — 4 scenes",
  complete: "🎥 Complete (40s) — 5 scenes",
};

const FORMAT_SCENES: Record<string, number> = {
  super_short: 3,
  short: 4,
  complete: 5,
};

const PLATFORMS = [
  { value: "shopee", label: "🛒 Shopee" },
  { value: "lazada", label: "🏪 Lazada" },
  { value: "tiktok", label: "🎵 TikTok Shop" },
  { value: "other", label: "📦 Other" },
];

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  pending: { text: "Pending", color: "bg-gray-100 text-gray-600" },
  generating_image: {
    text: "Generating Image",
    color: "bg-blue-100 text-blue-600",
  },
  generating_video: {
    text: "Generating Video",
    color: "bg-indigo-100 text-indigo-600",
  },
  ready: { text: "Ready", color: "bg-green-100 text-green-600" },
  posting: { text: "Posting", color: "bg-amber-100 text-amber-600" },
  posted: { text: "Posted", color: "bg-emerald-100 text-emerald-600" },
  failed: { text: "Failed", color: "bg-red-100 text-red-600" },
};

export default function CustomVideoPage() {
  // Form state
  const [title, setTitle] = useState("");
  const [usp, setUsp] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [price, setPrice] = useState("");
  const [platform, setPlatform] = useState("shopee");
  const [avatarId, setAvatarId] = useState("");

  // Avatar images from Settings
  const [avatarImages, setAvatarImages] = useState<Record<string, string>>({});

  // Product image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFilename, setImageFilename] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Model image (optional)
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelFilename, setModelFilename] = useState("");
  const [uploadingModel, setUploadingModel] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // Background image (optional — same background across all scenes)
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgFilename, setBgFilename] = useState("");
  const [uploadingBg, setUploadingBg] = useState(false);
  const [bgDesc, setBgDesc] = useState("");
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<QuickResult | null>(null);
  const [error, setError] = useState("");

  // Preset
  const [showPreset, setShowPreset] = useState(false);
  const [preset, setPreset] = useState<PresetConfig>(DEFAULT_PRESET);
  const [savingPreset, setSavingPreset] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(true);

  // History
  const [history, setHistory] = useState<CustomProduct[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Tiga Segi matrix
  const [matrices, setMatrices] = useState<Record<string, MatrixData>>({});
  const [generatingMatrix, setGeneratingMatrix] = useState<string | null>(null);
  const [autoMatrix, setAutoMatrix] = useState<"gemini" | "parse" | "off">(
    "gemini",
  );

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.filename;
  };

  // Product image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageFilename("");
    setUploadingImage(true);
    try {
      const fn = await uploadFile(file);
      setImageFilename(fn);
    } catch {
      setError("Failed to upload product image");
    } finally {
      setUploadingImage(false);
    }
    e.target.value = "";
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setImageFilename("");
  };

  // Model image upload
  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) return;
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

  const clearModel = () => {
    if (modelPreview) URL.revokeObjectURL(modelPreview);
    setModelPreview(null);
    setModelFilename("");
  };

  // Background image upload
  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) return;
    setBgPreview(URL.createObjectURL(file));
    setBgFilename("");
    setUploadingBg(true);
    try {
      const fn = await uploadFile(file);
      setBgFilename(fn);
    } catch {
      // ignore
    } finally {
      setUploadingBg(false);
    }
    e.target.value = "";
  };

  const clearBg = () => {
    if (bgPreview) URL.revokeObjectURL(bgPreview);
    setBgPreview(null);
    setBgFilename("");
    setBgDesc("");
  };

  // Load settings + history
  const loadSettings = useCallback(async () => {
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

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/custom-video");
      const prods = await res.json();
      setHistory(prods);
      // Load matrices for all custom products
      for (const p of prods) {
        fetch(`/api/products/${p.id}/matrix`)
          .then((r) => r.json())
          .then((data) => {
            if (data.exists) setMatrices((m) => ({ ...m, [p.id]: data }));
          })
          .catch(() => {});
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, []);

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
        const getRes = await fetch(`/api/products/${productId}/matrix`);
        const fullData = await getRes.json();
        setMatrices((m) => ({ ...m, [productId]: fullData }));
      }
    } catch {
      // ignore
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

  useEffect(() => {
    loadSettings();
    loadHistory();
  }, [loadSettings, loadHistory]);

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

  const handleGenerate = async () => {
    setError("");
    setResult(null);

    if (!title.trim()) {
      setError("Product name is required");
      return;
    }
    if (!usp.trim()) {
      setError("USP / Benefits is required");
      return;
    }
    if (!imageFilename) {
      setError("Please upload a product image first");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/custom-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          usp: usp.trim(),
          targetAudience: targetAudience.trim(),
          price: price.trim(),
          imageFilename,
          modelImage: modelFilename || "",
          backgroundImage: bgFilename || "",
          backgroundDesc: bgDesc.trim() || "",
          platform,
          avatarId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
      } else {
        setResult(data);
        loadHistory();
        // Auto-generate matrix for new product if enabled
        if (data.productId && autoMatrix !== "off") {
          fetch(`/api/products/${data.productId}/matrix`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: autoMatrix }),
          })
            .then(() => fetch(`/api/products/${data.productId}/matrix`))
            .then((r) => r.json())
            .then((d) => setMatrices((m) => ({ ...m, [data.productId]: d })))
            .catch(() => {});
        }
      }
    } catch {
      setError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    setHistory((prev) => prev.filter((p) => p.id !== productId));
  };

  const resetForm = () => {
    setTitle("");
    setUsp("");
    setTargetAudience("");
    setPrice("");
    setPlatform("shopee");
    setAvatarId("");
    clearImage();
    clearModel();
    clearBg();
    setResult(null);
    setError("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6 text-teal-500" />
            Custom Video
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-600">
              New
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Upload product image + enter USP → AI generates video for
            Shopee/Lazada/any platform
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
        <div className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/50 p-5">
          <h2 className="text-sm font-bold text-teal-800">
            Video Preset (shared with Quick Video)
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {Object.entries(AVATARS).map(([k, v]) => (
                  <option key={k} value={k}>
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
                className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
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
                className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
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
                className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
              />
              Scene Caption Overlay
            </label>
          </div>

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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
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

          <button
            onClick={handleSavePreset}
            disabled={savingPreset}
            className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
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

      {/* Main Form */}
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-gray-800">Product Details</h2>

        {/* Product Image Upload */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Product Image <span className="text-red-400">*</span>
          </label>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
          {imagePreview ? (
            <div className="flex items-start gap-4">
              <div className="relative h-32 w-32 shrink-0">
                <img
                  src={imagePreview}
                  alt="Product"
                  className="h-full w-full rounded-lg object-cover ring-2 ring-teal-400"
                />
                <button
                  onClick={clearImage}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white shadow-sm hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
                {uploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="pt-1 text-xs text-gray-500">
                {imageFilename ? (
                  <span className="text-green-600">
                    <CheckCircle2 className="mb-0.5 inline h-3.5 w-3.5" />{" "}
                    Uploaded — will be used as reference for AI generation
                  </span>
                ) : uploadingImage ? (
                  "Uploading..."
                ) : (
                  "Processing..."
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => imageInputRef.current?.click()}
              className="flex h-32 w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-teal-400 hover:bg-teal-50"
            >
              <Upload className="h-6 w-6 text-gray-400" />
              <div className="text-sm text-gray-500">
                <span className="font-medium text-teal-600">
                  Click to upload
                </span>{" "}
                product image (PNG, JPG, WebP — max 10MB)
              </div>
            </button>
          )}
        </div>

        {/* Product Name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Product Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Serum Vitamin C Glow Booster"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {/* USP / Benefits */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            USP / Benefits <span className="text-red-400">*</span>
          </label>
          <textarea
            value={usp}
            onChange={(e) => setUsp(e.target.value)}
            rows={3}
            placeholder="e.g. Mencerahkan kulit dalam 7 hari, mengandungi 20% Vitamin C tulen, sesuai untuk semua jenis kulit"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Key selling points — AI will highlight these in the video script
          </p>
        </div>

        {/* Two columns: Target Audience + Price */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Target Audience (optional)
            </label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g. Wanita 25-40 tahun yang mahu kulit cerah"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Price (optional)
            </label>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. RM39.90"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Platform + Avatar */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Avatar Override
            </label>
            <select
              value={avatarId}
              onChange={(e) => setAvatarId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
        </div>

        {/* Model Image (optional) */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
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
                  className="h-full w-full rounded-lg object-cover ring-2 ring-teal-400"
                />
                <button
                  onClick={clearModel}
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
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-teal-300 bg-teal-50 transition-colors hover:border-teal-400 hover:bg-teal-100"
              >
                <Upload className="h-5 w-5 text-teal-400" />
              </button>
            )}
            <p className="text-[11px] text-gray-500">
              {modelFilename
                ? "Model photo ready — will be used as reference"
                : "Upload your own photo to use as avatar model in generated scenes"}
            </p>
          </div>
        </div>

        {/* Custom Background Image (optional — same bg for all scenes) */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Custom Background (optional — same background for all scenes)
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={bgInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleBgUpload}
              className="hidden"
            />
            {bgPreview ? (
              <div className="relative h-16 w-16 shrink-0">
                <img
                  src={bgPreview}
                  alt="Background"
                  className="h-full w-full rounded-lg object-cover ring-2 ring-indigo-400"
                />
                <button
                  onClick={clearBg}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white shadow-sm hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
                {uploadingBg && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => bgInputRef.current?.click()}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 transition-colors hover:border-indigo-400 hover:bg-indigo-100"
              >
                <Upload className="h-5 w-5 text-indigo-400" />
              </button>
            )}
            <div className="flex-1">
              <p className="text-[11px] text-gray-500">
                {bgFilename
                  ? "Background ready — all scenes will use this background"
                  : "Upload a background image so all scenes share the same setting (great for Shopee videos)"}
              </p>
            </div>
          </div>
          {bgFilename && (
            <div className="mt-2">
              <input
                type="text"
                value={bgDesc}
                onChange={(e) => setBgDesc(e.target.value)}
                placeholder="Describe the background (e.g. 'Clean white studio with soft lighting')"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Optional description helps AI understand the background context
              </p>
            </div>
          )}
        </div>

        {/* Result feedback */}
        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              Video job created! {result.scenes} scenes queued
            </div>
            {result.hookTitle && (
              <p className="mt-1 text-sm text-green-600">
                Hook: &ldquo;{result.hookTitle}&rdquo;
              </p>
            )}
            {(result.variationAngle || result.hookStyle) && (
              <p className="mt-0.5 text-xs text-green-500">
                {result.variationAngle && (
                  <span>Angle: {result.variationAngle}</span>
                )}
                {result.variationAngle && result.hookStyle && <span> · </span>}
                {result.hookStyle && <span>Hook: {result.hookStyle}</span>}
              </p>
            )}
            <div className="mt-2 flex gap-3">
              <Link
                href="/automation"
                className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> View in Automation
              </Link>
              <button
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline"
              >
                <Sparkles className="h-3 w-3" /> Create Another
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Tiga Segi Auto-Matrix */}
        <div className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-2.5">
          <span className="text-xs font-semibold text-indigo-700">
            △ Tiga Segi
          </span>
          <select
            value={autoMatrix}
            onChange={(e) =>
              setAutoMatrix(e.target.value as "gemini" | "parse" | "off")
            }
            className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-600 focus:border-indigo-400 focus:outline-none"
          >
            <option value="gemini">Gemini (default)</option>
            <option value="parse">Parse (no AI cost)</option>
            <option value="off">Off</option>
          </select>
          <span className="text-[10px] text-indigo-400">
            {autoMatrix === "off"
              ? "Random angle per video"
              : "Systematic T×RS×USP combos"}
          </span>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !hasGeminiKey || uploadingImage}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-linear-to-r from-teal-500 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-teal-600 hover:to-cyan-600 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generating ? "Generating Script & Queuing Job..." : "Generate Video"}
        </button>
      </div>

      {/* History */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <ImageIcon className="h-4 w-4" />
          Custom Products ({history.length})
        </h2>

        {loadingHistory ? (
          <p className="py-4 text-center text-sm text-gray-400">Loading...</p>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-gray-400">
            <Package className="mx-auto mb-2 h-6 w-6" />
            <p className="text-sm">No custom products yet. Create one above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {history.map((p) => {
              const images: string[] = (() => {
                try {
                  return JSON.parse(p.images || "[]");
                } catch {
                  return [];
                }
              })();
              const job = p.videoJobs[0];
              const statusInfo = job
                ? STATUS_LABELS[job.status] || {
                    text: job.status,
                    color: "bg-gray-100 text-gray-600",
                  }
                : null;

              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
                >
                  <div className="flex gap-3 p-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
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
                      <h3 className="line-clamp-1 text-sm font-semibold leading-tight">
                        {p.title}
                      </h3>
                      {p.price && (
                        <p className="text-xs font-bold text-teal-500">
                          {p.price}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          {p.shopName?.toUpperCase() || "CUSTOM"}
                        </span>
                        {statusInfo && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusInfo.color}`}
                          >
                            {statusInfo.text}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteProduct(p.id)}
                      className="shrink-0 self-start rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {p.usp && (
                    <div className="border-t border-gray-100 px-3 py-1.5">
                      <p
                        className="line-clamp-2 text-[11px] text-gray-500"
                        title={p.usp}
                      >
                        {p.usp}
                      </p>
                    </div>
                  )}
                  {/* Tiga Segi Matrix */}
                  <div className="border-t border-gray-100 px-3 py-1.5">
                    {matrices[p.id]?.exists ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-indigo-700">
                            △ Phase {matrices[p.id].matrix?.phase}
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
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400">
                          △ Tiga Segi
                        </span>
                        <button
                          onClick={() => handleGenerateMatrix(p.id, "gemini")}
                          disabled={generatingMatrix === p.id}
                          className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {generatingMatrix === p.id ? "..." : "Gemini"}
                        </button>
                        <button
                          onClick={() => handleGenerateMatrix(p.id, "parse")}
                          disabled={generatingMatrix === p.id}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                        >
                          Parse
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <p>
          <strong>How it works:</strong> Upload product image + enter USP → AI
          generates {FORMATS[preset.format]?.split("—")[1]?.trim() || "scenes"}{" "}
          using{" "}
          <span className="font-semibold">
            {GENRES[preset.genre] || preset.genre}
          </span>{" "}
          genre → Job queued in Automation → Chrome Extension processes
          (image→video→combine).
        </p>
        <p className="mt-1">
          Works for any affiliate platform — Shopee, Lazada, TikTok Shop, or
          custom products. After videos are generated, combine them in{" "}
          <Link
            href="/gallery"
            className="font-medium text-teal-600 hover:underline"
          >
            Gallery
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
