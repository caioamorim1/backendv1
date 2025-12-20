import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { SnapshotDimensionamentoRepository } from "../repositories/snapshotDimensionamentoRepository";
import { BaselineRepository } from "../repositories/baselineRepository";

/**
 * DEPRECATION NOTICE:
 * Este controller foi usado temporariamente como um atalho para expor um "resumo de baseline" a partir de snapshots.
 * A partir de agora, use o SnapshotSummaryController e a rota
 *   GET /hospitals/:hospitalId/snapshots/latest/summary
 * que NÃO faz fallback para a entidade Baseline e reflete fielmente o conceito de snapshot.
 * Mantido apenas para compatibilidade/consulta e poderá ser removido futuramente.
 */
export class BaselineSummaryController {
  private snapshotRepo: SnapshotDimensionamentoRepository;
  private baselineRepo: BaselineRepository;

  constructor(private ds: DataSource) {
    this.snapshotRepo = new SnapshotDimensionamentoRepository(ds);
    this.baselineRepo = new BaselineRepository(ds);
  }

  getSummary = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const scope = (req.query.scope as string) || "global"; // global|internacao|nao-internacao
      const includeUnits =
        (req.query.includeUnits ?? "true").toString() === "true";
      const unitId = (req.query.unitId as string) || undefined;
      const activeOnly = (req.query.activeOnly ?? "true").toString() === "true";

      // 1) Buscar último snapshot do hospital
      const snapshot = await this.snapshotRepo.buscarUltimoPorHospital(
        hospitalId
      );

      // 2) Se não houver snapshot, fallback para Baseline simples (se existir)
      if (!snapshot) {
        const baseline = await this.baselineRepo.buscarPorHospitalId(
          hospitalId
        );
        if (!baseline) {
          return res.json({
            hospitalId,
            baselineId: null,
            generatedAt: null,
            hasBaseline: false,
            totals: { custo: 0, quantidade: 0 },
            units: [],
          });
        }
        // Monta a resposta a partir do Baseline clássico
        const setores: any[] = (baseline as any).setores || [];
        const ativos = activeOnly
          ? setores
              .map((s) => (typeof s === "string" ? safeParse(s) : s))
              .filter((s) => s?.ativo !== false)
          : setores.map((s) => (typeof s === "string" ? safeParse(s) : s));

        const units = includeUnits
          ? ativos.map((s) => ({
              unidadeId: s?.id || s?.unidadeId || s?.nome,
              nome: s?.nome,
              tipo: inferTipoFromName(s?.nome),
              ativo: s?.ativo !== false,
              custo: normalizeCost(s?.custo),
              quantidade: Number(s?.quantidade || 0),
            }))
          : [];

        const totals = units.reduce(
          (acc, u) => {
            acc.custo += u.custo;
            acc.quantidade += u.quantidade;
            return acc;
          },
          {
            custo: Number((baseline as any).custo_total || 0),
            quantidade: Number((baseline as any).quantidade_funcionarios || 0),
          }
        );

        return res.json({
          hospitalId,
          baselineId: baseline.id,
          generatedAt: baseline.updated_at || baseline.created_at,
          hasBaseline: true,
          totals,
          units,
        });
      }

      // 3) Temos snapshot: consolidar a partir de snapshot.dados
      const dados = snapshot.dados || {};
      // Estruturas possíveis no snapshot de hospital: { internation: [...], assistance: [...], neutral: [...] }
      let internation: any[] =
        dados.internation || dados.unidades || dados.internacao || [];
      let assistance: any[] =
        dados.assistance || dados.unidadesNaoInternacao || [];
      let neutral: any[] = dados.neutral || [];

      // Optional scope filter
      if (scope === "internacao") {
        assistance = [];
        neutral = [];
      } else if (scope === "nao-internacao") {
        internation = [];
        neutral = [];
      }

      // Optional unit filter
      if (unitId) {
        internation = internation.filter((u: any) => u.id === unitId);
        assistance = assistance.filter((u: any) => u.id === unitId);
        neutral = neutral.filter((u: any) => u.id === unitId);
      }

      // activeOnly aplica-se se viermos a usar baseline clássico; em snapshot, não há flag ativo por padrão.

      const unitsCombined = [
        ...internation.map((u: any) => ({
          unidadeId: u.id,
          nome: u.name || u.nome,
          tipo: "internacao" as const,
          ativo: true,
          custo: normalizeCost(u.costAmount),
          quantidade: sumStaff(u.staff),
        })),
        ...assistance.map((u: any) => ({
          unidadeId: u.id,
          nome: u.name || u.nome,
          tipo: "nao-internacao" as const,
          ativo: true,
          custo: normalizeCost(u.costAmount),
          quantidade: sumStaff(u.staff),
        })),
        ...neutral.map((u: any) => ({
          unidadeId: u.id,
          nome: u.name || u.nome,
          tipo: "neutral" as const,
          ativo: u.status === "ativo",
          custo: normalizeCost(u.costAmount),
          quantidade: 0, // Unidades neutras não têm staff
        })),
      ];

      const totals = unitsCombined.reduce(
        (acc, u) => {
          acc.custo += u.custo;
          acc.quantidade += u.quantidade;
          return acc;
        },
        { custo: 0, quantidade: 0 }
      );

      return res.json({
        hospitalId,
        baselineId: snapshot.id,
        generatedAt: snapshot.dataHora,
        hasBaseline: true,
        totals,
        units: includeUnits ? unitsCombined : [],
      });
    } catch (err) {
      console.error("[baseline-summary] erro:", err);
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}

function normalizeCost(v: any): number {
  if (v == null) return 0;
  // Snapshots sanitizados gravam custo em centavos; se for número, converta para reais.
  if (typeof v === "number") return Number((v / 100).toFixed(2));
  if (typeof v === "string") {
    const num = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(num) ? 0 : Number(num.toFixed(2));
  }
  return 0;
}

function sumStaff(arr: any[]): number {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, r) => s + Number(r?.quantity || 0), 0);
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { nome: s, ativo: true };
  }
}

function inferTipoFromName(
  nome?: string
): "internacao" | "nao-internacao" | undefined {
  if (!nome) return undefined;
  const n = nome.toLowerCase();
  if (/(uti|intern|enfermaria)/i.test(n)) return "internacao";
  return "nao-internacao";
}
