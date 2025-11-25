import { DataSource } from "typeorm";
import {
  SectorOccupationDTO,
  OccupationSummaryDTO,
  OccupationAnalysisResponse,
} from "../dto/occupationAnalysis.dto";
import { calcularProjecao } from "../calculoTaxaOcupacao/calculation";
import { ProjecaoParams } from "../calculoTaxaOcupacao/interfaces";
import { DimensionamentoService } from "./dimensionamentoService";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { LeitosStatus } from "../entities/LeitosStatus";
import { HistoricoLeitosStatus } from "../entities/HistoricoLeitosStatus";
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

  /**
   * NOVO: Calcula análise de ocupação para UMA unidade de internação
   */
  async analisarUnidadeInternacao(
    unidadeId: string,
    dataReferencia?: Date
  ): Promise<SectorOccupationDTO> {
    const t0 = Date.now();
    console.log(
      `📈 [OccAnalyse] Início unidade=${unidadeId} dataRef=${
        dataReferencia ? dataReferencia.toISOString() : "agora"
      }`
    );

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

    // Buscar unidade
    const unidade = await this.ds.getRepository(UnidadeInternacao).findOne({
      where: { id: unidadeId },
      relations: ["hospital"],
    });
    if (!unidade) throw new Error("Unidade não encontrada");

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
      taxaOcupacaoHoje = (historicoHoje.evaluated / historicoHoje.bedCount) * 100;
    }
    // Se não houver registro no histórico para hoje, taxaOcupacaoHoje = 0

    // Extrair quadro de profissionais da tabela
    const enfRow = tabela.find((t: any) =>
      (t.cargoNome || "").toLowerCase().includes("enfermeiro")
    );
    const tecRow = tabela.find(
      (t: any) =>
        (t.cargoNome || "").toLowerCase().includes("técnico") ||
        (t.cargoNome || "").toLowerCase().includes("tecnico") ||
        (t.cargoNome || "").toLowerCase().includes("técnico em enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tecnico em enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("técnico enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tec enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tec. enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("tec. em enfermagem") ||
        (t.cargoNome || "").toLowerCase().includes("técnico de enfermagem")
    );
    const quadroEnf = parseInt(enfRow?.quantidadeAtual ?? 0) || 0;
    const quadroTec = parseInt(tecRow?.quantidadeAtual ?? 0) || 0;

    // Extrair dados para calcular THE e projeção
    const ocupacaoBase = Number(agregados?.taxaOcupacaoPeriodo ?? 0.6);
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

    // Necessários @BASE (projetados calculados no dimensionamento)
    const enfBase = Number(enfRow?.quantidadeProjetada ?? 0);
    const tecBase = Number(tecRow?.quantidadeProjetada ?? 0);

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
        const resultado = calcularProjecao(parametros);
        // DEBUG: explicar por que o valor pode estar "travado"
        const ratioEnf =
          resultado.enf100pctFTE > 0
            ? parametros.quadroAtualEnfermeiros / resultado.enf100pctFTE
            : 0;
        const ratioTec =
          resultado.tec100pctFTE > 0
            ? parametros.quadroAtualTecnicos / resultado.tec100pctFTE
            : 0;
        ocupacaoMaximaAtendivel = resultado.ocupacaoMaximaAtendivel * 100;

        console.log("[OCC-ANALYSE] Unidade:", unidade.nome);
        console.log(
          "  - Taxa ocupação período (mês):",
          taxaOcupacaoPeriodo.toFixed(2),
          "%"
        );
        console.log("  - Taxa ocupação atual:", taxaOcupacao.toFixed(2), "%");
        console.log(
          "  - Ocupação base (dimensionamento):",
          (ocupacaoBase * 100).toFixed(2),
          "%"
        );
        console.log("  - THE base:", theBase.toFixed(2));
        console.log("  - ENF: atual=", quadroEnf, " necessário@BASE=", enfBase);
        console.log("  - TEC: atual=", quadroTec, " necessário@BASE=", tecBase);
        console.log(
          "  - Capacidade máxima atendível:",
          ocupacaoMaximaAtendivel.toFixed(2),
          "%"
        );
      }
    } catch (error) {
      console.warn(
        `⚠️  Não foi possível calcular ocupação máxima para unidade ${unidade.nome}:`,
        error instanceof Error ? error.message : error
      );
    }

    // Calcular indicadores usando taxaOcupacaoHoje (histórico do dia)
    const ociosidade = Math.max(0, ocupacaoMaximaAtendivel - taxaOcupacaoHoje);
    const superlotacao = Math.max(0, taxaOcupacaoHoje - ocupacaoMaximaAtendivel);

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
    console.log(
      `✅ [OccAnalyse] Fim unidade=${unidadeId} taxa=${out.taxaOcupacao}% max=${
        out.ocupacaoMaximaAtendivel
      }% tempo=${t1 - t0}ms`
    );
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
    console.log(
      `📊 [OccAnalyse] Início hospital=${hospitalId} dataRef=${
        dataReferencia ? dataReferencia.toISOString() : "agora"
      }`
    );
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

    const sectors: SectorOccupationDTO[] = [];
    for (const u of unidades) {
      const s = await this.analisarUnidadeInternacao(u.id, dataReferencia);
      sectors.push(s);
    }

    const summary = this.calcularResumoGlobal(sectors);
    const t1 = Date.now();
    console.log(
      `✅ [OccAnalyse] Fim hospital=${hospitalId} setores=${
        sectors.length
      } taxa=${summary.taxaOcupacao}% max=${
        summary.ocupacaoMaximaAtendivel
      }% tempo=${t1 - t0}ms`
    );
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
    const superlotacao = Math.max(0, taxaOcupacaoHoje - ocupacaoMaximaAtendivel);

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
}
