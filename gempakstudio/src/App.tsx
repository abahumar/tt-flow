import React, { useState, useEffect } from 'react';
import { 
  Upload, Copy, Check, RefreshCw, AlertCircle, 
  Zap, Loader, Download, 
  Plus, User, Box, Sparkles, Wand2, Smartphone, Layers, FileText, Package, Smile, BookOpen, Heart, ShoppingBag,
  Coffee, Eye, Mic, Video, RotateCcw, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateTikTokScript, generateSceneImage } from './services/geminiService';

const TikTokScriptGenerator = () => {
  const [images, setImages] = useState<string[]>([]);
  const [productName, setProductName] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [personaType, setPersonaType] = useState("woman_malay_hijab");
  const [genre, setGenre] = useState("comedy"); 
  const [numScenes, setNumScenes] = useState(5);
  const [loading, setLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  
  const [stepImages, setStepImages] = useState<Record<number, string>>({});
  const [stepLoading, setStepLoading] = useState<Record<number, boolean>>({});
  const [generationStatus, setGenerationStatus] = useState("");
  
  const [showSafeZone, setShowSafeZone] = useState(true);
  
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | string | null>(null);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const processImageToCanvas = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const targetWidth = 1080;
                const targetHeight = 1920;
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context");

                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, targetWidth, targetHeight);

                const imgAspect = img.width / img.height;
                const canvasAspect = targetWidth / targetHeight;
                
                let drawWidth, drawHeight, offsetX, offsetY;

                if (imgAspect > canvasAspect) {
                    drawHeight = targetHeight;
                    drawWidth = targetHeight * imgAspect;
                    offsetY = 0;
                    offsetX = (targetWidth - drawWidth) / 2;
                } else {
                    drawWidth = targetWidth;
                    drawHeight = targetWidth / imgAspect;
                    offsetX = 0;
                    offsetY = (targetHeight - drawHeight) / 2;
                }

                ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        reject(new Error("Canvas blob creation failed"));
                    }
                }, 'image/png', 0.95);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = (e) => reject(e);
        img.src = dataUrl;
    });
  };

  const handleDownloadSingleImage = async (dataUrl: string, filename: string) => {
    try {
        const blobUrl = await processImageToCanvas(dataUrl);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
        }, 5000); 
    } catch (e) {
        console.error("Canvas processing failed", e);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  const handleDownloadAllImages = async () => {
    if (downloadingAll) return;
    setDownloadingAll(true);
    try {
        const indices = Object.keys(stepImages).map(Number).sort((a, b) => a - b);
        for (const idx of indices) {
            await handleDownloadSingleImage(stepImages[idx], `scene-${idx + 1}_9-16.png`);
            await delay(1500); 
        }
    } catch (e) {
        console.error("Batch download failed", e);
        setError("Gagal memuat turun semua gambar. Sila cuba satu per satu.");
    } finally {
        setDownloadingAll(false);
    }
  };

  const handleDownloadScript = () => {
    if (!result) return;
    const content = `TIKTOK VIRAL SCRIPT (${result.genre_style})
-------------------
TITLE: ${result.script_title}
VISUAL DNA: ${result.visual_dna}
-------------------

${result.structure.map((s: any) => 
`[${s.time}] ${s.stage.replace(/_/g, ' ')}
VISUAL INSTRUCTION: ${s.visual_prompt_en}
DIALOG (BM): "${s.script}"
-------------------`
).join('\n')}

Generated by GempakStudio Engine.
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `script-${Date.now()}.txt`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      if (files.length > 10) {
        setError("Maksimum 10 gambar sahaja.");
        return;
      }
      const promises = files.map((file: File) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });
      Promise.all(promises).then(base64Images => {
        setImages(base64Images);
        setError(null);
        setResult(null); 
        setStepImages({});
      });
    }
  };

  const handleGenerateSingleScene = async (prompt: string, index: number, visualDna: string, productRef: string, characterRef?: string) => {
    setStepLoading(prev => ({ ...prev, [index]: true }));
    try {
      const generated = await generateSceneImage(prompt, visualDna, productRef, characterRef);
      if (generated) {
        setStepImages(prev => ({ ...prev, [index]: generated }));
        return generated;
      }
    } catch (err) {
      console.error(`Error generating scene ${index}`, err);
    } finally {
      setStepLoading(prev => ({ ...prev, [index]: false }));
    }
    return null;
  };

  const generateScript = async () => {
    if (images.length === 0) {
      setError("Sila upload gambar produk dahulu.");
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setStepImages({});
    setGenerationStatus("Merangka Skrip & Teknik Videografi...");

    try {
      const scriptResult = await generateTikTokScript(productName, additionalContext, personaType, genre, images, numScenes);
      setResult(scriptResult);
      setLoading(false);

      if (scriptResult.structure && scriptResult.structure.length > 0) {
        setGenerationStatus("Generating Scene 1 (Master Reference)...");
        const scene1ImageRef = await handleGenerateSingleScene(
            scriptResult.structure[0].visual_prompt_en, 0, scriptResult.visual_dna, images[0] 
        );

        if (!scene1ImageRef) {
          console.error("Failed to generate master reference image");
        }

        if (scriptResult.structure.length > 1) {
          setGenerationStatus("Generating remaining scenes...");
          
          // Generate scenes in sequence for better stability and rate limit management
          for (let i = 1; i < scriptResult.structure.length; i++) {
            setGenerationStatus(`Generating Scene ${i + 1} of ${scriptResult.structure.length}...`);
            await handleGenerateSingleScene(
              scriptResult.structure[i].visual_prompt_en, 
              i, 
              scriptResult.visual_dna, 
              images[0], 
              scene1ImageRef || undefined
            );
            // Small delay between scenes
            await delay(1000);
          }
        }
      }
      setGenerationStatus(""); 

    } catch (err: any) {
      console.error("Generation error:", err);
      setError(`Gagal menjana: ${err.message || "Sila cuba lagi."}`);
      setLoading(false);
      setGenerationStatus("");
    }
  };

  const handleRegenerateScene = async (index: number) => {
    if (!result || loading) return;
    const characterRef = index > 0 ? stepImages[0] : undefined;
    setGenerationStatus(`Regenerating Scene ${index + 1}...`);
    await handleGenerateSingleScene(
        result.structure[index].visual_prompt_en, index, result.visual_dna, images[0], characterRef
    );
    setGenerationStatus("");
  };

  const handleUpdateVisualPrompt = (index: number, newPrompt: string) => {
    if (!result) return;
    const newStructure = [...result.structure];
    newStructure[index] = { ...newStructure[index], visual_prompt_en: newPrompt };
    setResult({ ...result, structure: newStructure });
  };

  const genres = [
    { id: 'comedy', label: 'Kelakar', icon: <Smile size={18}/>, color: 'text-yellow-400', border: 'border-yellow-500', bg: 'bg-yellow-500/10' },
    { id: 'educational', label: 'Tips/Ilmiah', icon: <BookOpen size={18}/>, color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-500/10' },
    { id: 'emotional', label: 'Emosi/Sedih', icon: <Heart size={18}/>, color: 'text-pink-400', border: 'border-pink-500', bg: 'bg-pink-500/10' },
    { id: 'hardsell', label: 'Hard Sell', icon: <ShoppingBag size={18}/>, color: 'text-red-400', border: 'border-red-500', bg: 'bg-red-500/10' },
    { id: 'softsell', label: 'Soft Sell', icon: <Coffee size={18}/>, color: 'text-teal-400', border: 'border-teal-500', bg: 'bg-teal-500/10' },
    { id: 'pov', label: 'POV (Situasi)', icon: <Eye size={18}/>, color: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-500/10' },
    { id: 'asmr', label: 'ASMR', icon: <Mic size={18}/>, color: 'text-indigo-400', border: 'border-indigo-500', bg: 'bg-indigo-500/10' },
    { id: 'vlog', label: 'Vlog Harian', icon: <Video size={18}/>, color: 'text-orange-400', border: 'border-orange-500', bg: 'bg-orange-500/10' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-pink-500 pb-32">
      <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-pink-600 to-cyan-400 rounded-lg flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="font-black text-xl tracking-tighter italic">Gempak<span className="text-pink-500">Studio</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={() => setShowSafeZone(!showSafeZone)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${showSafeZone ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' : 'bg-white/5 border-white/10 text-gray-500'}`}
            >
                <Smartphone size={12} />
                Safe Zone
            </button>
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                <Layers size={12} className="text-pink-500" />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">9:16 Canvas</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 pt-8">
        <section className="mb-10">
          <div className={`transition-all duration-500 ${images.length > 0 ? 'bg-gray-900/40 p-4 rounded-2xl border border-white/10' : ''}`}>
            {images.length === 0 ? (
              <label className="group relative flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-gray-700 rounded-3xl cursor-pointer hover:border-pink-500 hover:bg-pink-500/5 transition-all">
                <div className="flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="text-pink-500" size={28} />
                  </div>
                  <p className="text-sm font-bold text-gray-300">Upload Produk Anda</p>
                  <p className="text-xs text-gray-500 mt-1">AI akan mengecam produk & model</p>
                </div>
                <input type="file" className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Visual Rujukan ({images.length})</h2>
                   <button onClick={() => {setImages([]); setResult(null);}} className="text-xs text-red-500 font-bold hover:bg-red-500/10 px-2 py-1 rounded">Reset</button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-white/10">
                      <img src={img} className="w-full h-full object-cover" />
                      {idx === 0 && <div className="absolute top-0 right-0 bg-pink-500 p-0.5 rounded-bl"><Wand2 size={10} /></div>}
                    </div>
                  ))}
                  <label className="w-20 h-20 flex-shrink-0 flex items-center justify-center border-2 border-dashed border-gray-700 rounded-xl cursor-pointer">
                    <Plus size={20} className="text-gray-500" />
                    <input type="file" className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mb-8">
            <h3 className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-3">Pilih Genre Video</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {genres.map(g => (
                    <button
                        key={g.id}
                        onClick={() => setGenre(g.id)}
                        className={`relative p-4 rounded-2xl border transition-all flex flex-col items-center justify-center gap-2 ${genre === g.id ? `${g.bg} ${g.border} ${g.color} ring-1 ring-offset-0 ${g.color.replace('text', 'ring')}` : 'bg-gray-900 border-white/5 text-gray-500 hover:bg-gray-800'}`}
                    >
                        {g.icon}
                        <span className="text-xs font-bold">{g.label}</span>
                        {genre === g.id && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-current animate-pulse"></div>}
                    </button>
                ))}
            </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 ml-1 tracking-widest">Produk</label>
            <input 
              type="text" 
              value={productName} 
              onChange={e => setProductName(e.target.value)}
              placeholder="cth: Sambal Nyet..."
              className="w-full bg-gray-900 border border-white/5 rounded-2xl py-3 px-4 text-sm focus:border-pink-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 ml-1 tracking-widest">Offer/Vibe</label>
            <input 
              type="text" 
              value={additionalContext} 
              onChange={e => setAdditionalContext(e.target.value)}
              placeholder="cth: Promo Raya, Murah..."
              className="w-full bg-gray-900 border border-white/5 rounded-2xl py-3 px-4 text-sm focus:border-pink-500 outline-none transition-all"
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 ml-1 tracking-widest">Bilangan Babak (Scenes)</label>
            <div className="flex gap-2">
              {[3, 4, 5, 6, 7, 8].map(n => (
                <button
                  key={n}
                  onClick={() => setNumScenes(n)}
                  className={`flex-1 py-3 rounded-2xl border text-sm font-bold transition-all ${numScenes === n ? 'bg-pink-600 border-pink-400 text-white' : 'bg-gray-900 border-white/5 text-gray-500 hover:border-gray-700'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 ml-1 tracking-widest">Pilih Model (DNA)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                { id: 'woman_malay_hijab', label: 'Wanita Melayu (Bertudung)', icon: <User size={14}/> },
                { id: 'woman_malay_freehair', label: 'Wanita Melayu (Moden)', icon: <User size={14}/> },
                { id: 'woman_malay_corporate', label: 'Wanita Melayu (Korporat)', icon: <User size={14}/> },
                { id: 'product_only', label: 'Produk Sahaja', icon: <Box size={14}/> },
                { id: 'man_malay_casual', label: 'Lelaki Melayu (Casual)', icon: <User size={14}/> },
                { id: 'man_malay_corporate', label: 'Lelaki Melayu (Korporat)', icon: <User size={14}/> },
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => setPersonaType(opt.id)}
                  className={`flex items-center justify-center gap-2 py-3 rounded-2xl border text-[11px] font-bold transition-all ${personaType === opt.id ? 'bg-pink-600 border-pink-400 text-white' : 'bg-gray-900 border-white/5 text-gray-500 hover:border-gray-700'}`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-4 rounded-2xl mb-8 flex items-center gap-2"><AlertCircle size={14}/> {error}</div>}

        {result && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-4 gap-4">
              <div>
                <h3 className="text-2xl font-black italic tracking-tighter uppercase">{result.script_title}</h3>
                <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-pink-500 font-bold tracking-widest uppercase">Visual DNA Active</p>
                    <span className="text-[10px] text-gray-600">•</span>
                    <p className={`text-[10px] font-bold tracking-widest uppercase ${genres.find(g => g.id === genre.toLowerCase())?.color || 'text-white'}`}>
                        GENRE: {result.genre_style}
                    </p>
                    <span className="text-[10px] text-gray-600">•</span>
                    <p className="text-[10px] text-cyan-500 font-bold tracking-widest uppercase h-4">
                        {generationStatus || "Ready"}
                    </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                 <button onClick={handleDownloadScript} className="text-[10px] font-bold px-4 py-2 bg-blue-900/40 border border-blue-500/30 rounded-full hover:bg-blue-900/60 flex items-center gap-2 text-blue-200">
                   <FileText size={12}/> Script (TXT)
                 </button>
                 <button onClick={handleDownloadAllImages} disabled={downloadingAll} className="text-[10px] font-bold px-4 py-2 bg-pink-900/40 border border-pink-500/30 rounded-full hover:bg-pink-900/60 flex items-center gap-2 text-pink-200 disabled:opacity-50">
                   {downloadingAll ? <Loader size={12} className="animate-spin"/> : <Package size={12}/>} Images
                 </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-12">
              {result.structure.map((item: any, idx: number) => (
                <div key={idx} className="group relative grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  <div className="md:col-span-5">
                    <div className="aspect-[9/16] bg-gray-900 rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl relative">
                      {stepLoading[idx] ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-black/50 backdrop-blur-sm z-10">
                          <Loader className="animate-spin text-pink-500 mb-4" size={32} />
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-300">Generating...</p>
                        </div>
                      ) : stepImages[idx] ? (
                        <div className="relative w-full h-full group/image">
                          <img src={stepImages[idx]} className="w-full h-full object-cover animate-in fade-in duration-500" />
                          {showSafeZone && (
                            <div className="absolute inset-0 pointer-events-none z-20">
                               <div className="absolute top-0 left-0 right-0 h-[15%] bg-red-500/10 border-b border-red-500/30 flex items-end justify-center pb-1">
                                 <span className="text-[8px] text-red-300 font-mono bg-black/50 px-1 rounded">SEARCH UI</span>
                               </div>
                               <div className="absolute top-[20%] right-0 bottom-[25%] w-[15%] bg-red-500/10 border-l border-red-500/30 flex flex-col items-center justify-center gap-4">
                                  <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30"></div>
                                  <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30"></div>
                                  <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30"></div>
                               </div>
                               <div className="absolute bottom-0 left-0 right-0 h-[25%] bg-red-500/10 border-t border-red-500/30 flex items-start justify-center pt-2">
                                 <span className="text-[8px] text-red-300 font-mono bg-black/50 px-1 rounded">CAPTION & AUDIO</span>
                               </div>
                               <div className="absolute top-[15%] bottom-[25%] left-0 right-[15%] border border-green-500/20 m-2 rounded border-dashed flex items-center justify-center">
                                  <span className="text-[8px] text-green-500/50 font-mono uppercase tracking-widest opacity-0 group-hover/image:opacity-100 transition-opacity">Safe Zone</span>
                               </div>
                            </div>
                          )}
                          <div className="absolute top-4 right-4 flex gap-2 z-30 pointer-events-auto">
                             {idx === 0 && <div className="px-2 py-1 bg-cyan-500 text-black text-[9px] font-black uppercase rounded shadow-lg">Master Ref</div>}
                             <button onClick={() => handleRegenerateScene(idx)} className="p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-pink-600 transition-all border border-white/10" title="Regenerate this scene"><RotateCcw size={12} /></button>
                          </div>
                          <button onClick={() => handleDownloadSingleImage(stepImages[idx], `scene-${idx+1}.png`)} className="absolute bottom-4 right-4 p-3 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-pink-600 transition-all opacity-0 group-hover:opacity-100 z-30 pointer-events-auto shadow-xl shadow-black/50"><Download size={18} /></button>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gray-900/50">
                            <Clock size={32} className="mb-2 opacity-20"/>
                            <p className="text-[9px] uppercase font-bold opacity-30 tracking-widest mb-4">Waiting Queue</p>
                            <button onClick={() => handleRegenerateScene(idx)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-full border border-white/10 flex items-center gap-2 transition-all group/retry"><RefreshCw size={12} className="group-hover/retry:rotate-180 transition-transform duration-500"/><span className="text-[10px] font-bold">Generate / Retry</span></button>
                        </div>
                      )}
                      <div className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-black border border-white/10 z-20">SCENE {idx+1} • {item.time}</div>
                    </div>
                  </div>
                  <div className="md:col-span-7 space-y-4 pt-4">
                    <div className="inline-block px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-[10px] font-black text-pink-500 uppercase tracking-widest">
                      {item.stage.replace(/_/g, ' ')}
                    </div>
                    <p className="text-xl font-medium leading-relaxed italic text-gray-100">"{item.script}"</p>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                       <div className="flex items-center justify-between">
                         <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-2">
                           <Sparkles size={10} className="text-cyan-400" /> Arahan Visual
                         </p>
                         <button 
                           onClick={() => handleRegenerateScene(idx)}
                           className="text-[10px] text-pink-500 font-bold hover:bg-pink-500/10 px-2 py-0.5 rounded flex items-center gap-1"
                         >
                           <RefreshCw size={10} /> Regenerate
                         </button>
                       </div>
                       <textarea 
                         value={item.visual_prompt_en}
                         onChange={(e) => handleUpdateVisualPrompt(idx, e.target.value)}
                         className="w-full bg-transparent text-xs text-gray-400 leading-relaxed italic outline-none focus:text-white transition-colors resize-none min-h-[60px]"
                         rows={3}
                       />
                       
                       <div className="mt-2 pt-2 border-t border-white/5">
                          <details className="group">
                            <summary className="text-[9px] font-bold text-gray-600 hover:text-gray-400 cursor-pointer list-none flex items-center gap-1 uppercase tracking-widest">
                              <Box size={10} /> Lihat Prompt Penuh
                            </summary>
                            <div className="mt-2 p-2 bg-black/40 rounded border border-white/5 text-[10px] font-mono text-gray-500 leading-relaxed break-words">
                               Generate a high-quality 9:16 vertical photo. SCENE: {item.visual_prompt_en}. MODEL DNA: {result.visual_dna}. STYLE: Cinematic, realistic, 8k.
                            </div>
                          </details>
                       </div>
                    </div>
                    <button onClick={() => {navigator.clipboard.writeText(item.script); setCopiedIndex(idx); setTimeout(() => setCopiedIndex(null), 2000);}} className="text-[10px] font-bold text-gray-500 hover:text-white flex items-center gap-2">
                      {copiedIndex === idx ? <Check size={12} className="text-green-500"/> : <Copy size={12}/>} Salin Dialog
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-black via-black/90 to-transparent z-50">
        <div className="max-w-md mx-auto">
          {!loading ? (
            <button 
              onClick={generateScript}
              disabled={images.length === 0 || generationStatus.includes("Generating")}
              className={`w-full py-4 rounded-3xl font-black text-lg tracking-tight flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-2xl shadow-pink-500/20 ${images.length === 0 || generationStatus.includes("Generating") ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5' : 'bg-gradient-to-r from-pink-600 to-pink-500 text-white hover:shadow-pink-500/40'}`}
            >
              {result ? <RefreshCw size={22} /> : <Zap size={22} fill="currentColor" />}
              {result ? "JANA SEMULA" : "JANA KONTEN VIRAL"}
            </button>
          ) : (
            <div className="w-full bg-gray-900 border border-white/10 py-4 rounded-3xl flex items-center justify-center gap-3">
              <Loader className="animate-spin text-pink-500" size={22} />
              <span className="font-black text-gray-400 text-lg animate-pulse uppercase tracking-widest">
                  {generationStatus.includes("Scene") ? generationStatus : "Merangka DNA..."}
              </span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return <TikTokScriptGenerator />;
}
