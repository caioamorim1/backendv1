// src/calculation.ts

import { ProjecaoParams, ProjecaoResult, GapAnalysisRow } from "./interfaces";

/**
 * Calcula a projeção de necessidade de pessoal de enfermagem com base nos parâmetros fornecidos.
 * @param params Os parâmetros de entrada para o cálculo.
 * @returns Um objeto com todos os resultados calculados.
 */
export function calcularProjecao(params: ProjecaoParams): ProjecaoResult {
  // === DEBUG: ENTRADAS ===
  try {
    console.log("\n===== 📈 DEBUG PROJEÇÃO - INÍCIO =====");
    console.log("▶️ Entradas:");
    console.log({
      quadroAtualEnfermeiros: params.quadroAtualEnfermeiros,
      quadroAtualTecnicos: params.quadroAtualTecnicos,
      leitos: params.leitos,
      ocupacaoBaseFracao: params.ocupacaoBase,
      ocupacaoBasePercent: Number((params.ocupacaoBase * 100).toFixed(2)),
      theBase: params.theBase,
      enfNecessariosBase: params.enfNecessariosBase,
      tecNecessariosBase: params.tecNecessariosBase,
      metaLivreOcupacaoFracao: params.metaLivreOcupacao,
      metaLivreOcupacaoPercent: Number(
        (params.metaLivreOcupacao * 100).toFixed(2)
      ),
    });
    if (params.ocupacaoBase <= 0) {
      console.warn(
        "⚠️ ocupacaoBase <= 0: as derivadas @100% ficarão infinitas/NaN."
      );
    }
  } catch {}
  // --- 2) Derivações a partir do BASE ---
  // Calcula os valores de FTE (Full-Time Equivalent) e THE (Total Horas Enfermagem)
  // como se a ocupação fosse de 100%.
  const the100pct = params.theBase / params.ocupacaoBase;
  const enf100pctFTE = params.enfNecessariosBase / params.ocupacaoBase;
  const tec100pctFTE = params.tecNecessariosBase / params.ocupacaoBase;
  try {
    console.log("\n🔧 Derivados @100%:");
    console.log(
      `the100pct = theBase (${params.theBase}) / ocupacaoBase (${
        params.ocupacaoBase
      }) = ${the100pct.toFixed(4)}`
    );
    console.log(
      `enf100pctFTE = enfNecessariosBase (${
        params.enfNecessariosBase
      }) / ocupacaoBase (${params.ocupacaoBase}) = ${enf100pctFTE.toFixed(4)}`
    );
    console.log(
      `tec100pctFTE = tecNecessariosBase (${
        params.tecNecessariosBase
      }) / ocupacaoBase (${params.ocupacaoBase}) = ${tec100pctFTE.toFixed(4)}`
    );
    if (
      !isFinite(the100pct) ||
      !isFinite(enf100pctFTE) ||
      !isFinite(tec100pctFTE)
    ) {
      console.warn(
        "⚠️ Valor não finito detectado em derivados @100%. Verifique ocupacaoBase e bases necessárias."
      );
    }
  } catch {}

  // --- 3) Ocupação MÁXIMA atendível com o quadro atual ---
  // A ocupação máxima é limitada pelo recurso mais escasso (enfermeiros ou técnicos).
  const ocupacaoAtendivelPorEnf = params.quadroAtualEnfermeiros / enf100pctFTE;
  const ocupacaoAtendivelPorTec = params.quadroAtualTecnicos / tec100pctFTE;
  const ocupacaoMaximaAtendivel = Math.min(
    ocupacaoAtendivelPorEnf,
    ocupacaoAtendivelPorTec
  );
  try {
    console.log("\n🧮 Ocupação atendível por recurso:");
    console.log(
      `por ENF = quadroAtualEnfermeiros (${
        params.quadroAtualEnfermeiros
      }) / enf100pctFTE (${enf100pctFTE.toFixed(
        4
      )}) = ${ocupacaoAtendivelPorEnf.toFixed(4)} (${(
        ocupacaoAtendivelPorEnf * 100
      ).toFixed(2)}%)`
    );
    console.log(
      `por TEC = quadroAtualTecnicos (${
        params.quadroAtualTecnicos
      }) / tec100pctFTE (${tec100pctFTE.toFixed(
        4
      )}) = ${ocupacaoAtendivelPorTec.toFixed(4)} (${(
        ocupacaoAtendivelPorTec * 100
      ).toFixed(2)}%)`
    );
    console.log(
      `➡️ ocupacaoMaximaAtendivel = min(${ocupacaoAtendivelPorEnf.toFixed(
        4
      )}, ${ocupacaoAtendivelPorTec.toFixed(
        4
      )}) = ${ocupacaoMaximaAtendivel.toFixed(4)} (${(
        ocupacaoMaximaAtendivel * 100
      ).toFixed(2)}%)`
    );
    if (!isFinite(ocupacaoMaximaAtendivel)) {
      console.warn(
        "⚠️ ocupacaoMaximaAtendivel não finita. Verifique entradas e derivados."
      );
    }
  } catch {}

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
    const gapEnf = Math.max(
      0,
      enfNecessariosArredondado - params.quadroAtualEnfermeiros
    );
    const gapTec = Math.max(
      0,
      tecNecessariosArredondado - params.quadroAtualTecnicos
    );

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
  try {
    console.log("\n📋 Resumo projeção:");
    console.log({
      the100pct: Number(the100pct.toFixed(4)),
      enf100pctFTE: Number(enf100pctFTE.toFixed(4)),
      tec100pctFTE: Number(tec100pctFTE.toFixed(4)),
      ocupacaoMaximaAtendivelFracao: Number(ocupacaoMaximaAtendivel.toFixed(4)),
      ocupacaoMaximaAtendivelPercent: Number(
        (ocupacaoMaximaAtendivel * 100).toFixed(2)
      ),
      metaLivreOcupacaoFracao: params.metaLivreOcupacao,
      metaLivreOcupacaoPercent: Number(
        (params.metaLivreOcupacao * 100).toFixed(2)
      ),
      analiseMetaLivre: {
        metaOcupacao: Number(analiseMetaLivre.metaOcupacao.toFixed(2)),
        enfNecessariosFTE: Number(
          analiseMetaLivre.enfNecessariosFTE.toFixed(2)
        ),
        tecNecessariosFTE: Number(
          analiseMetaLivre.tecNecessariosFTE.toFixed(2)
        ),
        enfNecessariosArredondado: analiseMetaLivre.enfNecessariosArredondado,
        tecNecessariosArredondado: analiseMetaLivre.tecNecessariosArredondado,
        gapEnf: analiseMetaLivre.gapEnf,
        gapTec: analiseMetaLivre.gapTec,
      },
    });
    console.log("===== 📈 DEBUG PROJEÇÃO - FIM =====\n");
  } catch {}

  return result;
}
