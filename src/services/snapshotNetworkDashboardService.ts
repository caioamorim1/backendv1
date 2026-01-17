import { DataSource } from "typeorm";
import { SnapshotDimensionamento } from "../entities/SnapshotDimensionamento";
import { SnapshotDimensionamentoRepository } from "../repositories/snapshotDimensionamentoRepository";
import { SnapshotDimensionamentoService } from "./snapshotDimensionamentoService";
import { Hospital } from "../entities/Hospital";
import { Rede } from "../entities/Rede";
import { Grupo } from "../entities/Grupo";
import { Regiao } from "../entities/Regiao";

type ScopeTipo = "rede" | "grupo" | "regiao";

type MoneyAndCount = {
  custoMensal: number;
  totalFuncionarios: number;
  internacao: { custoMensal: number; totalFuncionarios: number };
  naoInternacao: { custoMensal: number; totalFuncionarios: number };
};

type HospitalComputed = {
  hospitalId: string;
  hospitalNome: string;
  grupoId?: string;
  grupoNome?: string;
  regiaoId?: string;
  regiaoNome?: string;
  snapshot: SnapshotDimensionamento;
  situacaoAtualRaw: any;
  baseline: MoneyAndCount;
  atual: MoneyAndCount;
  projetado: MoneyAndCount;
  staffAtualizadoEm: Date | null;
};

export class SnapshotNetworkDashboardService {
  private snapshotRepo: SnapshotDimensionamentoRepository;
  private snapshotService: SnapshotDimensionamentoService;

  constructor(private ds: DataSource) {
    this.snapshotRepo = new SnapshotDimensionamentoRepository(ds);
    this.snapshotService = new SnapshotDimensionamentoService(ds);
  }

  async gerar(tipo: ScopeTipo, id: string) {
    const { rede, hospitais } = await this.buscarHospitaisNoEscopo(tipo, id);

    const hospitalIds = hospitais.map((h) => h.id);
    const snapshotsSelecionados =
      await this.snapshotRepo.buscarSelecionadosPorHospitais(hospitalIds);

    const snapshotMaisRecentePorHospital = pickLatestSnapshotPerHospital(
      snapshotsSelecionados
    );

    // Omitir hospitais sem snapshot selecionado
    const hospitaisComSnapshot = hospitais.filter((h) =>
      snapshotMaisRecentePorHospital.has(h.id)
    );

    const hospitaisComputados: HospitalComputed[] = await Promise.all(
      hospitaisComSnapshot.map(async (h) => {
        const snapshot = snapshotMaisRecentePorHospital.get(h.id)!;
        const situacaoAtual = await this.snapshotService.buscarSituacaoAtual(
          h.id
        );

        const baseline = computeBaselineFromSnapshot(snapshot);
        const atual = computeAtualFromSituacao(situacaoAtual);
        const projetado = computeProjetadoFromSnapshot(snapshot, situacaoAtual);

        const staffAtualizadoEm = extractStaffAtualizadoEm(situacaoAtual);

        const grupo = (h as any).grupo || (h as any).regiao?.grupo;
        const regiao = (h as any).regiao;

        return {
          hospitalId: h.id,
          hospitalNome: h.nome,
          grupoId: grupo?.id,
          grupoNome: grupo?.nome,
          regiaoId: regiao?.id,
          regiaoNome: regiao?.nome,
          snapshot,
          situacaoAtualRaw: situacaoAtual,
          baseline,
          atual,
          projetado,
          staffAtualizadoEm,
        };
      })
    );

    // Montar árvore Rede -> Grupos -> Regiões -> Hospitais
    const gruposMap = new Map<
      string,
      {
        grupoId: string;
        grupoNome: string;
        hospitais: HospitalComputed[];
        regioesMap: Map<
          string,
          {
            regiaoId: string;
            regiaoNome: string;
            hospitais: HospitalComputed[];
          }
        >;
      }
    >();

    for (const hc of hospitaisComputados) {
      if (!hc.grupoId || !hc.regiaoId) {
        // Sem vínculo suficiente para o dashboard hierárquico. Mantemos simples: ignorar.
        continue;
      }

      if (!gruposMap.has(hc.grupoId)) {
        gruposMap.set(hc.grupoId, {
          grupoId: hc.grupoId,
          grupoNome: hc.grupoNome || "Grupo",
          hospitais: [],
          regioesMap: new Map(),
        });
      }

      const grupo = gruposMap.get(hc.grupoId)!;
      grupo.hospitais.push(hc);

      if (!grupo.regioesMap.has(hc.regiaoId)) {
        grupo.regioesMap.set(hc.regiaoId, {
          regiaoId: hc.regiaoId,
          regiaoNome: hc.regiaoNome || "Região",
          hospitais: [],
        });
      }

      grupo.regioesMap.get(hc.regiaoId)!.hospitais.push(hc);
    }

    const grupos = Array.from(gruposMap.values()).map((g) => {
      const regioes = Array.from(g.regioesMap.values()).map((r) => {
        const hospitaisPayload = r.hospitais
          .map((h) => hospitalPayload(h))
          .sort((a, b) => a.hospitalNome.localeCompare(b.hospitalNome));

        return {
          regiaoId: r.regiaoId,
          regiaoNome: r.regiaoNome,
          global: buildGlobal(r.hospitais, { includeRankings: false }),
          hospitais: hospitaisPayload,
        };
      });

      return {
        grupoId: g.grupoId,
        grupoNome: g.grupoNome,
        global: buildGlobal(g.hospitais, { includeRankings: true }),
        regioes,
      };
    });

    const staffRange = computeStaffRange(hospitaisComputados);
    const snapshotInfo = pickRedeSnapshotInfo(hospitaisComputados);

    return {
      rede: {
        redeId: rede.id,
        redeNome: rede.nome,
        snapshot: {
          snapshotId: snapshotInfo?.id || null,
          baselineSelecionadoEm: snapshotInfo
            ? new Date(snapshotInfo.dataHora).toISOString()
            : null,
          geradoEm: new Date().toISOString(),
        },
        staff: {
          maisRecenteEm: staffRange.maisRecenteEm,
          maisAntigoEm: staffRange.maisAntigoEm,
          labelMaisRecente: staffRange.labelMaisRecente,
          labelMaisAntigo: staffRange.labelMaisAntigo,
        },
        global: buildGlobal(hospitaisComputados, { includeRankings: true }),
        grupos: grupos.sort((a, b) => a.grupoNome.localeCompare(b.grupoNome)),
      },
    };
  }

  private async buscarHospitaisNoEscopo(tipo: ScopeTipo, id: string) {
    // Descobrir a rede raiz e carregar hospitais com relações
    const redeRepo = this.ds.getRepository(Rede);
    const grupoRepo = this.ds.getRepository(Grupo);
    const regiaoRepo = this.ds.getRepository(Regiao);
    const hospitalRepo = this.ds.getRepository(Hospital);

    let rede: Rede | null = null;
    if (tipo === "rede") {
      rede = await redeRepo.findOne({ where: { id } });
    } else if (tipo === "grupo") {
      const grupo = await grupoRepo.findOne({
        where: { id },
        relations: ["rede"],
      });
      rede = (grupo as any)?.rede || null;
    } else {
      const regiao = await regiaoRepo.findOne({
        where: { id },
        relations: ["grupo", "grupo.rede"],
      });
      rede = (regiao as any)?.grupo?.rede || null;
    }

    if (!rede) {
      throw new Error("Rede não encontrada para o escopo informado");
    }

    const qb = hospitalRepo
      .createQueryBuilder("hospital")
      .leftJoinAndSelect("hospital.regiao", "regiao")
      .leftJoinAndSelect("regiao.grupo", "grupo")
      .leftJoinAndSelect("grupo.rede", "rede")
      .leftJoinAndSelect("hospital.grupo", "grupoDirect")
      .leftJoinAndSelect("hospital.rede", "redeDirect");

    if (tipo === "rede") {
      qb.where("rede.id = :id", { id }).orWhere("redeDirect.id = :id", { id });
    } else if (tipo === "grupo") {
      qb.where("grupo.id = :id", { id }).orWhere("grupoDirect.id = :id", {
        id,
      });
    } else {
      qb.where("regiao.id = :id", { id });
    }

    const hospitais = await qb.getMany();

    return { rede, hospitais };
  }
}

function hospitalPayload(h: HospitalComputed) {
  const globalAtualVsProjetado = buildGlobal([h], { includeRankings: false });

  return {
    hospitalId: h.hospitalId,
    hospitalNome: h.hospitalNome,
    baselineAtivo: true,
    staff: {
      atualizadoEm: h.staffAtualizadoEm?.toISOString() || null,
      atualizadoLabel: h.staffAtualizadoEm
        ? formatDatePtBr(h.staffAtualizadoEm)
        : null,
    },
    global: globalAtualVsProjetado,
    detalhamento: buildDetalhamento(h),
  };
}

function buildGlobal(
  hospitais: HospitalComputed[],
  opts: { includeRankings: boolean }
) {
  const atual = sumMoneyAndCount(hospitais.map((h) => h.atual));
  const projetado = sumMoneyAndCount(hospitais.map((h) => h.projetado));

  const variacaoCustoMensal = roundBRL(
    projetado.custoMensal - atual.custoMensal
  );
  const variacaoQtd = Math.round(
    projetado.totalFuncionarios - atual.totalFuncionarios
  );

  // Para manter o contrato do frontend (Aumento/Redução), tratamos 0 como Aumento.
  const custoStatus = variacaoCustoMensal >= 0 ? "Aumento" : "Redução";

  const internacaoDeltaCusto = roundBRL(
    projetado.internacao.custoMensal - atual.internacao.custoMensal
  );
  const naoInternacaoDeltaCusto = roundBRL(
    projetado.naoInternacao.custoMensal - atual.naoInternacao.custoMensal
  );
  const internacaoDeltaQtd = Math.round(
    projetado.internacao.totalFuncionarios - atual.internacao.totalFuncionarios
  );
  const naoInternacaoDeltaQtd = Math.round(
    projetado.naoInternacao.totalFuncionarios -
      atual.naoInternacao.totalFuncionarios
  );

  const payload: any = {
    cardsTopo: {
      custoAtualMensal: roundBRL(atual.custoMensal),
      custoProjetadoMensal: roundBRL(projetado.custoMensal),
      variacaoCustoMensal,
      variacaoCustoStatusLabel: custoStatus,
      totalFuncionariosAtual: Math.round(atual.totalFuncionarios),
      totalFuncionariosProjetado: Math.round(projetado.totalFuncionarios),
    },
    waterfalls: {
      custoMensal: [
        { name: "Atual", value: roundBRL(atual.custoMensal) },
        { name: "Internação", value: internacaoDeltaCusto },
        { name: "Não Internação", value: naoInternacaoDeltaCusto },
        { name: "Projetado", value: roundBRL(projetado.custoMensal) },
      ],
      quantidade: [
        { name: "Atual", value: Math.round(atual.totalFuncionarios) },
        { name: "Internação", value: internacaoDeltaQtd },
        { name: "Não Internação", value: naoInternacaoDeltaQtd },
        { name: "Projetado", value: Math.round(projetado.totalFuncionarios) },
      ],
    },
  };

  if (opts.includeRankings) {
    payload.rankings = buildRankings(hospitais);
  }

  return payload;
}

function buildDetalhamento(h: HospitalComputed) {
  const baseline = h.baseline;
  const atual = h.atual;
  const projetado = h.projetado;

  const variacaoCustoReais = roundBRL(
    projetado.custoMensal - baseline.custoMensal
  );
  const variacaoQtd = Math.round(
    projetado.totalFuncionarios - baseline.totalFuncionarios
  );

  const variacaoCustoPercentual = calcPercent(
    baseline.custoMensal,
    projetado.custoMensal
  );
  const variacaoQtdPercentual = calcPercent(
    baseline.totalFuncionarios,
    projetado.totalFuncionarios
  );

  const perUnit = buildPerUnitAnalysis(h);
  const perCargo = buildPerCargoAnalysis(h);

  const wfDetalhamento = buildWaterfallBaselineToProjetado(perUnit);

  return {
    baseline: {
      custoMensal: roundBRL(baseline.custoMensal),
      totalFuncionarios: Math.round(baseline.totalFuncionarios),
    },
    atual: {
      custoMensal: roundBRL(atual.custoMensal),
      totalFuncionarios: Math.round(atual.totalFuncionarios),
    },
    projetado: {
      custoMensal: roundBRL(projetado.custoMensal),
      totalFuncionarios: Math.round(projetado.totalFuncionarios),
    },
    variacoesBaselineParaProjetado: {
      variacaoCustoReais,
      variacaoCustoPercentual,
      variacaoQtd,
      variacaoQtdPercentual,
    },
    waterfallsDetalhamento: wfDetalhamento,
    analisePorSetorUnidade: perUnit,
    variacoesPorCargo: perCargo,
  };
}

function buildRankings(hospitais: HospitalComputed[]) {
  const custo = hospitais
    .map((h) => {
      const atual = h.atual.custoMensal;
      const proj = h.projetado.custoMensal;
      const variacaoReais = roundBRL(proj - atual);
      const variacaoPercentual = calcPercent(atual, proj);
      return {
        hospitalId: h.hospitalId,
        hospitalNome: h.hospitalNome,
        variacaoPercentual,
        variacaoReais,
      };
    })
    .sort((a, b) => b.variacaoPercentual - a.variacaoPercentual);

  const quantidade = hospitais
    .map((h) => {
      const atual = h.atual.totalFuncionarios;
      const proj = h.projetado.totalFuncionarios;
      const variacaoReais = Math.round(proj - atual);
      const variacaoPercentual = calcPercent(atual, proj);
      return {
        hospitalId: h.hospitalId,
        hospitalNome: h.hospitalNome,
        variacaoPercentual,
        variacaoReais,
      };
    })
    .sort((a, b) => b.variacaoPercentual - a.variacaoPercentual);

  return {
    hospitaisVariacaoCustoPercentual: custo,
    hospitaisVariacaoQuantidadePercentual: quantidade,
  };
}

function buildPerUnitAnalysis(h: HospitalComputed) {
  const baselineUnits = extractUnitsFromSnapshot(h.snapshot);
  const atualUnits = extractUnitsFromSituacaoRaw(h.situacaoAtualRaw);
  const projUnits = extractUnitsFromProjetado(h.snapshot);

  const allUnitIds = new Set<string>([
    ...baselineUnits.keys(),
    ...atualUnits.keys(),
    ...projUnits.keys(),
  ]);

  const items = Array.from(allUnitIds)
    .map((unidadeId) => {
      const b = baselineUnits.get(unidadeId) || {
        unidadeNome: "Unidade",
        tipo: "INTERNACAO" as const,
        custoMensal: 0,
        qtd: 0,
      };
      const a = atualUnits.get(unidadeId) || { custoMensal: 0, qtd: 0 };
      const p = projUnits.get(unidadeId) || { custoMensal: 0, qtd: 0 };

      const variacaoCustoReais = roundBRL(p.custoMensal - b.custoMensal);
      const variacaoCustoPercentual = calcPercent(b.custoMensal, p.custoMensal);
      const variacaoQtd = Math.round(p.qtd - b.qtd);
      const variacaoQtdPercentual = calcPercent(b.qtd, p.qtd);

      return {
        unidadeId,
        unidadeNome: b.unidadeNome,
        tipo: b.tipo,
        baseline: {
          custoMensal: roundBRL(b.custoMensal),
          qtd: Math.round(b.qtd),
        },
        atual: { custoMensal: roundBRL(a.custoMensal), qtd: Math.round(a.qtd) },
        projetado: {
          custoMensal: roundBRL(p.custoMensal),
          qtd: Math.round(p.qtd),
        },
        variacaoCustoReais,
        variacaoCustoPercentual,
        variacaoQtd,
        variacaoQtdPercentual,
      };
    })
    .sort((x, y) => x.unidadeNome.localeCompare(y.unidadeNome));

  return items;
}

function buildWaterfallBaselineToProjetado(
  perUnit: Array<{
    baseline: { custoMensal: number; qtd: number };
    projetado: { custoMensal: number; qtd: number };
  }>
) {
  const baselineCusto = perUnit.reduce(
    (s, u) => s + (u.baseline.custoMensal || 0),
    0
  );
  const baselineQtd = perUnit.reduce((s, u) => s + (u.baseline.qtd || 0), 0);
  const projCusto = perUnit.reduce(
    (s, u) => s + (u.projetado.custoMensal || 0),
    0
  );
  const projQtd = perUnit.reduce((s, u) => s + (u.projetado.qtd || 0), 0);

  let aumentosCusto = 0;
  let reducoesCusto = 0;
  let aumentosQtd = 0;
  let reducoesQtd = 0;

  for (const u of perUnit) {
    const dc = (u.projetado.custoMensal || 0) - (u.baseline.custoMensal || 0);
    const dq = (u.projetado.qtd || 0) - (u.baseline.qtd || 0);
    if (dc >= 0) aumentosCusto += dc;
    else reducoesCusto += dc;
    if (dq >= 0) aumentosQtd += dq;
    else reducoesQtd += dq;
  }

  return {
    custoMensal: [
      { name: "Baseline", value: roundBRL(baselineCusto) },
      { name: "Aumentos", value: roundBRL(aumentosCusto) },
      { name: "Reduções", value: roundBRL(reducoesCusto) },
      { name: "Projetado", value: roundBRL(projCusto) },
    ],
    quantidade: [
      { name: "Baseline", value: Math.round(baselineQtd) },
      { name: "Aumentos", value: Math.round(aumentosQtd) },
      { name: "Reduções", value: Math.round(reducoesQtd) },
      { name: "Projetado", value: Math.round(projQtd) },
    ],
  };
}

function buildPerCargoAnalysis(h: HospitalComputed) {
  const baselineByCargo = extractBaselineCargoTotals(h.snapshot);
  const atualByCargo = extractAtualCargoTotals(h.situacaoAtualRaw);
  const projetadoByCargo = extractProjetadoCargoTotals(h.snapshot);

  const cargoIds = new Set<string>([
    ...baselineByCargo.keys(),
    ...atualByCargo.keys(),
    ...projetadoByCargo.keys(),
  ]);

  const itens = Array.from(cargoIds)
    .map((cargoId) => {
      const b = baselineByCargo.get(cargoId) || {
        cargoNome: "Cargo",
        qtd: 0,
        custoMensal: 0,
      };
      const a = atualByCargo.get(cargoId) || { qtd: 0, custoMensal: 0 };
      const p = projetadoByCargo.get(cargoId) || {
        cargoNome: "Cargo",
        qtd: 0,
        custoMensal: 0,
      };

      const bCusto = Number(b.custoMensal || 0);
      const pCusto = Number(p.custoMensal || 0);

      return {
        cargoId,
        cargoNome: b.cargoNome || p.cargoNome || "Cargo",
        baseline: { qtd: Math.round(b.qtd), custoMensal: roundBRL(bCusto) },
        atual: { qtd: Math.round(a.qtd), custoMensal: roundBRL(a.custoMensal) },
        projetado: { qtd: Math.round(p.qtd), custoMensal: roundBRL(pCusto) },
        variacaoQtd: Math.round(p.qtd - b.qtd),
        variacaoCustoReais: roundBRL(pCusto - bCusto),
      };
    })
    .sort((a, b) => b.variacaoCustoReais - a.variacaoCustoReais);

  const custoMensalWaterfallPorCargo = buildCargoWaterfall(itens, "custo");
  const quantidadeWaterfallPorCargo = buildCargoWaterfall(itens, "qtd");

  return {
    itens,
    chartData: {
      custoMensalWaterfallPorCargo,
      quantidadeWaterfallPorCargo,
    },
  };
}

function buildCargoWaterfall(
  itens: Array<{
    cargoNome: string;
    baseline: { qtd: number; custoMensal: number };
    projetado: { qtd: number; custoMensal: number };
    variacaoQtd: number;
    variacaoCustoReais: number;
  }>,
  kind: "custo" | "qtd"
) {
  const baselineValue = itens.reduce(
    (s, i) => s + (kind === "custo" ? i.baseline.custoMensal : i.baseline.qtd),
    0
  );
  const projValue = itens.reduce(
    (s, i) =>
      s + (kind === "custo" ? i.projetado.custoMensal : i.projetado.qtd),
    0
  );

  const steps = [{ name: "Baseline", value: roundBRL(baselineValue) }];
  for (const i of itens) {
    const delta = kind === "custo" ? i.variacaoCustoReais : i.variacaoQtd;
    if (delta === 0) continue;
    steps.push({ name: i.cargoNome, value: roundBRL(delta) });
  }
  steps.push({ name: "Projetado", value: roundBRL(projValue) });
  return steps;
}

function extractUnitsFromSituacaoRaw(situacaoAtual: any) {
  const map = new Map<string, { custoMensal: number; qtd: number }>();
  const unidades: any[] = situacaoAtual?.unidades || [];
  for (const u of unidades) {
    const unidadeId = u?.unidadeId;
    if (!unidadeId) continue;
    map.set(unidadeId, {
      custoMensal: Number(u?.custoTotal || 0),
      qtd: Number(u?.totalFuncionarios || 0),
    });
  }
  return map;
}

function extractAtualCargoTotals(situacaoAtual: any) {
  const map = new Map<string, { qtd: number; custoMensal: number }>();
  const unidades: any[] = situacaoAtual?.unidades || [];

  for (const u of unidades) {
    for (const c of u?.cargos || []) {
      const cargoId = c?.cargoId;
      if (!cargoId) continue;
      const qtd = Number(c?.quantidadeFuncionarios || 0);
      const custo = Number(c?.custoTotal || 0);
      if (!map.has(cargoId)) map.set(cargoId, { qtd: 0, custoMensal: 0 });
      const e = map.get(cargoId)!;
      e.qtd += qtd;
      e.custoMensal += custo;
    }
  }

  return map;
}

function extractUnitsFromSnapshot(h: SnapshotDimensionamento) {
  const dados: any = h.dados || {};
  const intern: any[] = dados.internation || dados.internacao || [];
  const assist: any[] = dados.assistance || dados.naoInternacao || [];

  const map = new Map<
    string,
    {
      unidadeNome: string;
      tipo: "INTERNACAO" | "NAO_INTERNACAO";
      custoMensal: number;
      qtd: number;
    }
  >();

  for (const u of intern) {
    map.set(u.id, {
      unidadeNome: u.name || u.nome || "Unidade",
      tipo: "INTERNACAO",
      custoMensal: moneySnapshotToBRL(u.costAmount),
      qtd: sumStaffSnapshot(u.staff),
    });
  }
  for (const u of assist) {
    map.set(u.id, {
      unidadeNome: u.name || u.nome || "Unidade",
      tipo: "NAO_INTERNACAO",
      custoMensal: moneySnapshotToBRL(u.costAmount),
      qtd: sumStaffSnapshot(u.staff),
    });
  }

  return map;
}

function extractUnitsFromProjetado(h: SnapshotDimensionamento) {
  const projetado = (h.dados as any)?.projetadoFinal;
  const map = new Map<string, { custoMensal: number; qtd: number }>();
  if (!projetado) return map;

  for (const u of projetado.internacao || []) {
    const unidadeId = u.unidadeId;
    if (!unidadeId) continue;
    map.set(unidadeId, {
      custoMensal: moneyProjetadoToBRL(u.custoTotalUnidade),
      qtd: sumProjetadoInternacao(u),
    });
  }
  for (const u of projetado.naoInternacao || []) {
    const unidadeId = u.unidadeId;
    if (!unidadeId) continue;
    map.set(unidadeId, {
      custoMensal: moneyProjetadoToBRL(u.custoTotalUnidade),
      qtd: sumProjetadoNaoInternacao(u),
    });
  }
  return map;
}

function extractBaselineCargoTotals(snapshot: SnapshotDimensionamento) {
  const dados: any = snapshot.dados || {};
  const intern: any[] = dados.internation || dados.internacao || [];
  const assist: any[] = dados.assistance || dados.naoInternacao || [];

  const map = new Map<
    string,
    { cargoNome: string; qtd: number; custoMensal: number }
  >();

  const consumeUnit = (unit: any) => {
    const staff: any[] = unit?.staff;
    if (!Array.isArray(staff) || staff.length === 0) return;

    // Garante que o somatório por cargo feche com o custo total da unidade no snapshot.
    const unitTotal = moneySnapshotToBRL(unit?.costAmount);

    let rawSum = 0;
    const rawItems: Array<{
      cargoId: string;
      cargoNome: string;
      qtd: number;
      rawCost: number;
    }> = [];

    for (const s of staff) {
      const cargoId = s?.id;
      if (!cargoId) continue;
      const qtd = Number(s?.quantity || 0);
      const cargoNome = s?.role || "Cargo";

      const rawCost =
        s?.totalCost != null
          ? moneySnapshotToBRL(s.totalCost)
          : moneySnapshotToBRL(s?.unitCost) * qtd;

      rawItems.push({ cargoId, cargoNome, qtd, rawCost });
      rawSum += rawCost;
    }

    const factor = rawSum > 0 ? unitTotal / rawSum : 1;

    for (const it of rawItems) {
      if (!map.has(it.cargoId)) {
        map.set(it.cargoId, {
          cargoNome: it.cargoNome,
          qtd: 0,
          custoMensal: 0,
        });
      }
      const e = map.get(it.cargoId)!;
      e.qtd += it.qtd;
      e.custoMensal += it.rawCost * factor;
      if (!e.cargoNome && it.cargoNome) e.cargoNome = it.cargoNome;
    }
  };

  for (const u of intern) consumeUnit(u);
  for (const u of assist) consumeUnit(u);

  for (const e of map.values()) {
    e.qtd = Math.round(e.qtd);
    e.custoMensal = roundBRL(e.custoMensal);
  }

  return map;
}

function extractProjetadoCargoTotals(snapshot: SnapshotDimensionamento) {
  const proj = (snapshot.dados as any)?.projetadoFinal;
  const map = new Map<
    string,
    { cargoNome: string; qtd: number; custoMensal: number }
  >();
  if (!proj) return map;

  const consumeProjetadoUnit = (unit: any, staffItems: any[]) => {
    if (!Array.isArray(staffItems) || staffItems.length === 0) return;

    const unitTotal = moneyProjetadoToBRL(unit?.custoTotalUnidade);
    let rawSum = 0;
    const rawItems: Array<{
      cargoId: string;
      cargoNome: string;
      qtd: number;
      rawCost: number;
    }> = [];

    for (const c of staffItems) {
      const cargoId = c?.cargoId;
      if (!cargoId) continue;
      const qtd = Number(c?.projetadoFinal || 0);
      const rawCost = moneyProjetadoToBRL(c?.custoTotal);
      const cargoNome = c?.cargoNome || c?.nome || "Cargo";
      rawItems.push({ cargoId, cargoNome, qtd, rawCost });
      rawSum += rawCost;
    }

    const factor = rawSum > 0 ? unitTotal / rawSum : 1;

    for (const it of rawItems) {
      if (!map.has(it.cargoId)) {
        map.set(it.cargoId, {
          cargoNome: it.cargoNome,
          qtd: 0,
          custoMensal: 0,
        });
      }
      const e = map.get(it.cargoId)!;
      e.qtd += it.qtd;
      e.custoMensal += it.rawCost * factor;
      if (!e.cargoNome && it.cargoNome) e.cargoNome = it.cargoNome;
    }
  };

  for (const u of proj.internacao || []) {
    consumeProjetadoUnit(u, u.cargos || []);
  }

  for (const u of proj.naoInternacao || []) {
    // não-internação vem por sítios. Importante: `custoTotalUnidade` é o total da unidade,
    // então precisamos consolidar os cargos de TODOS os sítios e aplicar o rateio UMA vez.
    const combined: any[] = [];
    for (const s of u.sitios || []) {
      for (const c of s.cargos || []) combined.push(c);
    }
    consumeProjetadoUnit(u, combined);
  }

  for (const e of map.values()) {
    e.qtd = Math.round(e.qtd);
    e.custoMensal = roundBRL(e.custoMensal);
  }

  return map;
}

function pickLatestSnapshotPerHospital(snapshots: SnapshotDimensionamento[]) {
  const map = new Map<string, SnapshotDimensionamento>();
  for (const s of snapshots || []) {
    const existing = map.get(s.hospitalId);
    if (!existing || new Date(s.dataHora) > new Date(existing.dataHora)) {
      map.set(s.hospitalId, s);
    }
  }
  return map;
}

function pickRedeSnapshotInfo(hospitais: HospitalComputed[]) {
  let latest: SnapshotDimensionamento | null = null;
  for (const h of hospitais) {
    if (!latest || new Date(h.snapshot.dataHora) > new Date(latest.dataHora)) {
      latest = h.snapshot;
    }
  }
  return latest;
}

function computeBaselineFromSnapshot(
  snapshot: SnapshotDimensionamento
): MoneyAndCount {
  const dados: any = snapshot.dados || {};
  const intern: any[] = dados.internation || dados.internacao || [];
  const assist: any[] = dados.assistance || dados.naoInternacao || [];
  const neutral: any[] = dados.neutral || [];

  const internCost = intern.reduce(
    (s, u) => s + moneySnapshotToBRL(u.costAmount),
    0
  );
  const assistCost = assist.reduce(
    (s, u) => s + moneySnapshotToBRL(u.costAmount),
    0
  );
  const neutralCost = neutral.reduce(
    (s, u) => s + moneySnapshotToBRL(u.costAmount),
    0
  );

  const internQtd = intern.reduce((s, u) => s + sumStaffSnapshot(u.staff), 0);
  const assistQtd = assist.reduce((s, u) => s + sumStaffSnapshot(u.staff), 0);

  return {
    custoMensal: roundBRL(internCost + assistCost + neutralCost),
    totalFuncionarios: Math.round(internQtd + assistQtd),
    internacao: {
      custoMensal: roundBRL(internCost),
      totalFuncionarios: Math.round(internQtd),
    },
    naoInternacao: {
      custoMensal: roundBRL(assistCost),
      totalFuncionarios: Math.round(assistQtd),
    },
  };
}

function computeAtualFromSituacao(situacaoAtual: any): MoneyAndCount {
  const unidades: any[] = situacaoAtual?.unidades || [];
  const neutras: any[] = situacaoAtual?.unidadesNeutras || [];

  const intern = unidades.filter((u) => u.tipo === "INTERNACAO");
  const naoIntern = unidades.filter((u) => u.tipo === "NAO_INTERNACAO");

  const internCost = intern.reduce((s, u) => s + Number(u.custoTotal || 0), 0);
  const naoInternCost = naoIntern.reduce(
    (s, u) => s + Number(u.custoTotal || 0),
    0
  );
  const neutrasCost = neutras.reduce(
    (s, u) => s + Number(u.custoTotal || 0),
    0
  );

  const internQtd = intern.reduce(
    (s, u) => s + Number(u.totalFuncionarios || 0),
    0
  );
  const naoInternQtd = naoIntern.reduce(
    (s, u) => s + Number(u.totalFuncionarios || 0),
    0
  );

  return {
    custoMensal: roundBRL(internCost + naoInternCost + neutrasCost),
    totalFuncionarios: Math.round(internQtd + naoInternQtd),
    internacao: {
      custoMensal: roundBRL(internCost),
      totalFuncionarios: Math.round(internQtd),
    },
    naoInternacao: {
      custoMensal: roundBRL(naoInternCost),
      totalFuncionarios: Math.round(naoInternQtd),
    },
  };
}

function computeProjetadoFromSnapshot(
  snapshot: SnapshotDimensionamento,
  situacaoAtual?: any
): MoneyAndCount {
  const proj = (snapshot.dados as any)?.projetadoFinal;
  if (!proj) {
    return {
      custoMensal: 0,
      totalFuncionarios: 0,
      internacao: { custoMensal: 0, totalFuncionarios: 0 },
      naoInternacao: { custoMensal: 0, totalFuncionarios: 0 },
    };
  }

  const internCost = (proj.internacao || []).reduce(
    (s: number, u: any) => s + moneyProjetadoToBRL(u.custoTotalUnidade),
    0
  );
  const naoInternCost = (proj.naoInternacao || []).reduce(
    (s: number, u: any) => s + moneyProjetadoToBRL(u.custoTotalUnidade),
    0
  );

  const internQtd = (proj.internacao || []).reduce(
    (s: number, u: any) => s + sumProjetadoInternacao(u),
    0
  );
  const naoInternQtd = (proj.naoInternacao || []).reduce(
    (s: number, u: any) => s + sumProjetadoNaoInternacao(u),
    0
  );

  // Buscar custo das unidades neutras:
  // 1. Tenta do projetadoFinal.neutras (snapshots novos)
  // 2. Fallback: busca do baseline snapshot.dados.neutral (snapshots antigos)
  let neutrasCost = 0;

  if (Array.isArray(proj.neutras) && proj.neutras.length > 0) {
    // Snapshots novos: usa projetadoFinal.neutras
    neutrasCost = (proj.neutras as any[]).reduce(
      (s, u) => s + moneyProjetadoToBRL(u?.custoTotal || 0),
      0
    );
  } else {
    // Snapshots antigos: busca do baseline (snapshot.dados.neutral)
    const neutral = (snapshot.dados as any)?.neutral;
    if (Array.isArray(neutral) && neutral.length > 0) {
      neutrasCost = (neutral as any[]).reduce(
        (s, u) => s + moneySnapshotToBRL(u?.costAmount || 0),
        0
      );
    }
  }

  return {
    custoMensal: roundBRL(internCost + naoInternCost + neutrasCost),
    totalFuncionarios: Math.round(internQtd + naoInternQtd),
    internacao: {
      custoMensal: roundBRL(internCost),
      totalFuncionarios: Math.round(internQtd),
    },
    naoInternacao: {
      custoMensal: roundBRL(naoInternCost),
      totalFuncionarios: Math.round(naoInternQtd),
    },
  };
}

function sumMoneyAndCount(items: MoneyAndCount[]): MoneyAndCount {
  return items.reduce(
    (acc, it) => {
      acc.custoMensal += it.custoMensal;
      acc.totalFuncionarios += it.totalFuncionarios;
      acc.internacao.custoMensal += it.internacao.custoMensal;
      acc.internacao.totalFuncionarios += it.internacao.totalFuncionarios;
      acc.naoInternacao.custoMensal += it.naoInternacao.custoMensal;
      acc.naoInternacao.totalFuncionarios += it.naoInternacao.totalFuncionarios;
      return acc;
    },
    {
      custoMensal: 0,
      totalFuncionarios: 0,
      internacao: { custoMensal: 0, totalFuncionarios: 0 },
      naoInternacao: { custoMensal: 0, totalFuncionarios: 0 },
    }
  );
}

function moneySnapshotToBRL(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") {
    // snapshots geralmente armazenam custo em centavos (inteiro)
    if (Number.isFinite(v) && Number.isInteger(v) && Math.abs(v) > 1000) {
      return v / 100;
    }
    // fallback: já está em reais
    return v;
  }
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function moneyProjetadoToBRL(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") {
    // Importante: o projetado (snapshot.dados.projetadoFinal) é anexado APÓS a sanitização
    // na criação do snapshot e, portanto, fica tipicamente em REAIS (float).
    // Para replicar o comportamento de GET /snapshot/hospital/:hospitalId/selecionado,
    // tratamos esses valores como BRL e não aplicamos heurística de centavos.
    return Number.isFinite(v) ? v : 0;
  }
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function sumStaffSnapshot(staff: any[]): number {
  if (!Array.isArray(staff)) return 0;
  return staff.reduce((s, r) => s + Number(r?.quantity || 0), 0);
}

function sumProjetadoInternacao(u: any): number {
  const cargos = u?.cargos || [];
  if (!Array.isArray(cargos)) return 0;
  return cargos.reduce(
    (s: number, c: any) => s + Number(c?.projetadoFinal || 0),
    0
  );
}

function sumProjetadoNaoInternacao(u: any): number {
  const sitios = u?.sitios || [];
  if (!Array.isArray(sitios)) return 0;
  let sum = 0;
  for (const s of sitios) {
    const cargos = s?.cargos || [];
    if (!Array.isArray(cargos)) continue;
    for (const c of cargos) sum += Number(c?.projetadoFinal || 0);
  }
  return sum;
}

function extractStaffAtualizadoEm(situacaoAtual: any): Date | null {
  const unidades: any[] = situacaoAtual?.unidades || [];
  let max: Date | null = null;
  for (const u of unidades) {
    for (const c of u?.cargos || []) {
      const d = c?.quantidadeAtualizadaEm;
      if (!d) continue;
      const dt = new Date(d);
      if (!max || dt > max) max = dt;
    }
  }
  return max;
}

function computeStaffRange(hospitais: HospitalComputed[]) {
  const dates = hospitais
    .map((h) => h.staffAtualizadoEm)
    .filter((d): d is Date => !!d);

  const maisRecente = dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : null;
  const maisAntigo = dates.length
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : null;

  return {
    maisRecenteEm: maisRecente?.toISOString() || null,
    maisAntigoEm: maisAntigo?.toISOString() || null,
    labelMaisRecente: maisRecente ? formatDatePtBr(maisRecente) : null,
    labelMaisAntigo: maisAntigo ? formatDatePtBr(maisAntigo) : null,
  };
}

function formatDatePtBr(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

function roundBRL(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function calcPercent(base: number, target: number) {
  const b = Number(base || 0);
  const t = Number(target || 0);
  if (b === 0) return t === 0 ? 0 : 100;
  return Number((((t - b) / b) * 100).toFixed(1));
}
