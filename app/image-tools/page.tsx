"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import {
  ImageIcon,
  Upload,
  Sparkles,
  Send,
  Eye,
  EyeOff,
  Loader2,
  Wand2,
  Copy,
  Check,
  Trash2,
  CheckCircle2,
  X,
  Play,
  RefreshCw,
  Save,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ImageVariation {
  description: string;
  imagePrompt: string;
}

interface ImageJobData {
  id: string;
  status: string;
  imagePrompt: string;
  imageOnly: boolean;
  imageUrl: string;
  errorMessage: string;
  createdAt: string;
}

interface SavedPrompt {
  id: string;
  name: string;
  imagePrompt: string;
  createdAt: string;
}

const IMAGE_STYLES: Record<string, string> = {
  product_showcase: "Product Showcase",
  lifestyle: "Lifestyle / In-Use",
  flat_lay: "Flat Lay Composition",
  creative_art: "Creative / Artistic",
  social_media: "Social Media Ready",
};

export default function ImageToolsPage() {
  // Reference image
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState("");
  const [uploading, setUploading] = useState(false);

  // Prompt input mode
  const [promptMode, setPromptMode] = useState<"manual" | "ai">("manual");
  const [manualPrompt, setManualPrompt] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [imageStyle, setImageStyle] = useState("product_showcase");

  // AI generation
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState<ImageVariation[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Queue
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<ImageJobData[]>([]);

  // Automation
  const [startingAuto, setStartingAuto] = useState(false);

  // Saved prompts
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  // UI state
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const adjustHeight = (el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  useLayoutEffect(() => {
    if (hasGenerated) {
      setTimeout(() => {
        promptRefs.current.forEach(adjustHeight);
      }, 0);
    }
  }, [variations, hasGenerated]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      // Only show imageOnly jobs
      setJobs(data.filter((j: ImageJobData) => j.imageOnly));
    } catch {
      // ignore
    }
  }, []);

  // Fetch saved prompts
  const fetchSavedPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/custom-prompts");
      const data = await res.json();
      setSavedPrompts(data.filter((p: SavedPrompt) => p.imagePrompt));
    } catch {
      // ignore
    }
  }, []);

  // Load API key, jobs, and saved prompts
  useEffect(() => {
    const savedKey = localStorage.getItem("gemini_api_key");
    if (savedKey) setApiKey(savedKey);
    fetchJobs();
    fetchSavedPrompts();
  }, [fetchJobs, fetchSavedPrompts]);

  // Auto-poll jobs every 5s when there are generating jobs
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "generating_image");
    if (!hasActive) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Allowed: PNG, JPEG, WebP");
      return;
    }

    // Validate size
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Max 10MB");
      return;
    }

    setReferenceFile(file);
    setReferencePreview(URL.createObjectURL(file));
    setUploadedFilename("");
    setError("");
  };

  // Upload reference image
  const handleUpload = async () => {
    if (!referenceFile) return;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", referenceFile);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }

      setUploadedFilename(data.filename);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Clear reference image
  const clearReference = () => {
    setReferenceFile(null);
    setReferencePreview(null);
    setUploadedFilename("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // AI Generate prompts
  const handleAiGenerate = async () => {
    if (!aiDescription.trim()) {
      setError("Masukkan deskripsi untuk AI generate");
      return;
    }
    if (!apiKey.trim()) {
      setError("Masukkan Gemini API key");
      return;
    }

    setGenerating(true);
    setError("");
    setHasGenerated(false);
    setSentKeys(new Set());
    localStorage.setItem("gemini_api_key", apiKey);

    try {
      const res = await fetch("/api/prompts/ai-generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: aiDescription,
          style: imageStyle,
          apiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
        return;
      }

      setVariations(
        (data.variations || []).map(
          (v: { description: string; imagePrompt?: string }) => ({
            description: v.description || "",
            imagePrompt: v.imagePrompt || "",
          }),
        ),
      );
      setHasGenerated(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  // Send to queue
  const sendToQueue = async (prompt: string, index: number) => {
    // Auto-upload if not done yet
    let refImage = uploadedFilename;
    if (!refImage && referenceFile) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", referenceFile);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          refImage = data.filename;
          setUploadedFilename(data.filename);
        }
      } catch {
        // continue without reference
      } finally {
        setUploading(false);
      }
    }

    const key = `prompt-${index}`;
    setSendingKey(key);

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: prompt,
          imageOnly: true,
          referenceImage: refImage || "",
        }),
      });

      if (res.ok) {
        setSentKeys((prev) => new Set(prev).add(key));
        fetchJobs();
      } else {
        setError("Failed to add to queue");
      }
    } catch {
      setError("Failed to add to queue");
    } finally {
      setSendingKey(null);
    }
  };

  // Save manual prompt
  const handleSavePrompt = async () => {
    if (!manualPrompt.trim() || !savePromptName.trim()) return;
    setSavingPrompt(true);
    try {
      const res = await fetch("/api/custom-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: savePromptName.trim(),
          imagePrompt: manualPrompt,
        }),
      });
      if (res.ok) {
        setSavePromptName("");
        setShowSaveForm(false);
        fetchSavedPrompts();
      }
    } catch {
      setError("Failed to save prompt");
    } finally {
      setSavingPrompt(false);
    }
  };

  // Delete saved prompt
  const handleDeleteSavedPrompt = async (id: string) => {
    try {
      await fetch(`/api/custom-prompts/${id}`, { method: "DELETE" });
      fetchSavedPrompts();
    } catch {
      // ignore
    }
  };

  // Load saved prompt into manual textarea
  const loadSavedPrompt = (prompt: SavedPrompt) => {
    setManualPrompt(prompt.imagePrompt);
    setShowSavedPrompts(false);
  };

  // Send manual prompt to queue
  const sendManualToQueue = async () => {
    if (!manualPrompt.trim()) {
      setError("Masukkan prompt dulu");
      return;
    }
    await sendToQueue(manualPrompt, -1);
  };

  // Queue all variations
  const handleQueueAll = async () => {
    for (let i = 0; i < variations.length; i++) {
      if (!sentKeys.has(`prompt-${i}`)) {
        await sendToQueue(variations[i].imagePrompt, i);
      }
    }
  };

  // Copy to clipboard
  const handleCopy = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Delete job
  const handleDeleteJob = async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      fetchJobs();
    } catch {
      // ignore
    }
  };

  // Start automation — trigger extension to process queue
  const handleStartAuto = async () => {
    setStartingAuto(true);
    setError("");
    try {
      const res = await fetch("/api/jobs/start-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No pending jobs");
      }
      fetchJobs();
    } catch {
      setError("Failed to start automation");
    } finally {
      setStartingAuto(false);
    }
  };

  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const generatingCount = jobs.filter(
    (j) => j.status === "generating_image",
  ).length;
  const completedCount = jobs.filter((j) => j.status === "ready").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ImageIcon className="h-6 w-6 text-pink-500" />
          Image Creation Tools
        </h1>
        <p className="text-sm text-gray-500">
          Upload reference image, generate prompts (AI or manual), and send to
          Google Flow
        </p>
      </div>

      {/* Reference Image Upload */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          1. Reference Image
        </h2>

        <div className="flex items-start gap-4">
          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex h-40 w-40 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-pink-400 hover:bg-pink-50"
          >
            {referencePreview ? (
              <img
                src={referencePreview}
                alt="Reference"
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <>
                <Upload className="mb-2 h-8 w-8 text-gray-400" />
                <span className="text-xs text-gray-500">Click to upload</span>
                <span className="text-[10px] text-gray-400">
                  PNG, JPG, WebP
                </span>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* File info */}
          <div className="flex-1 space-y-2">
            {referenceFile && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {referenceFile.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({(referenceFile.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    onClick={clearReference}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>

                {uploadedFilename ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 size={14} />
                    Uploaded: {uploadedFilename}
                  </div>
                ) : (
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Upload size={12} />
                    )}
                    Upload Reference
                  </button>
                )}
              </>
            )}

            {!referenceFile && (
              <p className="text-xs text-gray-400">
                Upload an image to use as reference for Google Flow generation.
                The AI will keep your image&apos;s style and composition.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          2. Image Prompt
        </h2>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setPromptMode("manual")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              promptMode === "manual"
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Wand2 size={14} />
            Manual
          </button>
          <button
            onClick={() => setPromptMode("ai")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              promptMode === "ai"
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Sparkles size={14} />
            AI Generate
          </button>
        </div>

        {/* Manual Mode */}
        {promptMode === "manual" && (
          <div className="space-y-3">
            {/* Saved Prompts Toggle */}
            {savedPrompts.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSavedPrompts(!showSavedPrompts)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  <BookmarkPlus size={14} />
                  Saved Prompts ({savedPrompts.length})
                  {showSavedPrompts ? (
                    <ChevronUp size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                </button>

                {showSavedPrompts && (
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                    {savedPrompts.map((sp) => (
                      <div
                        key={sp.id}
                        className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white cursor-pointer group"
                      >
                        <div
                          className="min-w-0 flex-1"
                          onClick={() => loadSavedPrompt(sp)}
                        >
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {sp.name}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {sp.imagePrompt.substring(0, 80)}
                            {sp.imagePrompt.length > 80 ? "..." : ""}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSavedPrompt(sp.id);
                          }}
                          className="ml-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <textarea
              value={manualPrompt}
              onChange={(e) => setManualPrompt(e.target.value)}
              rows={4}
              placeholder="Enter your image prompt here... e.g., 'From the image uploaded, accurate scale, no alter, no redesign. Create a professional product showcase on a clean white background with studio lighting.'"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={sendManualToQueue}
                disabled={!manualPrompt.trim() || sendingKey === "prompt--1"}
                className="flex items-center gap-1.5 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
              >
                {sendingKey === "prompt--1" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : sentKeys.has("prompt--1") ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Send size={14} />
                )}
                {sentKeys.has("prompt--1") ? "Added!" : "Add to Queue"}
              </button>

              {/* Save Prompt Button */}
              {manualPrompt.trim() && !showSaveForm && (
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <Save size={14} />
                  Save Prompt
                </button>
              )}
            </div>

            {/* Save prompt form */}
            {showSaveForm && (
              <div className="flex items-center gap-2 rounded-lg border border-pink-200 bg-pink-50 p-3">
                <input
                  type="text"
                  value={savePromptName}
                  onChange={(e) => setSavePromptName(e.target.value)}
                  placeholder="Prompt name (e.g., Product Showcase Clean BG)"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSavePrompt();
                  }}
                  autoFocus
                />
                <button
                  onClick={handleSavePrompt}
                  disabled={savingPrompt || !savePromptName.trim()}
                  className="flex items-center gap-1 rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
                >
                  {savingPrompt ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveForm(false);
                    setSavePromptName("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* AI Mode */}
        {promptMode === "ai" && (
          <div className="space-y-4">
            {/* Description input */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Describe what you want
              </label>
              <textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                rows={3}
                placeholder="e.g., 'A minimalist sling bag product photo with soft lighting' or 'Creative social media post for skincare product'"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Style selection */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Image Style
              </label>
              <select
                value={imageStyle}
                onChange={(e) => setImageStyle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {Object.entries(IMAGE_STYLES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Gemini API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleAiGenerate}
              disabled={generating || !aiDescription.trim() || !apiKey.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {generating ? "Generating..." : "Generate Prompts"}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* AI Variations Output */}
      {promptMode === "ai" && hasGenerated && variations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Generated Variations ({variations.length})
            </h2>
            <button
              onClick={handleQueueAll}
              className="flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-pink-700"
            >
              <Send size={12} />
              Queue All
            </button>
          </div>

          {variations.map((v, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                  {v.description}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopy(v.imagePrompt, `copy-${i}`)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                  >
                    {copiedKey === `copy-${i}` ? (
                      <Check size={12} className="text-green-500" />
                    ) : (
                      <Copy size={12} />
                    )}
                    Copy
                  </button>
                  <button
                    onClick={() => sendToQueue(v.imagePrompt, i)}
                    disabled={
                      sendingKey === `prompt-${i}` ||
                      sentKeys.has(`prompt-${i}`)
                    }
                    className="flex items-center gap-1 rounded bg-pink-600 px-2 py-1 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
                  >
                    {sendingKey === `prompt-${i}` ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : sentKeys.has(`prompt-${i}`) ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <Send size={12} />
                    )}
                    {sentKeys.has(`prompt-${i}`) ? "Queued!" : "Queue"}
                  </button>
                </div>
              </div>

              <textarea
                ref={(el) => {
                  promptRefs.current[i] = el;
                }}
                value={v.imagePrompt}
                onChange={(e) => {
                  const newVars = [...variations];
                  newVars[i] = { ...newVars[i], imagePrompt: e.target.value };
                  setVariations(newVars);
                }}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows={3}
              />
            </div>
          ))}
        </div>
      )}

      {/* Job Queue */}
      {jobs.length > 0 && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Image Job Queue
            </h2>
            <div className="flex items-center gap-2 text-xs">
              {pendingCount > 0 && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-yellow-700">
                  {pendingCount} pending
                </span>
              )}
              {generatingCount > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                  {generatingCount} generating
                </span>
              )}
              {completedCount > 0 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                  {completedCount} done
                </span>
              )}
              <button
                onClick={fetchJobs}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Refresh"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Start Auto Button */}
          {pendingCount > 0 && (
            <button
              onClick={handleStartAuto}
              disabled={startingAuto}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pink-700 disabled:opacity-50"
            >
              {startingAuto ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} />
              )}
              {startingAuto
                ? "Starting..."
                : `Start Auto (${pendingCount} job${pendingCount > 1 ? "s" : ""})`}
            </button>
          )}

          <div className="space-y-2">
            {jobs.slice(0, 10).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-gray-700">
                    {job.imagePrompt.substring(0, 80)}
                    {job.imagePrompt.length > 80 ? "..." : ""}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-medium ${
                        job.status === "ready"
                          ? "bg-green-100 text-green-700"
                          : job.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : job.status === "generating_image"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {job.status === "generating_image"
                        ? "generating"
                        : job.status}
                    </span>
                    {job.errorMessage && (
                      <span className="text-red-400" title={job.errorMessage}>
                        ⚠️
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteJob(job.id)}
                  className="ml-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {jobs.length > 10 && (
            <p className="text-center text-xs text-gray-400">
              and {jobs.length - 10} more...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
