import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { SnapshotDimensionamentoRepository } from "../repositories/snapshotDimensionamentoRepository";

/**
 * Snapshot Summary: consolida custos e quantidades a partir do último SnapshotDimensionamento do hospital.
 * Não há fallback para a entidade Baseline. Se não houver snapshot, retorna 404.
 */
export class SnapshotSummaryController {
  private snapshotRepo: SnapshotDimensionamentoRepository;

  constructor(private ds: DataSource) {
    this.snapshotRepo = new SnapshotDimensionamentoRepository(ds);
  }

  getLatestSummary = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const scope = (req.query.scope as string) || "global"; // global|internacao|nao-internacao
      const includeUnits =
        (req.query.includeUnits ?? "true").toString() === "true";
      const unitId = (req.query.unitId as string) || undefined;

      // Buscar último snapshot (escopo hospital)
      const snapshot = await this.snapshotRepo.buscarUltimoPorHospital(
        hospitalId
      );
      if (!snapshot) {
        return res.status(404).json({
          error: "Nenhum snapshot encontrado para este hospital.",
          hospitalId,
        });
      }

      const dados: any = snapshot.dados || {};
      let internation: any[] =
        dados.internation || dados.unidades || dados.internacao || [];
      let assistance: any[] =
        dados.assistance || dados.unidadesNaoInternacao || [];

      if (scope === "internacao") {
        assistance = [];
      } else if (scope === "nao-internacao") {
        internation = [];
      }

      if (unitId) {
        internation = internation.filter((u: any) => u.id === unitId);
        assistance = assistance.filter((u: any) => u.id === unitId);
      }

      const unitsCombined = [
        ...internation.map((u: any) => ({
          unidadeId: u.id,
          nome: u.name || u.nome,
          tipo: "internacao" as const,
          custo: normalizeCost(u.costAmount),
          quantidade: sumStaff(u.staff),
        })),
        ...assistance.map((u: any) => ({
          unidadeId: u.id,
          nome: u.name || u.nome,
          tipo: "nao-internacao" as const,
          custo: normalizeCost(u.costAmount),
          quantidade: sumStaff(u.staff),
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

      const unitsWithFormatted = unitsCombined.map((u) => ({
        ...u,
        custoFormatado: formatBRL(u.custo),
      }));

      return res.json({
        hospitalId,
        snapshotId: snapshot.id,
        generatedAt: snapshot.dataHora,
        totals: { ...totals, custoFormatado: formatBRL(totals.custo) },
        units: includeUnits ? unitsWithFormatted : [],
      });
    } catch (err) {
      console.error("[snapshot-summary] erro:", err);
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}

function normalizeCost(v: any): number {
  if (v == null) return 0;
  // Snapshots armazenam valores monetários sanitizados em centavos (inteiro).
  // Se for número, assumimos centavos e convertemos para reais.
  if (typeof v === "number") return Number((v / 100).toFixed(2));
  // Se for string (ex: vindo direto do banco antes da sanitização), parse como reais.
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

function formatBRL(value: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback simples
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  }
}
