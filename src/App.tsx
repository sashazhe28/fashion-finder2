import React, { useState, useCallback, useEffect } from 'react';
import { Camera, Search, Loader, Zap, ExternalLink, User, Star, Upload, Trash2, LogIn, MapPin, ChevronDown, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePostHog } from '@posthog/react';
import { 
  SignedIn, 
  SignedOut, 
  SignInButton, 
  SignUpButton, 
  UserButton, 
  useUser 
} from '@clerk/clerk-react';
import { analyzeFashionImage } from './services/geminiService';

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
const REGIONS = {
  'Russia': [
    { name: 'Wildberries', baseUrl: 'https://www.wildberries.ru/catalog/0/search.aspx?search=', color: 'bg-[#9c27b0]' },
    { name: 'Ozon', baseUrl: 'https://www.ozon.ru/search/?text=', color: 'bg-[#005bff]' },
    { name: 'Lamoda', baseUrl: 'https://www.lamoda.ru/catalogsearch/result/?q=', color: 'bg-[#000000]' },
    { name: 'AliExpress', baseUrl: 'https://www.aliexpress.com/wholesale?SearchText=', color: 'bg-[#ff4747]' }
  ],
  'USA': [
    { name: 'Amazon', baseUrl: 'https://www.amazon.com/s?k=', color: 'bg-[#FF9900]' },
    { name: 'eBay', baseUrl: 'https://www.ebay.com/sch/i.html?_nkw=', color: 'bg-[#E53238]' },
    { name: 'Walmart', baseUrl: 'https://www.walmart.com/search?q=', color: 'bg-[#0071CE]' },
    { name: 'Etsy', baseUrl: 'https://www.etsy.com/search?q=', color: 'bg-[#F1641E]' }
  ],
  'Europe': [
    { name: 'Zalando', baseUrl: 'https://www.zalando.co.uk/catalog/?q=', color: 'bg-[#FF6900]' },
    { name: 'ASOS', baseUrl: 'https://www.asos.com/search/?q=', color: 'bg-[#000000]' },
    { name: 'Amazon EU', baseUrl: 'https://www.amazon.de/s?k=', color: 'bg-[#FF9900]' },
    { name: 'Farfetch', baseUrl: 'https://www.farfetch.com/shopping/women/search/items.aspx?q=', color: 'bg-[#000000]' }
  ],
  'Central Asia': [
    { name: 'Kaspi', baseUrl: 'https://kaspi.kz/shop/search/?text=', color: 'bg-[#F14635]' },
    { name: 'Wildberries', baseUrl: 'https://kz.wildberries.ru/catalog/0/search.aspx?search=', color: 'bg-[#9c27b0]' },
    { name: 'Ozon', baseUrl: 'https://www.ozon.kz/search/?text=', color: 'bg-[#005bff]' },
    { name: 'AliExpress', baseUrl: 'https://www.aliexpress.com/wholesale?SearchText=', color: 'bg-[#ff4747]' }
  ]
};

const generateSearchUrls = (query: string, region: keyof typeof REGIONS): MarketplaceLink[] => {
  const encodedQuery = encodeURIComponent(query.trim());
  return REGIONS[region].map(market => ({
    name: market.name,
    uri: `${market.baseUrl}${encodedQuery}`,
    color: market.color
  }));
};

export default function App() {
  const posthog = usePostHog();
  const { user, isSignedIn } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [results, setResults] = useState<ItemResult[] | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<keyof typeof REGIONS>('Russia');

  const [isProUser, setIsProUser] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [searchCount, setSearchCount] = useState<number>(() => {
    const cached = localStorage.getItem('fashionfinder_search_count');
    return cached ? parseInt(cached, 10) : 0;
  });

  // Polar states
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [polarProducts, setPolarProducts] = useState<any[]>([]);
  const [fetchingProducts, setFetchingProducts] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  const POLAR_TOKEN = import.meta.env.VITE_POLAR_ACCESS_TOKEN || "polar_oat_6pvvjyRLLiYzzn6VDpiBjrgHNSVUVVtncYX2A2HddpK";
  const POLAR_BASE_URL = "https://sandbox-api.polar.sh";

  // Check URL params for successful checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout_status') === 'success') {
      setIsProUser(true);
      localStorage.setItem('fashionfinder_pro_status', 'true');
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.showAlert('Оплата успешно завершена! Доступ к PRO активирован.');
      } else {
        alert('Оплата успешно завершена! Доступ к PRO активирован.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Hydrate local PRO status cache
  useEffect(() => {
    const isPro = localStorage.getItem('fashionfinder_pro_status') === 'true';
    if (isPro) {
      setIsProUser(true);
    }
  }, []);

  // Fetch products from Polar organization
  const fetchPolarProducts = useCallback(async () => {
    if (!POLAR_TOKEN) return;
    setFetchingProducts(true);
    try {
      const response = await fetch(`${POLAR_BASE_URL}/v1/products?limit=10`, {
        headers: {
          'Authorization': `Bearer ${POLAR_TOKEN}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.items) {
          setPolarProducts(data.items);
        }
      }
    } catch (err) {
      console.error("Error fetching Polar products:", err);
    } finally {
      setFetchingProducts(false);
    }
  }, [POLAR_TOKEN]);

  // Read active subscription of the signed in Clerk user from Polar.sh
  const checkPolarSubscription = useCallback(async () => {
    const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress;
    if (!email || !POLAR_TOKEN) return;

    setCheckingSubscription(true);
    try {
      const response = await fetch(`${POLAR_BASE_URL}/v1/subscriptions?active=true&search=${encodeURIComponent(email)}`, {
        headers: {
          'Authorization': `Bearer ${POLAR_TOKEN}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          setIsProUser(true);
          localStorage.setItem('fashionfinder_pro_status', 'true');
        }
      }
    } catch (err) {
      console.error("Error checking Polar subscription:", err);
    } finally {
      setCheckingSubscription(false);
    }
  }, [user, POLAR_TOKEN]);

  useEffect(() => {
    setIsAppReady(true);
    fetchPolarProducts();
  }, [fetchPolarProducts]);

  useEffect(() => {
    if (isSignedIn && user) {
      checkPolarSubscription();
    }
  }, [isSignedIn, user, checkPolarSubscription]);

  // Create customized checkout session via Polar API
  const handlePolarCheckout = async (productId: string) => {
    if (!isSignedIn) {
      alert("Пожалуйста, сначала войдите в аккаунт.");
      return;
    }

    setLoading(true);
    try {
      const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress;
      const response = await fetch(`${POLAR_BASE_URL}/v1/checkouts/custom`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${POLAR_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: productId,
          success_url: window.location.origin + '?checkout_status=success',
          customer_email: email
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create custom checkout session');
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned from Polar API');
      }
    } catch (err) {
      console.error("Error initiating Polar checkout:", err);
      alert("Не удалось запустить процесс оплаты. Пожалуйста, попробуйте еще раз.");
    } finally {
      setLoading(false);
    }
  };

  const handleProSubscription = useCallback(() => {
    setShowUpgradeModal(true);
  }, []);

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

    // Enforce 2 free searches limit for non-PRO users
    if (searchCount >= 2 && !isProUser) {
      setShowUpgradeModal(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const itemAnalysis = await analyzeFashionImage(base64Image, selectedRegion);
      
      const enrichedResults = itemAnalysis.map((item: any) => ({
        ...item,
        marketplaceLinks: generateSearchUrls(item.searchQuery, selectedRegion)
      }));

      posthog?.capture('fashion_analysis_completed', { 
        items_count: enrichedResults.length,
        items: enrichedResults.map((r: any) => r.itemDescription)
      });

      setResults(enrichedResults);
      if (enrichedResults.length === 0) {
        setError("Предметы не найдены. Попробуйте другое фото.");
      } else {
        // Increment search count only for non-PRO users
        if (!isProUser) {
          const nextCount = searchCount + 1;
          setSearchCount(nextCount);
          localStorage.setItem('fashionfinder_search_count', nextCount.toString());
          
          if (nextCount >= 2) {
            // Automatically prompt upgrade modal once 2nd search completes
            setTimeout(() => {
              setShowUpgradeModal(true);
            }, 1000);
          }
        }
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
          {/* Location Selection */}
          <div className="relative group hidden lg:flex items-center space-x-2 px-4 py-2 bg-white/50 border border-black/5 rounded-full hover:bg-white transition-all cursor-pointer">
            <MapPin className="w-3 h-3 opacity-60" />
            <select 
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value as keyof typeof REGIONS)}
              className="appearance-none bg-transparent border-none font-sans text-[10px] font-bold uppercase tracking-widest focus:outline-none pr-4 cursor-pointer"
            >
              {Object.keys(REGIONS).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="w-2 h-2 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity" />
          </div>

          <SignedIn>
            <div className="hidden sm:flex flex-col items-end">
              <span className="font-sans text-[10px] font-semibold letter-spacing-wide uppercase opacity-50 tracking-widest">Account</span>
              <span className="font-sans text-sm font-semibold">{user?.fullName || user?.username || 'User'}</span>
            </div>
            <div className="hidden sm:block h-10 w-[1px] bg-black/10"></div>
            <UserButton afterSignOutUrl="/" />
            <button 
              onClick={handleProSubscription}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full border border-black/10 transition-all ${isProUser ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-black/5'}`}
            >
              <span className="font-sans text-[11px] font-bold letter-spacing-wide uppercase tracking-widest">
                {isProUser ? 'Pro Active' : 'Upgrade'}
              </span>
              <Star className={`w-3 h-3 ${isProUser ? 'fill-yellow-400 text-yellow-400' : 'text-black'}`} />
            </button>
          </SignedIn>
          
          <SignedOut>
            <SignInButton mode="redirect">
              <button className="flex items-center space-x-2 px-4 py-2 rounded-full border border-black bg-black text-white hover:bg-neutral-800 transition-all">
                <LogIn className="w-3 h-3" />
                <span className="font-sans text-[11px] font-bold letter-spacing-wide uppercase tracking-widest">Sign In</span>
              </button>
            </SignInButton>
            <SignUpButton mode="redirect">
              <button className="hidden sm:flex items-center space-x-2 px-4 py-2 rounded-full border border-black text-black hover:bg-black/5 transition-all">
                <span className="font-sans text-[11px] font-bold letter-spacing-wide uppercase tracking-widest">Sign Up</span>
              </button>
            </SignUpButton>
          </SignedOut>
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

            {!isProUser && (
              <div className="mt-4 text-center flex flex-col items-center justify-center">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#1A1A1A] opacity-60">
                  {searchCount >= 2 
                    ? "Лимит исчерпан: 2 из 2 поисков использовано"
                    : `Использовано бесплатных поисков: ${searchCount} из 2`}
                </span>
                {searchCount >= 2 && (
                  <p className="font-sans text-[11px] text-red-600 font-semibold mt-1">
                    {isSignedIn 
                      ? "Активируйте PRO-доступ для продолжения поиска." 
                      : "Для продолжения войдите в аккаунт и активируйте PRO-доступ."}
                  </p>
                )}
                {searchCount > 0 && (
                  <button 
                    onClick={() => {
                      setSearchCount(0);
                      localStorage.removeItem('fashionfinder_search_count');
                    }}
                    className="mt-2.5 text-[9px] uppercase tracking-widest text-black/40 hover:text-black underline transition-colors font-mono"
                  >
                    [Сбросить лимит для теста]
                  </button>
                )}
              </div>
            )}
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

      {/* Polar Premium Upgrade Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowUpgradeModal(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#F9F8F6] w-full max-w-lg border border-black/10 p-6 md:p-8 relative rounded-sm shadow-xl flex flex-col gap-6 cursor-default"
            >
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="absolute top-6 right-6 p-1 text-black/40 hover:text-black transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col text-neutral-800">
                {isProUser ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col">
                      <span className="font-sans text-[10px] font-semibold letter-spacing-wide uppercase opacity-50 mb-1 tracking-widest">
                        Your Premium Access
                      </span>
                      <h2 className="font-serif text-3xl italic font-normal tracking-tight flex items-center gap-2">
                        PRO Active <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      </h2>
                      <p className="font-sans text-xs text-black/60 mt-2">
                        Ваша подписка FashionFinder PRO полностью активна. Наслаждайтесь бесконечным умным поиском одежды!
                      </p>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-900/10 p-5 flex flex-col gap-2 rounded-sm select-none">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                          Подписка Активна (Sandbox)
                        </span>
                      </div>
                      {isSignedIn && (
                        <p className="font-sans text-[11px] text-emerald-950/70">
                          Клиент: <strong className="font-bold">{user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress}</strong>
                        </p>
                      )}
                    </div>

                    <ul className="space-y-3 text-xs text-black/80">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>Бесконечный точный поиск одежды с ИИ</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>Глобальные ссылки (РФ, СНГ, США, ЕС)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>Приоритетная скорость обработки Gemini</span>
                      </li>
                    </ul>

                    <div className="flex flex-col gap-2.5 border-t border-black/5 pt-4">
                      <a
                        href="https://sandbox.polar.sh"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 bg-black text-white text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                      >
                        Управлять подпиской на Polar <ExternalLink className="w-3 h-3" />
                      </a>
                      
                      <button
                        onClick={() => {
                          setIsProUser(false);
                          localStorage.removeItem('fashionfinder_pro_status');
                          setShowUpgradeModal(false);
                          const tg = (window as any).Telegram?.WebApp;
                          if (tg) tg.showAlert('PRO-статус приостановлен (тестовый режим)');
                          else alert('PRO-статус приостановлен (тестовый режим)');
                        }}
                        className="w-full py-3 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100/50 text-[10px] font-bold uppercase tracking-widest text-center transition-colors"
                      >
                        Приостановить PRO (для тестов лимита)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col">
                      <span className="font-sans text-[10px] font-semibold letter-spacing-wide uppercase opacity-50 mb-1 tracking-widest">
                        Unlock Premium Capabilities
                      </span>
                      <h2 className="font-serif text-3xl italic font-normal tracking-tight">
                        Upgrade to PRO
                      </h2>
                      <p className="font-sans text-xs text-black/60 mt-2">
                        Take your fashion searches to the next level with global market matches, infinite image queries, and higher precision matching powered by Gemini.
                      </p>
                    </div>

                    {/* Plans section */}
                    <div className="flex flex-col gap-4">
                      {!isSignedIn ? (
                        <div className="border border-black p-6 flex flex-col gap-4 bg-white">
                          <div className="flex flex-col text-center">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-purple-600 mb-1">Шаг 1 из 2</span>
                            <h3 className="font-serif text-2xl italic">Войдите в аккаунт</h3>
                            <p className="font-sans text-xs text-black/60 mt-2">
                              Для привязки и активации PRO-подписки Polar.sh необходимо сначала авторизоваться или создать аккаунт.
                            </p>
                          </div>

                          <div className="flex flex-col gap-2 mt-2">
                            <SignInButton mode="redirect">
                              <button className="w-full py-3 bg-black text-white text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-neutral-800 transition-colors">
                                Войти в аккаунт
                              </button>
                            </SignInButton>
                            <SignUpButton mode="redirect">
                              <button className="w-full py-3 border border-black text-black text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-black/5 transition-colors">
                                Создать аккаунт
                              </button>
                            </SignUpButton>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="bg-emerald-50 border border-emerald-950/10 p-3.5 flex items-center justify-between text-emerald-950 rounded-sm">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider">Шаг 1: Авторизован</span>
                            </div>
                            <span className="font-sans text-[11px] font-medium opacity-70">
                              {user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress}
                            </span>
                          </div>

                          <div className="mt-2 text-center">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                              Шаг 2: Оплатите подписку Polar
                            </span>
                          </div>

                          {fetchingProducts ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-3 text-black/40">
                              <Loader className="w-6 h-6 animate-spin" />
                              <span className="font-sans text-[10px] uppercase tracking-widest font-bold">Retrieving Plans...</span>
                            </div>
                          ) : polarProducts.length > 0 ? (
                            polarProducts.map((product) => {
                              const priceObj = product.prices?.[0];
                              const hasRecurring = priceObj?.type === 'recurring';
                              const amount = priceObj ? (priceObj.price_amount / 100).toFixed(2) : "4.99";
                              const currency = priceObj?.price_currency === 'usd' ? '$' : '€';
                              const interval = hasRecurring ? ` / ${priceObj.recurring_interval}` : '';

                              return (
                                <div key={product.id} className="border border-black p-5 flex flex-col gap-4 bg-white hover:shadow-md transition-shadow">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <h3 className="font-sans text-lg font-bold uppercase tracking-tight">{product.name}</h3>
                                      <p className="font-sans text-[11px] opacity-60 mt-1">{product.description || "Полный доступ ко всем функциям FashionFinder PRO."}</p>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-mono text-2xl font-bold">{currency}{amount}</span>
                                      <span className="font-sans text-[10px] opacity-40 uppercase block tracking-wider">{interval}</span>
                                    </div>
                                  </div>

                                  <ul className="space-y-2 text-xs border-t border-black/5 pt-4">
                                    <li className="flex items-center gap-2">
                                      <Check className="w-3.5 h-3.5 text-black" />
                                      <span>Unlimited High-Accuracy Visual Matches</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                      <Check className="w-3.5 h-3.5 text-black" />
                                      <span>Global Marketplace Links (US, EU, RU, Central Asia)</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                      <Check className="w-3.5 h-3.5 text-black" />
                                      <span>Local Language Searches</span>
                                    </li>
                                  </ul>

                                  <button
                                    onClick={() => handlePolarCheckout(product.id)}
                                    className="w-full py-3 bg-black text-white text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-neutral-800 transition-colors mt-2"
                                  >
                                    Checkout via Polar
                                  </button>
                                </div>
                              );
                            })
                          ) : (
                            /* Fallback Plan when no active Polar products fetched */
                            <div className="border border-black p-5 flex flex-col gap-4 bg-white">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="font-sans text-lg font-bold uppercase tracking-tight">FashionFinder PRO</h3>
                                  <p className="font-sans text-[11px] opacity-60 mt-1">Full access to limitless fashion identification.</p>
                                </div>
                                <div className="text-right">
                                  <span className="font-mono text-2xl font-bold">$4.99</span>
                                  <span className="font-sans text-[10px] opacity-40 uppercase block tracking-wider">/ month</span>
                                </div>
                              </div>

                              <ul className="space-y-2 text-xs border-t border-black/5 pt-4">
                                <li className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-black" />
                                  <span>Unlimited High-Accuracy Visual Matches</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-black" />
                                  <span>Global Marketplace Links (US, EU, RU, Central Asia)</span>
                                </li>
                                <li className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-black" />
                                  <span>Priority Gemini Processing Target</span>
                                </li>
                              </ul>

                              <button
                                onClick={() => {
                                  setIsProUser(true);
                                  localStorage.setItem('fashionfinder_pro_status', 'true');
                                  setShowUpgradeModal(false);
                                  const tg = (window as any).Telegram?.WebApp;
                                  if (tg) tg.showAlert('FashionFinder PRO статус успешно активирован (Sandbox Mode)!');
                                  else alert('FashionFinder PRO статус успешно активирован (Sandbox Mode)!');
                                }}
                                className="w-full py-3 bg-black text-white text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-neutral-800 transition-colors mt-2"
                              >
                                Activate Trial Access
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center text-[10px] text-black/40 uppercase tracking-widest">
                Protected and compiled by Polar.sh
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
