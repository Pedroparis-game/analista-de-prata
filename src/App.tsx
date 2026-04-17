import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Skull, Send, Trophy, Trash2, ShieldAlert, Gamepad2, LogIn, LogOut, UserPlus, Mail, Lock, User, Search, Activity, Languages, Zap, Brain, Target, Shield, AlertTriangle, RotateCcw } from 'lucide-react';
import { generateRoast, analyzeProfile, analyzeMatch, chatWithAnalista } from './lib/gemini';
import { supabase } from './lib/supabase';
import { translations, Language } from './lib/translations';
import axios from 'axios';

interface ShameEntry {
  id: string;
  user_id: string;
  user_input: string;
  bot_response: string;
  created_at: string;
  user_email?: string;
}

interface PlayerStats {
  name: string;
  tag: string;
  rank: string | null;
  level: number | null;
  mmr: number | null;
  card?: string;
  region?: string;
  matches?: any[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface ProfileAnalysisResult {
  archetype: { title: string, description: string };
  scoutingReport: { rankLevel: string, mechanical: string, mental: string };
  crushingSummary: string;
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const t = translations[language];

  const [showApp, setShowApp] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mural, setMural] = useState<ShameEntry[]>([]);
  const [lastRoast, setLastRoast] = useState<string | null>(null);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerStats | null>(null);
  const [riotId, setRiotId] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [profileAnalysis, setProfileAnalysis] = useState<ProfileAnalysisResult | null>(null);
  const [topBagres, setTopBagres] = useState<ShameEntry[]>([]);
  const [triggerShake, setTriggerShake] = useState(false);
  const [isPosted, setIsPosted] = useState(false);
  const [currentRoastData, setCurrentRoastData] = useState<{ input: string, roast: string } | null>(null);
  const [showAnalysisScreen, setShowAnalysisScreen] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  useEffect(() => {
    // Check for saved player in local storage
    const savedPlayer = localStorage.getItem('valorant_player');
    if (savedPlayer) {
      setPlayer(JSON.parse(savedPlayer));
    }
  }, []);

  useEffect(() => {
    fetchMural();
  }, [supabase]);

  // Re-analyze when language changes (with debounce)
  useEffect(() => {
    if (player && showApp && !analyzing) {
      const timer = setTimeout(async () => {
        setAnalyzing(true);
        const analysis = await analyzeProfile(player, language);
        setProfileAnalysis(analysis);
        setAnalyzing(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [language, player?.name, player?.tag]);

  const fetchMural = async () => {
    if (!supabase) return;
    
    // Normal mural (recent 10)
    const { data: muralData, error: muralError } = await supabase
      .from('hall_of_shame')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (muralError) {
      console.error("Error fetching mural:", muralError);
      setSupabaseError(`${t.errors.details}: ${muralError.message}`);
    } else if (muralData) {
      setMural(muralData as ShameEntry[]);
      setSupabaseError(null);
    }

    // Top Bagres (most recent unique entries for leaderboard feel)
    const { data: topData } = await supabase
      .from('hall_of_shame')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (topData) {
      setTopBagres(topData as ShameEntry[]);
    }
  };

  const startAnalysisAnimation = () => {
    setAnalysisProgress(0);
    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 1;
      });
    }, 20);
  };

  const handleTrackerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riotId.includes('#')) {
      setSupabaseError(t.login.errorFormat);
      return;
    }

    setAuthLoading(true);
    setSupabaseError(null);

    const [name, tag] = riotId.split('#').map(s => s.trim());

    const apiKey = import.meta.env.VITE_HENRIK_API_KEY;
    const headers = apiKey ? { Authorization: apiKey } : {};

    try {
      // Try to fetch account info (v1 is usually fine for basic info)
      const accRes = await axios.get(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, { headers });
      const region = accRes.data.data.region || 'br';
      
      // MMR call with region from account
      const mmrRes = await axios.get(`https://api.henrikdev.xyz/valorant/v1/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, { headers });
      
      // Fetch Matches
      let matches: any[] = [];
      try {
        const matchesRes = await axios.get(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, { headers });
        matches = matchesRes.data.data || [];
      } catch (err) {
        console.warn("Matches not found for this profile, proceeding with profile only.");
      }

      const stats: PlayerStats = {
        name: accRes.data.data.name,
        tag: accRes.data.data.tag,
        level: accRes.data.data.account_level,
        card: accRes.data.data.card?.small,
        region,
        rank: mmrRes.data?.data?.currenttierpatched || t.match.unknownMap,
        mmr: mmrRes.data?.data?.elo || 0,
        matches
      };

      setPlayer(stats);
      localStorage.setItem('valorant_player', JSON.stringify(stats));
      setSupabaseError(null);
      setShowAnalysisScreen(true);
      startAnalysisAnimation();

      // Auto-analyze profile
      setAnalyzing(true);
      const analysis = await analyzeProfile(stats, language);
      setProfileAnalysis(analysis);
      setAnalyzing(false);
    } catch (error: any) {
      const isNotFound = error.response?.status === 404;
      
      if (!isNotFound) {
        console.error("Critical error fetching stats:", error);
      }
      
      const fallbackStats: PlayerStats = {
        name,
        tag,
        level: null,
        rank: null,
        mmr: null
      };
      setPlayer(fallbackStats);
      localStorage.setItem('valorant_player', JSON.stringify(fallbackStats));
      setShowAnalysisScreen(true);
      startAnalysisAnimation();
      
      setAnalyzing(true);
      const analysis = await analyzeProfile(fallbackStats, language);
      setProfileAnalysis(analysis);
      setAnalyzing(false);

      if (isNotFound) {
        setSupabaseError(t.login.errorNotFound);
      } else {
        setSupabaseError(t.login.errorUnstable);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    setPlayer(null);
    setProfileAnalysis(null);
    setSelectedMatch(null);
    setChatMessages([]);
    localStorage.removeItem('valorant_player');
    setShowApp(false);
  };

  const handleMatchSelect = async (match: any) => {
    if (!player) return;
    setAnalyzing(true);
    setSelectedMatch({ ...match, analysis: t.match.analyzing });
    const analysis = await analyzeMatch(match, player, language);
    setSelectedMatch({ ...match, analysis });
    setAnalyzing(false);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !player || analyzing) return;

    const userMsg: ChatMessage = { role: 'user', text: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setAnalyzing(true);

    const response = await chatWithAnalista(chatMessages, chatInput, player, language);
    setChatMessages(prev => [...prev, { role: 'model', text: response || '...' }]);
    setAnalyzing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    setLastRoast(null);
    setSupabaseError(null);
    setIsPosted(false);

    const roast = await generateRoast(input, player, language);
    setLastRoast(roast);
    setCurrentRoastData({ input, roast });
    setTriggerShake(true);
    setTimeout(() => setTriggerShake(false), 500);

    setLoading(false);
    setInput('');
  };

  const handlePostToMural = async () => {
    if (!supabase || !currentRoastData || isPosted) return;
    
    setLoading(true);
    const { error } = await supabase.from('hall_of_shame').insert([
      {
        user_id: player ? `${player.name}#${player.tag}` : 'web_user',
        user_email: player ? `${player.name}#${player.tag} (${player.rank || 'BRONZE SOUL'})` : 'Anonymous',
        user_input: currentRoastData.input,
        bot_response: currentRoastData.roast
      }
    ]);

    if (error) {
      console.error("Error saving to mural:", error);
      setSupabaseError(`Save failed: ${error.message}`);
    } else {
      setIsPosted(true);
      fetchMural();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f1923] text-[#ece8e1] overflow-x-hidden relative">
      <div className="fixed top-4 left-4 z-[100] flex gap-2">
        <button 
          onClick={() => setLanguage('en')} 
          className={`val-btn !text-[10px] !px-2 !py-1 !min-h-0 !h-auto ${language === 'en' ? 'bg-[#ff4655] text-white border-[#ff4655]' : 'bg-black/40 text-[#ece8e1]/50 border-[#ece8e1]/10'}`}
        >
          EN
        </button>
        <button 
          onClick={() => setLanguage('pt')} 
          className={`val-btn !text-[10px] !px-2 !py-1 !min-h-0 !h-auto ${language === 'pt' ? 'bg-[#ff4655] text-white border-[#ff4655]' : 'bg-black/40 text-[#ece8e1]/50 border-[#ece8e1]/10'}`}
        >
          PT
        </button>
      </div>

    <AnimatePresence mode="wait">
      {!showApp ? (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
          transition={{ duration: 0.8 }}
          className="w-full"
        >
          <LandingPage onEnter={() => setShowApp(true)} t={t} language={language} />
        </motion.div>
      ) : !player ? (
        <motion.div
          key="login"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(5px)' }}
          transition={{ duration: 0.5 }}
          className="min-h-screen bg-[#0f1923] flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden val-grid moving-grid val-cursor"
        >
        <div className="absolute inset-0 bg-vignette pointer-events-none" />
        <div className="scanline" />
        
        {/* Floating background elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(15)].map((_, i) => (
            <div 
              key={i} 
              className="floating-mote"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 20}s`,
                opacity: Math.random() * 0.15
              }}
            />
          ))}
        </div>

        {/* Background Visuals */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#ff4655] opacity-[0.03] rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#00b2a9] opacity-[0.02] rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2" />
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="val-border bg-[#1f2933] p-6 md:p-12 w-full max-w-xl relative z-10 neon-glow"
        >
          <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-6 md:px-12">
            <div className="val-header w-full flex justify-center items-center text-[10px] md:text-base">
              <div>{t.login.header}</div>
            </div>
          </div>

          <div className="text-center mb-8 md:mb-10 pt-4">
            <h1 className="font-display text-5xl md:text-8xl uppercase leading-[0.8] mb-6 tracking-tighter italic val-title-hover transition-all cursor-default">
              Silver <br /> <span className="text-[#ff4655] glitch-red">Analyst</span>
            </h1>
            <p className="font-mono text-[10px] md:text-xs uppercase tracking-[0.2em] text-[#ece8e1] opacity-50">
              {t.login.subtitle}
            </p>
          </div>

          <div className="space-y-8">
            <form onSubmit={handleTrackerLogin} className="space-y-6">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ff4655] transition-transform group-focus-within:scale-110" size={20} />
                <input 
                  type="text" 
                  placeholder={t.login.placeholder}
                  value={riotId}
                  onChange={(e) => setRiotId(e.target.value)}
                  className="w-full pl-12 pr-4 py-5 bg-[#0f1923] border-b-2 border-[#ece8e1]/20 font-mono text-xl focus:outline-none focus:border-[#ff4655] transition-all placeholder:opacity-20 uppercase val-input-pulse"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={authLoading}
                className="val-btn val-btn-primary w-full text-2xl"
              >
                {authLoading ? t.login.loading : t.login.button}
              </button>
            </form>

            {supabaseError && (
              <div className="border-l-4 border-[#ff4655] bg-[#ff4655]/10 p-4 animate-pulse">
                <p className="text-[#ff4655] font-mono text-[10px] uppercase font-bold">
                  DATABASE_ERROR: {supabaseError}
                </p>
              </div>
            )}

            <div className="pt-4 border-t border-[#ece8e1]/10 flex justify-between items-center">
              <span className="font-mono text-[9px] uppercase opacity-30">Ver. 2.0.0A</span>
              <p className="font-mono text-[9px] uppercase opacity-30 text-right max-w-[200px]">
                {t.login.footer}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Decorative elements */}
        <div className="absolute top-10 left-10 flex gap-4">
          <div className="w-1 h-32 bg-[#ece8e1]/10" />
          <div className="w-1 h-12 bg-[#ff4655]/40" />
        </div>
        <div className="absolute bottom-10 right-10 flex gap-1 items-end">
          <div className="w-8 h-1 bg-[#ece8e1]/20" />
          <div className="w-2 h-1 bg-[#ff4655]" />
          <div className="w-12 h-1 bg-[#ece8e1]/20" />
        </div>
      </motion.div>
      ) : showAnalysisScreen ? (
        <motion.div
          key="analysis"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6 }}
          className="min-h-screen bg-[#0f1923] flex flex-col items-center justify-center p-4 md:p-8 relative val-grid overflow-hidden"
        >
        <div className="absolute inset-0 bg-vignette pointer-events-none z-0" />
        <div className="scanline" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="val-border bg-[#1f2933] w-full max-w-4xl p-6 md:p-12 relative z-10 neon-glow overflow-hidden"
        >
          {/* Scanning Animation Header */}
          <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-6 md:px-12">
            <div className="val-header w-full flex justify-center items-center text-[10px] md:text-base !bg-[#ff4655] !text-white">
              <div className="flex items-center gap-4">
                <Activity className="animate-pulse" size={18} />
                <span>{t.analysis.header}</span>
                <Activity className="animate-pulse" size={18} />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-8 md:gap-12 mt-8 md:mt-10">
            {/* Player Card & Info */}
            <div className="md:w-1/3 space-y-6">
              <div className="relative group">
                <div className="val-border p-2 bg-black/40">
                  <img 
                    src={player.card || "https://picsum.photos/seed/val/400/400"} 
                    className="w-full aspect-[1/1] object-cover border-2 border-[#ff4655]/30 group-hover:border-[#ff4655] transition-all" 
                    alt="Card"
                    referrerPolicy="no-referrer"
                  />
                  {/* Scan bar animation */}
                  <motion.div 
                    animate={{ top: ['0%', '100%', '0%'] }} 
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 w-full h-1 bg-[#ff4655] shadow-[0_0_15px_#ff4655] z-30 opacity-60"
                  />
                </div>
                <div className="mt-4 text-center md:text-left">
                  <h2 className="font-display text-4xl uppercase italic tracking-tighter truncate">{player.name}</h2>
                  <p className="font-mono text-sm text-[#ff4655] font-bold">#{player.tag}</p>
                </div>
              </div>

              <div className="val-border p-4 bg-black/20 space-y-4">
                <div className="flex justify-between items-end border-b border-[#ece8e1]/10 pb-2">
                  <span className="font-mono text-[10px] uppercase opacity-40">{t.analysis.rankLabel}</span>
                  <span className="font-display text-xl text-[#00b2a9]">{player.rank || '??'}</span>
                </div>
                <div className="flex justify-between items-end border-b border-[#ece8e1]/10 pb-2">
                  <span className="font-mono text-[10px] uppercase opacity-40">{t.analysis.statusLabel}</span>
                  <span className="font-mono text-[10px] text-[#ff4655] animate-pulse">
                    {analysisProgress < 100 ? t.analysis.tracking : t.analysis.complete}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Analysis Reveal */}
            <div className="md:w-2/3 flex flex-col justify-between">
              <div className="val-border bg-black/40 p-6 flex-1 relative overflow-y-auto max-h-[400px] custom-scrollbar">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-1.5 bg-[#ff4655] rounded-full animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">{t.analysis.verdictTitle}</span>
                </div>

                {analyzing ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                      <Skull size={48} className="text-[#ff4655] opacity-20" />
                    </motion.div>
                    <p className="font-mono text-xs uppercase tracking-widest opacity-30 animate-pulse">{t.analysis.compiling}</p>
                  </div>
                ) : profileAnalysis ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    {/* Archetype Header */}
                    <div className="border-l-4 border-[#ff4655] pl-4 py-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap size={14} className="text-[#ff4655]" />
                        <span className="font-mono text-[10px] uppercase tracking-widest text-[#ff4655] font-bold">{t.analysis.labels.archetype}</span>
                      </div>
                      <h4 className="font-display text-2xl italic uppercase text-white">{profileAnalysis.archetype.title}</h4>
                      <p className="font-mono text-[11px] opacity-60 uppercase">{profileAnalysis.archetype.description}</p>
                    </div>

                    {/* Scouting Report Grid */}
                    <div className="grid gap-4">
                      <div className="bg-white/5 p-4 val-border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain size={16} className="text-[#00b2a9]" />
                          <span className="font-mono text-[10px] uppercase font-bold text-[#00b2a9]">{t.analysis.labels.strategic}</span>
                        </div>
                        <p className="font-mono text-xs leading-relaxed italic opacity-80 uppercase">{profileAnalysis.scoutingReport.rankLevel}</p>
                      </div>

                      <div className="bg-white/5 p-4 val-border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Target size={16} className="text-[#ff4655]" />
                          <span className="font-mono text-[10px] uppercase font-bold text-[#ff4655]">{t.analysis.labels.mechanical}</span>
                        </div>
                        <p className="font-mono text-xs leading-relaxed italic opacity-80 uppercase">{profileAnalysis.scoutingReport.mechanical}</p>
                      </div>

                      <div className="bg-white/5 p-4 val-border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle size={16} className="text-yellow-500" />
                          <span className="font-mono text-[10px] uppercase font-bold text-yellow-500">{t.analysis.labels.stability}</span>
                        </div>
                        <p className="font-mono text-xs leading-relaxed italic opacity-80 uppercase">{profileAnalysis.scoutingReport.mental}</p>
                      </div>
                    </div>

                    {/* Final Verdict */}
                    <div className="pt-4 border-t border-white/10">
                      <span className="font-mono text-[10px] uppercase opacity-40 mb-2 block">{t.analysis.labels.finalVerdict}</span>
                      <p className="font-mono text-sm leading-relaxed text-[#ece8e1] whitespace-pre-wrap italic bg-[#ff4655]/10 p-4 border border-[#ff4655]/20">
                        {profileAnalysis.crushingSummary}
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="text-center p-8 opacity-20 font-mono italic">
                    {t.analysis.empty}
                  </div>
                )}
              </div>

              {/* Progress Bar & Actions */}
              <div className="mt-8 space-y-6">
                <div className="w-full h-1.5 bg-black/50 overflow-hidden val-border !border-[#ece8e1]/10">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${analysisProgress}%` }}
                    className="h-full bg-[#ff4655] shadow-[0_0_10px_#ff4655]"
                  />
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                  <button 
                    onClick={() => setShowAnalysisScreen(false)}
                    className="val-btn flex-1 text-xl val-btn-primary"
                  >
                    {t.analysis.accessButton}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Decorative elements */}
        <div className="absolute top-1/2 left-4 -translate-y-1/2 hidden lg:flex flex-col gap-8 opacity-20">
          <div className="writing-vertical-rl font-mono text-[10px] uppercase tracking-[0.5em]">{t.analysis.protocol}</div>
          <div className="w-[1px] h-32 bg-[#ece8e1]" />
        </div>
      </motion.div>
      ) : (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="min-h-screen flex flex-col font-sans overflow-x-hidden bg-[#0f1923] val-grid moving-grid relative val-cursor"
        >
      <div className="absolute inset-0 bg-vignette pointer-events-none z-0" />
      <div className="scanline" />
      
      {/* Floating background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {[...Array(30)].map((_, i) => (
          <div 
            key={i} 
            className="floating-mote"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 20}s`,
              opacity: Math.random() * 0.1
            }}
          />
        ))}
      </div>

      {/* Marquee Header */}
      <div className="bg-[#0f1923] text-[#ece8e1] py-3 md:py-4 border-b border-[#ece8e1]/10 overflow-hidden whitespace-nowrap z-40 flex items-center relative">
        <div className="marquee-track font-display text-lg md:text-xl uppercase tracking-[0.3em] opacity-40">
          {[...Array(4)].map((_, i) => (
            <span key={i} className="flex items-center">
              <span className="mx-4 md:mx-6 text-sm md:text-xl">{t.marquee.title}</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-sm md:text-xl">{t.marquee.hall}</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-[#ff4655] text-sm md:text-xl">{t.marquee.coach}</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-sm md:text-xl">{t.marquee.issue}</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-sm md:text-xl">{t.marquee.life}</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
            </span>
          ))}
        </div>
        
        {/* Profile in Header */}
        <div className="flex items-center gap-3 md:gap-6 px-4 md:px-8 h-full bg-[#ff4655] text-white skew-x-[-12deg] -mr-4 ml-auto z-50">
          <div className="flex items-center gap-2 md:gap-4 skew-x-[12deg]">
            {player.card && (
              <img src={player.card} className="w-8 h-8 md:w-10 md:h-10 border-2 border-white/20" alt="Card" referrerPolicy="no-referrer" />
            )}
            <div className="flex flex-col leading-tight max-w-[80px] md:max-w-none">
              <span className="font-display text-base md:text-xl uppercase tracking-tighter truncate">
                {player.name}
              </span>
              <span className="font-mono text-[8px] md:text-[9px] uppercase font-bold opacity-80 truncate">
                {player.rank || t.match.noRank}
              </span>
            </div>
            <button 
              onClick={() => {
                setShowAnalysisScreen(true);
                // No need to restart animation if it's already running
              }}
              className="hover:bg-white hover:text-[#ff4655] transition-all p-1.5 md:p-2 border border-white/20 ml-2"
              title={t.header.back}
            >
              <Activity size={16} className="md:w-5 md:h-5" />
            </button>
            <button 
              onClick={handleSignOut}
              className="hover:bg-white hover:text-[#ff4655] transition-all p-1.5 md:p-2 border border-white/20 ml-2"
              title={t.header.signOut}
            >
              <LogOut size={16} className="md:w-5 md:h-5" />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-8 md:py-16 space-y-8 md:space-y-16 max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-8 md:gap-16">
          {/* Left Column: Input & Profile Analysis */}
          <div className="space-y-8 md:space-y-10">
            <motion.div 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              className="val-border p-6 md:p-10 bg-[#1f2933] text-[#ece8e1] relative overflow-hidden hover-sweep"
            >
              <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-6 md:px-10">
                <div className="val-header w-full flex justify-center items-center text-[10px] md:text-base">
                  <div>{t.dashboard.submission}</div>
                </div>
              </div>
              
              <p className="mb-4 md:mb-6 font-mono text-[10px] md:text-xs uppercase opacity-50 mt-8 tracking-widest text-center">
                {t.dashboard.reportPrompt}
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t.dashboard.placeholder}
                  className="w-full h-40 p-5 bg-[#0f1923] text-[#ece8e1] border-b-2 border-[#ff4655] focus:outline-none focus:bg-[#2a3744] transition-all font-mono placeholder:opacity-10 resize-none"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="val-btn val-btn-primary w-full"
                >
                  {loading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                      <Skull size={28} />
                    </motion.div>
                  ) : (
                    <>
                      <Send size={24} className="mr-4" />
                      {t.dashboard.generate}
                    </>
                  )}
                </button>
                
                <div className="flex items-center gap-4 pt-4">
                  <div className="flex-1 h-[1px] bg-white/5"></div>
                  <span className="font-mono text-[9px] uppercase opacity-20 tracking-[0.5em]">{t.dashboard.modules}</span>
                  <div className="flex-1 h-[1px] bg-white/5"></div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAnalysisScreen(true)}
                  className="val-btn text-xs w-full flex items-center justify-center gap-2 border-[#ece8e1]/10 text-[#ece8e1]/60 hover:text-[#ff4655] hover:border-[#ff4655]/40"
                >
                  <Activity size={18} />
                  {t.dashboard.viewVerdict}
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="val-btn val-btn-secondary w-full text-base"
                >
                  <LogOut size={18} className="mr-2" />
                  {t.dashboard.disconnect}
                </button>
              </form>
            </motion.div>

            {/* Profile Analysis */}
            <AnimatePresence>
              {(analyzing || profileAnalysis) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="val-border p-6 bg-[#ff4655] text-white relative shadow-[0_0_40px_rgba(255,70,85,0.2)] max-h-[600px] flex flex-col"
                >
                  <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-6">
                    <div className="bg-[#0f1923] text-white py-2 font-display text-sm tracking-widest skew-x-[-15deg] flex items-center justify-center border-l-4 border-white w-full">
                      {t.dashboard.agentVerdict}
                    </div>
                  </div>
                  
                  {analyzing ? (
                    <div className="pt-12 flex flex-col items-center justify-center h-48 gap-4">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                        <Skull size={48} className="opacity-20" />
                      </motion.div>
                      <p className="font-mono text-[10px] uppercase tracking-widest animate-pulse opacity-50">{t.analysis.compiling}</p>
                    </div>
                  ) : profileAnalysis ? (
                    <>
                      <div className="pt-8 flex-shrink-0">
                        <div className="bg-black/20 p-3 mb-4 border border-white/10">
                          <span className="font-mono text-[9px] uppercase font-bold opacity-60 block mb-1">{t.analysis.labels.archetype}</span>
                          <h3 className="font-display text-2xl italic tracking-tight uppercase leading-none">{profileAnalysis.archetype.title}</h3>
                        </div>
                      </div>

                      <div className="overflow-y-auto custom-scrollbar pr-2 flex-1 space-y-4">
                        <div className="grid gap-3">
                          <div className="bg-black/10 p-3 border-l-2 border-white/30">
                            <span className="font-mono text-[9px] uppercase font-bold opacity-40 block mb-1">{t.analysis.labels.strategic}</span>
                            <p className="font-mono text-[11px] font-bold uppercase leading-relaxed italic line-clamp-3">{profileAnalysis.scoutingReport.rankLevel}</p>
                          </div>
                          <div className="bg-black/10 p-3 border-l-2 border-[#00b2a9]">
                            <span className="font-mono text-[9px] uppercase font-bold opacity-40 block mb-1">{t.analysis.labels.mechanical}</span>
                            <p className="font-mono text-[11px] font-bold uppercase leading-relaxed italic line-clamp-3">{profileAnalysis.scoutingReport.mechanical}</p>
                          </div>
                        </div>
                        
                        <div className="bg-black/20 p-4 border border-white/20 italic">
                          <span className="font-mono text-[9px] uppercase font-bold opacity-40 block mb-2">{t.analysis.labels.verdictSummary}</span>
                          <p className="font-mono text-[11px] font-bold uppercase leading-relaxed">
                            {profileAnalysis.crushingSummary}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(loading || lastRoast) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    x: triggerShake ? [-12, 12, -10, 10, -5, 5, 0] : 0,
                    rotate: triggerShake ? [-1, 1, -1, 1, 0] : 0,
                    scale: triggerShake ? [1, 1.05, 1] : 1,
                    boxShadow: triggerShake 
                      ? "0 0 80px rgba(255, 70, 85, 0.8), inset 0 0 40px rgba(255, 70, 85, 0.4)" 
                      : "0 0 15px rgba(255, 70, 85, 0.2)",
                    borderColor: "#ff4655"
                  }}
                  transition={{ 
                    duration: triggerShake ? 0.3 : 0.5,
                    ease: "easeInOut"
                  }}
                  className={`val-border p-8 bg-black text-white relative transition-colors duration-150 border-2 overflow-hidden border-[#ff4655] mb-8 min-h-[200px] flex flex-col justify-center`}
                >
                  {/* Background Glitch Overlay */}
                  {triggerShake && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.3, 0.1, 0.3, 0] }}
                      className="absolute inset-0 bg-valorant-red pointer-events-none z-0"
                    />
                  )}

                  <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-30 px-12">
                    <div className={`py-3 font-display text-2xl skew-x-[-12deg] transition-all duration-150 flex items-center justify-center w-full ${triggerShake ? 'bg-valorant-red text-white scale-110 shadow-[0_0_20px_rgba(255,70,85,1)]' : 'bg-[#ff4655] text-[#0f1923]'}`}>
                      {loading ? t.analysis.compiling : (triggerShake ? t.dashboard.eliminated : t.dashboard.finalVerdict)}
                    </div>
                  </div>
                  
                  <div className="relative z-10 pt-16 text-center">
                    {loading ? (
                      <div className="flex flex-col items-center gap-4 py-8">
                        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                          <Skull size={48} className="text-[#ff4655]" />
                        </motion.div>
                        <p className="font-mono text-xs uppercase tracking-widest opacity-30 animate-pulse">{t.dashboard.generatingRoast}</p>
                      </div>
                    ) : (
                      <>
                        <p className={`text-2xl font-display uppercase italic leading-relaxed transition-all duration-150 tracking-tight ${triggerShake ? 'text-white glitch-red italic' : 'text-[#ff4655]'}`}>
                          "{lastRoast}"
                        </p>

                        <div className="mt-8 flex flex-col gap-3">
                          <button
                            onClick={handlePostToMural}
                            disabled={isPosted || loading}
                            className={`w-full py-3 font-display text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 skew-x-[-10deg] ${
                              isPosted 
                              ? 'bg-gray-800 text-gray-400 border-gray-700 cursor-default grayscale' 
                              : 'bg-white text-black hover:bg-valorant-red hover:text-white border-black hover:border-white border-2'
                            }`}
                          >
                            {isPosted ? (
                              <>
                                <ShieldAlert size={18} className="skew-x-[10deg]" />
                                <span className="skew-x-[10deg]">{t.dashboard.archived}</span>
                              </>
                            ) : (
                              <>
                                <UserPlus size={18} className="skew-x-[10deg]" />
                                <span className="skew-x-[10deg]">{t.dashboard.eternize}</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              setLastRoast(null);
                              setInput('');
                              setIsPosted(false);
                            }}
                            className="w-full py-3 font-display text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 skew-x-[-10deg] bg-transparent border-2 border-white/20 text-white/60 hover:border-[#ff4655] hover:text-[#ff4655]"
                          >
                            <RotateCcw size={18} className="skew-x-[10deg]" />
                            <span className="skew-x-[10deg]">{t.dashboard.reset}</span>
                          </button>

                          {isPosted && (
                            <div className="flex items-center justify-center gap-2 opacity-50">
                              <div className="h-[1px] flex-1 bg-white/20"></div>
                              <p className="font-mono text-[9px] uppercase tracking-tighter">
                                {t.dashboard.successPost}
                              </p>
                              <div className="h-[1px] flex-1 bg-white/20"></div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                {/* Valorant decorative elements */}
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-20">
                  <div className="w-1 h-4 bg-white rotate-12"></div>
                  <div className="w-1 h-4 bg-white rotate-12"></div>
                  <div className="w-1 h-4 bg-white rotate-12"></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

          {/* Right Column: Match History & Chat */}
          <div className="space-y-10">
            {/* Match History */}
            <div className="val-border p-6 md:p-10 bg-[#1f2933] text-[#ece8e1] relative">
              <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-6 md:px-10">
                <div className="val-header w-full flex justify-center items-center text-[10px] md:text-base">
                  <div>{t.match.history}</div>
                </div>
              </div>
              
              <div className="space-y-4 mt-12 max-h-[350px] md:max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                {player.matches && player.matches.length > 0 ? (
                  player.matches.map((match: any, idx: number) => {
                    const stats = match.players?.all_players?.find((p: any) => p.name === player.name);
                    const isWin = match.metadata?.mode === 'Deathmatch' ? false : (match.teams?.red?.has_won && stats?.team === 'Red') || (match.teams?.blue?.has_won && stats?.team === 'Blue');

                    return (
                      <motion.div
                        key={match.metadata?.matchid || idx}
                        whileHover={{ x: 8 }}
                        onClick={() => handleMatchSelect(match)}
                        className={`p-5 val-border cursor-pointer transition-all group hover-sweep ${selectedMatch?.metadata?.matchid === match.metadata?.matchid ? 'bg-[#ff4655] border-white' : 'bg-[#0f1923] hover:bg-[#2a3744]'}`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className={`font-display uppercase text-lg italic ${selectedMatch?.metadata?.matchid === match.metadata?.matchid ? 'text-white' : 'text-[#ff4655]'}`}>
                            {match.metadata?.map || t.match.unknownMap}
                          </span>
                          <span className={`text-[9px] font-mono px-3 py-1 skew-x-[-12deg] border ${isWin ? 'bg-[#00b2a9] text-white border-white/20' : 'bg-[#ff4655] text-white border-white/20'}`}>
                            {isWin ? t.match.win : t.match.loss}
                          </span>
                        </div>
                        <div className="flex gap-6 font-mono text-[9px] uppercase opacity-50 font-bold">
                          <span className="flex items-center gap-1">{t.match.agent} <span className="text-white">{stats?.character || 'RANDOM'}</span></span>
                          <span className="flex items-center gap-1">{t.match.kda} <span className={isWin ? 'text-[#00b2a9]' : 'text-[#ff4655]'}>{stats?.stats?.kills}/{stats?.stats?.deaths}/{stats?.stats?.assists}</span></span>
                          <span className="flex items-center gap-1">{t.match.points} <span className="text-white">{stats?.stats?.score}</span></span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="py-20 text-center border-2 border-dashed border-white/5 bg-white/[0.02]">
                    <p className="font-mono text-xs uppercase opacity-20 tracking-widest">{t.match.awaitingData}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Selected Match Analysis */}
            <AnimatePresence>
              {selectedMatch && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="val-border p-8 bg-[#0f1923] border-[#ff4655] text-[#ece8e1] relative"
                >
                  <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-8">
                    <div className="bg-[#ff4655] text-white py-2 font-display text-sm skew-x-[-10deg] italic flex items-center justify-center border-l-4 border-[#0f1923] w-full">
                      {t.errors.details}
                    </div>
                  </div>
                  <p className="font-mono text-xs leading-relaxed italic whitespace-pre-wrap opacity-80 decoration-[#ff4655]/30 pt-10">
                    {selectedMatch.analysis}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat with Analista */}
            <div className="val-border p-8 bg-[#1f2933] text-[#ece8e1] relative flex flex-col h-[500px]">
              <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-8">
                <div className="val-header w-full flex justify-center items-center">
                  <div>{t.dashboard.commsHeader}</div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 mb-6 mt-14 pr-2 custom-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale">
                    <Activity size={48} className="mb-4" />
                    <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] max-w-[200px]">
                      {t.dashboard.commsEmpty}
                    </p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 text-xs font-mono tracking-tight leading-snug ${
                      msg.role === 'user' 
                      ? 'bg-[#0f1923] border-r-4 border-[#00b2a9] text-[#ece8e1]' 
                      : 'bg-[#ff4655] text-white skew-x-[-5deg]'
                    }`}>
                      <div className={msg.role === 'model' ? 'skew-x-[5deg]' : ''}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ))}
                {analyzing && (
                  <div className="flex justify-start">
                    <div className="p-3 bg-[#ff4655] text-white animate-pulse font-bold">
                      ...
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleChatSubmit} className="flex gap-4">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={t.dashboard.commsPlaceholder}
                  className="flex-1 p-4 bg-[#0f1923] border-b border-white/20 font-mono text-xs focus:outline-none focus:border-[#ff4655] transition-colors uppercase"
                />
                <button
                  type="submit"
                  disabled={analyzing}
                  className="bg-[#ff4655] text-white px-6 transition-all hover:bg-white hover:text-[#ff4655] active:scale-95 border-2 border-transparent"
                >
                  <Send size={20} />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Mural & Ranking Section */}
        <div className="pt-10 md:pt-20 space-y-8 md:space-y-16">
          <div className="flex items-center gap-4 md:gap-6">
            <h2 className="font-display text-3xl md:text-5xl uppercase italic tracking-tighter shrink-0 text-[#ff4655]">{t.mural.title}</h2>
            <div className="h-[1px] md:h-[2px] w-full bg-[#ece8e1]/10"></div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 md:gap-16">
            {/* Top Bagres (Ranking) */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-1 val-border p-6 md:p-10 bg-[#1f2933] text-[#ece8e1] relative shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="absolute -top-2 left-0 w-full flex justify-center items-center z-20 px-6 md:px-10">
                <div className="val-header !bg-[#ffb800] !text-[#0f1923] !py-2 md:!py-3 text-base md:text-xl w-full flex justify-center items-center">
                  <div className="flex items-center gap-3">
                    <Trophy size={16} className="md:w-5 md:h-5" /> <span className="translate-y-[1px]">{t.mural.elite}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 md:space-y-6 mt-10">
                {topBagres.map((entry, idx) => (
                  <motion.div
                    key={entry.id}
                    initial={{ scale: 0.95, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className={`flex items-center gap-3 md:gap-5 p-3 md:p-4 val-border ${idx === 0 ? 'bg-[#ffb800] border-black text-[#0f1923]' : 'bg-[#0f1923] opacity-80 hover:opacity-100 transition-opacity'}`}
                  >
                    <span className="font-display text-2xl md:text-4xl italic opacity-50 w-8 md:w-12 text-center">0{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-base md:text-lg uppercase tracking-tight truncate">
                        {entry.user_id || t.dashboard.hiddenRequest}
                      </p>
                      <p className="text-[8px] md:text-[10px] font-mono opacity-60 font-bold uppercase">
                        {entry.user_email?.match(/\(([^)]+)\)/)?.[1] || t.dashboard.noobTraining}
                      </p>
                    </div>
                  </motion.div>
                ))}
                {topBagres.length === 0 && (
                  <div className="py-10 md:py-20 text-center opacity-10">
                    <Search size={32} className="mx-auto mb-4 md:w-12 md:h-12" />
                    <p className="font-mono text-[10px] uppercase tracking-widest">{t.mural.searching}</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Mural da Vergonha Mundial */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-2 val-border p-6 md:p-12 bg-[#0f1923] border-[#ff4655]/30 relative min-h-[300px] md:min-h-[400px]"
            >
              <div className="absolute -top-2 left-0 w-full flex justify-center items-center z-20 px-6 md:px-12">
                <div className="val-header !tracking-[0.2em] !py-3 md:!py-4 text-[10px] md:text-base w-full flex justify-center items-center text-center">
                  <div>{t.dashboard.registry}</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 md:gap-8 mt-10">
                {mural.map((entry, idx) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-4 md:p-6 border border-[#ece8e1]/10 hover:border-[#ff4655]/50 transition-all bg-[#1f2933]/50 group"
                  >
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#ece8e1]/5">
                      <span className="text-[8px] md:text-[9px] font-mono text-[#ff4655] font-bold uppercase tracking-widest">
                        {entry.user_email?.split('(')[0] || t.dashboard.anonymous}
                      </span>
                      <span className="text-[7px] md:text-[8px] font-mono opacity-30">
                        // {new Date(entry.created_at).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US')}
                      </span>
                    </div>
                    <p className="text-[10px] md:text-xs font-mono text-[#ece8e1]/60 mb-3 italic line-clamp-2">
                      "{entry.user_input}"
                    </p>
                    <p className="text-[#ece8e1] text-xs md:text-sm font-bold uppercase tracking-tight leading-[1.3] group-hover:text-[#ff4655] transition-colors">
                      {entry.bot_response}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 md:p-12 border-t border-[#ece8e1]/5 mt-12 bg-[#0a0a0a]">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-8 md:gap-12">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="w-12 h-12 md:w-16 md:h-16 val-border bg-[#ff4655] flex items-center justify-center transform hover:rotate-90 transition-transform duration-500">
              <Activity className="text-white md:w-8 md:h-8" size={24} />
            </div>
            <div>
              <h3 className="font-display text-xl md:text-3xl uppercase italic tracking-tighter leading-none">{t.landing.title}</h3>
              <p className="text-[8px] md:text-[9px] font-mono opacity-40 uppercase tracking-[0.3em] mt-2 text-center md:text-left">{t.footer.copyright}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 font-mono text-[9px] md:text-[10px] uppercase tracking-widest opacity-50">
            <span className="hover:text-[#ff4655] cursor-help border-b border-transparent hover:border-[#ff4655] pb-1 transition-all text-white">{t.footer.guidelines}</span>
            <span className="hover:text-[#ff4655] cursor-help border-b border-transparent hover:border-[#ff4655] pb-1 transition-all text-white">{t.footer.privacy}</span>
          </div>
        </div>
      </footer>
    </motion.div>
  )}
      </AnimatePresence>
    </div>
  );
}

function LandingPage({ onEnter, t, language }: { onEnter: () => void, t: any, language: Language }) {
  return (
    <div className="min-h-screen bg-[#0f1923] flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden val-grid moving-grid select-none cursor-default">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-vignette pointer-events-none z-10" />
      <div className="absolute inset-0 bg-gradient-to-tr from-[#ff4655]/5 via-transparent to-[#00b2a9]/5 opacity-40 z-0" />
      
      {/* Decorative Floating Mesh */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[10%] left-[20%] w-64 h-64 bg-[#ff4655] rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] right-[20%] w-96 h-96 bg-[#00b2a9] rounded-full blur-[150px] animate-pulse-slow" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-20 text-center max-w-5xl w-full px-4"
      >
        <div className="inline-block mb-6 py-2 px-6 val-border bg-white/5 backdrop-blur-md border border-white/10 skew-x-[-12deg]">
          <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.5em] text-[#ff4655] font-bold skew-x-[12deg] flex items-center gap-2">
            <span className="w-2 h-2 bg-[#ff4655] rounded-full animate-ping" />
            {t.landing.infra}
          </span>
        </div>

        <h1 className="text-7xl md:text-[10rem] font-display uppercase italic tracking-tighter leading-[0.85] mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-[#ff4655]/40 drop-shadow-[0_10px_30px_rgba(255,70,85,0.2)]">
          {t.landing.title.split(' ').map((word: string, i: number) => (
            <React.Fragment key={i}>
              {word}{i === 0 && <br />}
            </React.Fragment>
          ))}
        </h1>
        
        <p className="font-mono text-sm md:text-2xl text-[#ece8e1]/70 uppercase tracking-[0.4em] mb-16 max-w-3xl mx-auto leading-relaxed">
          {t.landing.subtitle.split(' for ').map((part: string, i: number) => (
            <React.Fragment key={i}>
              {i === 1 ? <><span className="text-[#ff4655]"> {part}</span></> : part}
              {i === 0 && <br className="hidden md:block" />}
            </React.Fragment>
          ))}
        </p>

        {/* Live Data Layer - 3D Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {[
            { label: t.landing.stats.roasts, value: '12,483', icon: <Skull size={20} />, delay: 0 },
            { label: t.landing.stats.users, value: '3,201', icon: <User size={20} />, delay: 0.1 },
            { label: t.landing.stats.latency, value: '2.3s', icon: <Activity size={20} />, delay: 0.2 }
          ].map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ 
                scale: 1.05, 
                rotateY: 12, 
                rotateX: -5,
                boxShadow: "0 25px 50px -12px rgba(255, 70, 85, 0.4)",
                borderColor: "rgba(255, 70, 85, 0.5)"
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + item.delay, duration: 0.6 }}
              className="group bg-white/5 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300 transform perspective-1000"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl" />
              
              <div className="relative z-10 text-[#ff4655] p-3 bg-black/40 rounded-xl mb-2">
                {item.icon}
              </div>
              <div className="relative z-10 font-display text-4xl text-white italic tracking-tighter">
                {item.value}
              </div>
              <div className="relative z-10 font-mono text-[11px] font-bold uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 group-hover:text-[#ff4655] transition-all">
                {item.label}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.button
          whileHover={{ 
            scale: 1.05, 
            boxShadow: "0 0 40px rgba(255, 70, 85, 0.6)",
            y: -5
          }}
          whileTap={{ scale: 0.98 }}
          onClick={onEnter}
          className="val-btn val-btn-primary !text-2xl md:!text-5xl !px-16 !py-10 relative group overflow-hidden neon-glow !border-white/40"
        >
          <span className="relative z-10 flex items-center gap-6 italic tracking-tight uppercase">
            {t.landing.cta}
            <Gamepad2 className="w-10 h-10 animate-bounce" />
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
        </motion.button>

        {/* Version & Credits */}
        <div className="mt-20 flex items-center justify-center gap-8 font-mono text-[9px] uppercase tracking-widest opacity-20">
          <span>{t.landing.enterprise}</span>
          <span className="w-1 h-1 bg-[#ece8e1] rounded-full" />
          <span>{t.landing.network}</span>
          <span className="w-1 h-1 bg-[#ece8e1] rounded-full" />
          <span>{t.landing.encryption}</span>
        </div>
      </motion.div>

      {/* Grid Scan Animation */}
      <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#ff4655]/5 to-transparent pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ y: [0, 500] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="w-full h-[1px] bg-[#ff4655]/20 shadow-[0_0_20px_#ff4655]"
        />
      </div>
    </div>
  );
}
