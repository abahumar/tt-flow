"use client";

import { useState, useEffect } from "react";
import {
  Save,
  RefreshCw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
  Upload,
  ImageIcon,
} from "lucide-react";

interface SettingEntry {
  key: string;
  value: string;
}

interface CustomPrompt {
  id: string;
  name: string;
  imagePrompt: string;
  videoPrompt: string;
  createdAt: string;
}

const AVATARS: Record<string, string> = {
  woman_malay_hijab: "🧕 Wanita Melayu (Bertudung)",
  woman_malay_freehair: "🧕 Wanita Melayu 3 (Bertudung)",
  woman_malay_corporate: "👩‍💼 Wanita Melayu (Korporat)",
  woman_malay_elder: "👵 Makcik Melayu (50+)",
  man_malay_casual: "👨 Lelaki Melayu (Casual)",
  man_malay_corporate: "👨‍💼 Lelaki Melayu (Korporat)",
  man_malay_elder: "👴 Pakcik Melayu (50+)",
  woman_malay_student: "🎓 Wanita Melayu (Student/Gen Z)",
  woman_malay_mother: "👩‍👧 Ibu Muda Melayu",
  woman_malay_beauty: "💄 Beauty Influencer",
  woman_chinese_casual: "🧕 Wanita Melayu 2 (Bertudung)",
  woman_malay_homecook: "🍳 Suri Rumah / Home Cook",
  man_malay_father: "👨‍👦 Ayah Muda",
  couple_malay: "💑 Pasangan Melayu (Couple)",
};

const SETTING_FIELDS = [
  {
    key: "extension_id",
    label: "Chrome Extension ID",
    placeholder: "ohdoccgglgmopfclmolmhhchebmmn...",
    type: "text",
  },
  {
    key: "gemini_api_key",
    label: "Gemini API Key",
    placeholder: "AIzaSy...",
    type: "password",
  },
  {
    key: "openai_api_key",
    label: "ChatGPT API Key",
    placeholder: "sk-...",
    type: "password",
  },
  {
    key: "telegram_bot_token",
    label: "Telegram Bot Token",
    placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    type: "password",
  },
  {
    key: "telegram_chat_id",
    label: "Telegram Chat ID / Channel",
    placeholder: "@mychannel or -1001234567890",
    type: "text",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Custom prompts state
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);
  const [newPromptName, setNewPromptName] = useState("");
  const [newImagePrompt, setNewImagePrompt] = useState("");
  const [newVideoPrompt, setNewVideoPrompt] = useState("");
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editImagePrompt, setEditImagePrompt] = useState("");
  const [editVideoPrompt, setEditVideoPrompt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Avatar images state
  const [avatarImages, setAvatarImages] = useState<Record<string, string>>({});
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null);

  const fetchCustomPrompts = async () => {
    const res = await fetch("/api/custom-prompts");
    const data = await res.json();
    setCustomPrompts(data);
  };

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingEntry[]) => {
        const map: Record<string, string> = {};
        for (const s of data) map[s.key] = s.value;
        setSettings(map);
        setLoaded(true);
        // Load avatar images
        if (map.avatar_images) {
          try {
            setAvatarImages(JSON.parse(map.avatar_images));
          } catch {
            // ignore parse error
          }
        }
      });
    fetchCustomPrompts();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
  };

  const saveAvatarImages = async (updated: Record<string, string>) => {
    setAvatarImages(updated);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_images: JSON.stringify(updated) }),
    });
  };

  const handleAvatarImageUpload = async (avatarId: string, file: File) => {
    setUploadingAvatar(avatarId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const updated = { ...avatarImages, [avatarId]: data.filename };
      await saveAvatarImages(updated);
    } catch (e) {
      console.error("Avatar image upload failed:", e);
    }
    setUploadingAvatar(null);
  };

  const handleAvatarImageRemove = async (avatarId: string) => {
    const updated = { ...avatarImages };
    delete updated[avatarId];
    await saveAvatarImages(updated);
  };

  const handleAddPrompt = async () => {
    if (
      !newPromptName.trim() ||
      (!newImagePrompt.trim() && !newVideoPrompt.trim())
    )
      return;
    setAddingPrompt(true);
    await fetch("/api/custom-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPromptName,
        imagePrompt: newImagePrompt,
        videoPrompt: newVideoPrompt,
      }),
    });
    setNewPromptName("");
    setNewImagePrompt("");
    setNewVideoPrompt("");
    setShowAddForm(false);
    setAddingPrompt(false);
    fetchCustomPrompts();
  };

  const startEditing = (prompt: CustomPrompt) => {
    setEditingPromptId(prompt.id);
    setEditName(prompt.name);
    setEditImagePrompt(prompt.imagePrompt);
    setEditVideoPrompt(prompt.videoPrompt);
    setExpandedPromptId(prompt.id);
  };

  const handleEditPrompt = async () => {
    if (
      !editingPromptId ||
      !editName.trim() ||
      (!editImagePrompt.trim() && !editVideoPrompt.trim())
    )
      return;
    setSavingEdit(true);
    await fetch(`/api/custom-prompts/${editingPromptId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        imagePrompt: editImagePrompt,
        videoPrompt: editVideoPrompt,
      }),
    });
    setEditingPromptId(null);
    setSavingEdit(false);
    fetchCustomPrompts();
  };

  const handleDeletePrompt = async (id: string) => {
    if (!confirm("Delete this prompt?")) return;
    await fetch(`/api/custom-prompts/${id}`, { method: "DELETE" });
    fetchCustomPrompts();
  };

  if (!loaded)
    return <p className="py-8 text-center text-gray-400">Loading...</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-gray-500">
          Configure extension, prompts, and defaults
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        {SETTING_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {field.label}
            </label>
            <input
              type={field.type}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder={field.placeholder}
              value={settings[field.key] || ""}
              onChange={(e) =>
                setSettings((s) => ({ ...s, [field.key]: e.target.value }))
              }
            />
          </div>
        ))}

        {/* AI Provider Selector */}
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-gray-700">
            AI Provider
          </legend>
          <p className="mb-3 text-xs text-gray-500">
            Choose which AI is used for all prompt and content generation
          </p>
          <div className="flex gap-4">
            {(["gemini", "openai"] as const).map((p) => (
              <label
                key={p}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm transition-colors has-[:checked]:border-rose-500 has-[:checked]:bg-rose-50"
              >
                <input
                  type="radio"
                  name="ai_provider"
                  value={p}
                  checked={(settings["ai_provider"] || "gemini") === p}
                  onChange={() =>
                    setSettings((s) => ({ ...s, ai_provider: p }))
                  }
                  className="accent-rose-500"
                />
                {p === "gemini" ? "Gemini (Google)" : "ChatGPT (OpenAI)"}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      {/* Auto-Post Toggle */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold">TikTok Posting</h2>
          <p className="text-xs text-gray-500">
            Configure automatic posting behavior
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Auto-post to TikTok
            </p>
            <p className="text-xs text-gray-500">
              Automatically post videos to TikTok after generation completes.
              When off, videos pause at &ldquo;Ready&rdquo; status for manual
              posting.
            </p>
          </div>
          <button
            onClick={async () => {
              const newValue =
                settings["autoPostEnabled"] === "true" ? "false" : "true";
              setSettings((s) => ({ ...s, autoPostEnabled: newValue }));
              await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ autoPostEnabled: newValue }),
              });
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings["autoPostEnabled"] === "true"
                ? "bg-rose-500"
                : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform ${
                settings["autoPostEnabled"] === "true"
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Parallel Jobs Toggle */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold">Performance</h2>
          <p className="text-xs text-gray-500">
            Control how many video generation jobs run at the same time
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Parallel video generation
            </p>
            <p className="text-xs text-gray-500">
              Run 2 jobs at once (one per browser tab). Settings sync to
              extension every ~1 minute.
            </p>
          </div>
          <button
            onClick={async () => {
              const newValue =
                settings["parallelJobs"] === "2" ? "1" : "2";
              setSettings((s) => ({ ...s, parallelJobs: newValue }));
              await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parallelJobs: newValue }),
              });
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              settings["parallelJobs"] === "2"
                ? "bg-rose-500"
                : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform ${
                settings["parallelJobs"] === "2"
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Avatar Images Section */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold">Avatar Images</h2>
          <p className="text-xs text-gray-500">
            Upload your own reference image for each avatar. When set, this
            image will be used as model reference instead of AI-generated faces.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(AVATARS).map(([id, label]) => (
            <div
              key={id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              {/* Thumbnail */}
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
                {avatarImages[id] ? (
                  <img
                    src={`/api/upload/${avatarImages[id]}`}
                    alt={label}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
              {/* Info & actions */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">
                  {label}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <label className="flex cursor-pointer items-center gap-1 rounded bg-rose-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-rose-600 transition-colors">
                    {uploadingAvatar === id ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    {avatarImages[id] ? "Change" : "Upload"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarImageUpload(id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {avatarImages[id] && (
                    <button
                      onClick={() => handleAvatarImageRemove(id)}
                      className="flex items-center gap-0.5 rounded bg-gray-200 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Prompts Section */}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Custom Image Prompts</h2>
            <p className="text-xs text-gray-500">
              Create custom prompts for image generation. Use {"{title}"},{" "}
              {"{description}"}, {"{price}"} as placeholders.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Prompt
          </button>
        </div>

        {/* Add new prompt form */}
        {showAddForm && (
          <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Prompt Name
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="e.g., Minimalist Product Shot"
                value={newPromptName}
                onChange={(e) => setNewPromptName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Image Prompt
              </label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="From the image uploaded, create a professional product photo of {title}..."
                value={newImagePrompt}
                onChange={(e) => setNewImagePrompt(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Video Prompt
              </label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                placeholder="Create a 15-second video showcasing {title}..."
                value={newVideoPrompt}
                onChange={(e) => setNewVideoPrompt(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddPrompt}
                disabled={
                  addingPrompt ||
                  !newPromptName.trim() ||
                  (!newImagePrompt.trim() && !newVideoPrompt.trim())
                }
                className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {addingPrompt ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {addingPrompt ? "Saving..." : "Save Prompt"}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Prompt list */}
        {customPrompts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 py-6 text-center text-sm text-gray-400">
            No custom prompts yet. Click &quot;Add Prompt&quot; to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {customPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden"
              >
                <div className="flex items-center justify-between p-3">
                  <button
                    onClick={() =>
                      setExpandedPromptId(
                        expandedPromptId === prompt.id ? null : prompt.id,
                      )
                    }
                    className="flex items-center gap-2 text-sm font-medium text-gray-800 hover:text-rose-600 transition-colors"
                  >
                    {expandedPromptId === prompt.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    {prompt.name}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditing(prompt)}
                      className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePrompt(prompt.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {expandedPromptId === prompt.id && (
                  <div className="border-t border-gray-200 p-3 space-y-2">
                    {editingPromptId === prompt.id ? (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            Name
                          </label>
                          <input
                            type="text"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            Image Prompt
                          </label>
                          <textarea
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            value={editImagePrompt}
                            onChange={(e) => setEditImagePrompt(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            Video Prompt
                          </label>
                          <textarea
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                            value={editVideoPrompt}
                            onChange={(e) => setEditVideoPrompt(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleEditPrompt}
                            disabled={
                              savingEdit ||
                              !editName.trim() ||
                              (!editImagePrompt.trim() &&
                                !editVideoPrompt.trim())
                            }
                            className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
                          >
                            {savingEdit ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            {savingEdit ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            onClick={() => setEditingPromptId(null)}
                            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {prompt.imagePrompt && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">
                              Image Prompt
                            </span>
                            <p className="mt-0.5 text-xs text-gray-700 whitespace-pre-wrap">
                              {prompt.imagePrompt}
                            </p>
                          </div>
                        )}
                        {prompt.videoPrompt && (
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">
                              Video Prompt
                            </span>
                            <p className="mt-0.5 text-xs text-gray-700 whitespace-pre-wrap">
                              {prompt.videoPrompt}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
