/**
 * DTO para análise de taxa de ocupação por setor
 */
export interface SectorOccupationDTO {
  sectorId: string;
  sectorName: string;
  sectorType: "internacao" | "nao_internacao";
  taxaOcupacao: number; // % (0-100+) - Taxa atual baseada em leitos (momento atual)
  taxaOcupacaoDia: number; // % (0-100+) - Taxa média de ocupação do dia inteiro
  ocupacaoMaximaAtendivel: number; // % - Ocupação máxima que o quadro atual de profissionais pode atender
  ociosidade: number; // % (calculado: max(0, ocupacaoMaximaAtendivel - taxaOcupacao))
  superlotacao: number; // % (calculado: max(0, taxaOcupacao - ocupacaoMaximaAtendivel))
  capacidadeProdutiva: number; // % (fixo em 100)
  totalLeitos: number;
  leitosOcupados: number;
  leitosVagos: number;
  leitosInativos: number;
  leitosAvaliados: number;
  // Dados do quadro de profissionais (para cálculo de ocupação máxima)
  quadroAtualEnfermeiros?: number;
  quadroAtualTecnicos?: number;
}

/**
 * Resumo global de ocupação do hospital
 */
export interface OccupationSummaryDTO {
  sectorName: string; // "Global"
  taxaOcupacao: number; // Taxa atual (média ponderada do momento)
  taxaOcupacaoDia: number; // Taxa média do dia inteiro
  ocupacaoMaximaAtendivel: number; // Ocupação máxima baseada no quadro
  ociosidade: number;
  superlotacao: number;
  capacidadeProdutiva: number;
  totalLeitos: number; // Soma de todos
  leitosOcupados: number; // Soma de todos
  leitosVagos: number;
  leitosInativos: number;
  leitosAvaliados: number;
}

/**
 * Response completo da API de análise de ocupação
 */
export interface OccupationAnalysisResponse {
  hospitalId: string;
  hospitalName: string;
  sectors: SectorOccupationDTO[];
  summary: OccupationSummaryDTO;
}
