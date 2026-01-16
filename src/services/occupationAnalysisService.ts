import { DataSource } from "typeorm";
import {
  SectorOccupationDTO,
  OccupationSummaryDTO,
  OccupationAnalysisResponse,
  OccupationDashboardResponse,
  SectorOccupationDashboardDTO,
  HospitalOccupationDashboardSummary,
  MonthlyOccupationData,
} from "../dto/occupationAnalysis.dto";
import { calcularProjecao } from "../calculoTaxaOcupacao/calculation";
import { ProjecaoParams } from "../calculoTaxaOcupacao/interfaces";
import { DimensionamentoService } from "./dimensionamentoService";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { LeitosStatus } from "../entities/LeitosStatus";
import { HistoricoLeitosStatus } from "../entities/HistoricoLeitosStatus";
import { TaxaOcupacaoCustomizada } from "../entities/TaxaOcupacaoCustomizada";
// Parâmetros adicionais serão derivados do Dimensionamento (agregados/tabela)

/**
 * Service para cálculo de análise de taxa de ocupação
 *
 * Regras de negócio:
 * - Taxa de Ocupação Atual = (leitos ocupados / total leitos) × 100
 * - Ocupação Máxima Atendível = calculada com base no quadro de profissionais (função calcularProjecao)
 * - Ociosidade = max(0, ocupacaoMaximaAtendivel - taxaOcupacao)
 * - Superlotação = max(0, taxaOcupacao - ocupacaoMaximaAtendivel)
 */
export class OccupationAnalysisService {
  constructor(private ds: DataSource) {}

  private isDebugEnabled(): boolean {
    return (
      process.env.OCCUPATION_ANALYSIS_DEBUG === "true" ||
      process.env.NODE_ENV !== "production"
    );
  }

  private log(...args: any[]): void {
    if (!this.isDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log(...args);
  }

  private warn(...args: any[]): void {
    if (!this.isDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.warn(...args);
  }

  /**
   * NOVO: Calcula análise de ocupação para UMA unidade de internação
   */
  async analisarUnidadeInternacao(
    unidadeId: string,
    dataReferencia?: Date
  ): Promise<SectorOccupationDTO> {
    this.log("\n🔄 [OCCUPATION ANALYSIS] Iniciando análise de ocupação...");
    this.log("   Unidade ID:", unidadeId);
    this.log("   Data Referência:", dataReferencia || "hoje");
    const t0 = Date.now();

    // Calcular período (início do mês até data de referência)
    const agora = dataReferencia ? new Date(dataReferencia) : new Date();
    const inicioMes = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const fimPeriodo = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate(),
      23,
      59,
      59,
      999
    );

    // Formatar datas para passar ao dimensionamento (YYYY-MM-DD)
    const dataInicioStr = inicioMes.toISOString().split("T")[0];
    const dataFimStr = fimPeriodo.toISOString().split("T")[0];

    this.log("\n🗓️  [PERÍODO]");
    this.log("   Início:", inicioMes.toISOString());
    this.log("   Fim:", fimPeriodo.toISOString());
    this.log("   Strings (YYYY-MM-DD):", dataInicioStr, "→", dataFimStr);

    // Buscar unidade
    const unidade = await this.ds.getRepository(UnidadeInternacao).findOne({
      where: { id: unidadeId },
      relations: ["hospital"],
    });
    if (!unidade) throw new Error("Unidade não encontrada");

    this.log("\n🏥 [UNIDADE]");
    this.log("   Nome:", unidade.nome);
    this.log("   Hospital:", (unidade as any)?.hospital?.nome);

    // ===== USAR DIMENSIONAMENTO COMO FONTE ÚNICA DE DADOS =====
    const dimService = new DimensionamentoService(this.ds);
    const dim = await dimService.calcularParaInternacao(
      unidadeId,
      dataInicioStr,
      dataFimStr
    );

    const agregados = (dim as any)?.agregados || {};
    const tabela = Array.isArray((dim as any).tabela)
      ? (dim as any).tabela
      : [];

    this.log("\n📦 [DIMENSIONAMENTO] Resultado recebido");
    this.log("   Tabela linhas:", tabela.length);
    this.log("   Agregados.totalLeitos:", (dim as any)?.agregados?.totalLeitos);
    this.log(
      "   Agregados.taxaOcupacaoPeriodoPercent:",
      (dim as any)?.agregados?.taxaOcupacaoPeriodoPercent
    );
    this.log(
      "   Agregados.taxaOcupacaoPeriodo (fração):",
      (dim as any)?.agregados?.taxaOcupacaoPeriodo
    );

    // Extrair dados dos agregados do dimensionamento (PERÍODO)
    const bedCount = Number(agregados?.totalLeitos ?? 0);
    const vagos = Number(agregados?.leitosVagos ?? 0);
    const inativos = Number(agregados?.leitosInativos ?? 0);

    // Taxa de ocupação do período (já calculada pelo dimensionamento)
    const taxaOcupacaoPeriodo = Number(
      agregados?.taxaOcupacaoPeriodoPercent ?? 0
    );

    // Buscar dados ATUAIS do dia de hoje na tabela leitos_status (para taxaOcupacao)
    const leitosStatusRepo = this.ds.getRepository(LeitosStatus);
    const leitosStatusHoje = await leitosStatusRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

    // Dados do DIA ATUAL (não do período)
    const ocupadosHoje = leitosStatusHoje?.evaluated ?? 0;
    const vagosHoje = leitosStatusHoje?.vacant ?? 0;
    const inativosHoje = leitosStatusHoje?.inactive ?? 0;
    const avaliadosHoje = ocupadosHoje + vagosHoje + inativosHoje;

    // Taxa de ocupação atual (instantânea do dia de hoje)
    const taxaOcupacao = bedCount > 0 ? (ocupadosHoje / bedCount) * 100 : 0;

    this.log("\n🛏️  [LEITOS_STATUS - AGORA]");
    this.log("   bedCount (dimensionamento):", bedCount);
    this.log(
      "   evaluated/occupied:",
      ocupadosHoje,
      "vacant:",
      vagosHoje,
      "inactive:",
      inativosHoje,
      "avaliados:",
      avaliadosHoje
    );
    this.log("   taxaOcupacao (agora):", taxaOcupacao.toFixed(2) + "%");

    // Buscar taxaOcupacaoHoje do histórico (dados de hoje na tabela historicos_leitos_status)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const historicoHojeRepo = this.ds.getRepository(HistoricoLeitosStatus);
    const historicoHoje = await historicoHojeRepo
      .createQueryBuilder("h")
      .where("h.unidade_id = :unidadeId", { unidadeId })
      .andWhere("DATE(h.data) = CURRENT_DATE")
      .getOne();

    // Taxa de ocupação de hoje do histórico
    let taxaOcupacaoHoje = 0;
    if (historicoHoje && historicoHoje.bedCount > 0) {
      taxaOcupacaoHoje =
        (historicoHoje.evaluated / historicoHoje.bedCount) * 100;
    }
    // Se não houver registro no histórico para hoje, taxaOcupacaoHoje = 0

    this.log("\n📅 [HISTÓRICO - HOJE]");
    if (!historicoHoje) {
      this.log("   Nenhum registro encontrado para hoje (CURRENT_DATE).");
    } else {
      this.log(
        "   bedCount:",
        historicoHoje.bedCount,
        "evaluated:",
        historicoHoje.evaluated,
        "taxa:",
        taxaOcupacaoHoje.toFixed(2) + "%"
      );
    }

    // Extrair quadro de profissionais da tabela
    const enfRow = tabela.find((t: any) =>
      (t.cargoNome || "").toLowerCase().includes("enfermeiro")
    );
    const tecRow = tabela.find(
      (t: any) =>
        (t.cargoNome || "").toLowerCase().includes("técnico em enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tecnico em enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("técnico enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tec enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("téc enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tec. enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tec. em enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("téc. em enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("técnico de enfermagem")
    );
    const quadroEnf = parseInt(enfRow?.quantidadeAtual ?? 0) || 0;
    const quadroTec = parseInt(tecRow?.quantidadeAtual ?? 0) || 0;

    this.log("\n👩‍⚕️ [EQUIPE - DIMENSIONAMENTO/TABELA]");
    this.log(
      "   Enfermeiro row:",
      enfRow
        ? {
            cargoNome: enfRow.cargoNome,
            atual: enfRow.quantidadeAtual,
            proj: enfRow.quantidadeProjetada,
          }
        : "NÃO ENCONTRADO"
    );
    this.log(
      "   Técnico row:",
      tecRow
        ? {
            cargoNome: tecRow.cargoNome,
            atual: tecRow.quantidadeAtual,
            proj: tecRow.quantidadeProjetada,
          }
        : "NÃO ENCONTRADO"
    );
    this.log("   Quadro atual (parse): Enf=", quadroEnf, "Tec=", quadroTec);

    // Buscar taxa de ocupação customizada (se existir)
    const taxaCustomizadaRepo = this.ds.getRepository(TaxaOcupacaoCustomizada);
    const taxaCustomizada = await taxaCustomizadaRepo.findOne({
      where: { unidadeId },
    });

    // Extrair dados para calcular THE e projeção
    // Usar taxa customizada se disponível, senão usar a do período
    const ocupacaoBase = taxaCustomizada
      ? Number(taxaCustomizada.taxa) / 100 // Converter de % para fração
      : Number(agregados?.taxaOcupacaoPeriodo ?? 0.6);

    this.log("\n📊 [TAXA DE OCUPAÇÃO] Fonte da taxa:");
    if (taxaCustomizada) {
      this.log("   ✅ CUSTOMIZADA encontrada:", taxaCustomizada.taxa + "%");
      this.log("      Taxa convertida para fração:", ocupacaoBase);
      this.log("      Salva em:", taxaCustomizada.updatedAt);
    } else {
      this.log(
        "   📈 CALCULADA (do período):",
        (ocupacaoBase * 100).toFixed(2) + "%"
      );
      this.log(
        "      Taxa do período (agregados):",
        agregados?.taxaOcupacaoPeriodoPercent + "%"
      );
    }
    this.log("   Ocupação Base (fração):", ocupacaoBase);

    const distribuicao: Record<string, number> =
      agregados?.distribuicaoTotalClassificacao || {};

    // Calcular THE (Total de Horas de Enfermagem)
    const horasPorClassificacao: Record<string, number> = {
      MINIMOS: 4,
      INTERMEDIARIOS: 6,
      ALTA_DEPENDENCIA: 10,
      SEMI_INTENSIVOS: 10,
      INTENSIVOS: 18,
    };
    const theBase = Object.entries(distribuicao).reduce(
      (acc, [classe, total]) => {
        const horas = horasPorClassificacao[classe] ?? 0;
        return acc + horas * Number(total || 0);
      },
      0
    );

    this.log("\n🧾 [CLASSIFICAÇÃO / THE]");
    this.log("   Distribuição:", distribuicao);
    this.log("   THE Base calculado:", theBase.toFixed(2));

    // Necessários @BASE (projetados calculados no dimensionamento)
    const enfBase = Number(enfRow?.quantidadeProjetada ?? 0);
    const tecBase = Number(tecRow?.quantidadeProjetada ?? 0);

    this.log("\n📌 [BASE NECESSÁRIOS]");
    this.log("   Enfermeiros necessários @BASE:", enfBase);
    this.log("   Técnicos necessários @BASE:", tecBase);

    // Calcular capacidade máxima atendível com o quadro atual
    let ocupacaoMaximaAtendivel = 0; // Se não houver equipe de enfermagem, capacidade é 0
    try {
      if (enfBase > 0 && tecBase > 0 && theBase > 0) {
        const parametros: ProjecaoParams = {
          quadroAtualEnfermeiros: quadroEnf,
          quadroAtualTecnicos: quadroTec,
          leitos: bedCount,
          ocupacaoBase,
          theBase,
          enfNecessariosBase: enfBase,
          tecNecessariosBase: tecBase,
          metaLivreOcupacao: 0.85,
        };
        this.log("\n🧮 [CÁLCULO PROJEÇÃO] Parâmetros:");
        this.log(
          "   Quadro Atual - Enfermeiros:",
          quadroEnf,
          "Técnicos:",
          quadroTec
        );
        this.log("   Leitos:", bedCount);
        this.log("   Ocupação Base:", (ocupacaoBase * 100).toFixed(2) + "%");
        this.log("   THE Base:", theBase.toFixed(2));
        this.log(
          "   Necessários @Base - Enfermeiros:",
          enfBase,
          "Técnicos:",
          tecBase
        );

        const resultado = calcularProjecao(parametros);
        this.log("\n✨ [RESULTADO PROJEÇÃO]:");
        this.log(
          "   Ocupação Máxima Atendível:",
          (resultado.ocupacaoMaximaAtendivel * 100).toFixed(2) + "%"
        );
        // DEBUG: explicar por que o valor pode estar "travado"
        const ratioEnf =
          resultado.enf100pctFTE > 0
            ? parametros.quadroAtualEnfermeiros / resultado.enf100pctFTE
            : 0;
        const ratioTec =
          resultado.tec100pctFTE > 0
            ? parametros.quadroAtualTecnicos / resultado.tec100pctFTE
            : 0;

        this.log("   Derivados @100%:");
        this.log("     enf100pctFTE:", resultado.enf100pctFTE);
        this.log("     tec100pctFTE:", resultado.tec100pctFTE);
        this.log("     the100pct:", resultado.the100pct);
        this.log("   Gargalo (min ratios):");
        this.log("     ratioEnf:", ratioEnf.toFixed(4));
        this.log("     ratioTec:", ratioTec.toFixed(4));

        ocupacaoMaximaAtendivel = resultado.ocupacaoMaximaAtendivel * 100;
      } else {
        this.warn("\n⚠️  [CÁLCULO PROJEÇÃO] Pulado por falta de base:");
        this.warn(
          "   enfBase:",
          enfBase,
          "tecBase:",
          tecBase,
          "theBase:",
          theBase
        );
        this.warn(
          "   Motivo típico: tabela do dimensionamento sem linha de Enf/Tec, ou distribuição vazia, ou ocupacaoBase inválida."
        );
      }
    } catch (error) {
      this.warn(
        `⚠️  Não foi possível calcular ocupação máxima para unidade ${unidade.nome}:`,
        error instanceof Error ? error.message : error
      );
    }

    // Calcular indicadores usando taxaOcupacaoHoje (histórico do dia)
    const ociosidade = Math.max(0, ocupacaoMaximaAtendivel - taxaOcupacaoHoje);
    const superlotacao = Math.max(
      0,
      taxaOcupacaoHoje - ocupacaoMaximaAtendivel
    );

    const out: SectorOccupationDTO = {
      sectorId: unidade.id,
      sectorName: unidade.nome,
      sectorType: "internacao",
      taxaOcupacao: parseFloat(taxaOcupacao.toFixed(2)),
      taxaOcupacaoDia: parseFloat(taxaOcupacaoPeriodo.toFixed(2)), // Taxa do período (mês)
      taxaOcupacaoHoje: parseFloat(taxaOcupacaoHoje.toFixed(2)), // Taxa de hoje
      ocupacaoMaximaAtendivel: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      ociosidade: parseFloat(ociosidade.toFixed(2)),
      superlotacao: parseFloat(superlotacao.toFixed(2)),
      capacidadeProdutiva: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      totalLeitos: bedCount,
      leitosOcupados: ocupadosHoje,
      leitosVagos: vagosHoje,
      leitosInativos: inativosHoje,
      leitosAvaliados: avaliadosHoje,
      quadroAtualEnfermeiros: quadroEnf,
      quadroAtualTecnicos: quadroTec,
      distribuicaoClassificacao: distribuicao,
    };
    const t1 = Date.now();

    this.log("\n📋 [INDICADORES FINAIS]");
    this.log(
      "   Taxa Ocupação Atual (leitos_status):",
      taxaOcupacao.toFixed(2) + "%"
    );
    this.log(
      "   Taxa Ocupação Hoje (histórico):",
      taxaOcupacaoHoje.toFixed(2) + "%"
    );
    this.log(
      "   Taxa Ocupação Período (mês):",
      taxaOcupacaoPeriodo.toFixed(2) + "%"
    );
    this.log(
      "   Ocupação Máxima Atendível:",
      ocupacaoMaximaAtendivel.toFixed(2) + "%"
    );
    this.log("   Ociosidade:", ociosidade.toFixed(2) + "%");
    this.log("   Superlotação:", superlotacao.toFixed(2) + "%");
    this.log(
      "   Leitos: Total=",
      bedCount,
      "Ocupados=",
      ocupadosHoje,
      "Vagos=",
      vagosHoje,
      "Inativos=",
      inativosHoje
    );
    this.log("   ⏱️  Tempo de processamento:", t1 - t0, "ms\n");

    return out;
  }

  /**
   * NOVO: Calcula análise de ocupação para TODAS as unidades de internação de um hospital
   */
  async analisarHospitalInternacao(
    hospitalId: string,
    dataReferencia?: Date
  ): Promise<OccupationAnalysisResponse> {
    const t0 = Date.now();

    this.log("\n🏥🏥 [OCCUPATION ANALYSIS - HOSPITAL] Iniciando...");
    this.log("   Hospital ID:", hospitalId);
    this.log("   Data Referência:", dataReferencia || "hoje");

    const unidades = await this.ds.getRepository(UnidadeInternacao).find({
      where: { hospital: { id: hospitalId } },
      order: { nome: "ASC" },
      relations: ["hospital"],
    });
    if (unidades.length === 0) {
      throw new Error(
        `Hospital ${hospitalId} não encontrado ou sem unidades de internação`
      );
    }

    const hospitalName = (unidades[0] as any)?.hospital?.nome ?? "Hospital";

    this.log("   Hospital Nome:", hospitalName);
    this.log("   Unidades de internação:", unidades.length);

    const sectors: SectorOccupationDTO[] = [];
    for (const u of unidades) {
      this.log("\n➡️  [HOSPITAL] Calculando setor:", u.nome, "(", u.id, ")");
      const s = await this.analisarUnidadeInternacao(u.id, dataReferencia);
      sectors.push(s);
    }

    const summary = this.calcularResumoGlobal(sectors);
    const t1 = Date.now();

    this.log("\n📌 [HOSPITAL] Resumo global:");
    this.log("   Total leitos:", summary.totalLeitos);
    this.log("   Taxa hoje:", summary.taxaOcupacaoHoje.toFixed(2) + "%");
    this.log(
      "   Ocupação Máxima Atendível:",
      summary.ocupacaoMaximaAtendivel.toFixed(2) + "%"
    );
    this.log("   Superlotação:", summary.superlotacao.toFixed(2) + "%");
    this.log("   Ociosidade:", summary.ociosidade.toFixed(2) + "%");
    this.log("   ⏱️  Tempo hospital:", t1 - t0, "ms\n");

    return { hospitalId, hospitalName, sectors, summary };
  }

  /**
   * BACKCOMPAT: Mantém a assinatura antiga delegando para a análise por hospital
   */
  async calcularAnaliseOcupacao(
    hospitalId: string,
    dataReferencia?: Date
  ): Promise<OccupationAnalysisResponse> {
    return this.analisarHospitalInternacao(hospitalId, dataReferencia);
  }

  /**
   * Calcula resumo global agregando todos os setores
   */
  private calcularResumoGlobal(
    sectors: SectorOccupationDTO[]
  ): OccupationSummaryDTO {
    // Somar todos os leitos
    const totalLeitos = sectors.reduce((sum, s) => sum + s.totalLeitos, 0);
    const leitosOcupados = sectors.reduce(
      (sum, s) => sum + s.leitosOcupados,
      0
    );
    const leitosVagos = sectors.reduce((sum, s) => sum + s.leitosVagos, 0);
    const leitosInativos = sectors.reduce(
      (sum, s) => sum + s.leitosInativos,
      0
    );
    const leitosAvaliados = sectors.reduce(
      (sum, s) => sum + s.leitosAvaliados,
      0
    );

    // Taxa global (média ponderada)
    const taxaOcupacao =
      totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

    // Taxa de ocupação do dia (média ponderada)
    let taxaOcupacaoDia = 0;
    if (totalLeitos > 0) {
      taxaOcupacaoDia = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.taxaOcupacaoDia * peso;
      }, 0);
    }

    // Taxa de ocupação de hoje (média ponderada)
    let taxaOcupacaoHoje = 0;
    if (totalLeitos > 0) {
      taxaOcupacaoHoje = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.taxaOcupacaoHoje * peso;
      }, 0);
    }

    // Ocupação máxima atendível ponderada pela capacidade de cada setor
    let ocupacaoMaximaAtendivel = 0;
    if (totalLeitos > 0) {
      ocupacaoMaximaAtendivel = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.ocupacaoMaximaAtendivel * peso;
      }, 0);
    }

    // Ociosidade e superlotação baseadas em taxaOcupacaoHoje (histórico do dia)
    const ociosidade = Math.max(0, ocupacaoMaximaAtendivel - taxaOcupacaoHoje);
    const superlotacao = Math.max(
      0,
      taxaOcupacaoHoje - ocupacaoMaximaAtendivel
    );

    return {
      sectorName: "Global",
      taxaOcupacao: parseFloat(taxaOcupacao.toFixed(2)),
      taxaOcupacaoDia: parseFloat(taxaOcupacaoDia.toFixed(2)),
      taxaOcupacaoHoje: parseFloat(taxaOcupacaoHoje.toFixed(2)),
      ocupacaoMaximaAtendivel: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      ociosidade: parseFloat(ociosidade.toFixed(2)),
      superlotacao: parseFloat(superlotacao.toFixed(2)),
      capacidadeProdutiva: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      totalLeitos,
      leitosOcupados,
      leitosVagos,
      leitosInativos,
      leitosAvaliados,
    };
  }

  /**
   * NOVO: Dashboard de ocupação - Ocupação máxima + histórico 4 meses
   * Para cada setor e resumo do hospital
   */
  async calcularDashboardOcupacao(
    hospitalId: string,
    dataReferencia?: Date
  ): Promise<OccupationDashboardResponse> {
    const agora = dataReferencia ? new Date(dataReferencia) : new Date();

    this.log("\n📊 [DASHBOARD OCUPAÇÃO] Iniciando...");
    this.log("   Hospital ID:", hospitalId);
    this.log("   Data Referência:", agora.toISOString());

    // Buscar unidades do hospital
    const unidades = await this.ds.getRepository(UnidadeInternacao).find({
      where: { hospital: { id: hospitalId } },
      order: { nome: "ASC" },
      relations: ["hospital"],
    });
    if (unidades.length === 0) {
      throw new Error(
        `Hospital ${hospitalId} não encontrado ou sem unidades de internação`
      );
    }

    const hospitalName = (unidades[0] as any)?.hospital?.nome ?? "Hospital";

    // Calcular últimos 4 meses (do mais antigo para o mais recente)
    const meses = this.calcularUltimos4Meses(agora);

    this.log("   Hospital Nome:", hospitalName);
    this.log("   Unidades:", unidades.length);
    this.log(
      "   Meses (4):",
      meses.map((m) => m.toISOString().slice(0, 7)).join(", ")
    );

    const sectors: SectorOccupationDashboardDTO[] = [];

    for (const unidade of unidades) {
      this.log(
        "\n➡️  [DASHBOARD] Unidade:",
        unidade.nome,
        "(",
        unidade.id,
        ")"
      );
      const sectorData = await this.calcularDashboardUnidade(
        unidade,
        meses,
        agora
      );
      sectors.push(sectorData);
    }

    // Calcular resumo do hospital (médias ponderadas)
    const summary = this.calcularDashboardSummary(sectors);

    this.log("\n📌 [DASHBOARD] Summary:");
    this.log(
      "   Ocupação Máxima Atendível (média simples):",
      summary.ocupacaoMaximaAtendivel
    );

    return {
      hospitalId,
      hospitalName,
      sectors,
      summary,
    };
  }

  /**
   * Calcula últimos 4 meses (do mais antigo ao mais recente)
   */
  private calcularUltimos4Meses(dataRef: Date): Date[] {
    const meses: Date[] = [];
    for (let i = 3; i >= 0; i--) {
      const mes = new Date(dataRef.getFullYear(), dataRef.getMonth() - i, 1);
      meses.push(mes);
    }
    return meses;
  }

  /**
   * Calcula dashboard para uma unidade específica
   */
  private async calcularDashboardUnidade(
    unidade: UnidadeInternacao,
    meses: Date[],
    dataAtual: Date
  ): Promise<SectorOccupationDashboardDTO> {
    // 1. Calcular ocupação máxima atendível (usa dados atuais)
    const analiseAtual = await this.analisarUnidadeInternacao(
      unidade.id,
      dataAtual
    );
    const ocupacaoMaximaAtendivel = analiseAtual.ocupacaoMaximaAtendivel;

    this.log(
      "   Ocupação Máxima Atendível (atual):",
      ocupacaoMaximaAtendivel.toFixed(2) + "%"
    );

    // 2. Calcular histórico de 4 meses
    const historico4Meses: MonthlyOccupationData[] = [];

    for (const mesInicio of meses) {
      const mesFim = new Date(
        mesInicio.getFullYear(),
        mesInicio.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );

      // Buscar taxa de ocupação média do mês no histórico
      const taxaOcupacaoMes = await this.calcularTaxaOcupacaoMes(
        unidade.id,
        mesInicio,
        mesFim
      );

      this.log(
        "   Histórico mês",
        mesInicio.toISOString().slice(0, 7),
        ":",
        taxaOcupacaoMes.toFixed(2) + "%"
      );

      const monthLabel = this.formatarMesLabel(mesInicio);
      const month = `${mesInicio.getFullYear()}-${String(
        mesInicio.getMonth() + 1
      ).padStart(2, "0")}`;

      historico4Meses.push({
        month,
        monthLabel,
        taxaOcupacao: parseFloat(taxaOcupacaoMes.toFixed(2)),
      });
    }

    return {
      sectorId: unidade.id,
      sectorName: unidade.nome,
      sectorType: "internacao",
      ocupacaoMaximaAtendivel,
      historico4Meses,
    };
  }

  /**
   * Calcula taxa de ocupação média de um mês para uma unidade
   */
  private async calcularTaxaOcupacaoMes(
    unidadeId: string,
    inicio: Date,
    fim: Date
  ): Promise<number> {
    const historicoRepo = this.ds.getRepository(HistoricoLeitosStatus);

    const registros = await historicoRepo
      .createQueryBuilder("h")
      .where("h.unidade_id = :unidadeId", { unidadeId })
      .andWhere("h.data >= :inicio", { inicio })
      .andWhere("h.data <= :fim", { fim })
      .getMany();

    if (registros.length === 0) {
      this.log(
        "   (histórico)",
        inicio.toISOString().slice(0, 7),
        "sem registros para unidade",
        unidadeId
      );
      return 0;
    }

    // Calcular média ponderada (soma de ocupados / soma de leitos totais)
    let somaOcupados = 0;
    let somaLeitos = 0;

    for (const reg of registros) {
      somaOcupados += reg.evaluated || 0;
      somaLeitos += reg.bedCount || 0;
    }

    if (somaLeitos === 0) {
      this.warn(
        "   (histórico)",
        inicio.toISOString().slice(0, 7),
        "somaLeitos=0 para unidade",
        unidadeId,
        "(registros:",
        registros.length,
        ")"
      );
      return 0;
    }

    const taxa = (somaOcupados / somaLeitos) * 100;
    this.log(
      "   (histórico)",
      inicio.toISOString().slice(0, 7),
      "registros:",
      registros.length,
      "somaOcupados:",
      somaOcupados,
      "somaLeitos:",
      somaLeitos,
      "taxa:",
      taxa.toFixed(2) + "%"
    );
    return taxa;
  }

  /**
   * Formata mês para exibição (ex: "Setembro/2025")
   */
  private formatarMesLabel(data: Date): string {
    const meses = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    return `${meses[data.getMonth()]}/${data.getFullYear()}`;
  }

  /**
   * Calcula resumo dashboard do hospital (médias ponderadas)
   */
  private calcularDashboardSummary(
    sectors: SectorOccupationDashboardDTO[]
  ): HospitalOccupationDashboardSummary {
    // Para calcular média ponderada, precisamos dos leitos de cada setor
    // Vamos buscar essa info do sistema
    const totalSetores = sectors.length;
    if (totalSetores === 0) {
      return {
        ocupacaoMaximaAtendivel: 0,
        historico4Meses: [],
      };
    }

    // Ocupação máxima: média simples (pois não temos peso aqui)
    const ocupacaoMaximaAtendivel =
      sectors.reduce((sum, s) => sum + s.ocupacaoMaximaAtendivel, 0) /
      totalSetores;

    // Histórico: calcular média para cada mês
    const numMeses = sectors[0]?.historico4Meses?.length || 0;
    const historico4Meses: MonthlyOccupationData[] = [];

    for (let i = 0; i < numMeses; i++) {
      const month = sectors[0].historico4Meses[i].month;
      const monthLabel = sectors[0].historico4Meses[i].monthLabel;

      // Média simples das taxas de ocupação de todos os setores nesse mês
      const taxaOcupacaoMedia =
        sectors.reduce((sum, s) => {
          return sum + (s.historico4Meses[i]?.taxaOcupacao || 0);
        }, 0) / totalSetores;

      historico4Meses.push({
        month,
        monthLabel,
        taxaOcupacao: parseFloat(taxaOcupacaoMedia.toFixed(2)),
      });
    }

    return {
      ocupacaoMaximaAtendivel: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      historico4Meses,
    };
  }
}
