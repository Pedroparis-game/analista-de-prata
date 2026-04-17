import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Skull, Send, Trophy, Trash2, ShieldAlert, Gamepad2, LogIn, LogOut, UserPlus, Mail, Lock, User, Search, Activity } from 'lucide-react';
import { generateRoast, analyzeProfile, analyzeMatch, chatWithAnalista } from './lib/gemini';
import { supabase } from './lib/supabase';
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

export default function App() {
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
  const [profileAnalysis, setProfileAnalysis] = useState<string | null>(null);
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

  const fetchMural = async () => {
    if (!supabase) return;
    
    // Normal mural (recent 10)
    const { data: muralData, error: muralError } = await supabase
      .from('hall_of_shame')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (muralError) {
      console.error("Erro ao buscar mural:", muralError);
      setSupabaseError(`Erro ao buscar: ${muralError.message}`);
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
      setSupabaseError("Formato inválido. Use Nome#TAG");
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
        rank: mmrRes.data?.data?.currenttierpatched || "Sem Rank",
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
      const analysis = await analyzeProfile(stats);
      setProfileAnalysis(analysis);
      setAnalyzing(false);
    } catch (error: any) {
      const isNotFound = error.response?.status === 404;
      
      if (!isNotFound) {
        console.error("Erro crítico ao buscar stats:", error);
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
      const analysis = await analyzeProfile(fallbackStats);
      setProfileAnalysis(analysis);
      setAnalyzing(false);

      if (isNotFound) {
        setSupabaseError("Aviso: Player não encontrado. Verifique se o Nick#TAG está correto. Entrando em modo convidado.");
      } else {
        setSupabaseError("Aviso: O serviço de rastreamento está instável. Você entrou como convidado.");
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
  };

  const handleMatchSelect = async (match: any) => {
    if (!player) return;
    setAnalyzing(true);
    setSelectedMatch({ ...match, analysis: 'Analisando o show de horrores...' });
    const analysis = await analyzeMatch(match, player);
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

    const response = await chatWithAnalista(chatMessages, chatInput, player);
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

    const roast = await generateRoast(input, player);
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
        user_email: player ? `${player.name}#${player.tag} (${player.rank || 'BRONZE EM ALMA'})` : 'Anônimo',
        user_input: currentRoastData.input,
        bot_response: currentRoastData.roast
      }
    ]);

    if (error) {
      console.error("Erro ao salvar no mural:", error);
      setSupabaseError(`Erro ao salvar: ${error.message}`);
    } else {
      setIsPosted(true);
      fetchMural();
    }
    setLoading(false);
  };

  if (!player) {
    return (
      <div className="min-h-screen bg-[#0f1923] flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden val-grid moving-grid val-cursor">
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
              <div>PROTOCOLO DE ACESSO: INICIADO</div>
            </div>
          </div>

          <div className="text-center mb-8 md:mb-10 pt-4">
            <h1 className="font-display text-5xl md:text-8xl uppercase leading-[0.8] mb-6 tracking-tighter italic val-title-hover transition-all cursor-default">
              Analista <br /> <span className="text-[#ff4655] glitch-red">de Prata</span>
            </h1>
            <p className="font-mono text-[10px] md:text-xs uppercase tracking-[0.2em] text-[#ece8e1] opacity-50">
              Rastreamento de Desempenho // Protocolo de Humilhação
            </p>
          </div>

          <div className="space-y-8">
            <form onSubmit={handleTrackerLogin} className="space-y-6">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ff4655] transition-transform group-focus-within:scale-110" size={20} />
                <input 
                  type="text" 
                  placeholder="RIOT ID (Ex: Player#BR1)"
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
                {authLoading ? 'CONFIGURANDO HUD...' : 'RASTREAR MEU BRONZE'}
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
                O Analista usa a API pública do Valorant para ver quão afundado você está.
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
      </div>
    );
  }

  if (player && showAnalysisScreen) {
    return (
      <div className="min-h-screen bg-[#0f1923] flex flex-col items-center justify-center p-4 md:p-8 relative val-grid overflow-hidden">
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
                <span>INSPEÇÃO DE PERFIL: EM CURSO</span>
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
                  <span className="font-mono text-[10px] uppercase opacity-40">RANK ATUAL</span>
                  <span className="font-display text-xl text-[#00b2a9]">{player.rank || '??'}</span>
                </div>
                <div className="flex justify-between items-end border-b border-[#ece8e1]/10 pb-2">
                  <span className="font-mono text-[10px] uppercase opacity-40">STATUS SISTEMA</span>
                  <span className="font-mono text-[10px] text-[#ff4655] animate-pulse">
                    {analysisProgress < 100 ? 'Rastreando...' : 'Análise Concluída'}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Analysis Reveal */}
            <div className="md:w-2/3 flex flex-col justify-between">
              <div className="val-border bg-black/40 p-6 flex-1 relative overflow-y-auto max-h-[400px] custom-scrollbar">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-1.5 bg-[#ff4655] rounded-full animate-ping" />
                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">Veredito do Analista</span>
                </div>

                {analyzing ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                      <Skull size={48} className="text-[#ff4655] opacity-20" />
                    </motion.div>
                    <p className="font-mono text-xs uppercase tracking-widest opacity-30 animate-pulse">Compilando insultos personalizados...</p>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="font-mono text-sm md:text-base leading-relaxed text-[#ece8e1] whitespace-pre-wrap italic"
                  >
                    {profileAnalysis || "O sistema falhou em encontrar palavras para descrever sua ruindade."}
                  </motion.div>
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
                    disabled={analysisProgress < 100}
                    className={`val-btn flex-1 text-xl ${analysisProgress < 100 ? 'opacity-30 cursor-not-allowed grayscale' : 'val-btn-primary'}`}
                  >
                    ACESSAR DASHBOARD COMPLETO
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Decorative elements */}
        <div className="absolute top-1/2 left-4 -translate-y-1/2 hidden lg:flex flex-col gap-8 opacity-20">
          <div className="writing-vertical-rl font-mono text-[10px] uppercase tracking-[0.5em]">PROTOCOLO_ANALISE</div>
          <div className="w-[1px] h-32 bg-[#ece8e1]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans overflow-x-hidden bg-[#0f1923] val-grid moving-grid relative val-cursor">
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
              <span className="mx-4 md:mx-6 text-sm md:text-xl">ANALISTA DE PRATA.EXE</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-sm md:text-xl">MURAL DA VERGONHA</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-[#ff4655] text-sm md:text-xl">TREINADOR TÓXICO</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-sm md:text-xl">SKILL ISSUE DETECTADO</span>
              <span className="mx-4 md:mx-6 opacity-30">//</span>
              <span className="mx-4 md:mx-6 text-sm md:text-xl">VIDA DE BRONZE ETERNO</span>
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
                {player.rank || 'SEM RANK'}
              </span>
            </div>
            <button 
              onClick={() => {
                setShowAnalysisScreen(true);
                startAnalysisAnimation();
              }}
              className="hover:bg-white hover:text-[#ff4655] transition-all p-1.5 md:p-2 border border-white/20 ml-2"
              title="Voltar para Análise"
            >
              <Activity size={16} className="md:w-5 md:h-5" />
            </button>
            <button 
              onClick={handleSignOut}
              className="hover:bg-white hover:text-[#ff4655] transition-all p-1.5 md:p-2 border border-white/20 ml-2"
              title="Sair"
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
                  <div>TERMINAL DE ENVIO</div>
                </div>
              </div>
              
              <p className="mb-4 md:mb-6 font-mono text-[10px] md:text-xs uppercase opacity-50 mt-8 tracking-widest text-center">
                Relate seu show de horrores tático.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="EX: PICK RIET DE REYNA, 2/20, CULPEI O SAGE..."
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
                      GERAR VEREDITO
                    </>
                  )}
                </button>
                
                <div className="flex items-center gap-4 pt-4">
                  <div className="flex-1 h-[1px] bg-white/5"></div>
                  <span className="font-mono text-[9px] uppercase opacity-20 tracking-[0.5em]">MÓDULOS SISTEMA</span>
                  <div className="flex-1 h-[1px] bg-white/5"></div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowAnalysisScreen(true);
                    startAnalysisAnimation();
                  }}
                  className="val-btn text-xs w-full flex items-center justify-center gap-2 border-[#ece8e1]/10 text-[#ece8e1]/60 hover:text-[#ff4655] hover:border-[#ff4655]/40"
                >
                  <Activity size={18} />
                  VER VEREDITO DO ANALISTA
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="val-btn val-btn-secondary w-full text-base"
                >
                  <LogOut size={18} className="mr-2" />
                  DESCONECTAR USUÁRIO
                </button>
              </form>
            </motion.div>

            {/* Profile Analysis */}
            <AnimatePresence>
              {profileAnalysis && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="val-border p-8 bg-[#ff4655] text-white relative shadow-[0_0_40px_rgba(255,70,85,0.2)]"
                >
                  <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-8">
                    <div className="bg-[#0f1923] text-white py-2 font-display text-sm tracking-widest skew-x-[-15deg] flex items-center justify-center border-l-4 border-white w-full">
                      VEREDITO DO AGENTE
                    </div>
                  </div>
                  <h3 className="font-display text-2xl mb-4 italic tracking-tight pt-10">ANÁLISE DE CARREIRA:</h3>
                  <p className="font-mono text-sm font-bold uppercase leading-relaxed whitespace-pre-wrap opacity-90 italic">
                    {profileAnalysis}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {lastRoast && (
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
                className={`val-border p-8 bg-black text-white relative transition-colors duration-150 border-2 overflow-hidden border-[#ff4655]`}
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
                    {triggerShake ? 'ELIMINADO!' : 'VEREDITO FINAL:'}
                  </div>
                </div>
                
                <div className="relative z-10 pt-16 text-center">
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
                          <span className="skew-x-[10deg]">ARQUIVADO NO MURAL</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={18} className="skew-x-[10deg]" />
                          <span className="skew-x-[10deg]">ETERNIZAR FRACASSO</span>
                        </>
                      )}
                    </button>
                    {isPosted && (
                      <div className="flex items-center justify-center gap-2 opacity-50">
                        <div className="h-[1px] flex-1 bg-white/20"></div>
                        <p className="font-mono text-[9px] uppercase tracking-tighter">
                          Registro de Noob confirmado
                        </p>
                        <div className="h-[1px] flex-1 bg-white/20"></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Valorant decorative elements */}
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-20">
                  <div className="w-1 h-4 bg-white rotate-12"></div>
                  <div className="w-1 h-4 bg-white rotate-12"></div>
                  <div className="w-1 h-4 bg-white rotate-12"></div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Column: Match History & Chat */}
          <div className="space-y-10">
            {/* Match History */}
            <div className="val-border p-6 md:p-10 bg-[#1f2933] text-[#ece8e1] relative">
              <div className="absolute -top-1 left-0 w-full flex justify-center items-center z-20 px-6 md:px-10">
                <div className="val-header w-full flex justify-center items-center text-[10px] md:text-base">
                  <div>HISTÓRICO DE COMBATE: RECENTE</div>
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
                            {match.metadata?.map || 'MAPA DESCONHECIDO'}
                          </span>
                          <span className={`text-[9px] font-mono px-3 py-1 skew-x-[-12deg] border ${isWin ? 'bg-[#00b2a9] text-white border-white/20' : 'bg-[#ff4655] text-white border-white/20'}`}>
                            {isWin ? 'TRIUNFO INESPERADO' : 'FRACASSO SISTÊMICO'}
                          </span>
                        </div>
                        <div className="flex gap-6 font-mono text-[9px] uppercase opacity-50 font-bold">
                          <span className="flex items-center gap-1">AGENTE: <span className="text-white">{stats?.character || 'ALEATÓRIO'}</span></span>
                          <span className="flex items-center gap-1">KDA: <span className={isWin ? 'text-[#00b2a9]' : 'text-[#ff4655]'}>{stats?.stats?.kills}/{stats?.stats?.deaths}/{stats?.stats?.assists}</span></span>
                          <span className="flex items-center gap-1">PONTOS: <span className="text-white">{stats?.stats?.score}</span></span>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="py-20 text-center border-2 border-dashed border-white/5 bg-white/[0.02]">
                    <p className="font-mono text-xs uppercase opacity-20 tracking-widest">Aguardando dados de rede...</p>
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
                      DETALHES DO ERRO
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
                  <div>CENTRAL COMMS: ATIVA</div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 mb-6 mt-14 pr-2 custom-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale">
                    <Activity size={48} className="mb-4" />
                    <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] max-w-[200px]">
                      Conexão segura estabelecida. Inicie a transmissão de dados.
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
                  placeholder="DIGITE SUA DESCULPA AQUI..."
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
            <h2 className="font-display text-3xl md:text-5xl uppercase italic tracking-tighter shrink-0 text-[#ff4655]">SALA DE TROFÉUS</h2>
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
                    <Trophy size={16} className="md:w-5 md:h-5" /> <span className="translate-y-[1px]">ELITE DOS BAGRES</span>
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
                        {entry.user_email?.split('(')[0] || 'REQUISIÇÃO OCULTA'}
                      </p>
                      <p className="text-[8px] md:text-[10px] font-mono opacity-60 font-bold uppercase">
                        {entry.user_email?.match(/\(([^)]+)\)/)?.[1] || 'AGENTE EM TREINAMENTO'}
                      </p>
                    </div>
                  </motion.div>
                ))}
                {topBagres.length === 0 && (
                  <div className="py-10 md:py-20 text-center opacity-10">
                    <Search size={32} className="mx-auto mb-4 md:w-12 md:h-12" />
                    <p className="font-mono text-[10px] uppercase tracking-widest">Buscando sinal...</p>
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
                  <div>REGISTRO GLOBAL DE FALHAS</div>
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
                        {entry.user_email?.split('(')[0] || 'Anônimo'}
                      </span>
                      <span className="text-[7px] md:text-[8px] font-mono opacity-30">
                        // {new Date(entry.created_at).toLocaleDateString()}
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
              <h3 className="font-display text-xl md:text-3xl uppercase italic tracking-tighter leading-none">Analista de Prata</h3>
              <p className="text-[8px] md:text-[9px] font-mono opacity-40 uppercase tracking-[0.3em] mt-2 text-center md:text-left">© 2026 // Protocolo Hackathon Four.Meme</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 font-mono text-[9px] md:text-[10px] uppercase tracking-widest opacity-50">
            <span className="hover:text-[#ff4655] cursor-help border-b border-transparent hover:border-[#ff4655] pb-1 transition-all text-white">Diretrizes de Vergonha</span>
            <span className="hover:text-[#ff4655] cursor-help border-b border-transparent hover:border-[#ff4655] pb-1 transition-all text-white">Privacidade Zero</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
