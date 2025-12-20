/**
 * DTO para análise de taxa de ocupação por setor
 */
export interface SectorOccupationDTO {
  sectorId: string;
  sectorName: string;
  sectorType: "internacao" | "nao_internacao";
  taxaOcupacao: number; // % (0-100+) - Taxa atual baseada em leitos (momento atual)
  taxaOcupacaoDia: number; // % (0-100+) - Taxa média de ocupação do período (mês até hoje)
  taxaOcupacaoHoje: number; // % (0-100+) - Taxa de ocupação específica de hoje
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
  // Distribuição de classificação dos pacientes
  distribuicaoClassificacao?: Record<string, number>;
}

/**
 * Resumo global de ocupação do hospital
 */
export interface OccupationSummaryDTO {
  sectorName: string; // "Global"
  taxaOcupacao: number; // Taxa atual (média ponderada do momento)
  taxaOcupacaoDia: number; // Taxa média do período (mês até hoje)
  taxaOcupacaoHoje: number; // Taxa de ocupação específica de hoje
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

/**
 * Dados de ocupação de um mês específico
 */
export interface MonthlyOccupationData {
  month: string; // "2025-08" (YYYY-MM)
  monthLabel: string; // "Agosto/2025"
  taxaOcupacao: number; // % média do mês
}

/**
 * Dashboard de ocupação por setor (ocupação máxima + histórico 4 meses)
 */
export interface SectorOccupationDashboardDTO {
  sectorId: string;
  sectorName: string;
  sectorType: "internacao" | "nao_internacao";
  ocupacaoMaximaAtendivel: number; // % - Capacidade máxima com quadro atual
  historico4Meses: MonthlyOccupationData[]; // Últimos 4 meses (mais antigo primeiro)
}

/**
 * Resumo dashboard para todo o hospital
 */
export interface HospitalOccupationDashboardSummary {
  ocupacaoMaximaAtendivel: number; // Média ponderada
  historico4Meses: MonthlyOccupationData[]; // Últimos 4 meses (média ponderada)
}

/**
 * Response completo do dashboard de ocupação
 */
export interface OccupationDashboardResponse {
  hospitalId: string;
  hospitalName: string;
  sectors: SectorOccupationDashboardDTO[];
  summary: HospitalOccupationDashboardSummary;
}
