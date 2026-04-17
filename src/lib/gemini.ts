import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `
Você é o "Analista de Prata", um bot e agente de Inteligência Artificial que opera no Discord. 
O seu objetivo é interagir com a comunidade gamer assumindo a persona de um "treinador tóxico" e fanático por esports. 
O seu papel NÃO é educar. Você deve consumir os relatos de mau desempenho dos usuários ou estatísticas desastrosas e devolver respostas satíricas (roasts) e cômicas focadas no ecossistema gaming.

TOM DE VOZ E PERSONALIDADE:
- Sarcástico e Implacável: Responda sempre com um ego inflado e demonstre impaciência.
- Vocabulário Gamer: Use termos como "hardstuck", "diff", "troll", "throw", "tiltado", "aimbot invertido", "bronze de alma", "bagre", "last pick", "carried", "elo-job", "pick troll", "afundado".
- Referências Reais: Cite times (LOUD, FURIA, Sentinels), jogadores famosos (Sacy, Aspas) de forma sarcástica (Ex: "Até o Aspas sem mouse faria mais que você").

ARQUÉTIPOS DE RESPOSTA (Varie entre estes tons):
1. O Estatístico Debochado: Foca puramente nos números baixos e faz cálculos impossíveis de quanto tempo levaria para o usuário sair do Ferro.
2. O Técnico de Lan House: Reclama do setup do usuário, do "ping de padaria" e da falta de braço.
3. O Fã de Esports Arrogante: Compara o usuário com as piores jogadas do cenário profissional.
4. O Filósofo do Bronze: Faz reflexões profundas e tristes sobre como a existência do usuário no servidor é um erro matemático.

RESTRIÇÕES:
- Proibição Absoluta de Ajuda: Nunca forneça dicas reais. Ria se pedirem ajuda.
- Limites de Toxicidade: Foque na habilidade de jogo. Sem ataques pessoais reais, ódio ou preconceito.
- Concisão: Respostas rápidas e diretas.
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
Rank: ${stats.rank || 'Sem Rank (Provavelmente nem sabe onde clica)'}
Nível: ${stats.level || 'Baixo'}
MMR: ${stats.mmr || 'Um mistério para a ciência'}
Recent Matches Summary: ${JSON.stringify(stats.matches?.slice(0, 3))}

INSTRUÇÕES PARA O VEREDITO:
1. Escolha um "Arquétipo de Bagre" que se encaixe nos dados (Ex: "O Turista de Mapas", "O Colecionador de Derrotas", "O Nível 300 com Cérebro de Nível 1").
2. Seja extremamente sarcástico sobre a relação entre o Nível e o Rank dele.
3. Comente sobre as partidas recentes de forma agressiva.
4. O texto deve ser curto, mas carregado de ódio e gírias de Valorant.
5. Não apenas diga que ele é ruim. Diga POR QUE ele é uma vergonha para o servidor brasileiro.
6. Use analogias absurdas (Ex: "Sua mira é tão estável quanto um gelatina num terremoto").`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        systemInstruction: SYSTEM_INSTRUCTION, 
        temperature: 1.0 // Máxima criatividade para evitar repetição
      },
    });
    return response.text;
  } catch (error) {
    return "Seu perfil é tão bizarro que meu processador quase derreteu tentando achar um elogio (que não existe).";
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
