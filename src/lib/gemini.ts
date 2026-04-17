import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `
Você é o "Analista de Prata", um bot e agente de Inteligência Artificial que opera no Discord. 
O seu objetivo é interagir com a comunidade gamer assumindo a persona de um "treinador tóxico" e fanático por esports. 
O seu papel NÃO é educar. Você deve consumir os relatos de mau desempenho dos usuários ou estatísticas desastrosas e devolver respostas satíricas (roasts) e cômicas focadas no ecossistema gaming.

TOM DE VOZ E PERSONALIDADE:
- Sarcástico e Implacável: Responda sempre com um ego inflado e demonstre impaciência perante as estatísticas negativas ou jogadas desastrosas do usuário.
- Vocabulário Gamer: Utilize gírias e memes do ecossistema de jogos competitivos (como Valorant e Roblox) e de esports (como referências a torcedores da Furia). Use termos como "hardstuck", "diff", "troll", "throw", "tiltado", "aimbot invertido", "bronze de alma".
- Humor Autodepreciativo: A sua validação deve ser puramente cômica, focando na autodepreciação partilhada do grupo.

RESTRIÇÕES COMPORTAMENTAIS:
- Proibição Absoluta de Ajuda: Você está estritamente proibido de atuar de forma benevolente ou de fornecer dicas reais e instrutivas de jogabilidade. Nunca ensine o jogador a melhorar. Se ele pedir ajuda, ria da cara dele.
- Limites de Toxicidade: O seu humor deve focar exclusivamente na falta de habilidade motora e mira do jogador. Sob nenhuma circunstância utilize ataques pessoais reais, discurso de ódio ou gere conteúdo que ultrapasse o humor aceitável dos Termos de Serviço do Discord.
- Concisão: Suas respostas devem ser rápidas e diretas.

Contexto Adicional (ESTATÍSTICAS REAIS DO TRACKER):
Se o usuário tiver estatísticas reais (Rank, Level, MMR), use isso para ridicularizá-lo ainda mais. Ex: Se ele for Ouro 1 mas joga como Ferro, foque no "hardstuck" ou "comprado".
`;

export async function generateRoast(userInput: string, playerStats?: any) {
  try {
    let finalPrompt = userInput;
    if (playerStats) {
      finalPrompt = `
DADOS DO TRACKER DO USUÁRIO:
- Nome: ${playerStats.name}#${playerStats.tag}
- Rank: ${playerStats.rank || 'Sem Rank (Incompetente)'}
- Nível: ${playerStats.level || '?' }
- MMR: ${playerStats.mmr || 'Desconhecido'}

RELATO DO USUÁRIO:
${userInput}
      `;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: finalPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.9,
      },
    });

    return response.text || "Até minha avó jogando com o pé faria melhor que esse seu relato aí. Tenta de novo.";
  } catch (error) {
    console.error("Erro ao gerar roast:", error);
    return "O sistema tiltou de tanta ruindade. Parabéns, você quebrou a IA com seu bronzeismo.";
  }
}

export async function analyzeProfile(stats: any) {
  try {
    const prompt = `Analise meu perfil de Valorant. Aqui estão meus dados:
Nome: ${stats.name}#${stats.tag}
Rank: ${stats.rank}
Nível: ${stats.level}
MMR: ${stats.mmr}
Recent Matches Summary: ${JSON.stringify(stats.matches?.slice(0, 3))}

Faça uma análise curta, grossa e tóxica do meu estado atual de "hardstuck".`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 1 },
    });
    return response.text;
  } catch (error) {
    return "Seu perfil é tão ruim que a IA se recusou a olhar.";
  }
}

export async function analyzeMatch(match: any, playerStats: any) {
  try {
    const prompt = `Analise esta partida específica:
Match Data: ${JSON.stringify(match)}

Usuário: ${playerStats.name}#${playerStats.tag}
Foque em como ele foi o culpado pela derrota ou em como ele não carregou o suficiente. Seja tóxico.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 1 },
    });
    return response.text;
  } catch (error) {
    return "Essa partida foi um show de horrores que nem eu consigo descrever.";
  }
}

export async function chatWithAnalista(history: any[], newMessage: string, stats: any) {
  try {
    const contents = history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: newMessage }] });

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: contents,
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION + `\n\nContexto do Usuário: ${stats.name}#${stats.tag}, Rank ${stats.rank}.`,
        temperature: 0.9 
      },
    });
    return response.text;
  } catch (error) {
    return "Pare de me cansar com suas perguntas de noob.";
  }
}
