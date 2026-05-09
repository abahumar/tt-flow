"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Home,
  Loader2,
  CheckCircle2,
  ShoppingBag,
  Upload,
  X,
  ImageIcon,
  RefreshCw,
  Sparkles,
  Zap,
  AlertCircle,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";

interface Product {
  id: string;
  title: string;
  price: string;
  shopName: string;
  images: string;
  usp: string;
  targetAudience: string;
  avatarId: string;
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

interface FurnitureAnalysis {
  furnitureType?: string;
  style?: string;
  colorPalette?: string[];
  material?: string;
  recommendedRooms?: string[];
}

interface PreviewData {
  analysis: FurnitureAnalysis;
  hookTitle: string;
  tiktokCaption: string;
  tiktokHashtags: string;
  scenes: HomeVideoScene[];
  effectiveProductImage: string;
}

interface AppearanceSettings {
  enableHook: boolean;
  hookBgColor: string;
  hookTextColor: string;
  hookFontSize: number;
  overlayFontSize: number;
}

const DEFAULT_APPEARANCE: AppearanceSettings = {
  enableHook: true,
  hookBgColor: "1a1a2e",
  hookTextColor: "FFFFFF",
  hookFontSize: 48,
  overlayFontSize: 28,
};

const AVATARS: { id: string; label: string }[] = [
  { id: "woman_malay_hijab",    label: "🧕 Wanita Melayu (Bertudung)" },
  { id: "woman_malay_freehair", label: "🧕 Wanita Melayu 3 (Bertudung)" },
  { id: "woman_malay_corporate",label: "👩‍💼 Wanita Melayu (Korporat)" },
  { id: "woman_malay_elder",    label: "👵 Makcik Melayu (50+)" },
  { id: "man_malay_casual",     label: "👨 Lelaki Melayu (Casual)" },
  { id: "man_malay_corporate",  label: "👨‍💼 Lelaki Melayu (Korporat)" },
  { id: "man_malay_elder",      label: "👴 Pakcik Melayu (50+)" },
  { id: "product_only",         label: "📦 Produk Sahaja" },
  { id: "woman_malay_student",  label: "🎓 Wanita Melayu (Student/Gen Z)" },
  { id: "woman_malay_mother",   label: "👩‍👧 Ibu Muda Melayu" },
  { id: "woman_malay_beauty",   label: "💄 Beauty Influencer" },
  { id: "woman_chinese_casual", label: "🧕 Wanita Melayu 2 (Bertudung)" },
  { id: "woman_malay_homecook", label: "🍳 Suri Rumah / Home Cook" },
  { id: "man_malay_father",     label: "👨‍👦 Ayah Muda" },
  { id: "couple_malay",         label: "💑 Pasangan Melayu (Couple)" },
  { id: "hands_only",           label: "🤲 Tangan Sahaja (Hands Only)" },
];

const GENRES = [
  { id: "softsell", label: "Soft Sell" },
  { id: "hardsell", label: "Hard Sell" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "educational", label: "Educational" },
];

const SCENE_COUNTS = [
  { value: 2, label: "2", sub: "16s" },
  { value: 3, label: "3", sub: "24s" },
  { value: 4, label: "4", sub: "32s" },
  { value: 5, label: "5", sub: "40s" },
];

const SHOT_COLORS: Record<string, string> = {
  wide: "bg-violet-900 text-violet-200",
  mid: "bg-blue-900 text-blue-200",
  "close-up": "bg-amber-900 text-amber-200",
};

function getProductImage(product: Product): string {
  try {
    const imgs = JSON.parse(product.images || "[]");
    return imgs[0] || "";
  } catch {
    return "";
  }
}

export default function HomeVideoPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [customImageFilename, setCustomImageFilename] = useState("");
  const [customImagePreview, setCustomImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatar, setAvatar] = useState("woman_malay_hijab");
  const [genre, setGenre] = useState("softsell");
  const [sceneCount, setSceneCount] = useState(2);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [editedScenes, setEditedScenes] = useState<HomeVideoScene[]>([]);
  const [editedHookTitle, setEditedHookTitle] = useState("");
  const [editedCaption, setEditedCaption] = useState("");
  const [editedHashtags, setEditedHashtags] = useState("");

  const [queuing, setQueuing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const [avatarImages, setAvatarImages] = useState<Record<string, string>>({});
  const [customUsp, setCustomUsp] = useState("");

  // Product mode: catalog vs custom
  const [productMode, setProductMode] = useState<"catalog" | "custom">("catalog");
  const [customProductTitle, setCustomProductTitle] = useState("");
  const [customProductDesc, setCustomProductDesc] = useState("");
  const [customProductPrice, setCustomProductPrice] = useState("");

  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [showAppearance, setShowAppearance] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts(data.products || data || []);
    } catch {
      // ignore
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    // Load appearance settings from DB
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings: { key: string; value: string }[]) => {
        const entry = settings.find((s) => s.key === "home_video_settings");
        if (entry?.value) {
          try {
            setAppearance({ ...DEFAULT_APPEARANCE, ...JSON.parse(entry.value) });
          } catch {}
        }
        const avatarEntry = settings.find((s) => s.key === "avatar_images");
        if (avatarEntry?.value) {
          try {
            setAvatarImages(JSON.parse(avatarEntry.value));
          } catch {}
        }
      })
      .catch(() => {});
  }, [fetchProducts]);

  const saveAppearance = useCallback((next: AppearanceSettings) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSavingAppearance(true);
      try {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ home_video_settings: JSON.stringify(next) }),
        });
      } finally {
        setSavingAppearance(false);
      }
    }, 600);
  }, []);

  const updateAppearance = useCallback(
    (patch: Partial<AppearanceSettings>) => {
      setAppearance((prev) => {
        const next = { ...prev, ...patch };
        saveAppearance(next);
        return next;
      });
    },
    [saveAppearance],
  );

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setCustomImageFilename(data.filename);
      setCustomImagePreview(URL.createObjectURL(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const isReadyToGenerate =
    productMode === "catalog" ? !!selectedProduct : !!customProductTitle.trim();

  const handleGenerate = async () => {
    if (!isReadyToGenerate) return;
    setLoading(true);
    setError(null);
    setPreviewData(null);
    setJobId(null);

    const basePayload = {
      customImage: customImageFilename || "",
      customUsp: customUsp.trim() || undefined,
      avatar: (productMode === "catalog" ? selectedProduct?.avatarId : null) || avatar,
      genre,
      sceneCount,
      preview: true,
    };

    const payload =
      productMode === "catalog"
        ? { ...basePayload, productId: selectedProduct!.id }
        : {
            ...basePayload,
            customProduct: {
              title: customProductTitle.trim(),
              description: customProductDesc.trim(),
              price: customProductPrice.trim(),
            },
          };

    try {
      const res = await fetch("/api/home-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setPreviewData(data);
      setEditedScenes(data.scenes || []);
      setEditedHookTitle(data.hookTitle || "");
      setEditedCaption(data.tiktokCaption || "");
      setEditedHashtags(data.tiktokHashtags || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmQueue = async () => {
    if (!previewData) return;
    setQueuing(true);
    setError(null);

    const editedContent = {
      hookTitle: editedHookTitle,
      tiktokCaption: editedCaption,
      tiktokHashtags: editedHashtags,
      scenes: editedScenes,
    };
    const base = {
      customImage: customImageFilename || "",
      customUsp: customUsp.trim() || undefined,
      genre,
      preview: false,
      appearanceSettings: appearance,
      editedContent,
    };
    const payload =
      productMode === "catalog"
        ? { ...base, productId: selectedProduct!.id }
        : {
            ...base,
            customProduct: {
              title: customProductTitle.trim(),
              description: customProductDesc.trim(),
              price: customProductPrice.trim(),
            },
          };

    try {
      const res = await fetch("/api/home-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Job creation failed");
      setJobId(data.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Job creation failed");
    } finally {
      setQueuing(false);
    }
  };

  const updateScene = (index: number, field: keyof HomeVideoScene, value: string) => {
    setEditedScenes((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const filteredProducts = products.filter((p) =>
    p.title.toLowerCase().includes(pickerSearch.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
        <Home className="h-5 w-5 text-emerald-600" />
        <div>
          <h1 className="text-lg font-bold text-gray-900">Home Video</h1>
          <p className="text-xs text-gray-500">
            Furniture & home products — AI generates real Malaysian home scenes
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT PANEL ─── */}
        <aside className="flex w-64 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-200 bg-white p-4">
          {/* Product */}
          <section>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Product
            </label>

            {/* Mode toggle */}
            <div className="mb-2 flex rounded-md border border-gray-200 p-0.5">
              <button
                onClick={() => setProductMode("catalog")}
                className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                  productMode === "catalog"
                    ? "bg-emerald-600 text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                From Catalog
              </button>
              <button
                onClick={() => setProductMode("custom")}
                className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                  productMode === "custom"
                    ? "bg-emerald-600 text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Custom
              </button>
            </div>

            {productMode === "catalog" ? (
              selectedProduct ? (
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start gap-2">
                    {getProductImage(selectedProduct) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getProductImage(selectedProduct)}
                        alt={selectedProduct.title}
                        className="h-12 w-12 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-gray-100">
                        <ShoppingBag className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-xs font-medium text-gray-900">
                        {selectedProduct.title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {selectedProduct.price}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPicker(true)}
                    className="mt-2 w-full rounded-md border border-gray-200 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Change Product
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPicker(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Select Product
                </button>
              )
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <input
                    value={customProductTitle}
                    onChange={(e) => setCustomProductTitle(e.target.value)}
                    placeholder="Product name *"
                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <div>
                  <textarea
                    value={customProductDesc}
                    onChange={(e) => setCustomProductDesc(e.target.value)}
                    placeholder="Description, USP, target audience…"
                    rows={3}
                    className="w-full resize-none rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <div>
                  <input
                    value={customProductPrice}
                    onChange={(e) => setCustomProductPrice(e.target.value)}
                    placeholder="Price (optional, e.g. RM 59)"
                    className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </section>

          {/* USP Override */}
          <section>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              USP / Key Selling Point
            </label>
            <textarea
              value={customUsp}
              onChange={(e) => setCustomUsp(e.target.value)}
              rows={2}
              placeholder={
                productMode === "catalog" && selectedProduct?.usp
                  ? selectedProduct.usp
                  : "e.g. Boleh tampung 50kg, 3 tier, mudah pasang tanpa skru…"
              }
              className="w-full resize-none rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none"
            />
            {productMode === "catalog" && selectedProduct?.usp && !customUsp && (
              <p className="mt-1 text-[10px] text-gray-400">
                Using product USP — type above to override
              </p>
            )}
          </section>

          {/* Image Upload */}
          <section>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Product Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
            {customImagePreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={customImagePreview}
                  alt="Custom product"
                  className="h-32 w-full rounded-lg object-contain border border-gray-200 bg-gray-50"
                />
                <button
                  onClick={() => {
                    setCustomImageFilename("");
                    setCustomImagePreview("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute right-1 top-1 rounded-full bg-white p-0.5 shadow hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5 text-gray-500" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-4 text-center hover:border-emerald-400"
              >
                {uploadingImage ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                ) : (
                  <Upload className="h-5 w-5 text-gray-400" />
                )}
                <span className="text-xs text-gray-500">
                  {uploadingImage ? "Uploading…" : "Upload custom image"}
                </span>
                <span className="text-[10px] text-gray-400">
                  Scraped image used if empty
                </span>
              </button>
            )}
          </section>

          {/* Avatar */}
          <section>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Avatar
            </label>
            <select
              value={selectedProduct?.avatarId || avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="w-full rounded-md border border-gray-200 py-1.5 px-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none"
            >
              {AVATARS.map((a) => (
                <option key={a.id} value={a.id}>
                  {avatarImages[a.id] ? "📷 " : ""}{a.label}
                </option>
              ))}
            </select>
            {(() => {
              const effectiveAvatar = selectedProduct?.avatarId || avatar;
              const hasPhoto = !!avatarImages[effectiveAvatar];
              return (
                <p className="mt-1 text-[10px] text-gray-400">
                  {selectedProduct?.avatarId
                    ? `Using product avatar: ${selectedProduct.avatarId}${hasPhoto ? " · custom photo" : ""}`
                    : hasPhoto
                      ? "Custom photo will be used as model reference"
                      : "Prompt-generated model (no custom photo)"}
                </p>
              );
            })()}
          </section>

          {/* Genre */}
          <section>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Genre
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGenre(g.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    genre === g.id
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </section>

          {/* Scene Count */}
          <section>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Scenes
            </label>
            <div className="flex gap-1.5">
              {SCENE_COUNTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSceneCount(s.value)}
                  className={`flex flex-1 flex-col items-center rounded-md border py-1.5 text-xs transition-colors ${
                    sceneCount === s.value
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span className="font-bold">{s.label}</span>
                  <span className="text-[9px] opacity-70">{s.sub}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Appearance Settings */}
          <section>
            <button
              onClick={() => setShowAppearance((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
            >
              <span className="flex items-center gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                Appearance
                {savingAppearance && (
                  <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                )}
              </span>
              {showAppearance ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showAppearance && (
              <div className="mt-2 flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                {/* Enable Hook */}
                <label className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Show Hook Title</span>
                  <button
                    onClick={() => updateAppearance({ enableHook: !appearance.enableHook })}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      appearance.enableHook ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        appearance.enableHook ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>

                {/* Hook BG Color */}
                <label className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600">Hook BG</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${appearance.hookBgColor}`}
                      onChange={(e) =>
                        updateAppearance({ hookBgColor: e.target.value.replace("#", "") })
                      }
                      className="h-6 w-8 cursor-pointer rounded border border-gray-200 p-0.5"
                    />
                    <span className="font-mono text-[10px] text-gray-400">
                      #{appearance.hookBgColor}
                    </span>
                  </div>
                </label>

                {/* Hook Text Color */}
                <label className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600">Hook Text</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={`#${appearance.hookTextColor}`}
                      onChange={(e) =>
                        updateAppearance({ hookTextColor: e.target.value.replace("#", "") })
                      }
                      className="h-6 w-8 cursor-pointer rounded border border-gray-200 p-0.5"
                    />
                    <span className="font-mono text-[10px] text-gray-400">
                      #{appearance.hookTextColor}
                    </span>
                  </div>
                </label>

                {/* Hook Font Size */}
                <label className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600">Hook Size</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={24}
                      max={96}
                      value={appearance.hookFontSize}
                      onChange={(e) =>
                        updateAppearance({ hookFontSize: Number(e.target.value) })
                      }
                      className="w-14 rounded border border-gray-200 px-1.5 py-0.5 text-center text-xs"
                    />
                    <span className="text-[10px] text-gray-400">px</span>
                  </div>
                </label>

                {/* Overlay Font Size */}
                <label className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600">Overlay Size</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={16}
                      max={64}
                      value={appearance.overlayFontSize}
                      onChange={(e) =>
                        updateAppearance({ overlayFontSize: Number(e.target.value) })
                      }
                      className="w-14 rounded border border-gray-200 px-1.5 py-0.5 text-center text-xs"
                    />
                    <span className="text-[10px] text-gray-400">px</span>
                  </div>
                </label>

                {/* Live preview of hook title */}
                {appearance.enableHook && (
                  <div
                    className="mt-1 rounded px-2 py-1.5 text-center text-xs font-bold"
                    style={{
                      backgroundColor: `#${appearance.hookBgColor}`,
                      color: `#${appearance.hookTextColor}`,
                      fontSize: `${Math.round(appearance.hookFontSize * 0.25)}px`,
                    }}
                  >
                    {editedHookTitle || "HOOK TITLE PREVIEW"}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Generate */}
          <div className="mt-auto">
            <button
              onClick={handleGenerate}
              disabled={!isReadyToGenerate || loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing furniture…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Scenes
                </>
              )}
            </button>
          </div>
        </aside>

        {/* ─── MAIN PANEL ─── */}
        <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 p-5">
          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Success */}
          {jobId && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    Job queued successfully!
                  </p>
                  <p className="text-xs text-green-600">Job ID: {jobId}</p>
                </div>
              </div>
              <Link
                href="/automation"
                className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                <Zap className="h-3.5 w-3.5" />
                View Queue
              </Link>
            </div>
          )}

          {/* Empty state */}
          {!loading && !previewData && !error && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
              <Home className="h-12 w-12 opacity-20" />
              <p className="text-sm">
                Select a product or enter product details, then click Generate Scenes
              </p>
              <p className="text-xs">
                Gemini will analyze the product image and create home-styled scenes
              </p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
              <p className="text-sm font-medium text-gray-600">
                Analyzing furniture &amp; generating scenes…
              </p>
              <p className="text-xs">This takes 10–20 seconds</p>
            </div>
          )}

          {/* Preview */}
          {previewData && !loading && (
            <div className="flex flex-col gap-4">
              {/* Analysis banner */}
              {previewData.analysis?.furnitureType && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
                  <span className="font-semibold text-emerald-800">
                    🔍 Gemini detected:
                  </span>
                  <span className="text-emerald-700 capitalize">
                    {previewData.analysis.furnitureType}
                  </span>
                  {previewData.analysis.style && (
                    <>
                      <span className="text-emerald-400">·</span>
                      <span className="text-emerald-700 capitalize">
                        {previewData.analysis.style}
                      </span>
                    </>
                  )}
                  {previewData.analysis.colorPalette?.length ? (
                    <>
                      <span className="text-emerald-400">·</span>
                      <span className="text-emerald-700">
                        {previewData.analysis.colorPalette.join(", ")}
                      </span>
                    </>
                  ) : null}
                  {previewData.analysis.recommendedRooms?.length ? (
                    <>
                      <span className="text-emerald-400">·</span>
                      <span className="text-emerald-600 text-xs">
                        Rooms: {previewData.analysis.recommendedRooms.join(", ")}
                      </span>
                    </>
                  ) : null}
                </div>
              )}

              {/* Hook title + caption */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Hook Title
                  </label>
                  <input
                    value={editedHookTitle}
                    onChange={(e) => setEditedHookTitle(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                    placeholder="Hook title…"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Hashtags
                  </label>
                  <input
                    value={editedHashtags}
                    onChange={(e) => setEditedHashtags(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                    placeholder="#homedecor #perabotmurah…"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    TikTok Caption
                  </label>
                  <textarea
                    value={editedCaption}
                    onChange={(e) => setEditedCaption(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                    placeholder="TikTok caption…"
                  />
                </div>
              </div>

              {/* Scene cards */}
              <div
                className={`grid gap-3 ${
                  editedScenes.length === 2
                    ? "grid-cols-2"
                    : editedScenes.length <= 3
                      ? "grid-cols-3"
                      : "grid-cols-2"
                }`}
              >
                {editedScenes.map((scene, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    {/* Scene header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Scene {scene.sceneNumber}
                      </span>
                      <div className="flex gap-1.5">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${
                            SHOT_COLORS[scene.shotType] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {scene.shotType}
                        </span>
                        {scene.roomContext && (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 capitalize">
                            {scene.roomContext}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dialog */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Dialog (BM)
                      </label>
                      <textarea
                        value={scene.dialog}
                        onChange={(e) => updateScene(i, "dialog", e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 focus:border-emerald-300 focus:outline-none"
                      />
                    </div>

                    {/* Overlay */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Overlay Text
                      </label>
                      <input
                        value={scene.overlayText}
                        onChange={(e) => updateScene(i, "overlayText", e.target.value)}
                        className="w-full rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 focus:border-emerald-300 focus:outline-none"
                      />
                    </div>

                    {/* Image prompt */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Image Prompt
                      </label>
                      <textarea
                        value={scene.imagePrompt}
                        onChange={(e) => updateScene(i, "imagePrompt", e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 text-[10px] leading-relaxed text-gray-600 focus:border-emerald-300 focus:outline-none"
                      />
                    </div>

                    {/* Video prompt */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                        Video Prompt
                      </label>
                      <textarea
                        value={scene.videoPrompt}
                        onChange={(e) => updateScene(i, "videoPrompt", e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 text-[10px] leading-relaxed text-gray-600 focus:border-emerald-300 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom actions */}
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </button>
                <button
                  onClick={handleConfirmQueue}
                  disabled={queuing}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {queuing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Queuing…
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Confirm &amp; Queue
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ─── PRODUCT PICKER MODAL ─── */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Select Product
              </h2>
              <button
                onClick={() => setShowPicker(false)}
                className="rounded-full p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="border-b border-gray-200 px-5 py-3">
              <input
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingProducts ? (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No products found
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filteredProducts.map((p) => {
                    const img = getProductImage(p);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedProduct(p);
                          setShowPicker(false);
                          setPickerSearch("");
                          // Reset previous generation when product changes
                          setPreviewData(null);
                          setJobId(null);
                          setError(null);
                        }}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 ${
                          selectedProduct?.id === p.id
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200"
                        }`}
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={p.title}
                            className="h-14 w-14 flex-shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded bg-gray-100">
                            <ImageIcon className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-xs font-medium text-gray-900">
                            {p.title}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {p.price}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
