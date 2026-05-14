import { classificarTotal } from "../../utils/scpFaixas";
import { ClassificacaoCuidado } from "../../entities/AvaliacaoSCP";
import { SCPType } from "../../utils/scpSchemas";

// ─────────────────────────────────────────────────
// PERROCA
// Faixas: 13–26 MINIMOS | 27–39 INTERMEDIARIOS
//         40–52 SEMI_INTENSIVOS | 53–65 INTENSIVOS
// ─────────────────────────────────────────────────
describe("classificarTotal - PERROCA", () => {
  it.each<[number, ClassificacaoCuidado]>([
    [13,  ClassificacaoCuidado.MINIMOS],        // borda inferior da faixa
    [20,  ClassificacaoCuidado.MINIMOS],        // meio da faixa
    [26,  ClassificacaoCuidado.MINIMOS],        // borda superior
    [27,  ClassificacaoCuidado.INTERMEDIARIOS], // borda inferior da próxima
    [33,  ClassificacaoCuidado.INTERMEDIARIOS],
    [39,  ClassificacaoCuidado.INTERMEDIARIOS], // borda superior
    [40,  ClassificacaoCuidado.SEMI_INTENSIVOS],
    [46,  ClassificacaoCuidado.SEMI_INTENSIVOS],
    [52,  ClassificacaoCuidado.SEMI_INTENSIVOS],
    [53,  ClassificacaoCuidado.INTENSIVOS],
    [59,  ClassificacaoCuidado.INTENSIVOS],
    [65,  ClassificacaoCuidado.INTENSIVOS],     // borda superior
  ])("%d pts → %s", (total, expected) => {
    expect(classificarTotal(SCPType.PERROCA, total)).toBe(expected);
  });

  it("pontuação abaixo do mínimo lança erro", () => {
    expect(() => classificarTotal(SCPType.PERROCA, 12)).toThrow();
  });

  it("pontuação acima do máximo lança erro", () => {
    expect(() => classificarTotal(SCPType.PERROCA, 66)).toThrow();
  });
});

// ─────────────────────────────────────────────────
// DINI
// Faixas: 11–17 MINIMOS | 18–23 INTERMEDIARIOS
//         24–30 ALTA_DEPENDENCIA | 31–36 SEMI_INTENSIVOS | 37+ INTENSIVOS
// ─────────────────────────────────────────────────
describe("classificarTotal - DINI", () => {
  it.each<[number, ClassificacaoCuidado]>([
    [11,  ClassificacaoCuidado.MINIMOS],
    [17,  ClassificacaoCuidado.MINIMOS],
    [18,  ClassificacaoCuidado.INTERMEDIARIOS],
    [23,  ClassificacaoCuidado.INTERMEDIARIOS],
    [24,  ClassificacaoCuidado.ALTA_DEPENDENCIA],
    [30,  ClassificacaoCuidado.ALTA_DEPENDENCIA],
    [31,  ClassificacaoCuidado.SEMI_INTENSIVOS],
    [36,  ClassificacaoCuidado.SEMI_INTENSIVOS],
    [37,  ClassificacaoCuidado.INTENSIVOS],
    [100, ClassificacaoCuidado.INTENSIVOS],  // max aberto
  ])("%d pts → %s", (total, expected) => {
    expect(classificarTotal(SCPType.DINI, total)).toBe(expected);
  });

  it("pontuação abaixo de 11 lança erro", () => {
    expect(() => classificarTotal(SCPType.DINI, 10)).toThrow();
  });
});

// ─────────────────────────────────────────────────
// FUGULIN
// Faixas: 0–14 MINIMOS | 15–24 INTERMEDIARIOS
//         25–28 ALTA_DEPENDENCIA | 29–34 SEMI_INTENSIVOS | 35+ INTENSIVOS
// ─────────────────────────────────────────────────
describe("classificarTotal - FUGULIN", () => {
  it.each<[number, ClassificacaoCuidado]>([
    [0,   ClassificacaoCuidado.MINIMOS],
    [7,   ClassificacaoCuidado.MINIMOS],
    [14,  ClassificacaoCuidado.MINIMOS],
    [15,  ClassificacaoCuidado.INTERMEDIARIOS],
    [20,  ClassificacaoCuidado.INTERMEDIARIOS],
    [24,  ClassificacaoCuidado.INTERMEDIARIOS],
    [25,  ClassificacaoCuidado.ALTA_DEPENDENCIA],
    [28,  ClassificacaoCuidado.ALTA_DEPENDENCIA],
    [29,  ClassificacaoCuidado.SEMI_INTENSIVOS],
    [34,  ClassificacaoCuidado.SEMI_INTENSIVOS],
    [35,  ClassificacaoCuidado.INTENSIVOS],
    [50,  ClassificacaoCuidado.INTENSIVOS],
  ])("%d pts → %s", (total, expected) => {
    expect(classificarTotal(SCPType.FUGULIN, total)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────
// Consistência geral: borda N da faixa X nunca deve
// classificar igual à borda N+1 (limite imediatamente superior)
// ─────────────────────────────────────────────────
describe("classificarTotal - transições de faixa são mutuamente exclusivas", () => {
  const transicoes: Array<[SCPType, number, number]> = [
    [SCPType.PERROCA,  26, 27],
    [SCPType.PERROCA,  39, 40],
    [SCPType.PERROCA,  52, 53],
    [SCPType.DINI,     17, 18],
    [SCPType.DINI,     23, 24],
    [SCPType.DINI,     30, 31],
    [SCPType.DINI,     36, 37],
    [SCPType.FUGULIN,  14, 15],
    [SCPType.FUGULIN,  24, 25],
    [SCPType.FUGULIN,  28, 29],
    [SCPType.FUGULIN,  34, 35],
  ];

  it.each(transicoes)(
    "%s: %d e %d devem ter classificações diferentes",
    (scp, lower, upper) => {
      const classLower = classificarTotal(scp, lower);
      const classUpper = classificarTotal(scp, upper);
      expect(classLower).not.toBe(classUpper);
    }
  );
});
