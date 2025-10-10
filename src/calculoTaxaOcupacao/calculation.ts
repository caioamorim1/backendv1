// src/calculation.ts

import { ProjecaoParams, ProjecaoResult, GapAnalysisRow } from './interfaces';

/**
 * Calcula a projeção de necessidade de pessoal de enfermagem com base nos parâmetros fornecidos.
 * @param params Os parâmetros de entrada para o cálculo.
 * @returns Um objeto com todos os resultados calculados.
 */
export function calcularProjecao(params: ProjecaoParams): ProjecaoResult {
    // --- 2) Derivações a partir do BASE ---
    // Calcula os valores de FTE (Full-Time Equivalent) e THE (Total Horas Enfermagem)
    // como se a ocupação fosse de 100%.
    const the100pct = params.theBase / params.ocupacaoBase;
    const enf100pctFTE = params.enfNecessariosBase / params.ocupacaoBase;
    const tec100pctFTE = params.tecNecessariosBase / params.ocupacaoBase;

    // --- 3) Ocupação MÁXIMA atendível com o quadro atual ---
    // A ocupação máxima é limitada pelo recurso mais escasso (enfermeiros ou técnicos).
    const ocupacaoAtendivelPorEnf = params.quadroAtualEnfermeiros / enf100pctFTE;
    const ocupacaoAtendivelPorTec = params.quadroAtualTecnicos / tec100pctFTE;
    const ocupacaoMaximaAtendivel = Math.min(
        ocupacaoAtendivelPorEnf,
        ocupacaoAtendivelPorTec
    );

    /**
     * Função auxiliar para calcular a análise de GAP para uma meta de ocupação específica.
     */
    const calcularGapParaMeta = (meta: number): GapAnalysisRow => {
        const theAlvo = the100pct * meta;
        const enfNecessariosFTE = enf100pctFTE * meta;
        const tecNecessariosFTE = tec100pctFTE * meta;

        const enfNecessariosArredondado = Math.ceil(enfNecessariosFTE);
        const tecNecessariosArredondado = Math.ceil(tecNecessariosFTE);

        // O GAP é a diferença entre o necessário (arredondado para cima) e o quadro atual.
        // Um valor negativo ou zero significa que não há déficit.
        const gapEnf = Math.max(0, enfNecessariosArredondado - params.quadroAtualEnfermeiros);
        const gapTec = Math.max(0, tecNecessariosArredondado - params.quadroAtualTecnicos);

        return {
            metaOcupacao: meta,
            theAlvo,
            enfNecessariosFTE,
            tecNecessariosFTE,
            enfNecessariosArredondado,
            tecNecessariosArredondado,
            gapEnf,
            gapTec,
        };
    };

    // --- 4) Tabela de GAP para metas fixas ---
    const metasFixas = [0.6, 0.7, 0.8, 0.9, 1.0];
    const tabelaGapMetas = metasFixas.map(calcularGapParaMeta);

    // --- 5) Análise para a META LIVRE ---
    const analiseMetaLivre = calcularGapParaMeta(params.metaLivreOcupacao);

    // --- Montagem do resultado final ---
    const result: ProjecaoResult = {
        the100pct,
        enf100pctFTE,
        tec100pctFTE,
        ocupacaoMaximaAtendivel,
        tabelaGapMetas,
        analiseMetaLivre,
    };

    return result;
}