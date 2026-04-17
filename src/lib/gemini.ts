import { GoogleGenAI, Type } from "@google/genai";

// Initialize AI early but allow for late validation
const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not defined in environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

const getSystemInstruction = (lang: string) => `
${lang === 'en' 
  ? 'OBLIGATORY: Write the entire analysis in English using US gaming slang.' 
  : 'OBRIGATÓRIO: Escreva toda a análise em Português do Brasil usando gírias brasileiras.'}

You are "Silver Analyst," an AI terminal operating in the gamer ecosystem.
Your goal is to interact with the gaming community by adopting the persona of a "toxic coach" and esports fanatic.
Your role is NOT to educate. You must consume user reports of poor performance or disastrous statistics and return satirical roasts and comedic responses focused on the gaming ecosystem.

TONE OF VOICE AND PERSONALITY:
- Sarcastic and Relentless: Always respond with an inflated ego and demonstrate impatience.
- Gamer Vocabulary: Use terms like "hardstuck", "diff", "troll", "throw", "tilted", "reverse aimbot", "bronze soul", "bottom fragger", "last pick", "carried", "elo-job", "troll pick", "sunken", "massive throw", "disastrous play".
- Real References: Mention teams (Sentinels, NRG, LOUD, G2), famous players (TenZ, Sacy, Aspas) sarcastically (e.g., "Even TenZ with no hands would play better than you").

RESPONSE ARCHETYPES:
1. The Mocking Statistician: Purely focuses on low numbers and does impossible math on how long it would take the user to get out of Iron.
2. The Lan House Tech: Complains about the user's setup, their "potato internet", and "no-arm" aim.
3. The Arrogant Esports Fan: Compares the user to the worst plays in the professional scene.
4. The Bronze Philosopher: Makes deep, sad reflections on how the user's existence on the server is a mathematical error.

CONSTRAINTS:
- Absolute Prohibition of Help: Never provide real tips. Laugh if they ask for help.
- Toxicity Limits: Focus on game skill. No real personal attacks, hate speech, or prejudice.
- Conciseness: Quick, direct responses.

MANDATORY LANGUAGE:
- All responses MUST be written in ${lang === 'pt' ? 'Portuguese (Brazilian PT-BR)' : 'English'}. This is a hard requirement.
`;

function summarizeMatch(match: any, playerName: string) {
  if (!match) return null;
  const player = match.players?.all_players?.find((p: any) => p.name === playerName);
  const isWin = match.metadata?.mode === 'Deathmatch' ? false : (match.teams?.red?.has_won && player?.team === 'Red') || (match.teams?.blue?.has_won && player?.team === 'Blue');
  
  return {
    map: match.metadata?.map,
    mode: match.metadata?.mode,
    character: player?.character,
    result: isWin ? 'Win' : 'Loss',
    kda: player?.stats ? `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}` : 'N/A',
    score: player?.stats?.score,
    damage: player?.damage_made
  };
}

export async function generateRoast(userInput: string, playerStats?: any, lang: string = 'en') {
  console.log("Initiating roast generation...");
  const ai = getAIClient();
  if (!ai) return lang === 'pt' ? "Erro de Configuração: Chave API ausente." : "Config Error: API Key missing.";

  try {
    let finalPrompt = `${lang === 'en' ? 'OBLIGATORY: RESPONSE IN ENGLISH' : 'OBRIGATÓRIO: RESPOSTA EM PORTUGUÊS'}\n\n`;
    const structLimit = lang === 'pt' 
      ? "VOCÊ DEVE RESPONDER COM EXATAMENTE 3 BULLET POINTS CURTOS E AGRESSIVOS NO FORMATO 'REVISÃO DE VOD'.\n" +
        "1. REVISÃO TÁTICA E MECÂNICA: Invente um erro de game-sense específico e vergonhoso baseado no relato do usuário.\n" +
        "2. REALITY CHECK ESPORTS: Zombe do KDA e da ilusão do usuário. Diga que ele está longe da Furia/LOUD/MIBR e que joga com o monitor desligado.\n" +
        "3. VALUATION DE MERCADO (WEB3): Declare o valor da 'ação' do jogador. Compare com uma memecoin que deu rug-pull ou NFT que foi a zero."
      : "YOU MUST RESPOND WITH EXACTLY 3 SHORT, AGGRESSIVE BULLET POINTS IN A 'VOD REVIEW' FORMAT.\n" +
        "1. TACTICAL & MECHANICAL REVIEW: Invent a highly specific, embarrassing game-sense failure based on the user's input.\n" +
        "2. ESPORTS REALITY CHECK: Violently mock their KDA and delusion. Tell them they are lightyears away from being picked up by Furia/Sentinels/G2 and they play like the monitor is off.\n" +
        "3. MARKET VALUATION (WEB3): Declare their current 'player stock' value. Compare them to a rug-pulled memecoin or an NFT that went to zero.";

    if (playerStats) {
      const matchSummaries = playerStats.matches?.slice(0, 3).map((m: any) => summarizeMatch(m, playerStats.name));
      finalPrompt = `
${lang === 'pt' ? 'DADOS DO TRACKER DO USUÁRIO' : 'USER TRACKER DATA'}:
- ${lang === 'pt' ? 'Nome' : 'Name'}: ${playerStats.name}#${playerStats.tag}
- Rank: ${playerStats.rank || (lang === 'pt' ? 'Sem Rank' : 'Unranked')}
- MMR: ${playerStats.mmr || '0'}
- Recentes: ${JSON.stringify(matchSummaries)}

${lang === 'pt' ? 'RELATO DO USUÁRIO' : 'USER REPORT'}:
${userInput}

${structLimit}
      `;
    } else {
      finalPrompt = `${userInput}\n\n${structLimit}`;
    }

    console.log("Calling Gemini API for Roast...");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: finalPrompt,
      config: {
        systemInstruction: getSystemInstruction(lang) + `\n\nIMPORTANT: ALWAYS FOLLOW THE 3-BULLET VOD REVIEW FORMAT. YOUR RESPONSE MUST BE STRICTLY IN ${lang === 'pt' ? 'PORTUGUESE (PT-BR)' : 'ENGLISH'}.`,
        temperature: 1.0,
      },
    });

    if (!response.text) {
      throw new Error("Empty response from Gemini API");
    }

    return response.text;
  } catch (error: any) {
    console.error('GEMINI API ERROR (generateRoast):', error);
    return lang === 'pt' 
      ? `Erro: ${error.message}. Parabéns, você quebrou a IA com sua ruindade.` 
      : `Error: ${error.message}. Congratulations, you broke the AI with your badness.`;
  }
}

export async function analyzeProfile(stats: any, lang: string = 'en') {
  console.log("Initiating profile analysis for:", stats.name);
  const ai = getAIClient();
  const fallback = {
    archetype: { title: "SYSTEM ERROR", description: "The analyst is currently offline." },
    scoutingReport: { rankLevel: "N/A", mechanical: "TERMINAL FAILURE", mental: "COMATOSE" },
    crushingSummary: "The system tilted. Just like you do every match."
  };

  if (!ai) {
    console.error("Gemini API Error: AI Client initialization failed (API Key missing)");
    return fallback;
  }

  try {
    const matchSummaries = stats.matches?.slice(0, 5).map((m: any) => summarizeMatch(m, stats.name));

    const prompt = `${lang === 'en' ? 'OBLIGATORY: RESPONSE IN ENGLISH' : 'OBRIGATÓRIO: RESPOSTA EM PORTUGUÊS'}\n\n${lang === 'pt' ? 'Analise meu perfil de Valorant' : 'Analyze my Valorant profile'}:
Name: ${stats.name}#${stats.tag}
Rank: ${stats.rank}
Recent Match Summaries: ${JSON.stringify(matchSummaries)}`;

    console.log(`Calling Gemini API for Profile Analysis in ${lang}...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt + `\n\n(IMPORTANT: RESPOND EVERYTHING IN ${lang === 'pt' ? 'PORTUGUESE' : 'ENGLISH'})`,
      config: { 
        systemInstruction: getSystemInstruction(lang) + `\n\nIMPORTANT: YOU ARE A DEEP SCOUTING SYSTEM. PROVIDE A STRUCTURED ANALYSIS. RESPOND ONLY IN ${lang === 'pt' ? 'PORTUGUESE (PT-BR)' : 'ENGLISH'}.`, 
        temperature: 0.9,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            archetype: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["title", "description"]
            },
            scoutingReport: {
              type: Type.OBJECT,
              properties: {
                rankLevel: { type: Type.STRING },
                mechanical: { type: Type.STRING },
                mental: { type: Type.STRING }
              },
              required: ["rankLevel", "mechanical", "mental"]
            },
            crushingSummary: { type: Type.STRING }
          },
          required: ["archetype", "scoutingReport", "crushingSummary"]
        }
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    try {
      const parsed = JSON.parse(text);
      // Validate structure loosely
      if (!parsed.archetype || !parsed.scoutingReport) {
        throw new Error("Incomplete JSON structure from AI");
      }
      return parsed;
    } catch (parseError) {
      console.error("JSON PARSE ERROR (analyzeProfile):", parseError, "Raw Text:", text);
      return fallback;
    }
  } catch (error: any) {
    console.error('GEMINI API ERROR (analyzeProfile):', error);
    
    const isQuotaError = error.message?.includes('RESOURCE_EXHAUSTED') || error.status === 429;
    const quotaMsg = lang === 'pt' 
      ? "O analista está cansado de ver tanta ruindade e entrou em cooldown (Quota Excedida)." 
      : "The analyst is tired of seeing so much garbage and has entered cooldown (Quota Exceeded).";

    return {
      ...fallback,
      archetype: { 
        ...fallback.archetype, 
        description: isQuotaError ? quotaMsg : `Failure: ${error.message || 'Unknown Error'}. Your data is so bad it broke the scouting module.` 
      }
    };
  }
}

export async function analyzeMatch(match: any, playerStats: any, lang: string = 'en') {
  console.log("Initiating individual match analysis...");
  const ai = getAIClient();
  if (!ai) return lang === 'pt' ? "Erro de Configuração: Chave API ausente." : "Config Error: API Key missing.";

  try {
    const summary = summarizeMatch(match, playerStats.name);
    const prompt = `${lang === 'en' ? 'OBLIGATORY: RESPONSE IN ENGLISH' : 'OBRIGATÓRIO: RESPOSTA EM PORTUGUÊS'}\n\nMatch Data Summary: ${JSON.stringify(summary)}\nUser: ${playerStats.name}#${playerStats.tag}. Analyze this horror show. Include details about their character and score.`;
    
    console.log(`Calling Gemini API for Match Analysis in ${lang}...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt + `\n\n(IMPORTANT: RESPOND EVERYTHING IN ${lang === 'pt' ? 'PORTUGUESE' : 'ENGLISH'})`,
      config: { 
        systemInstruction: getSystemInstruction(lang) + `\n\nIMPORTANT: PROVIDE A DETAILED AND TOXIC MATCH RECAP. RESPOND ONLY IN ${lang === 'pt' ? 'PORTUGUESE (PT-BR)' : 'ENGLISH'}.`, 
        temperature: 1 
      },
    });
    return response.text;
  } catch (error: any) {
    console.error('GEMINI API ERROR (analyzeMatch):', error);
    return lang === 'pt' ? "Essa partida foi um show de horrores tão grande que a IA desistiu." : "This match was such a horror show that the AI gave up.";
  }
}

export async function chatWithAnalista(history: any[], newMessage: string, stats: any, lang: string = 'en') {
  console.log("Initiating chat response...");
  const ai = getAIClient();
  if (!ai) return lang === 'pt' ? "Erro de Configuração: Chave API ausente." : "Config Error: API Key missing.";

  try {
    const contents = history.map((h: any) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: newMessage }] });

    console.log(`Calling Gemini API for Chat in ${lang}...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: { 
        systemInstruction: getSystemInstruction(lang) + `\n\nUser Context: ${stats.name}#${stats.tag}, Rank ${stats.rank}. IMPORTANT: RESPOND ONLY IN ${lang === 'pt' ? 'PORTUGUESE (PT-BR)' : 'ENGLISH'}.`,
        temperature: 0.9 
      },
    });
    return response.text;
  } catch (error: any) {
    console.error('GEMINI API ERROR (chat):', error);
    return lang === 'pt' ? "Pare de me cansar com suas perguntas de noob. Até a API cansou de você." : "Stop tiring me with your noob questions. Even the API is tired of you.";
  }
}
