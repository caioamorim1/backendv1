import { calcularProjecao } from "../../calculoTaxaOcupacao/calculation";
import { ProjecaoParams } from "../../calculoTaxaOcupacao/interfaces";

// Parâmetros de referência para os testes
// Valores escolhidos para que os cálculos intermediários sejam exatos
const BASE_PARAMS: ProjecaoParams = {
  leitos: 30,
  ocupacaoBase: 0.6,          // 60 %
  theBase: 36,                // Total Horas Enfermagem @ ocupacaoBase
  enfNecessariosBase: 6,      // enfermeiros necessários @ 60 %
  tecNecessariosBase: 12,     // técnicos necessários @ 60 %
  quadroAtualEnfermeiros: 7,
  quadroAtualTecnicos: 14,
  metaLivreOcupacao: 0.7,    // 70 %
};

describe("calcularProjecao — normalização @100%", () => {
  it("calcula the100pct corretamente (THE @ 100%)", () => {
    // the100pct = theBase / ocupacaoBase = 36 / 0.6 = 60
    const result = calcularProjecao(BASE_PARAMS);
    expect(result.the100pct).toBeCloseTo(60, 5);
  });

  it("calcula enf100pctFTE corretamente", () => {
    // enf100pct = enfNecessariosBase / ocupacaoBase = 6 / 0.6 = 10
    const result = calcularProjecao(BASE_PARAMS);
    expect(result.enf100pctFTE).toBeCloseTo(10, 5);
  });

  it("calcula tec100pctFTE corretamente", () => {
    // tec100pct = tecNecessariosBase / ocupacaoBase = 12 / 0.6 = 20
    const result = calcularProjecao(BASE_PARAMS);
    expect(result.tec100pctFTE).toBeCloseTo(20, 5);
  });
});

describe("calcularProjecao — ocupação máxima atendível", () => {
  it("ocupacaoMaximaAtendivel com quadro equilibrado", () => {
    // ocupaçãoEnf = 7 / 10 = 0.7
    // ocupaçãoTec = 14 / 20 = 0.7
    // max = min(0.7, 0.7) = 0.7
    const result = calcularProjecao(BASE_PARAMS);
    expect(result.ocupacaoMaximaAtendivel).toBeCloseTo(0.7, 5);
  });

  it("é limitada pelo recurso mais escasso (enfermeiros)", () => {
    // Se há poucos enfermeiros, o gargalo é eles
    const params: ProjecaoParams = {
      ...BASE_PARAMS,
      quadroAtualEnfermeiros: 5,  // 5/10 = 0.5
      quadroAtualTecnicos: 20,    // 20/20 = 1.0
    };
    const result = calcularProjecao(params);
    expect(result.ocupacaoMaximaAtendivel).toBeCloseTo(0.5, 5);
  });

  it("é limitada pelo recurso mais escasso (técnicos)", () => {
    const params: ProjecaoParams = {
      ...BASE_PARAMS,
      quadroAtualEnfermeiros: 15, // 15/10 = 1.5
      quadroAtualTecnicos: 10,    // 10/20 = 0.5
    };
    const result = calcularProjecao(params);
    expect(result.ocupacaoMaximaAtendivel).toBeCloseTo(0.5, 5);
  });
});

describe("calcularProjecao — análise de GAP por metas fixas", () => {
  it("gera entradas para as metas fixas (60%, 70%, 80%, 90%, 100%)", () => {
    const result = calcularProjecao(BASE_PARAMS);
    // Verifica que a tabela tem pelo menos as metas principais
    const metas = result.tabelaGapMetas.map((r) => r.metaOcupacao);
    expect(metas).toContain(0.6);
    expect(metas).toContain(0.8);
    expect(metas).toContain(1.0);
  });

  it("gap é 0 quando o quadro atual cobre exatamente a meta de 60%", () => {
    // @ 60%: enfNecessarios = ceil(10 * 0.6) = 6; quadro = 7 → sem gap
    const result = calcularProjecao(BASE_PARAMS);
    const row60 = result.tabelaGapMetas.find((r) => r.metaOcupacao === 0.6);
    expect(row60).toBeDefined();
    expect(row60!.gapEnf).toBe(0);
    expect(row60!.gapTec).toBe(0);
  });

  it("gap é 0 quando o quadro atual cobre exatamente a meta de 70%", () => {
    // @ 70%: enfNecessarios = ceil(10 * 0.7) = 7; quadro = 7 → sem gap
    const result = calcularProjecao(BASE_PARAMS);
    const row70 = result.tabelaGapMetas.find((r) => r.metaOcupacao === 0.7);
    expect(row70).toBeDefined();
    expect(row70!.gapEnf).toBe(0);
    expect(row70!.gapTec).toBe(0);
  });

  it("gap > 0 quando o quadro é insuficiente para 100%", () => {
    // @ 100%: enfNecessarios = ceil(10) = 10; quadro = 7 → gap = 3
    const result = calcularProjecao(BASE_PARAMS);
    const row100 = result.tabelaGapMetas.find((r) => r.metaOcupacao === 1.0);
    expect(row100).toBeDefined();
    expect(row100!.gapEnf).toBe(3);
    expect(row100!.gapTec).toBe(6);
  });
});

describe("calcularProjecao — meta livre", () => {
  it("analisa a meta livre fornecida (70%)", () => {
    const result = calcularProjecao(BASE_PARAMS);
    expect(result.analiseMetaLivre.metaOcupacao).toBe(0.7);
    // @ 70%: THE = 60 * 0.7 = 42
    expect(result.analiseMetaLivre.theAlvo).toBeCloseTo(42, 3);
  });

  it("gap da meta livre é zero quando o quadro cobre", () => {
    const result = calcularProjecao(BASE_PARAMS);
    expect(result.analiseMetaLivre.gapEnf).toBe(0);
    expect(result.analiseMetaLivre.gapTec).toBe(0);
  });

  it("gap da meta livre > 0 quando o quadro não cobre 90%", () => {
    const params: ProjecaoParams = { ...BASE_PARAMS, metaLivreOcupacao: 0.9 };
    const result = calcularProjecao(params);
    // @ 90%: enfNecessarios = ceil(10 * 0.9) = 9; quadro = 7 → gap = 2
    expect(result.analiseMetaLivre.gapEnf).toBe(2);
  });
});

describe("calcularProjecao — edge cases", () => {
  it("não lança erro com quadro atual zerado", () => {
    const params: ProjecaoParams = {
      ...BASE_PARAMS,
      quadroAtualEnfermeiros: 0,
      quadroAtualTecnicos: 0,
    };
    const result = calcularProjecao(params);
    expect(result.ocupacaoMaximaAtendivel).toBe(0);
    // Gap para qualquer meta > 0 deve ser positivo
    const row100 = result.tabelaGapMetas.find((r) => r.metaOcupacao === 1.0);
    expect(row100!.gapEnf).toBeGreaterThan(0);
  });

  it("quadro generoso resulta em ocupação máxima ≥ 100%", () => {
    const params: ProjecaoParams = {
      ...BASE_PARAMS,
      quadroAtualEnfermeiros: 20,
      quadroAtualTecnicos: 40,
    };
    const result = calcularProjecao(params);
    expect(result.ocupacaoMaximaAtendivel).toBeGreaterThanOrEqual(1.0);
  });
});
