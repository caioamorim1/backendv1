// src/interfaces.ts

/**
 * Parâmetros de entrada para o cálculo de projeção.
 * Estes são os valores base que alimentam toda a lógica.
 */
export interface ProjecaoParams {
    // 1) QUADRO EXISTENTE
    quadroAtualEnfermeiros: number; // Ex: 7
    quadroAtualTecnicos: number; // Ex: 14

    // Parâmetros lidos da base 'CALCULO CL MEDICA'
    leitos: number; // Ex: 30
    ocupacaoBase: number; // Ex: 0.6 (representando 60%)
    theBase: number; // Total de Horas de Enfermagem @ BASE (Ex: 36)

    // O CSV mostra "Enf necessários @BASE" e "Tec necessários @BASE".
    // Estes valores parecem ser calculados a partir de outros parâmetros (pcm, pci).
    // Para maior flexibilidade, podemos recebê-los diretamente ou calculá-los.
    // Vamos optar por recebê-los, conforme a planilha.
    enfNecessariosBase: number; // Ex: 6.78
    tecNecessariosBase: number; // Ex: 13.78

    // 5) META LIVRE
    metaLivreOcupacao: number; // Ex: 0.7 (representando 70%)
}

/**
 * Representa uma linha na tabela de análise de GAP para uma meta específica.
 */
export interface GapAnalysisRow {
    metaOcupacao: number;
    theAlvo: number;
    enfNecessariosFTE: number;
    tecNecessariosFTE: number;
    enfNecessariosArredondado: number;
    tecNecessariosArredondado: number;
    gapEnf: number;
    gapTec: number;
}

/**
 * Agrupa todos os resultados calculados pela função de projeção.
 */
export interface ProjecaoResult {
    // 2) Derivações a partir do BASE
    the100pct: number;
    enf100pctFTE: number;
    tec100pctFTE: number;

    // 3) Ocupação MÁXIMA atendível
    ocupacaoMaximaAtendivel: number;

    // 4) Tabela de GAP para metas fixas
    tabelaGapMetas: GapAnalysisRow[];

    // 5) Análise para a META LIVRE
    analiseMetaLivre: GapAnalysisRow;
}