import { DataSource } from "typeorm";
import {
  OccupationAnalysisResponse,
  SectorOccupationDTO,
  OccupationSummaryDTO,
} from "../dto/occupationAnalysis.dto";
import { OccupationAnalysisService } from "./occupationAnalysisService";
import { Hospital } from "../entities/Hospital";

/**
 * Service para cálculo de análise de taxa de ocupação agregada
 * por rede, grupo ou região
 */
export class OccupationAnalysisNetworkService {
  private occupationService: OccupationAnalysisService;

  constructor(private ds: DataSource) {
    this.occupationService = new OccupationAnalysisService(ds);
  }

  /**
   * Calcula análise de ocupação agregada para todos os hospitais de uma rede
   */
  async analisarRede(
    redeId: string,
    dataReferencia?: Date
  ): Promise<OccupationAnalysisResponse> {
    const t0 = Date.now();
    console.log(
      `📊 [OccAnalyseNetwork] Início rede=${redeId} dataRef=${
        dataReferencia ? dataReferencia.toISOString() : "agora"
      }`
    );

    const hospitais = await this.ds.getRepository(Hospital).find({
      where: { rede: { id: redeId } },
      relations: ["rede"],
    });

    if (hospitais.length === 0) {
      throw new Error(`Rede ${redeId} não encontrada ou sem hospitais`);
    }

    const redeName = hospitais[0]?.rede?.nome ?? "Rede";
    const sectors = await this.agregarSetores(hospitais, dataReferencia);
    const summary = this.calcularResumoGlobal(sectors);

    const t1 = Date.now();
    console.log(
      `✅ [OccAnalyseNetwork] Fim rede=${redeId} setores=${
        sectors.length
      } hospitais=${hospitais.length} taxa=${summary.taxaOcupacao}% max=${
        summary.ocupacaoMaximaAtendivel
      }% tempo=${t1 - t0}ms`
    );

    return {
      hospitalId: redeId,
      hospitalName: redeName,
      sectors,
      summary,
    };
  }

  /**
   * Calcula análise de ocupação agregada para todos os hospitais de um grupo
   */
  async analisarGrupo(
    grupoId: string,
    dataReferencia?: Date
  ): Promise<OccupationAnalysisResponse> {
    const t0 = Date.now();
    console.log(
      `📊 [OccAnalyseNetwork] Início grupo=${grupoId} dataRef=${
        dataReferencia ? dataReferencia.toISOString() : "agora"
      }`
    );

    const hospitais = await this.ds.getRepository(Hospital).find({
      where: { grupo: { id: grupoId } },
      relations: ["grupo"],
    });

    if (hospitais.length === 0) {
      throw new Error(`Grupo ${grupoId} não encontrado ou sem hospitais`);
    }

    const grupoName = hospitais[0]?.grupo?.nome ?? "Grupo";
    const sectors = await this.agregarSetores(hospitais, dataReferencia);
    const summary = this.calcularResumoGlobal(sectors);

    const t1 = Date.now();
    console.log(
      `✅ [OccAnalyseNetwork] Fim grupo=${grupoId} setores=${
        sectors.length
      } hospitais=${hospitais.length} taxa=${summary.taxaOcupacao}% max=${
        summary.ocupacaoMaximaAtendivel
      }% tempo=${t1 - t0}ms`
    );

    return {
      hospitalId: grupoId,
      hospitalName: grupoName,
      sectors,
      summary,
    };
  }

  /**
   * Calcula análise de ocupação agregada para todos os hospitais de uma região
   */
  async analisarRegiao(
    regiaoId: string,
    dataReferencia?: Date
  ): Promise<OccupationAnalysisResponse> {
    const t0 = Date.now();
    console.log(
      `📊 [OccAnalyseNetwork] Início regiao=${regiaoId} dataRef=${
        dataReferencia ? dataReferencia.toISOString() : "agora"
      }`
    );

    const hospitais = await this.ds.getRepository(Hospital).find({
      where: { regiao: { id: regiaoId } },
      relations: ["regiao"],
    });

    if (hospitais.length === 0) {
      throw new Error(`Região ${regiaoId} não encontrada ou sem hospitais`);
    }

    const regiaoName = hospitais[0]?.regiao?.nome ?? "Região";
    const sectors = await this.agregarSetores(hospitais, dataReferencia);
    const summary = this.calcularResumoGlobal(sectors);

    const t1 = Date.now();
    console.log(
      `✅ [OccAnalyseNetwork] Fim regiao=${regiaoId} setores=${
        sectors.length
      } hospitais=${hospitais.length} taxa=${summary.taxaOcupacao}% max=${
        summary.ocupacaoMaximaAtendivel
      }% tempo=${t1 - t0}ms`
    );

    return {
      hospitalId: regiaoId,
      hospitalName: regiaoName,
      sectors,
      summary,
    };
  }

  /**
   * Agrega setores de múltiplos hospitais, somando valores por nome de setor
   */
  private async agregarSetores(
    hospitais: Hospital[],
    dataReferencia?: Date
  ): Promise<SectorOccupationDTO[]> {
    // Map para agregar setores com mesmo nome
    const setoresMap = new Map<string, SectorOccupationDTO>();

    // Processar cada hospital
    for (const hospital of hospitais) {
      try {
        const analise = await this.occupationService.analisarHospitalInternacao(
          hospital.id,
          dataReferencia
        );

        // Agregar cada setor
        for (const sector of analise.sectors) {
          const key = sector.sectorName;

          if (setoresMap.has(key)) {
            // Setor já existe, agregar valores
            const existing = setoresMap.get(key)!;

            const totalLeitos = existing.totalLeitos + sector.totalLeitos;
            const leitosOcupados =
              existing.leitosOcupados + sector.leitosOcupados;
            const leitosVagos = existing.leitosVagos + sector.leitosVagos;
            const leitosInativos =
              existing.leitosInativos + sector.leitosInativos;
            const leitosAvaliados =
              existing.leitosAvaliados + sector.leitosAvaliados;

            // Taxas ponderadas pelo número de leitos
            const taxaOcupacao =
              totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

            // Taxa de ocupação do dia (média ponderada)
            const taxaOcupacaoDia =
              totalLeitos > 0
                ? (existing.taxaOcupacaoDia * existing.totalLeitos +
                    sector.taxaOcupacaoDia * sector.totalLeitos) /
                  totalLeitos
                : 0;

            // Taxa de ocupação de hoje (média ponderada)
            const taxaOcupacaoHoje =
              totalLeitos > 0
                ? (existing.taxaOcupacaoHoje * existing.totalLeitos +
                    sector.taxaOcupacaoHoje * sector.totalLeitos) /
                  totalLeitos
                : 0;

            // Ocupação máxima atendível (média ponderada)
            const ocupacaoMaximaAtendivel =
              totalLeitos > 0
                ? (existing.ocupacaoMaximaAtendivel * existing.totalLeitos +
                    sector.ocupacaoMaximaAtendivel * sector.totalLeitos) /
                  totalLeitos
                : 0;

            // Recalcular ociosidade e superlotação
            const ociosidade = Math.max(
              0,
              ocupacaoMaximaAtendivel - taxaOcupacao
            );
            const superlotacao = Math.max(
              0,
              taxaOcupacao - ocupacaoMaximaAtendivel
            );

            // Quadro de profissionais
            const quadroEnf =
              (existing.quadroAtualEnfermeiros || 0) +
              (sector.quadroAtualEnfermeiros || 0);
            const quadroTec =
              (existing.quadroAtualTecnicos || 0) +
              (sector.quadroAtualTecnicos || 0);

            // Distribuição de classificação (somar todas as classes)
            const distribuicao = { ...existing.distribuicaoClassificacao };
            for (const [classe, valor] of Object.entries(
              sector.distribuicaoClassificacao || {}
            )) {
              distribuicao[classe] = (distribuicao[classe] || 0) + valor;
            }

            // Atualizar setor agregado
            setoresMap.set(key, {
              ...existing,
              taxaOcupacao: parseFloat(taxaOcupacao.toFixed(2)),
              taxaOcupacaoDia: parseFloat(taxaOcupacaoDia.toFixed(2)),
              taxaOcupacaoHoje: parseFloat(taxaOcupacaoHoje.toFixed(2)),
              ocupacaoMaximaAtendivel: parseFloat(
                ocupacaoMaximaAtendivel.toFixed(2)
              ),
              ociosidade: parseFloat(ociosidade.toFixed(2)),
              superlotacao: parseFloat(superlotacao.toFixed(2)),
              capacidadeProdutiva: parseFloat(
                ocupacaoMaximaAtendivel.toFixed(2)
              ),
              totalLeitos,
              leitosOcupados,
              leitosVagos,
              leitosInativos,
              leitosAvaliados,
              quadroAtualEnfermeiros: quadroEnf,
              quadroAtualTecnicos: quadroTec,
              distribuicaoClassificacao: distribuicao,
            });
          } else {
            // Primeiro setor com este nome
            setoresMap.set(key, { ...sector });
          }
        }
      } catch (error) {
        console.warn(
          `⚠️ Erro ao processar hospital ${hospital.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    // Converter map para array e ordenar por nome
    return Array.from(setoresMap.values()).sort((a, b) =>
      a.sectorName.localeCompare(b.sectorName)
    );
  }

  /**
   * Calcula resumo global agregando todos os setores
   */
  private calcularResumoGlobal(
    sectors: SectorOccupationDTO[]
  ): OccupationSummaryDTO {
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

    const taxaOcupacao =
      totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

    let taxaOcupacaoDia = 0;
    if (totalLeitos > 0) {
      taxaOcupacaoDia = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.taxaOcupacaoDia * peso;
      }, 0);
    }

    let taxaOcupacaoHoje = 0;
    if (totalLeitos > 0) {
      taxaOcupacaoHoje = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.taxaOcupacaoHoje * peso;
      }, 0);
    }

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
}
