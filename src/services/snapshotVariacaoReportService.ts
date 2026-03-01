import { DataSource, In } from "typeorm";
import { SnapshotDimensionamento } from "../entities/SnapshotDimensionamento";
import { Cargo } from "../entities/Cargo";
import { Hospital } from "../entities/Hospital";
import { SitioFuncional } from "../entities/SitioFuncional";
import { DimensionamentoService } from "./dimensionamentoService";
import { SnapshotDimensionamentoService } from "./snapshotDimensionamentoService";

// ── Tipos públicos ──────────────────────────────────────────────────────────

export interface CargoRow {
  cargoId: string;
  cargoNome: string;
  atualQtd: number;
  baselineQtd: number;
  calculadoQtd: number | null;
  ajusteQtd: number | null;   // projetado - calculado
  projetadoQtd: number;
  variacaoQtd: number;        // projetado - atual
  atualRs: number;
  baselineRs: number;
  calculadoRs: number | null;
  ajusteRs: number | null;
  projetadoRs: number;
  variacaoRs: number;
  observacao: string;
}

export interface TabelaVariacao {
  setor: string;
  snapshotNome: string;
  snapshotData: string;
  variacaoPercQtd: number;
  variacaoPercRs: number;
  cargos: CargoRow[];
}

export interface SnapshotVariacaoData {
  hospitalNome: string;
  snapshotData: string;
  snapshotNome: string;
  tabelas: TabelaVariacao[];
}

// ── Serviço ─────────────────────────────────────────────────────────────────

export class SnapshotVariacaoReportService {
  private dimSvc: DimensionamentoService;
  private snapshotSvc: SnapshotDimensionamentoService;

  constructor(private ds: DataSource) {
    this.dimSvc = new DimensionamentoService(ds);
    this.snapshotSvc = new SnapshotDimensionamentoService(ds);
  }

  async buildReportData(hospitalId: string): Promise<SnapshotVariacaoData> {
    // 1. Buscar snapshot selecionado
    const snapshot = await this.ds
      .getRepository(SnapshotDimensionamento)
      .findOne({
        where: { hospitalId, escopo: "HOSPITAL", selecionado: true },
        order: { dataHora: "DESC" },
      });

    if (!snapshot) {
      throw new Error("Nenhum snapshot selecionado encontrado para este hospital");
    }

    // 2. Buscar situação atual (tempo real)
    const situacaoAtual = await this.snapshotSvc.buscarSituacaoAtual(hospitalId);

    const dados = snapshot.dados as any;
    const projetadoFinal = dados?.projetadoFinal ?? {};
    const snapshotData = new Date(snapshot.dataHora).toLocaleDateString("pt-BR");
    const snapshotNome = snapshot.observacao || `Baseline ${snapshotData}`;

    // 3. Coletar todos os cargoIds do snapshot para buscar nomes em lote
    const allCargoIds = new Set<string>();
    const allSitioIds = new Set<string>();
    for (const u of projetadoFinal.internacao || []) {
      for (const c of u.cargos || []) if (c.cargoId) allCargoIds.add(c.cargoId);
    }
    for (const u of projetadoFinal.naoInternacao || []) {
      for (const s of u.sitios || []) {
        if (s.sitioId) allSitioIds.add(s.sitioId);
        for (const c of s.cargos || []) if (c.cargoId) allCargoIds.add(c.cargoId);
      }
    }
    const cargoNomeMap: Record<string, string> = {};
    if (allCargoIds.size > 0) {
      const cargos = await this.ds
        .getRepository(Cargo)
        .find({ where: { id: In([...allCargoIds]) }, select: ["id", "nome"] });
      for (const c of cargos) cargoNomeMap[c.id] = c.nome;
    }

    // Buscar nomes dos sítios e dados atuais por sítio
    const sitioNomeMap: Record<string, string> = {};
    // sitioAtualMap[sitioId][cargoId] = { qty, custoUnitario }
    const sitioAtualMap: Record<string, Record<string, { qty: number; custoUnitario: number }>> = {};
    if (allSitioIds.size > 0) {
      const sitios = await this.ds.getRepository(SitioFuncional).find({
        where: { id: In([...allSitioIds]) },
        relations: ["unidade", "cargosSitio", "cargosSitio.cargoUnidade", "cargosSitio.cargoUnidade.cargo"],
      });
      for (const sitio of sitios) {
        if (sitio.nome) sitioNomeMap[sitio.id] = sitio.nome;
        const horasExtra = parseFloat((sitio.unidade?.horas_extra_reais || "0").replace(",", "."));
        sitioAtualMap[sitio.id] = {};
        for (const cs of sitio.cargosSitio || []) {
          const cargo = cs.cargoUnidade?.cargo;
          if (!cargo) continue;
          const salario = parseFloat((cargo.salario || "0").replace(",", "."));
          const adicionais = parseFloat(((cargo as any).adicionais_tributos || "0").replace(",", "."));
          sitioAtualMap[sitio.id][cargo.id] = {
            qty: cs.quantidade_funcionarios ?? 0,
            custoUnitario: salario + adicionais + horasExtra,
          };
        }
      }
    }

    // 4. Montar tabelas de internação
    const tabelasInternacao = await this.buildInternacao(
      projetadoFinal.internacao || [],
      dados?.internation || [],
      situacaoAtual,
      snapshotNome,
      snapshotData,
      cargoNomeMap
    );

    // 5. Montar tabelas de não-internação (por sítio)
    const tabelasNaoInternacao = this.buildNaoInternacao(
      projetadoFinal.naoInternacao || [],
      dados?.assistance || [],
      snapshotNome,
      snapshotData,
      cargoNomeMap,
      sitioNomeMap,
      sitioAtualMap
    );

    const hospitalNome =
      (await this.ds
        .getRepository(Hospital)
        .findOne({ where: { id: hospitalId }, select: ["id", "nome"] }))
        ?.nome ?? dados?.hospital?.nome ?? "";

    return {
      hospitalNome,
      snapshotData,
      snapshotNome,
      tabelas: [...tabelasInternacao, ...tabelasNaoInternacao],
    };
  }

  // ── Internação ────────────────────────────────────────────────────────────

  private async buildInternacao(
    pfList: any[],
    baselineList: any[],
    situacaoAtual: any | null,
    snapshotNome: string,
    snapshotData: string,
    cargoNomeMap: Record<string, string> = {}
  ): Promise<TabelaVariacao[]> {
    const tabelas: TabelaVariacao[] = [];

    for (const pfUnidade of pfList) {
      const { unidadeId, unidadeNome, cargos: pfCargos = [], periodoTravado } = pfUnidade;

      // Baseline: staff do snapshot na época de criação
      const baselineUnidade = baselineList.find((u: any) => u.id === unidadeId);
      const baselineStaffMap: Record<string, { qty: number; custoUnitario: number }> = {};
      for (const s of baselineUnidade?.staff || []) {
        baselineStaffMap[s.id] = {
          qty: s.quantity ?? 0,
          custoUnitario: s.unitCost ?? (s.totalCost && s.quantity ? s.totalCost / s.quantity : 0),
        };
      }

      // Atual: da situacaoAtual (pode vir dentro do snapshot.dados ou precisar do serviço)
      const atualUnidade = situacaoAtual?.unidades?.find(
        (u: any) => u.unidadeId === unidadeId
      );
      const atualCargoMap: Record<string, { qty: number; custoUnitario: number }> = {};
      for (const c of atualUnidade?.cargos || []) {
        atualCargoMap[c.cargoId] = {
          qty: c.quantidadeFuncionarios ?? 0,
          custoUnitario: c.custoUnitario ?? 0,
        };
      }

      // Fallback: recalcular quantidadeCalculada se não salvo no snapshot
      const needsFallback = pfCargos.some((c: any) => c.quantidadeCalculada == null);
      let calculadoFallback: Record<string, number> = {};
      if (needsFallback && periodoTravado?.dataInicial && periodoTravado?.dataFinal) {
        try {
          const dim = await this.dimSvc.calcularParaInternacao(
            unidadeId,
            periodoTravado.dataInicial,
            periodoTravado.dataFinal
          );
          for (const t of dim?.tabela || []) {
            if (t.cargoId) calculadoFallback[t.cargoId] = t.quantidadeProjetada ?? 0;
          }
        } catch {
          // silently ignore
        }
      }

      const rows: CargoRow[] = pfCargos.map((pf: any) => {
        const atualInfo = atualCargoMap[pf.cargoId] ?? { qty: 0, custoUnitario: pf.custoUnitario ?? 0 };
        const baselineInfo = baselineStaffMap[pf.cargoId] ?? { qty: 0, custoUnitario: pf.custoUnitario ?? 0 };
        const custoUnit = pf.custoUnitario ?? 0;

        const atualQtd = atualInfo.qty;
        const baselineQtd = baselineInfo.qty;
        const projetadoQtd = pf.projetadoFinal ?? 0;

        const calculadoQtd =
          pf.quantidadeCalculada != null
            ? pf.quantidadeCalculada
            : (calculadoFallback[pf.cargoId] ?? null);
        const ajusteQtd = calculadoQtd != null ? projetadoQtd - calculadoQtd : null;

        const atualRs = atualQtd * (atualInfo.custoUnitario || custoUnit);
        const baselineRs = baselineQtd * (baselineInfo.custoUnitario || custoUnit);
        const projetadoRs = pf.custoTotal ?? projetadoQtd * custoUnit;
        const calculadoRs = calculadoQtd != null ? calculadoQtd * custoUnit : null;
        const ajusteRs = ajusteQtd != null ? ajusteQtd * custoUnit : null;

        return {
          cargoId: pf.cargoId,
          cargoNome: cargoNomeMap[pf.cargoId] ?? pf.cargoNome ?? pf.cargoId,
          atualQtd,
          baselineQtd,
          calculadoQtd,
          ajusteQtd,
          projetadoQtd,
          variacaoQtd: projetadoQtd - atualQtd,
          atualRs,
          baselineRs,
          calculadoRs,
          ajusteRs,
          projetadoRs,
          variacaoRs: projetadoRs - atualRs,
          observacao: pf.observacao ?? "",
        };
      });

      tabelas.push({
        setor: unidadeNome ?? unidadeId,
        snapshotNome,
        snapshotData,
        variacaoPercQtd: this.calcVariacaoPerc(rows, "qtd"),
        variacaoPercRs: this.calcVariacaoPerc(rows, "rs"),
        cargos: rows,
      });
    }

    return tabelas;
  }

  // ── Não-Internação (por sítio) ────────────────────────────────────────────

  private buildNaoInternacao(
    pfList: any[],
    baselineList: any[],
    snapshotNome: string,
    snapshotData: string,
    cargoNomeMap: Record<string, string> = {},
    sitioNomeMap: Record<string, string> = {},
    sitioAtualMap: Record<string, Record<string, { qty: number; custoUnitario: number }>> = {}
  ): TabelaVariacao[] {
    const tabelas: TabelaVariacao[] = [];

    for (const pfUnidade of pfList) {
      const { unidadeId, unidadeNome, sitios = [] } = pfUnidade;

      // Baseline staff para a unidade toda (agregado por cargoId)
      const baselineUnidade = baselineList.find((u: any) => u.id === unidadeId);
      const baselineStaffMap: Record<string, { qty: number; custoUnitario: number }> = {};
      for (const s of baselineUnidade?.staff || []) {
        const existing = baselineStaffMap[s.id];
        baselineStaffMap[s.id] = {
          qty: (existing?.qty ?? 0) + (s.quantity ?? 0),
          custoUnitario: s.unitCost ?? (s.totalCost && s.quantity ? s.totalCost / s.quantity : 0),
        };
      }

      for (const sitio of sitios) {
        const { sitioId, sitioNome: sitioNomeSnap, cargos: sitioCargos = [] } = sitio;
        const resolvedSitioNome = sitioNomeMap[sitioId] ?? sitioNomeSnap ?? sitioId ?? "Sítio";
        const setorLabel = `${unidadeNome} / ${resolvedSitioNome}`;
        const atualSitio = sitioAtualMap[sitioId] ?? {};

        const rows: CargoRow[] = sitioCargos.map((pf: any) => {
          const custoUnit = pf.custoUnitario ?? 0;
          const baselineInfo = baselineStaffMap[pf.cargoId] ?? { qty: 0, custoUnitario: custoUnit };
          const atualInfo = atualSitio[pf.cargoId] ?? { qty: 0, custoUnitario: custoUnit };

          const atualQtd = atualInfo.qty;
          const baselineQtd = baselineInfo.qty;
          const projetadoQtd = pf.projetadoFinal ?? 0;
          const projetadoRs = pf.custoTotal ?? projetadoQtd * custoUnit;
          const atualRs = atualQtd * (atualInfo.custoUnitario || custoUnit);
          const baselineRs = baselineQtd * (baselineInfo.custoUnitario || custoUnit);

          return {
            cargoId: pf.cargoId,
            cargoNome: cargoNomeMap[pf.cargoId] ?? pf.cargoNome ?? pf.cargoId,
            atualQtd,
            baselineQtd,
            calculadoQtd: null,
            ajusteQtd: null,
            projetadoQtd,
            variacaoQtd: projetadoQtd - atualQtd,
            atualRs,
            baselineRs,
            calculadoRs: null,
            ajusteRs: null,
            projetadoRs,
            variacaoRs: projetadoRs - atualRs,
            observacao: pf.observacao ?? "",
          };
        });

        tabelas.push({
          setor: setorLabel,
          snapshotNome,
          snapshotData,
          variacaoPercQtd: this.calcVariacaoPerc(rows, "qtd"),
          variacaoPercRs: this.calcVariacaoPerc(rows, "rs"),
          cargos: rows,
        });
      }
    }

    return tabelas;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private calcVariacaoPerc(rows: CargoRow[], tipo: "qtd" | "rs"): number {
    const baseTotal = rows.reduce(
      (s, r) => s + (tipo === "qtd" ? r.baselineQtd : r.baselineRs),
      0
    );
    const projTotal = rows.reduce(
      (s, r) => s + (tipo === "qtd" ? r.projetadoQtd : r.projetadoRs),
      0
    );
    if (baseTotal === 0) return 0;
    return ((projTotal - baseTotal) / baseTotal) * 100;
  }
}
