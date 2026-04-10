"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import Link from "next/link";

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  shopName: string;
  images: string;
  usp: string;
  targetAudience: string;
  avatarId: string;
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
}

interface PresetConfig {
  avatar: string;
  genre: string;
  format: string;
  sceneCount: number;
  includeDialog: boolean;
  enableHook: boolean;
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
  hookBgColor: "E91E63",
  hookTextColor: "FFFFFF",
  hookFontSize: 36,
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

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    setProducts(await res.json());
    setLoading(false);
  }, []);

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

    try {
      const res = await fetch("/api/quick-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({ ...e, [productId]: data.error }));
      } else {
        setResults((r) => ({ ...r, [productId]: data }));
      }
    } catch {
      setErrors((e) => ({ ...e, [productId]: "Network error" }));
    } finally {
      setGenerating(null);
    }
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
                    <p className="truncate text-xs text-gray-500">
                      {p.shopName}
                    </p>
                    <p className="text-sm font-bold text-rose-500">{p.price}</p>
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

                {/* Avatar selector per product */}
                <div className="border-t border-gray-100 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <select
                      value={p.avatarId || ""}
                      onChange={(e) =>
                        handleUpdateAvatar(p.id, e.target.value)
                      }
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="">Use default preset</option>
                      {Object.entries(AVATARS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

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
                    disabled={isGenerating || !hasGeminiKey}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-linear-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : result ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isGenerating
                      ? "Generating..."
                      : result
                        ? "Regenerate"
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
          generates{" "}
          {FORMATS[preset.format]?.split("—")[1]?.trim() || "scenes"} using{" "}
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
