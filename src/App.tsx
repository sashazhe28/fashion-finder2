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
import { LegalDocModal, CompanyDetailsWidget } from './components/LegalDocuments';

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
  
  // Track separate free search counts for unregistered and registered users
  const [unregisteredSearchCount, setUnregisteredSearchCount] = useState<number>(() => {
    const cached = localStorage.getItem('fashionfinder_unregistered_search_count');
    return cached ? parseInt(cached, 10) : 0;
  });

  const [registeredSearchCount, setRegisteredSearchCount] = useState<number>(() => {
    const cached = localStorage.getItem('fashionfinder_registered_search_count');
    return cached ? parseInt(cached, 10) : 0;
  });

  // Test Environment Check - strictly local or the developer sandbox (not pre-release/actual domain)
  const isTestEnvironment = typeof window !== 'undefined' && (
    window.location.hostname.includes('ais-dev-') || 
    window.location.hostname.includes('localhost') || 
    window.location.hostname.includes('127.0.0.1')
  );

  // Upgrade Modal visibility
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // YuMan Paywall Mock states
  const [activeLegalDoc, setActiveLegalDoc] = useState<'offer' | 'policy' | 'consent' | null>(null);
  const [yumanMethod, setYumanMethod] = useState<'sbp' | 'card' | 'yoomoney'>('sbp');
  const [yumanTariff, setYumanTariff] = useState<'day' | 'week' | 'month'>('week');
  const [yumanLoading, setYumanLoading] = useState(false);
  const [yumanSuccess, setYumanSuccess] = useState(false);
  const [yumanCardNumber, setYumanCardNumber] = useState('');
  const [yumanCardExpiry, setYumanCardExpiry] = useState('');
  const [yumanCardCvv, setYumanCardCvv] = useState('');

  const handleYumanPayment = () => {
    setYumanLoading(true);
    setTimeout(() => {
      setYumanLoading(false);
      setYumanSuccess(true);
      
      setIsProUser(true);
      localStorage.setItem('fashionfinder_pro_status', 'true');
      
      const priceText = yumanTariff === 'day' ? '49 ₽' : yumanTariff === 'week' ? '149 ₽' : '390 ₽';
      const termText = yumanTariff === 'day' ? 'PRO-доступ на день' : yumanTariff === 'week' ? 'PRO-доступ на неделю' : 'PRO-доступ на месяц';
      
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.showAlert(`Оплата ${priceText} успешно получена через ЮКасса! Активирован тариф: ${termText}.`);
      } else {
        alert(`Оплата ${priceText} успешно получена через ЮКасса! Активирован тариф: ${termText}.`);
      }
      
      setTimeout(() => {
        setShowUpgradeModal(false);
        setYumanSuccess(false);
      }, 1500);
    }, 2000);
  };

  // Hydrate local PRO status cache
  useEffect(() => {
    setIsAppReady(true);
    const isPro = localStorage.getItem('fashionfinder_pro_status') === 'true';
    if (isPro) {
      setIsProUser(true);
    }
  }, []);

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

    // Enforce 2 free searches for non-PRO users depending on registration status
    if (!isProUser) {
      if (!isSignedIn) {
        if (unregisteredSearchCount >= 2) {
          setShowUpgradeModal(true);
          return;
        }
      } else {
        if (registeredSearchCount >= 2) {
          setShowUpgradeModal(true);
          return;
        }
      }
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
          if (!isSignedIn) {
            const nextCount = unregisteredSearchCount + 1;
            setUnregisteredSearchCount(nextCount);
            localStorage.setItem('fashionfinder_unregistered_search_count', nextCount.toString());
            
            if (nextCount >= 2) {
              // Automatically prompt upgrade/register modal once 2nd search completes
              setTimeout(() => {
                setShowUpgradeModal(true);
              }, 1000);
            }
          } else {
            const nextCount = registeredSearchCount + 1;
            setRegisteredSearchCount(nextCount);
            localStorage.setItem('fashionfinder_registered_search_count', nextCount.toString());
            
            if (nextCount >= 2) {
              // Automatically prompt upgrade/paywall modal once 2nd search completes
              setTimeout(() => {
                setShowUpgradeModal(true);
              }, 1000);
            }
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
            <button 
              onClick={handleProSubscription}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full border border-black/10 transition-all ${isProUser ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-black/5'}`}
            >
              <span className="font-sans text-[11px] font-bold letter-spacing-wide uppercase tracking-widest">
                {isProUser ? 'Pro Active' : 'Upgrade'}
              </span>
              <Star className={`w-3 h-3 ${isProUser ? 'fill-yellow-400 text-yellow-400' : 'text-black'}`} />
            </button>
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
                  {!isSignedIn ? (
                    unregisteredSearchCount >= 2
                      ? "Вы израсходовали 2 бесплатные попытки без регистрации"
                      : `Бесплатные поиски без регистрации: ${unregisteredSearchCount} из 2`
                  ) : (
                    registeredSearchCount >= 2
                      ? "Лимит исчерпан: 2 из 2 поисков после регистрации"
                      : `Использовано бесплатных поисков: ${registeredSearchCount} из 2`
                  )}
                </span>
                {((!isSignedIn && unregisteredSearchCount >= 2) || (isSignedIn && registeredSearchCount >= 2)) && (
                  <p className="font-sans text-[11px] text-red-600 font-semibold mt-1 animate-pulse">
                    {!isSignedIn 
                      ? "Зарегистрируйтесь, чтобы получить еще 2 бесплатные попытки." 
                      : "Активируйте PRO-доступ для продолжения поиска."}
                  </p>
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

      {/* Company Requisites Table/Widget for YooKassa validation */}
      <CompanyDetailsWidget />

      {/* Footer Decor */}
      <footer className="min-h-16 border-t border-black/10 py-4 px-6 md:px-8 flex flex-col md:flex-row items-center justify-between bg-white gap-4 text-[9px] md:text-[10px] font-sans font-bold tracking-[0.1em] text-black/40 uppercase">
        <p className="font-serif italic text-xs normal-case tracking-normal opacity-60">
          Curating style through visual intelligence.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <button onClick={() => setActiveLegalDoc('offer')} className="hover:text-[#9c27b0] transition-colors cursor-pointer text-left uppercase">Договор оферты</button>
          <button onClick={() => setActiveLegalDoc('policy')} className="hover:text-[#9c27b0] transition-colors cursor-pointer text-left uppercase">Политика конфиденциальности</button>
          <button onClick={() => setActiveLegalDoc('consent')} className="hover:text-[#9c27b0] transition-colors cursor-pointer text-left uppercase">Согласие на обработку ПД</button>
          <span className="text-black/10 hidden lg:inline">|</span>
          <span>© {new Date().getFullYear()} FashionFinder Studio</span>
        </div>
      </footer>

      {/* Premium Upgrade Modal with ЮКасса only */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowUpgradeModal(false);
              }
            }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 md:p-6 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#F9F8F6] w-full max-w-lg border border-[#1A1A1A]/10 p-6 md:p-8 relative rounded-sm shadow-xl flex flex-col gap-6 cursor-default"
            >
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-black/40 hover:text-black hover:bg-black/5 rounded-full transition-colors z-[100] cursor-pointer flex items-center justify-center"
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
                          {isTestEnvironment ? "Подписка Активна (Sandbox)" : "Подписка Активна"}
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

                    {isTestEnvironment && (
                      <div className="flex flex-col gap-2.5 border-t border-black/5 pt-4">
                        <button
                          onClick={() => {
                            setIsProUser(false);
                            localStorage.removeItem('fashionfinder_pro_status');
                            setShowUpgradeModal(false);
                            const tg = (window as any).Telegram?.WebApp;
                            if (tg) tg.showAlert('PRO-статус приостановлен (тестовый режим)');
                            else alert('PRO-статус приостановлен (тестовый режим)');
                          }}
                          className="w-full py-3 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100/50 text-[10px] font-bold uppercase tracking-widest text-center transition-colors shadow-sm"
                        >
                          Приостановить PRO (для тестов лимита)
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    {!isSignedIn ? (
                      // Unregistered user prompt - Step 1: Registration
                      <div className="flex flex-col gap-6">
                        <div className="flex flex-col text-neutral-800">
                          <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#9c27b0] mb-1">
                            Бесплатный гостевой лимит исчерпан
                          </span>
                          <h2 className="font-serif text-3xl italic font-normal tracking-tight">
                            Лимит 2 из 2 поисков
                          </h2>
                          <p className="font-sans text-xs text-black/60 mt-2 leading-relaxed">
                            Вы израсходовали первые две бесплатные гостевые попытки поиска. Зарегистрируйтесь бесплатно за пару секунд, чтобы автоматически сохранить историю и получить еще 2 полноценных поиска абсолютно бесплатно!
                          </p>
                        </div>

                        <div className="border border-black/10 p-5 flex flex-col gap-4 bg-white shadow-sm rounded-none font-sans">
                          <div className="text-center">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-black/40">
                              Вход или регистрация
                            </span>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3 mt-1">
                            <SignInButton mode="redirect">
                              <button className="flex-1 py-3 bg-black text-white text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-neutral-800 transition-colors cursor-pointer select-none">
                                Войти в аккаунт
                              </button>
                            </SignInButton>
                            <SignUpButton mode="redirect">
                              <button className="flex-1 py-3 border border-black text-black text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-black/5 transition-colors cursor-pointer select-none">
                                Создать аккаунт
                              </button>
                            </SignUpButton>
                          </div>
                          
                          <p className="text-[10px] text-black/40 text-center leading-tight">
                            Регистрация полностью бесплатна. После авторизации вам сразу начислятся +2 дополнительные бесплатные попытки поиска.
                          </p>
                        </div>

                        {/* Beautiful feature checklist for preview */}
                        <div className="flex flex-col gap-2.5 mt-1 border-t border-black/5 pt-4">
                          <div className="flex items-start gap-2.5 text-xs text-black/70">
                            <Check className="w-4 h-4 text-[#9c27b0] flex-shrink-0 mt-0.5" />
                            <span>Дополнительные 2 бесплатные попытки сразу после регистрации</span>
                          </div>
                          <div className="flex items-start gap-2.5 text-xs text-black/70">
                            <Check className="w-4 h-4 text-[#9c27b0] flex-shrink-0 mt-0.5" />
                            <span>Доступ к истории поисков на всех ваших устройствах</span>
                          </div>
                          <div className="flex items-start gap-2.5 text-xs text-black/70">
                            <Check className="w-4 h-4 text-[#9c27b0] flex-shrink-0 mt-0.5" />
                            <span>Умный анализ деталей одежды с помощью Gemini ИИ</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Registered non-PRO user - Step 2: Payment/Paywall
                      <div className="flex flex-col gap-6">
                        <div className="flex flex-col text-neutral-800">
                          <span className="font-sans text-[10px] font-semibold letter-spacing-wide uppercase text-[#9c27b0] mb-1 tracking-widest">
                            Использование лимитов
                          </span>
                          <h2 className="font-serif text-3xl italic font-normal tracking-tight">
                            FashionFinder PRO
                          </h2>
                          <p className="font-sans text-xs text-black/60 mt-2 leading-relaxed">
                            Вы израсходовали все 4 бесплатные попытки (2 гостевых + 2 в аккаунте). Активируйте FashionFinder PRO для безлимитного поиска одежды по фото, подбора товаров со всего рунета и СНГ, и приоритетной скорости ИИ!
                          </p>
                        </div>

                        <div className="flex flex-col gap-4">
                          <div className="bg-emerald-50 border border-emerald-950/10 p-3.5 flex items-center justify-between text-emerald-950 rounded-sm font-sans">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider">Личный кабинет:</span>
                            </div>
                            <span className="font-sans text-[11px] font-medium opacity-70">
                              {user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress}
                            </span>
                          </div>

                          <div className="text-center mt-2">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#9c27b0]">
                              Безопасная оплата через ЮКасса
                            </span>
                          </div>

                          {yumanSuccess ? (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="border-2 border-emerald-500 bg-emerald-50/50 p-6 flex flex-col items-center justify-center text-center gap-3 rounded-sm animate-pulse font-sans"
                            >
                              <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                                <Check className="w-6 h-6 stroke-[3]" />
                              </div>
                              <h4 className="font-serif text-xl italic text-emerald-950 font-semibold text-center">Оплата успешно проведена!</h4>
                              <p className="font-sans text-xs text-emerald-900/70">
                                Спасибо! Доступ в FashionFinder PRO активирован. Закрываем окно...
                              </p>
                            </motion.div>
                          ) : (
                            <div className="border border-black p-5 flex flex-col gap-5 bg-white shadow-sm font-sans">
                              {/* Tariff Selection */}
                              <div className="flex flex-col gap-2">
                                <label className="font-sans text-[9px] font-bold uppercase tracking-wider text-black/40">Выберите тариф:</label>
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setYumanTariff('day')}
                                    className={`p-3 border text-left flex flex-col justify-between transition-all rounded-none cursor-pointer ${
                                      yumanTariff === 'day' ? 'border-[#9c27b0] bg-[#9c27b0]/5 shadow-sm font-bold' : 'border-black/10 hover:border-black/40 bg-white'
                                    }`}
                                  >
                                    <span className="font-sans text-[10px] uppercase text-black/80 block">1 день</span>
                                    <span className="font-serif text-lg italic text-black font-semibold mt-1">49 ₽</span>
                                    <span className="font-sans text-[8px] opacity-40 mt-1 uppercase">24 часа PRO</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setYumanTariff('week')}
                                    className={`p-3 border text-left flex flex-col justify-between relative transition-all rounded-none cursor-pointer ${
                                      yumanTariff === 'week' ? 'border-[#9c27b0] bg-[#9c27b0]/5 shadow-sm font-bold' : 'border-black/10 hover:border-black/40 bg-white'
                                    }`}
                                  >
                                    <span className="absolute -top-1.5 right-1 px-1 bg-[#9c27b0] text-white text-[7px] uppercase font-bold tracking-widest rounded-none">Хит</span>
                                    <span className="font-sans text-[10px] uppercase text-black/80 block">1 неделя</span>
                                    <span className="font-serif text-lg italic text-black font-semibold mt-1">149 ₽</span>
                                    <span className="font-sans text-[8px] opacity-40 mt-1 uppercase">7 дней PRO</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setYumanTariff('month')}
                                    className={`p-3 border text-left flex flex-col justify-between transition-all rounded-none cursor-pointer ${
                                      yumanTariff === 'month' ? 'border-[#9c27b0] bg-[#9c27b0]/5 shadow-sm font-bold' : 'border-black/10 hover:border-black/40 bg-white'
                                    }`}
                                  >
                                    <span className="font-sans text-[10px] uppercase text-black/80 block">1 месяц</span>
                                    <span className="font-serif text-lg italic text-black font-semibold mt-1">390 ₽</span>
                                    <span className="font-sans text-[8px] opacity-40 mt-1 uppercase">выгодно</span>
                                  </button>
                                </div>
                              </div>

                              {/* Payment Method Selector */}
                              <div className="flex flex-col gap-2">
                                <label className="font-sans text-[9px] font-bold uppercase tracking-wider text-black/40">Способ оплаты:</label>
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setYumanMethod('sbp')}
                                    className={`p-2 border text-center flex flex-col items-center justify-center gap-1 transition-all rounded-none cursor-pointer ${
                                      yumanMethod === 'sbp' ? 'border-black bg-black/5 font-bold' : 'border-black/10 hover:border-black/40 bg-white'
                                    }`}
                                  >
                                    <svg className="w-5 h-5 text-gray-800 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="3" y="3" width="7" height="7" />
                                      <rect x="14" y="3" width="7" height="7" />
                                      <rect x="3" y="14" width="7" height="7" />
                                      <path d="M14 14h2v2h-2zM19 19h2v2h-2zM14 19h2v2h-2zM19 14h2v2h-2z" />
                                    </svg>
                                    <span className="text-[9px] uppercase tracking-tight block mt-1">СБП</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setYumanMethod('card')}
                                    className={`p-2 border text-center flex flex-col items-center justify-center gap-1 transition-all rounded-none cursor-pointer ${
                                      yumanMethod === 'card' ? 'border-black bg-black/5 font-bold' : 'border-black/10 hover:border-black/40 bg-white'
                                    }`}
                                  >
                                    <svg className="w-5 h-5 text-gray-800 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="2" y="5" width="20" height="14" rx="2" />
                                      <line x1="2" y1="10" x2="22" y2="10" />
                                    </svg>
                                    <span className="text-[9px] uppercase tracking-tight block mt-1">Карта РФ</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setYumanMethod('yoomoney')}
                                    className={`p-2 border text-center flex flex-col items-center justify-center gap-1 transition-all rounded-none cursor-pointer ${
                                      yumanMethod === 'yoomoney' ? 'border-black bg-black/5 font-bold' : 'border-black/10 hover:border-black/40 bg-white'
                                    }`}
                                  >
                                    <span className="font-serif text-[13px] font-extrabold text-[#9c27b0] block">Ю</span>
                                    <span className="text-[9px] uppercase tracking-tight block">ЮMoney</span>
                                  </button>
                                </div>
                              </div>

                              {/* Dynamic info for selected payment method */}
                              {yumanMethod === 'sbp' && (
                                <div className="bg-neutral-50 border border-black/5 p-3.5 flex flex-col items-center gap-2 rounded-sm text-center">
                                  <div className="w-24 h-24 bg-white border border-black/10 p-1.5 flex items-center justify-center relative shadow-sm mx-auto">
                                    <div className="grid grid-cols-4 grid-rows-4 gap-1 w-full h-full opacity-85">
                                      <div className="bg-black"></div><div className="bg-black"></div><div className="bg-neutral-200"></div><div className="bg-black"></div>
                                      <div className="bg-black"></div><div className="bg-neutral-200"></div><div className="bg-black"></div><div className="bg-black"></div>
                                      <div className="bg-neutral-200"></div><div className="bg-black"></div><div className="bg-black"></div><div className="bg-neutral-200"></div>
                                      <div className="bg-black"></div><div className="bg-black"></div><div className="bg-neutral-200"></div><div className="bg-black"></div>
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className="bg-[#9c27b0] text-white text-[7px] font-bold px-1 py-0.5 rounded-none uppercase tracking-wider">ЮКасса СБП</span>
                                    </div>
                                  </div>
                                  <p className="font-sans text-[10px] text-black/60 max-w-[200px] mx-auto">
                                    Сканируйте QR-код в мобильном приложении любого банка РФ для моментальной оплаты.
                                  </p>
                                </div>
                              )}

                              {yumanMethod === 'card' && (
                                <div className="bg-neutral-50 border border-black/5 p-4 flex flex-col gap-3 rounded-sm">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[8px] font-bold uppercase tracking-wider text-black/50">Номер банковской карты</label>
                                    <input
                                      type="text"
                                      placeholder="2200 1234 5678 9012"
                                      value={yumanCardNumber}
                                      onChange={(e) => setYumanCardNumber(e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().substring(0, 19))}
                                      className="p-2 border border-black/10 bg-white text-xs font-mono w-full focus:border-black focus:outline-none"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[8px] font-bold uppercase tracking-wider text-black/50">Срок (ММ/ГГ)</label>
                                      <input
                                        type="text"
                                        placeholder="12/28"
                                        value={yumanCardExpiry}
                                        onChange={(e) => setYumanCardExpiry(e.target.value.substring(0, 5))}
                                        className="p-2 border border-black/10 bg-white text-xs font-mono focus:border-black focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[8px] font-bold uppercase tracking-wider text-black/50">CVC / CVV</label>
                                      <input
                                        type="password"
                                        placeholder="***"
                                        value={yumanCardCvv}
                                        onChange={(e) => setYumanCardCvv(e.target.value.replace(/\D/g, '').substring(0, 3))}
                                        className="p-2 border border-black/10 bg-white text-xs font-mono focus:border-black focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {yumanMethod === 'yoomoney' && (
                                <div className="bg-neutral-50 border border-black/5 p-3 text-center rounded-sm">
                                  <p className="font-sans text-[10px] text-black/60">
                                    Вы будете перенаправлены на защищенный шлюз ЮКасса для завершения транзакции.
                                  </p>
                                </div>
                              )}

                              {/* Action button */}
                              <button
                                onClick={handleYumanPayment}
                                disabled={yumanLoading}
                                className="w-full py-3 bg-[#9c27b0] text-white text-[10px] font-extrabold uppercase tracking-widest text-center hover:bg-[#7b1fa2] transition-colors mt-1.5 flex items-center justify-center gap-2 select-none cursor-pointer"
                              >
                                {yumanLoading ? (
                                  <>
                                    <Loader className="w-3.5 h-3.5 animate-spin" />
                                    <span>Соединение с ЮКасса...</span>
                                  </>
                                ) : (
                                  <span>Оплатить {yumanTariff === 'day' ? '49 ₽' : yumanTariff === 'week' ? '149 ₽' : '390 ₽'} через ЮКасса</span>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="text-center text-[10px] text-black/40 uppercase tracking-widest">
                Protected and compiled by YooKassa Secure Connection
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Russian Legal Documents Modals for YooKassa compliance */}
      <LegalDocModal type={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
    </div>
  );
}
