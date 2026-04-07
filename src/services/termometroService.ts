import { DataSource, In } from "typeorm";
import { DateTime } from "luxon";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { LeitosStatus } from "../entities/LeitosStatus";
import { HistoricoLeitosStatus } from "../entities/HistoricoLeitosStatus";
import { Leito, StatusLeito } from "../entities/Leito";

import {
  AvaliacaoSCP,
  StatusSessaoAvaliacao,
} from "../entities/AvaliacaoSCP";
import { OccupationAnalysisService } from "./occupationAnalysisService";

const SAO_PAULO_TZ = "America/Sao_Paulo";

const NIVEL_LABELS: Record<string, string> = {
  MINIMOS: "Mínimos",
  INTERMEDIARIOS: "Intermediários",
  ALTA_DEPENDENCIA: "Alta Dependência",
  SEMI_INTENSIVOS: "Semi-Intensivos",
  INTENSIVOS: "Intensivos",
};

const MES_PT = [
  "JAN","FEV","MAR","ABR","MAI","JUN",
  "JUL","AGO","SET","OUT","NOV","DEZ",
];

const NIVEIS_ORDER = [
  "MINIMOS",
  "INTERMEDIARIOS",
  "ALTA_DEPENDENCIA",
  "SEMI_INTENSIVOS",
  "INTENSIVOS",
];

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return parseFloat(((num / den) * 100).toFixed(2));
}

export class TermometroService {
  private occupationService: OccupationAnalysisService;

  constructor(private ds: DataSource) {
    this.occupationService = new OccupationAnalysisService(ds);
  }

  // ─────────────────────────────────────────────────
  // 1. GLOBAL
  // ─────────────────────────────────────────────────
  async global(hospitalId: string) {
    const agoraSP = DateTime.now().setZone(SAO_PAULO_TZ);
    const ontemSPStr = agoraSP.minus({ days: 1 }).toFormat("yyyy-MM-dd");

    // Unidades do hospital
    const unidades = await this.ds.getRepository(UnidadeInternacao).find({
      where: { hospital: { id: hospitalId } },
    });
    if (unidades.length === 0) return this._emptyGlobal(agoraSP);

    const unidadeIds = unidades.map((u) => u.id);

    // Leitos reais (fonte: tabela leitos)
    const todosLeitos = await this.ds.getRepository(Leito).find({
      where: unidadeIds.map((id) => ({ unidade: { id } })),
      relations: ["unidade"],
    });

    // Sessões ativas (fonte direta: AvaliacaoSCP com statusSessao ATIVA)
    const sessoesAtivas = await this.ds.getRepository(AvaliacaoSCP).find({
      where: unidadeIds.map((id) => ({
        unidade: { id },
        statusSessao: StatusSessaoAvaliacao.ATIVA,
      })),
      relations: ["unidade", "leito"],
    });

    // HistoricoLeitosStatus de ontem (latest record per unit)
    const historicoOntem = await this._latestHistoricoByDay(unidadeIds, ontemSPStr);

    // ── Aggregate ──
    let totalLeitos = 0;
    let totalOcupados = 0;
    let totalPendentes = 0;

    // Niveis acumulados
    const niveisAcum: Record<string, number> = {
      MINIMOS: 0, INTERMEDIARIOS: 0, ALTA_DEPENDENCIA: 0,
      SEMI_INTENSIVOS: 0, INTENSIVOS: 0,
    };

    // Por setor — computed from leitos + sessões
    const setoresOcupacaoMap = new Map<string, { nome: string; hoje: number; ontem: number }>();
    const setoresDesvioMap = new Map<string, { nome: string; subutilizacao: number; risco: number }>();

    // Niveis por setor (para ranking)
    const niveisPorUnidade = new Map<string, Record<string, number>>();

    for (const u of unidades) {
      const ontem = historicoOntem.get(u.id);

      // Leitos da unidade
      const leitosUnidade = todosLeitos.filter((l) => l.unidade?.id === u.id);
      const bedCount = leitosUnidade.length;
      const pendentes = leitosUnidade.filter((l) => l.status === StatusLeito.PENDENTE).length;

      // Sessões ativas da unidade
      const sessoesDaUnidade = sessoesAtivas.filter(
        (s) => s.unidade?.id === u.id
      );
      const evaluated = sessoesDaUnidade.length;

      totalLeitos += bedCount;
      totalOcupados += evaluated;
      totalPendentes += pendentes;

      // Niveis da unidade (direto das sessões ativas)
      const niveisUnidade: Record<string, number> = {
        MINIMOS: 0, INTERMEDIARIOS: 0, ALTA_DEPENDENCIA: 0,
        SEMI_INTENSIVOS: 0, INTENSIVOS: 0,
      };
      for (const s of sessoesDaUnidade) {
        if (s.classificacao && niveisUnidade[s.classificacao] !== undefined) {
          niveisUnidade[s.classificacao]++;
        }
      }
      niveisPorUnidade.set(u.id, niveisUnidade);

      // Somar ao acumulado global
      for (const [nivel, qtd] of Object.entries(niveisUnidade)) {
        niveisAcum[nivel] += qtd;
      }

      // Taxa hoje vs ontem
      const taxaHoje = pct(evaluated, bedCount);
      const taxaOntem = ontem ? pct(ontem.evaluated, ontem.bedCount) : 0;
      setoresOcupacaoMap.set(u.id, { nome: u.nome, hoje: taxaHoje, ontem: taxaOntem });

      // Desvios: precisa de pontuacao_min/max na unidade
      const pontuacaoMin =
        u.pontuacao_min != null ? Number(u.pontuacao_min) : null;
      const pontuacaoMax =
        u.pontuacao_max != null ? Number(u.pontuacao_max) : null;
      const temIntervalo = pontuacaoMin !== null && pontuacaoMax !== null;

      let subutilizacao = 0;
      let risco = 0;
      if (temIntervalo) {
        for (const s of sessoesDaUnidade) {
          if (s.totalPontos < pontuacaoMin!) subutilizacao++;
          else if (s.totalPontos > pontuacaoMax!) risco++;
        }
      }
      setoresDesvioMap.set(u.id, { nome: u.nome, subutilizacao, risco });
    }

    // Indicadores globais
    const taxaOcupacaoHospital = pct(totalOcupados, totalLeitos);
    // Leitos avaliados = leitos que NÃO estão pendentes OU que têm sessão ativa
    const leitosComSessao = new Set(sessoesAtivas.map((s) => s.leito?.id).filter(Boolean));
    const leitosAvaliadosCount = todosLeitos.filter(
      (l) => l.status !== StatusLeito.PENDENTE || leitosComSessao.has(l.id)
    ).length;
    const leitosAvaliadosHospital = pct(leitosAvaliadosCount, totalLeitos);

    const totalPacientes = Object.values(niveisAcum).reduce((a, b) => a + b, 0);

    // Nivel predominante
    let nivelPredominante = "Sem avaliações";
    if (totalPacientes > 0) {
      let maxNivel = -1;
      for (const [nivel, qtd] of Object.entries(niveisAcum)) {
        if (qtd > maxNivel) { maxNivel = qtd; nivelPredominante = NIVEL_LABELS[nivel]; }
      }
    }

    // desviosPerfil
    let desviosPerfil = 0;
    for (const d of setoresDesvioMap.values()) {
      desviosPerfil += d.subutilizacao + d.risco;
    }

    // Niveis com % e ranking de setores
    const niveis = NIVEIS_ORDER.map((nivel) => {
      const totalNivel = niveisAcum[nivel];
      const percentualTotal = pct(totalNivel, totalPacientes);

      // ranking de setores neste nivel
      const setoresRanking: Array<{ nome: string; percentual: number }> = [];
      for (const u of unidades) {
        const niveisU = niveisPorUnidade.get(u.id);
        const qtdNivelNaUnidade = niveisU?.[nivel] ?? 0;
        const totalNaUnidade = niveisU
          ? Object.values(niveisU).reduce((a, b) => a + b, 0)
          : 0;
        setoresRanking.push({
          nome: u.nome,
          percentual: pct(qtdNivelNaUnidade, totalNaUnidade),
        });
      }
      setoresRanking.sort((a, b) => b.percentual - a.percentual);

      return {
        nivel,
        label: NIVEL_LABELS[nivel],
        totalPacientes: totalNivel,
        percentualTotal,
        setores: setoresRanking,
      };
    });

    return {
      taxaOcupacaoHospital,
      leitosAvaliadosHospital,
      data: agoraSP.toFormat("dd/MM/yyyy"),
      nivelPredominante,
      desviosPerfil,
      setoresOcupacao: [...setoresOcupacaoMap.values()],
      setoresDesvio: [...setoresDesvioMap.values()],
      niveis,
    };
  }

  // ─────────────────────────────────────────────────
  // 2. DETALHAMENTO
  // ─────────────────────────────────────────────────
  async detalhamento(
    hospitalId: string,
    setorId?: string,
    dataInicial?: string,
    dataFinal?: string
  ) {
    const agoraSP = DateTime.now().setZone(SAO_PAULO_TZ);
    const di = dataInicial ?? agoraSP.toFormat("yyyy-MM-dd");
    const df = dataFinal ?? agoraSP.toFormat("yyyy-MM-dd");

    // Unidades
    const whereUnidade: any = { hospital: { id: hospitalId } };
    if (setorId) whereUnidade.id = setorId;
    const unidades = await this.ds.getRepository(UnidadeInternacao).find({
      where: whereUnidade,
      relations: ["scpMetodo"],
    });
    const todas = await this.ds.getRepository(UnidadeInternacao).find({
      where: { hospital: { id: hospitalId } },
    });

    if (unidades.length === 0) return this._emptyDetalhamento(todas);

    const unidadeIds = unidades.map((u) => u.id);
    const agoraDiaSP = agoraSP.toFormat("yyyy-MM-dd");
    const isTodayOnly = di === df && di === agoraDiaSP;

    // Leitos reais (fonte de verdade para contagens)
    const leitosAll = await this.ds.getRepository(Leito).find({
      where: { unidade: { id: In(unidadeIds) } },
    });
    const totalLeitos = leitosAll.length;
    const totalPendLeito = leitosAll.filter((l) => l.status === StatusLeito.PENDENTE).length;
    const totalInacLeito = leitosAll.filter((l) => l.status === StatusLeito.INATIVO).length;
    const totalVacLeito  = leitosAll.filter((l) => l.status === StatusLeito.VAGO).length;

    // HistoricoLeitosStatus no período para taxaOcupacaoMedia e leitosAvaliadosPerc
    const historico = await this.ds
      .getRepository(HistoricoLeitosStatus)
      .createQueryBuilder("h")
      .leftJoinAndSelect("h.unidade", "unidade")
      .where("h.unidade_id IN (:...ids)", { ids: unidadeIds })
      .andWhere(
        "DATE(h.data AT TIME ZONE 'America/Sao_Paulo') BETWEEN :di AND :df",
        { di, df }
      )
      .getMany();

    // Total de avaliações SCP no período
    const totalAvaliacoes = await this.ds
      .getRepository(AvaliacaoSCP)
      .createQueryBuilder("a")
      .where("a.unidade IN (:...ids)", { ids: unidadeIds })
      .andWhere("a.dataAplicacao BETWEEN :di AND :df", { di, df })
      .getCount();

    // Sessões ativas (para "hoje") e avaliações do período (para range)
    const sessoesAtivas = await this.ds.getRepository(AvaliacaoSCP).find({
      where: unidadeIds.map((id) => ({
        unidade: { id },
        statusSessao: StatusSessaoAvaliacao.ATIVA,
      })),
      relations: ["unidade", "leito"],
    });

    // Avaliações do período (para desvios + níveis quando range > hoje)
    const avalsPeriodo = isTodayOnly
      ? sessoesAtivas
      : await this.ds.getRepository(AvaliacaoSCP).find({
          where: unidadeIds.map((id) => ({
            unidade: { id },
          })),
          relations: ["unidade", "leito"],
        }).then((all) =>
          all.filter(
            (a) => a.dataAplicacao >= di && a.dataAplicacao <= df
          )
        );

    // Métricas de período
    let sumTaxa = 0;
    let sumAvaliados = 0;
    let countDays = 0;
    for (const h of historico) {
      sumTaxa     += totalLeitos > 0 ? pct(h.evaluated, totalLeitos) : 0;
      sumAvaliados += totalLeitos > 0 ? pct(h.evaluated, totalLeitos) : 0;
      countDays++;
    }
    // Para hoje sem histórico consolidado ainda, usa dados ao vivo
    const taxaOcupacaoMedia = isTodayOnly
      ? pct(sessoesAtivas.length, totalLeitos)
      : countDays > 0 ? parseFloat((sumTaxa / countDays).toFixed(2)) : 0;
    // Leitos avaliados = leitos não-pendentes OU com sessão ativa no período
    const leitosComSessaoSet = new Set(
      (isTodayOnly ? sessoesAtivas : avalsPeriodo)
        .map((a) => (a as any).leito?.id)
        .filter(Boolean)
    );
    const leitosAvaliadosCount = leitosAll.filter(
      (l) => l.status !== StatusLeito.PENDENTE || leitosComSessaoSet.has(l.id)
    ).length;
    const leitosAvaliadosPerc = pct(leitosAvaliadosCount, totalLeitos);

    // Metodo SCP (primeiro setor com scpMetodo definido, ou null)
    const metodoScp =
      unidades.find((u) => u.scpMetodo)?.scpMetodo?.key ?? null;

    // Desvios — usa avaliações do período, não apenas sessões ativas
    let totalDesvios = 0;
    let riscos = 0;
    let subutilizacao = 0;
    for (const u of unidades) {
      const pontuacaoMin = u.pontuacao_min != null ? Number(u.pontuacao_min) : null;
      const pontuacaoMax = u.pontuacao_max != null ? Number(u.pontuacao_max) : null;
      if (pontuacaoMin === null || pontuacaoMax === null) continue;
      const avalsDaUnidade = avalsPeriodo.filter((a) => a.unidade?.id === u.id);
      for (const a of avalsDaUnidade) {
        if (a.totalPontos < pontuacaoMin) { subutilizacao++; totalDesvios++; }
        else if (a.totalPontos > pontuacaoMax) { riscos++; totalDesvios++; }
      }
    }

    // Nivel predominante
    const niveisCount: Record<string, number> = {
      MINIMOS: 0, INTERMEDIARIOS: 0, ALTA_DEPENDENCIA: 0,
      SEMI_INTENSIVOS: 0, INTENSIVOS: 0,
    };
    for (const a of avalsPeriodo) {
      if (a.classificacao && niveisCount[a.classificacao] !== undefined) {
        niveisCount[a.classificacao]++;
      }
    }

    const totalNiveisCount = Object.values(niveisCount).reduce((a, b) => a + b, 0);
    let nivelPredominante = "SEM_AVALIACOES";
    if (totalNiveisCount > 0) {
      let maxCount = -1;
      for (const [n, c] of Object.entries(niveisCount)) {
        if (c > maxCount) { maxCount = c; nivelPredominante = n; }
      }
    }

    // estadosLeitos — hoje: dados ao vivo das sessões ativas; período: agrega historico
    let estadosLeitos: { name: string; value: number }[];
    if (isTodayOnly) {
      // Fonte de verdade: sessões ativas (fluxo novo) + status dos leitos
      const totalOcupado    = sessoesAtivas.length;
      const totalDisponivel = Math.max(0, totalLeitos - totalOcupado - totalVacLeito - totalInacLeito);
      estadosLeitos = [
        { name: "Leito Ocupado",      value: pct(totalOcupado,    totalLeitos) },
        { name: "Leito Não Avaliado", value: pct(totalDisponivel, totalLeitos) },
        { name: "Leito Inativo",      value: pct(totalInacLeito,  totalLeitos) },
        { name: "Leito Vago",         value: pct(totalVacLeito,   totalLeitos) },
      ];
    } else {
      // Fonte de verdade: HistoricoLeitosStatus agregado do período
      const histBed  = historico.reduce((s, h) => s + h.bedCount,  0) || totalLeitos || 1;
      const histEval = historico.reduce((s, h) => s + h.evaluated, 0);
      const histVac  = historico.reduce((s, h) => s + h.vacant,    0);
      const histInac = historico.reduce((s, h) => s + h.inactive,  0);
      const histPend = Math.max(0, histBed - histEval - histVac - histInac);
      estadosLeitos = [
        { name: "Leito Ocupado",      value: pct(histEval, histBed) },
        { name: "Leito Não Avaliado", value: pct(histPend, histBed) },
        { name: "Leito Inativo",      value: pct(histInac, histBed) },
        { name: "Leito Vago",         value: pct(histVac,  histBed) },
      ];
    }

    // niveisCuidado — usa mesma fonte de niveisCount
    const totalNiveis = Object.values(niveisCount).reduce((a, b) => a + b, 0) || 1;
    const niveisCuidado = [
      { name: "Cuidado Mínimo",        value: pct(niveisCount.MINIMOS,          totalNiveis), quantidade: niveisCount.MINIMOS },
      { name: "Cuidado Intermediário", value: pct(niveisCount.INTERMEDIARIOS,   totalNiveis), quantidade: niveisCount.INTERMEDIARIOS },
      { name: "Alta Dependência",      value: pct(niveisCount.ALTA_DEPENDENCIA, totalNiveis), quantidade: niveisCount.ALTA_DEPENDENCIA },
      { name: "Semi-Intensivo",        value: pct(niveisCount.SEMI_INTENSIVOS,  totalNiveis), quantidade: niveisCount.SEMI_INTENSIVOS },
      { name: "Intensivo",             value: pct(niveisCount.INTENSIVOS,       totalNiveis), quantidade: niveisCount.INTENSIVOS },
    ];

    // setores (para dropdown)
    const setoresList = [
      { id: null, nome: "Todos os setores" },
      ...todas.map((u) => ({ id: u.id, nome: u.nome })),
    ];

    return {
      taxaOcupacaoMedia,
      leitosAvaliadosPerc,
      totalLeitos,
      totalAvaliacoes,
      metodoScp,
      nivelPredominante,
      nivelPredominanteLabel: nivelPredominante === "SEM_AVALIACOES" ? "Sem avaliações" : (NIVEL_LABELS[nivelPredominante] ?? nivelPredominante),
      desvios: totalDesvios,
      riscos,
      subutilizacao,
      estadosLeitos,
      niveisCuidado,
      setores: setoresList,
    };
  }

  // ─────────────────────────────────────────────────
  // 3. SÉRIE HISTÓRICA
  // ─────────────────────────────────────────────────
  async serieHistorica(
    hospitalId: string,
    dataInicial: string,
    dataFinal: string,
    granularidade?: "dia" | "mes",
    setorId?: string
  ) {
    const di = DateTime.fromISO(dataInicial, { zone: SAO_PAULO_TZ });
    const df = DateTime.fromISO(dataFinal, { zone: SAO_PAULO_TZ });
    const diffDays = df.diff(di, "days").days;

    const gran: "dia" | "mes" =
      granularidade ?? (diffDays < 31 ? "dia" : "mes");

    // Unidades
    const whereUnidade: any = { hospital: { id: hospitalId } };
    if (setorId) whereUnidade.id = setorId;
    const unidades = await this.ds.getRepository(UnidadeInternacao).find({
      where: whereUnidade,
    });
    if (unidades.length === 0) {
      return { granularidade: gran, ocupacao: [], niveis: [], snapshotHoje: null };
    }
    const unidadeIds = unidades.map((u) => u.id);

    // HistoricoLeitosStatus no período (já tem SCP breakdown!)
    const historico = await this.ds
      .getRepository(HistoricoLeitosStatus)
      .createQueryBuilder("h")
      .leftJoinAndSelect("h.unidade", "unidade")
      .where("h.unidade_id IN (:...ids)", { ids: unidadeIds })
      .andWhere(
        "DATE(h.data AT TIME ZONE 'America/Sao_Paulo') BETWEEN :di AND :df",
        { di: dataInicial, df: dataFinal }
      )
      .orderBy("h.data", "DESC")
      .getMany();

    // Calcular taxaMaxima (atual, estática para toda a série)
    let taxaMaxima = 0;
    try {
      if (setorId) {
        const r = await this.occupationService.analisarUnidadeInternacao(setorId);
        taxaMaxima = r.ocupacaoMaximaAtendivel;
      } else {
        const r = await this.occupationService.analisarHospitalInternacao(hospitalId);
        taxaMaxima = r.summary.ocupacaoMaximaAtendivel;
      }
    } catch { /* taxaMaxima = 0 */ }

    // ── Agrupar histórico de leitos (bedCount/evaluated) por período ──
    interface PontoAcum {
      bedCount: number; evaluated: number;
      minimos: number; intermediarios: number;
      altaDependencia: number; semiIntensivos: number; intensivos: number;
      count: number;
    }
    const agrupado = new Map<string, PontoAcum>();
    const latestByUnitPeriod = new Map<string, HistoricoLeitosStatus>();

    for (const h of historico) {
      const dataSP = DateTime.fromJSDate(h.data, { zone: SAO_PAULO_TZ });
      const chave =
        gran === "dia"
          ? dataSP.toFormat("yyyy-MM-dd")
          : dataSP.toFormat("yyyy-MM");

      const unidadeId = (h as any).unidade_id ?? (h as any).unidadeId ?? (h.unidade?.id);
      const dedupKey = `${chave}::${unidadeId}`;
      if (!latestByUnitPeriod.has(dedupKey)) {
        latestByUnitPeriod.set(dedupKey, h);
      } else {
        const prev = latestByUnitPeriod.get(dedupKey)!;
        if (h.data > prev.data) latestByUnitPeriod.set(dedupKey, h);
      }
    }

    for (const h of latestByUnitPeriod.values()) {
      const dataSP = DateTime.fromJSDate(h.data, { zone: SAO_PAULO_TZ });
      const chave =
        gran === "dia"
          ? dataSP.toFormat("yyyy-MM-dd")
          : dataSP.toFormat("yyyy-MM");

      const prev = agrupado.get(chave) ?? {
        bedCount: 0, evaluated: 0,
        minimos: 0, intermediarios: 0, altaDependencia: 0,
        semiIntensivos: 0, intensivos: 0, count: 0,
      };
      agrupado.set(chave, {
        ...prev,
        bedCount: prev.bedCount + h.bedCount,
        evaluated: prev.evaluated + h.evaluated,
        count: prev.count + 1,
      });
    }

    // ── Níveis: buscar diretamente de AvaliacaoSCP (mesma fonte do detalhamento) ──
    if (unidadeIds.length) {
      const avalsPeriodo = await this.ds
        .getRepository(AvaliacaoSCP)
        .createQueryBuilder("a")
        .select(["a.dataAplicacao", "a.classificacao"])
        .where("a.unidade IN (:...ids)", { ids: unidadeIds })
        .andWhere("a.dataAplicacao BETWEEN :di AND :df", { di: dataInicial, df: dataFinal })
        .getMany();

      for (const a of avalsPeriodo) {
        const chave =
          gran === "dia"
            ? a.dataAplicacao
            : a.dataAplicacao.slice(0, 7);

        const prev = agrupado.get(chave) ?? {
          bedCount: 0, evaluated: 0,
          minimos: 0, intermediarios: 0, altaDependencia: 0,
          semiIntensivos: 0, intensivos: 0, count: 0,
        };
        switch (a.classificacao) {
          case "MINIMOS":          prev.minimos++; break;
          case "INTERMEDIARIOS":   prev.intermediarios++; break;
          case "ALTA_DEPENDENCIA": prev.altaDependencia++; break;
          case "SEMI_INTENSIVOS":  prev.semiIntensivos++; break;
          case "INTENSIVOS":       prev.intensivos++; break;
        }
        agrupado.set(chave, prev);
      }
    }

    // Always remove today's historico bed data (may be contaminated by expiry job)
    const hojeSPStr = DateTime.now().setZone(SAO_PAULO_TZ).toFormat("yyyy-MM-dd");
    const chaveHoje = gran === "dia" ? hojeSPStr : hojeSPStr.slice(0, 7);

    // For today, recompute bedCount/evaluated from real data
    if (dataInicial <= hojeSPStr && dataFinal >= hojeSPStr) {
      // Remove stale historico bed snapshot for today
      const hojeExisting = agrupado.get(chaveHoje);
      if (hojeExisting) {
        // Keep niveis (already computed from AvaliacaoSCP above), reset bed counts
        hojeExisting.bedCount = 0;
        hojeExisting.evaluated = 0;
      }

      const leitos = await this.ds.getRepository(Leito).find({
        where: unidadeIds.map((id) => ([
          { unidade: { id }, status: StatusLeito.ATIVO },
          { unidade: { id }, status: StatusLeito.PENDENTE },
          { unidade: { id }, status: StatusLeito.VAGO },
        ])).flat(),
      });

      const avalsHoje = unidadeIds.length
        ? await this.ds.getRepository(AvaliacaoSCP).find({
            where: unidadeIds.map((id) => ({ unidade: { id }, dataAplicacao: hojeSPStr })),
          })
        : [];

      if (avalsHoje.length > 0 || (hojeExisting && (hojeExisting.minimos + hojeExisting.intermediarios + hojeExisting.altaDependencia + hojeExisting.semiIntensivos + hojeExisting.intensivos) > 0)) {
        const prev = agrupado.get(chaveHoje) ?? {
          bedCount: 0, evaluated: 0,
          minimos: 0, intermediarios: 0, altaDependencia: 0,
          semiIntensivos: 0, intensivos: 0, count: 0,
        };
        prev.bedCount = leitos.length;
        prev.evaluated = avalsHoje.length;
        prev.count = 1;
        agrupado.set(chaveHoje, prev);
      } else {
        agrupado.delete(chaveHoje);
      }
    } else {
      // Past-only range: remove any today entry that shouldn't be there
      // (noop since today wouldn't be in range)
    }

    // Gerar pontos na ordem cronológica
    const chavesSorted = [...agrupado.keys()].sort();

    const ocupacao = chavesSorted.map((chave) => {
      const p = agrupado.get(chave)!;
      return {
        label: _label(chave, gran),
        data: gran === "dia" ? chave : `${chave}-01`,
        taxa: pct(p.evaluated, p.bedCount),
        taxaMaxima,
      };
    });

    const niveis = chavesSorted.map((chave) => {
      const p = agrupado.get(chave)!;
      const total = p.minimos + p.intermediarios + p.altaDependencia +
        p.semiIntensivos + p.intensivos || 1;
      return {
        label: _label(chave, gran),
        data: gran === "dia" ? chave : `${chave}-01`,
        minimos: pct(p.minimos, total),
        intermediarios: pct(p.intermediarios, total),
        altaDependencia: pct(p.altaDependencia, total),
        semiIntensivos: pct(p.semiIntensivos, total),
        intensivos: pct(p.intensivos, total),
        qtdMinimos: p.minimos,
        qtdIntermediarios: p.intermediarios,
        qtdAltaDependencia: p.altaDependencia,
        qtdSemiIntensivos: p.semiIntensivos,
        qtdIntensivos: p.intensivos,
        qtdTotal: p.minimos + p.intermediarios + p.altaDependencia + p.semiIntensivos + p.intensivos,
      };
    });

    // Snapshot hoje (se dataInicial == dataFinal == hoje)
    let snapshotHoje = null;
    if (dataInicial === hojeSPStr && dataFinal === hojeSPStr) {
      const rt = await this._realTimeStats(unidadeIds);
      const totalNiveis = rt.minimos + rt.intermediarios + rt.altaDependencia +
        rt.semiIntensivos + rt.intensivos || 1;
      snapshotHoje = {
        taxaOcupacao: pct(rt.evaluated, rt.bedCount),
        taxaMaxima,
        niveis: [
          { name: "Mínimos",          value: rt.minimos,          percentual: pct(rt.minimos,          totalNiveis) },
          { name: "Intermediários",   value: rt.intermediarios,   percentual: pct(rt.intermediarios,   totalNiveis) },
          { name: "Alta Dependência", value: rt.altaDependencia,  percentual: pct(rt.altaDependencia,  totalNiveis) },
          { name: "Semi-Intensivo",   value: rt.semiIntensivos,   percentual: pct(rt.semiIntensivos,   totalNiveis) },
          { name: "Intensivos",       value: rt.intensivos,       percentual: pct(rt.intensivos,       totalNiveis) },
        ],
      };
    }

    return { granularidade: gran, ocupacao, niveis, snapshotHoje };
  }

  // ─────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────

  /** Real-time stats from Leito + AvaliacaoSCP (no dependency on LeitosStatus cache) */
  private async _realTimeStats(unidadeIds: string[]) {
    if (unidadeIds.length === 0) {
      return { bedCount: 0, evaluated: 0, minimos: 0, intermediarios: 0, altaDependencia: 0, semiIntensivos: 0, intensivos: 0 };
    }

    const [leitos, sessoes] = await Promise.all([
      this.ds.getRepository(Leito).find({
        where: unidadeIds.map((id) => ([
          { unidade: { id }, status: StatusLeito.ATIVO },
          { unidade: { id }, status: StatusLeito.PENDENTE },
          { unidade: { id }, status: StatusLeito.VAGO },
        ])).flat(),
      }),
      this.ds.getRepository(AvaliacaoSCP).find({
        where: unidadeIds.map((id) => ({ unidade: { id }, statusSessao: StatusSessaoAvaliacao.ATIVA })),
      }),
    ]);

    const bedCount = leitos.length;
    const evaluated = sessoes.length;
    let minimos = 0, intermediarios = 0, altaDependencia = 0, semiIntensivos = 0, intensivos = 0;
    for (const s of sessoes) {
      switch (s.classificacao) {
        case "MINIMOS": minimos++; break;
        case "INTERMEDIARIOS": intermediarios++; break;
        case "ALTA_DEPENDENCIA": altaDependencia++; break;
        case "SEMI_INTENSIVOS": semiIntensivos++; break;
        case "INTENSIVOS": intensivos++; break;
      }
    }
    return { bedCount, evaluated, minimos, intermediarios, altaDependencia, semiIntensivos, intensivos };
  }

  private async _latestHistoricoByDay(
    unidadeIds: string[],
    diaStr: string
  ): Promise<Map<string, HistoricoLeitosStatus>> {
    if (unidadeIds.length === 0) return new Map();
    const list = await this.ds
      .getRepository(HistoricoLeitosStatus)
      .createQueryBuilder("h")
      .leftJoinAndSelect("h.unidade", "unidade")
      .where("h.unidade_id IN (:...ids)", { ids: unidadeIds })
      .andWhere(
        "DATE(h.data AT TIME ZONE 'America/Sao_Paulo') = :dia",
        { dia: diaStr }
      )
      .orderBy("h.data", "DESC")
      .getMany();

    const map = new Map<string, HistoricoLeitosStatus>();
    for (const h of list) {
      if (!map.has(h.unidade.id)) map.set(h.unidade.id, h);
    }
    return map;
  }

  private _emptyGlobal(agoraSP: DateTime) {
    return {
      taxaOcupacaoHospital: 0,
      leitosAvaliadosHospital: 0,
      data: agoraSP.toFormat("dd/MM/yyyy"),
      nivelPredominante: null,
      desviosPerfil: 0,
      setoresOcupacao: [],
      setoresDesvio: [],
      niveis: NIVEIS_ORDER.map((nivel) => ({
        nivel,
        label: NIVEL_LABELS[nivel],
        totalPacientes: 0,
        percentualTotal: 0,
        setores: [],
      })),
    };
  }

  private _emptyDetalhamento(todas: UnidadeInternacao[]) {
    return {
      taxaOcupacaoMedia: 0,
      leitosAvaliadosPerc: 0,
      totalLeitos: 0,
      totalAvaliacoes: 0,
      metodoScp: null,
      nivelPredominante: null,
      nivelPredominanteLabel: null,
      desvios: 0,
      riscos: 0,
      subutilizacao: 0,
      estadosLeitos: [],
      niveisCuidado: [],
      setores: [
        { id: null, nome: "Todos os setores" },
        ...todas.map((u) => ({ id: u.id, nome: u.nome })),
      ],
    };
  }
}

// ── Funções utilitárias de módulo ──────────────────
function _lsNivel(ls: LeitosStatus, nivel: string): number {
  switch (nivel) {
    case "MINIMOS":          return ls.minimumCare;
    case "INTERMEDIARIOS":   return ls.intermediateCare;
    case "ALTA_DEPENDENCIA": return ls.highDependency;
    case "SEMI_INTENSIVOS":  return ls.semiIntensive;
    case "INTENSIVOS":       return ls.intensive;
    default:                 return 0;
  }
}

function _label(chave: string, gran: "dia" | "mes"): string {
  if (gran === "dia") {
    // chave = "yyyy-MM-dd" → "dd/MM"
    const [, m, d] = chave.split("-");
    return `${d}/${m}`;
  } else {
    // chave = "yyyy-MM" → "JAN"
    const [, m] = chave.split("-");
    const MES_PT = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
    return MES_PT[parseInt(m, 10) - 1] ?? chave;
  }
}
