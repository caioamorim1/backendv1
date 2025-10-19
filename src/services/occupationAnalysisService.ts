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
    // Intervalo do mês atual (início do mês até agora)
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
    const dataInicioStr = inicioMes.toISOString();
    const dataFimStr = fimPeriodo.toISOString();

    // Buscar unidade e leitos_status
    const unidade = await this.ds.getRepository(UnidadeInternacao).findOne({
      where: { id: unidadeId },
      relations: ["hospital"],
    });
    if (!unidade) throw new Error("Unidade não encontrada");

    const lsRow = await this.ds.query(
      `SELECT bed_count, evaluated, vacant, inactive FROM public.leitos_status WHERE unidade_id = $1`,
      [unidadeId]
    );
    const bedCount = parseInt(lsRow?.[0]?.bed_count ?? 0) || 0;
    const avaliados = parseInt(lsRow?.[0]?.evaluated ?? 0) || 0;
    const vagos = parseInt(lsRow?.[0]?.vacant ?? 0) || 0;
    const inativos = parseInt(lsRow?.[0]?.inactive ?? 0) || 0;
    const ocupados = Math.max(0, avaliados - vagos);

    // Média de ocupados no MÊS por hora para esta unidade (usar generate_series para sobreposição correta)
    const ocupacaoDiaQueryUnit = `
      WITH horas AS (
        SELECT generate_series($2::timestamp, $3::timestamp, interval '1 hour') AS hora
      ),
      ocupacao_por_hora AS (
        SELECT 
          h.hora,
          COUNT(DISTINCT ho."leitoId") as leitos_ocupados
        FROM horas h
        JOIN public.leitos l ON l."unidadeId" = $1
        LEFT JOIN public.historicos_ocupacao ho
          ON ho."leitoId" = l.id
         AND ho.inicio <= h.hora
         AND (ho.fim IS NULL OR ho.fim > h.hora)
        GROUP BY h.hora
      )
      SELECT AVG(leitos_ocupados) as media_ocupados FROM ocupacao_por_hora`;
    const occRow = await this.ds.query(ocupacaoDiaQueryUnit, [
      unidadeId,
      dataInicioStr,
      dataFimStr,
    ]);
    const mediaOcupadosDia =
      parseFloat(occRow?.[0]?.media_ocupados ?? 0) || ocupados;
    const taxaOcupacao = bedCount > 0 ? (ocupados / bedCount) * 100 : 0;
    // Taxa média mensal (mapeada para taxaOcupacaoDia por compatibilidade do DTO)
    const taxaOcupacaoDia =
      bedCount > 0 ? (mediaOcupadosDia / bedCount) * 100 : 0;

    // Montar params para calcularProjecao a partir do Dimensionamento e dos parâmetros da unidade
    const dimService = new DimensionamentoService(this.ds);
    const dim = await dimService.calcularParaInternacao(unidadeId);
    const tabela = Array.isArray((dim as any).tabela)
      ? (dim as any).tabela
      : [];
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

    // Derivar parâmetros do cálculo a partir do resultado do Dimensionamento
    const agregados = (dim as any)?.agregados || {};
    const ocupacaoBase = Number(agregados?.taxaOcupacaoMensal ?? 0.6);
    const distribuicao: Record<string, number> =
      agregados?.distribuicaoTotalClassificacao || {};

    // Mesma tabela de horas por classificação usada no DimensionamentoService
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

    // Necessários @BASE aproximados pelos valores projetados calculados no dimensionamento
    const enfBase = Number(enfRow?.quantidadeProjetada ?? 0);
    const tecBase = Number(tecRow?.quantidadeProjetada ?? 0);

    let ocupacaoMaximaAtendivel = 100;
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
          "  - ocupacaoBase (mês):",
          (ocupacaoBase * 100).toFixed(2),
          "%"
        );
        console.log("  - THE base (mês):", theBase.toFixed(2));
        console.log(
          "  - ENF: atual=",
          quadroEnf,
          " @BASE=",
          enfBase,
          " FTE@100%=",
          resultado.enf100pctFTE.toFixed(2),
          " ratio=",
          (ratioEnf * 100).toFixed(2),
          "%"
        );
        console.log(
          "  - TEC: atual=",
          quadroTec,
          " @BASE=",
          tecBase,
          " FTE@100%=",
          resultado.tec100pctFTE.toFixed(2),
          " ratio=",
          (ratioTec * 100).toFixed(2),
          "%"
        );
        console.log(
          "  - ocupacaoMaximaAtendivel:",
          ocupacaoMaximaAtendivel.toFixed(2),
          "%"
        );
        if (Math.abs(ocupacaoMaximaAtendivel - ocupacaoBase * 100) < 0.5) {
          console.log(
            "  → Observação: ocupacaoMaximaAtendivel ~= ocupacaoBase pois o quadro atual está próximo do necessário @BASE."
          );
        }
      }
    } catch (error) {
      console.warn(
        `⚠️  Não foi possível calcular ocupação máxima para unidade ${unidade.nome}:`,
        error instanceof Error ? error.message : error
      );
    }

    const ociosidade = Math.max(0, ocupacaoMaximaAtendivel - taxaOcupacao);
    const superlotacao = Math.max(0, taxaOcupacao - ocupacaoMaximaAtendivel);

    const out: SectorOccupationDTO = {
      sectorId: unidade.id,
      sectorName: unidade.nome,
      sectorType: "internacao",
      taxaOcupacao: parseFloat(taxaOcupacao.toFixed(2)),
      taxaOcupacaoDia: parseFloat(taxaOcupacaoDia.toFixed(2)),
      ocupacaoMaximaAtendivel: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      ociosidade: parseFloat(ociosidade.toFixed(2)),
      superlotacao: parseFloat(superlotacao.toFixed(2)),
      capacidadeProdutiva: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      totalLeitos: bedCount,
      leitosOcupados: ocupados,
      leitosVagos: vagos,
      leitosInativos: inativos,
      leitosAvaliados: avaliados,
      quadroAtualEnfermeiros: quadroEnf,
      quadroAtualTecnicos: quadroTec,
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

    // Ocupação máxima atendível ponderada pela capacidade de cada setor
    let ocupacaoMaximaAtendivel = 0;
    if (totalLeitos > 0) {
      ocupacaoMaximaAtendivel = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.ocupacaoMaximaAtendivel * peso;
      }, 0);
    }

    // Ociosidade e superlotação baseadas na ocupação máxima atendível
    const ociosidade = Math.max(0, ocupacaoMaximaAtendivel - taxaOcupacao);
    const superlotacao = Math.max(0, taxaOcupacao - ocupacaoMaximaAtendivel);

    return {
      sectorName: "Global",
      taxaOcupacao: parseFloat(taxaOcupacao.toFixed(2)),
      taxaOcupacaoDia: parseFloat(taxaOcupacaoDia.toFixed(2)),
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
