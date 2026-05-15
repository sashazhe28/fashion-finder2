import React, { useState, useCallback, useEffect } from 'react';
import { Camera, Search, Loader, Zap, ExternalLink, User, Star, Upload, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePostHog } from '@posthog/react';

// --- TS Types ---
interface MarketplaceLink {
  name: string;
  uri: string;
  color: string;
}

interface ItemResult {
  itemDescription: string;
  searchQuery: string;
  marketplaceLinks: MarketplaceLink[];
}

interface TelegramUser {
  id: number | string;
  name: string;
}

// --- UTILS ---
const generateSearchUrls = (query: string): MarketplaceLink[] => {
  const encodedQuery = encodeURIComponent(query.trim());
  return [
    { name: 'Wildberries', uri: `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodedQuery}`, color: 'bg-[#9c27b0]' },
    { name: 'Ozon', uri: `https://www.ozon.ru/search/?text=${encodedQuery}`, color: 'bg-[#005bff]' },
    { name: 'Lamoda', uri: `https://www.lamoda.ru/catalogsearch/result/?q=${encodedQuery}`, color: 'bg-[#000000]' },
    { name: 'AliExpress', uri: `https://www.aliexpress.com/wholesale?SearchText=${encodedQuery}`, color: 'bg-[#ff4747]' }
  ];
};

export default function App() {
  const posthog = usePostHog();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [results, setResults] = useState<ItemResult[] | null>(null);

  // Telegram Mini App State
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  const [isProUser, setIsProUser] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    // In a real Telegram Mini App 'Telegram' is global.
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      const userData = tg.initDataUnsafe?.user;
      if (userData) {
        setTgUser({
          id: userData.id,
          name: userData.username || userData.first_name || 'Пользователь'
        });
      }
      tg.ready();
      tg.expand();
    } else {
      // Mock for dev
      setTgUser({ id: 'dev_user', name: 'Dev User' });
    }
    setIsAppReady(true);
  }, []);

  const handleProSubscription = useCallback(() => {
    if (isProUser) {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) tg.showAlert('Вы уже PRO-пользователь!');
      return;
    }
    
    setLoading(true);
    setTimeout(() => {
      setIsProUser(true);
      setLoading(false);
      const tg = (window as any).Telegram?.WebApp;
      if (tg) tg.showAlert('PRO-статус активирован!');
    }, 1500);
  }, [isProUser]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Размер файла не должен превышать 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      setBase64Image(base64);
      setResults(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSearch = async () => {
    if (!base64Image) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        let errorMessage = `Analysis failed (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const itemAnalysis = await response.json();
      
      const enrichedResults = itemAnalysis.map((item: any) => ({
        ...item,
        marketplaceLinks: generateSearchUrls(item.searchQuery)
      }));

      posthog?.capture('fashion_analysis_completed', { 
        items_count: enrichedResults.length,
        items: enrichedResults.map((r: any) => r.itemDescription)
      });

      setResults(enrichedResults);
      if (enrichedResults.length === 0) {
        setError("Предметы не найдены. Попробуйте другое фото.");
      }
    } catch (e) {
      console.error(e);
      setError("Ошибка при анализе изображения. Пожалуйста, попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  if (!isAppReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader className="w-8 h-8 text-neutral-800 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] font-sans selection:bg-neutral-200 flex flex-col">
      {/* Header / Nav */}
      <nav className="flex justify-between items-end p-6 md:p-8 border-b border-black/10 bg-[#F9F8F6] z-50">
        <div className="flex flex-col">
          <span className="font-sans text-[10px] font-semibold letter-spacing-wide uppercase opacity-50 mb-1 tracking-widest">
            AI-Powered Visual Search
          </span>
          <h1 className="font-serif text-3xl md:text-4xl italic font-normal leading-none tracking-tight">
            FashionFinder
          </h1>
        </div>
        
        <div className="flex items-center space-x-3 md:space-x-6 mb-1">
          <div className="hidden sm:flex flex-col items-end">
            <span className="font-sans text-[10px] font-semibold letter-spacing-wide uppercase opacity-50 tracking-widest">Session</span>
            <span className="font-sans text-sm font-semibold">{tgUser?.name || 'Guest'}</span>
          </div>
          <div className="hidden sm:block h-10 w-[1px] bg-black/10"></div>
          <button 
            onClick={handleProSubscription}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full border border-black/10 transition-all ${isProUser ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-black/5'}`}
          >
            <span className="font-sans text-[11px] font-bold letter-spacing-wide uppercase tracking-widest">
              {isProUser ? 'Pro Active' : 'Upgrade'}
            </span>
            <Star className={`w-3 h-3 ${isProUser ? 'fill-yellow-400 text-yellow-400' : 'text-black'}`} />
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Source */}
        <section className="w-full md:w-[45%] p-6 md:p-10 border-b md:border-b-0 md:border-r border-black/10 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-serif text-2xl italic">Source Analysis</h2>
            <span className="font-sans text-[10px] md:text-[11px] uppercase border border-black px-2 py-1 font-bold tracking-widest">
              Ref: {results ? `ID-${results.length}` : 'WAITING'}
            </span>
          </div>

          <div 
            className={`relative flex-1 rounded-sm overflow-hidden flex items-center justify-center transition-all duration-500
              ${base64Image ? 'bg-white' : 'bg-[#EAE8E4] min-h-[300px]'}`}
          >
            {/* Corner Accents */}
            <div className="absolute inset-0 border-[15px] md:border-[20px] border-[#F9F8F6] z-10 pointer-events-none"></div>
            
            <AnimatePresence mode="wait">
              {base64Image ? (
                <motion.div 
                  key="preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full p-4 flex flex-col items-center justify-center"
                >
                  <img 
                    src={`data:image/jpeg;base64,${base64Image}`} 
                    alt="Upload" 
                    className="w-full h-full object-contain grayscale-[0.2] contrast-[1.1]" 
                  />
                  {loading && (
                    <div className="absolute top-1/4 left-0 right-0 h-[1px] bg-black/50 shadow-[0_0_15px_rgba(0,0,0,0.2)] animate-pulse z-20"></div>
                  )}
                  <button 
                    onClick={() => { setBase64Image(null); setResults(null); }}
                    className="absolute bottom-12 right-12 bg-black text-white p-3 rounded-none hover:bg-neutral-800 transition-colors z-20"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-black/20 group">
                  <div className="w-20 h-20 border border-black/10 flex items-center justify-center group-hover:scale-105 transition-transform bg-white/50">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="font-serif italic text-lg text-black/60">Upload Inspiration</p>
                    <p className="font-sans text-[10px] uppercase font-bold tracking-widest opacity-40">JPG / PNG / 5MB</p>
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                </div>
              )}
            </AnimatePresence>

            {loading && (
              <div className="absolute bottom-12 left-12 right-12 bg-white/90 backdrop-blur-md p-4 border border-black/5 z-20">
                <p className="font-sans text-[10px] font-bold opacity-60 mb-1 tracking-widest uppercase">AI Status</p>
                <p className="font-sans text-xs md:text-sm font-medium animate-pulse flex items-center gap-2">
                  <Loader className="w-3 h-3 animate-spin" />
                  Scanning visual attributes for high-relevance matches...
                </p>
              </div>
            )}
          </div>
          
          <div className="mt-8">
            <button 
              onClick={handleSearch}
              disabled={!base64Image || loading}
              className={`w-full py-4 rounded-none border border-black flex items-center justify-center gap-3 font-bold text-xs uppercase tracking-[0.2em] transition-all
                ${!base64Image || loading 
                  ? 'bg-transparent text-black/20 border-black/10 cursor-not-allowed' 
                  : 'bg-black text-white hover:bg-neutral-800'}`}
            >
              {loading ? 'Processing...' : 'Identify Objects'}
            </button>
          </div>
        </section>

        {/* Right Side: Results */}
        <section className="w-full md:w-[55%] p-6 md:p-10 flex flex-col bg-white/30 overflow-y-auto">
          <header className="mb-10 text-center md:text-left">
             <h2 className="font-serif text-3xl md:text-4xl mb-4 italic leading-tight">Identified Items</h2>
             <p className="font-sans text-sm opacity-60 max-w-sm mx-auto md:mx-0">
               Precise search queries generated based on visual fit, texture, and stylistic markers.
             </p>
          </header>

          <div className="flex-1 space-y-12">
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 border border-red-200 bg-red-50 text-red-900 font-serif italic text-lg"
                >
                  {error}
                </motion.div>
              )}

              {results && results.map((item, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex group"
                >
                  <div className="w-12 md:w-16 font-serif text-4xl md:text-5xl italic opacity-10 transition-opacity group-hover:opacity-100 flex-shrink-0">
                    0{idx + 1}
                  </div>
                  <div className="flex-1 border-b border-black/10 pb-10">
                    <h3 className="font-sans text-xl md:text-2xl font-bold mb-1 tracking-tight">{item.itemDescription}</h3>
                    <p className="font-sans text-[11px] font-medium opacity-50 mb-6 uppercase tracking-widest">
                      Search Query: "{item.searchQuery}"
                    </p>
                    
                    <div className="flex flex-wrap gap-2">
                      {item.marketplaceLinks.map((link, lIdx) => (
                        <a 
                          key={lIdx}
                          href={link.uri} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          onClick={() => posthog?.capture('marketplace_link_clicked', { 
                            marketplace: link.name, 
                            search_query: item.searchQuery, 
                            item_description: item.itemDescription 
                          })}
                          className="px-6 py-2 bg-black text-white text-[10px] font-extrabold uppercase tracking-widest rounded-none transition-all hover:bg-neutral-800 flex items-center gap-2"
                        >
                          {link.name}
                          <ExternalLink className="w-3 h-3 opacity-40" />
                        </a>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}

              {!results && !loading && !error && (
                <div className="flex flex-col items-center justify-center py-20 text-black/10">
                  <Search className="w-16 h-16 mb-4" />
                  <p className="font-serif italic text-xl">Results will appear here</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Footer Decor */}
      <footer className="h-16 border-t border-black/10 px-6 md:px-8 flex items-center justify-between bg-white text-[9px] md:text-[10px] font-sans font-bold tracking-[0.1em] text-black/40 uppercase">
        <p className="font-serif italic text-xs normal-case tracking-normal opacity-60">
          Curating style through visual intelligence.
        </p>
        <div className="flex space-x-6">
           <span className="hidden sm:inline">Terms & Archive</span>
           <span>© 2025 FashionFinder Studio</span>
        </div>
      </footer>
    </div>
  );
}
