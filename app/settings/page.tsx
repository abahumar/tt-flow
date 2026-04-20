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
