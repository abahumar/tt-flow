"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Video,
  RefreshCw,
  ExternalLink,
  Chrome,
  PenLine,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface Product {
  id: string;
  url: string;
  title: string;
  description: string;
  images: string;
  price: string;
  shopName: string;
  videoReady: boolean;
  scrapedAt: string;
  _count?: { videoJobs: number };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [creatingJobId, setCreatingJobId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({
    url: "",
    title: "",
    description: "",
    price: "",
    shopName: "",
  });

  const fetchProducts = async () => {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Method 1: Scrape via Chrome extension (sends URL, extension opens tab and scrapes)
  const handleScrapeViaExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setScraping(true);

    // Try to communicate with the extension
    try {
      // Check if extension is available by trying to send a message via a custom event
      const extensionId = await getExtensionId();
      if (extensionId) {
        // Use chrome.runtime.sendMessage via external messaging
        const result = await sendToExtension(extensionId, {
          type: "SCRAPE_PRODUCT_BY_URL",
          payload: { url: url.trim() },
        });

        if (result?.success) {
          setUrl("");
          fetchProducts();
          setScraping(false);
          return;
        }
      }
    } catch {
      // Extension not available, fall through
    }

    // Fallback: try server-side (will likely fail with security check)
    const res = await fetch("/api/products/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });

    if (res.ok) {
      setUrl("");
      fetchProducts();
    } else {
      const err = await res.json();
      if (err.needsExtension) {
        alert(
          "TikTok blocks direct scraping.\n\n" +
            "Options:\n" +
            "1. Open the product page in your browser, then click 'Scrape Current Page' in the extension side panel\n" +
            "2. Use 'Add Manually' below to enter product info by hand",
        );
        setShowManual(true);
        setManual((m) => ({ ...m, url: url.trim() }));
      } else {
        alert(err.error || "Failed to scrape product");
      }
    }
    setScraping(false);
  };

  // Method 2: Manual product entry
  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.url.trim() || !manual.title.trim()) return;
    setScraping(true);

    const res = await fetch("/api/products/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual }),
    });

    if (res.ok) {
      setManual({
        url: "",
        title: "",
        description: "",
        price: "",
        shopName: "",
      });
      setShowManual(false);
      fetchProducts();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to add product");
    }
    setScraping(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product and all its video jobs?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    fetchProducts();
  };

  const handleCreateJob = async (productId: string) => {
    setCreatingJobId(productId);
    const res = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoReady: true }),
    });
    if (res.ok) {
      setAddedIds((prev) => new Set(prev).add(productId));
      fetchProducts();
    } else {
      alert("Failed to mark product");
    }
    setCreatingJobId(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Katalog Produk</h1>
        <p className="text-sm text-gray-500">
          Add TikTok Shop products via Chrome extension or manually
        </p>
      </div>

      {/* Scrape via URL form */}
      <form
        onSubmit={handleScrapeViaExtension}
        className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://shop.tiktok.com/product/..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            required
          />
          <button
            type="submit"
            disabled={scraping}
            className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
          >
            {scraping ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Chrome className="h-4 w-4" />
            )}
            {scraping ? "Scraping..." : "Fetch Produk"}
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Chrome className="h-3 w-3" /> Best: Open product page in browser,
            use extension to scrape
          </span>
          <span>·</span>
          <button
            type="button"
            onClick={() => setShowManual(!showManual)}
            className="flex items-center gap-1 text-blue-500 hover:underline"
          >
            <PenLine className="h-3 w-3" />{" "}
            {showManual ? "Hide manual form" : "Add manually"}
          </button>
        </div>
      </form>

      {/* Manual entry form */}
      {showManual && (
        <form
          onSubmit={handleManualAdd}
          className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4"
        >
          <h3 className="text-sm font-semibold text-blue-700">
            Add Product Manually
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="url"
              value={manual.url}
              onChange={(e) =>
                setManual((m) => ({ ...m, url: e.target.value }))
              }
              placeholder="Product URL *"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
            <input
              type="text"
              value={manual.title}
              onChange={(e) =>
                setManual((m) => ({ ...m, title: e.target.value }))
              }
              placeholder="Product Title *"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
            <input
              type="text"
              value={manual.price}
              onChange={(e) =>
                setManual((m) => ({ ...m, price: e.target.value }))
              }
              placeholder="Price (e.g. RM 29.90)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={manual.shopName}
              onChange={(e) =>
                setManual((m) => ({ ...m, shopName: e.target.value }))
              }
              placeholder="Shop Name"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <textarea
            value={manual.description}
            onChange={(e) =>
              setManual((m) => ({ ...m, description: e.target.value }))
            }
            placeholder="Product description (helps with better AI prompts)"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={scraping}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </form>
      )}

      {/* Product list */}
      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading...</p>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400">
          No products yet. Paste a TikTok Shop URL above to get started.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => {
            const images: string[] = JSON.parse(p.images || "[]");
            return (
              <div
                key={p.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Thumbnail */}
                <div className="aspect-square w-full overflow-hidden bg-gray-100">
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

                {/* Info */}
                <div className="flex flex-col flex-1 p-3">
                  <h3 className="text-sm font-semibold line-clamp-2 leading-tight">
                    {p.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {p.shopName}
                  </p>
                  <p className="text-sm font-bold text-rose-500 mt-1">
                    {p.price}
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
                  >
                    <ExternalLink className="h-3 w-3" /> View on TikTok
                  </a>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-auto pt-2">
                    {p.videoReady || addedIds.has(p.id) ? (
                      <span className="flex items-center justify-center gap-1 flex-1 rounded-lg bg-green-50 border border-green-200 px-2 py-1.5 text-xs font-medium text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> Siap Video
                      </span>
                    ) : (
                      <button
                        onClick={() => handleCreateJob(p.id)}
                        disabled={creatingJobId === p.id}
                        className="flex items-center justify-center gap-1 flex-1 rounded-lg bg-rose-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
                      >
                        {creatingJobId === p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Video className="h-3 w-3" />
                        )}
                        {creatingJobId === p.id ? "..." : "Create Video"}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Helper: get extension ID from settings
async function getExtensionId(): Promise<string | null> {
  try {
    const res = await fetch("/api/settings");
    const settings = await res.json();
    const entry = settings.find(
      (s: { key: string; value: string }) => s.key === "extension_id",
    );
    return entry?.value || null;
  } catch {
    return null;
  }
}

// Helper: send message to Chrome extension via externally_connectable
async function sendToExtension(
  extensionId: string,
  message: { type: string; payload?: unknown },
): Promise<{ success?: boolean; error?: string; product?: unknown } | null> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(extensionId, message, (response) => {
          resolve(response || null);
        });
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}
