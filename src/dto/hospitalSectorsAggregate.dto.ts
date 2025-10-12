import {
  StaffDTO,
  CareLevelDTO,
  BedStatusDTO,
  HospitalSectorsDTO,
} from "./hospitalSectors.dto";

export interface InternationSectorWithHospitalDTO {
  id: string;
  name: string;
  hospitalName: string;
  descr: string | null;
  costAmount: number;
  bedCount: number;
  careLevel: CareLevelDTO;
  bedStatus: BedStatusDTO;
  staff: StaffDTO[];
}

export interface AssistanceSectorWithHospitalDTO {
  id: string;
  name: string;
  hospitalName: string;
  descr: string | null;
  costAmount: number;
  staff: StaffDTO[];
}

export interface AggregatedSectorsDTO extends HospitalSectorsDTO {
  hospitalName: string;
}

export interface SectorsAggregateDTO {
  id: string;
  hospitals: AggregatedSectorsDTO[];
}

// ===== DTOs PARA AGREGAÇÃO OTIMIZADA (Múltiplas entidades em 1 chamada) =====

/**
 * Métricas simplificadas para agregação em lote
 * Contém apenas os dados essenciais para o dashboard
 */
export interface GlobalMetricsSimplifiedDTO {
  totalFuncionarios: number;
  totalFuncionariosProjetado: number;
  custoTotal: number;
  custoTotalProjetado: number;
  hospitaisCount: number;
  unidadesInternacao: number;
  unidadesNaoInternacao: number;
}

/**
 * Entidade global agregada (rede, grupo, região ou hospital)
 */
export interface GlobalEntityDTO {
  id: string;
  name: string;
  tipo: "global";
  metrics: GlobalMetricsSimplifiedDTO;
}

/**
 * Lista de entidades agregadas retornada pelas rotas otimizadas
 * Usado por: /networks/all-aggregated, /groups/all-aggregated, etc.
 */
export interface GlobalAggregatedListDTO {
  aggregatedBy: "network" | "group" | "region" | "hospital";
  items: GlobalEntityDTO[];
}

// ===== DTOs PARA AGREGAÇÃO PROJETADA POR SETOR =====

/**
 * Setor de Internação agregado com dados ATUAIS e PROJETADOS
 * Usado pelas rotas: /networks/all-projected-aggregated, etc.
 */
export interface ProjectedInternationSectorDTO {
  id: string;
  name: string;
  entityName: string; // Nome da Rede/Grupo/Região/Hospital
  costAmount: string; // Custo atual agregado
  projectedCostAmount: string; // Custo projetado agregado
  staff: StaffDTO[]; // Funcionários atuais por cargo
  projectedStaff: StaffDTO[]; // Funcionários projetados por cargo
  bedCount: number; // Total de leitos agregados
  careLevel: CareLevelDTO; // Níveis de cuidado agregados
  bedStatus: BedStatusDTO; // Status dos leitos agregados
}

/**
 * Setor de Assistência (Não Internação) agregado com dados ATUAIS e PROJETADOS
 * Usado pelas rotas: /networks/all-projected-aggregated, etc.
 */
export interface ProjectedAssistanceSectorDTO {
  id: string;
  name: string;
  entityName: string; // Nome da Rede/Grupo/Região/Hospital
  costAmount: string; // Custo atual agregado
  projectedCostAmount: string; // Custo projetado agregado
  staff: StaffDTO[]; // Funcionários atuais por cargo
  projectedStaff: StaffDTO[]; // Funcionários projetados por cargo
}

/**
 * Setores agregados por entidade (Rede/Grupo/Região/Hospital) com dados PROJETADOS
 */
export interface ProjectedAggregatedSectorsDTO {
  id: string;
  name: string; // Nome da entidade (Rede/Grupo/Região/Hospital)
  internation: ProjectedInternationSectorDTO[];
  assistance: ProjectedAssistanceSectorDTO[];
}

/**
 * Lista de entidades com setores agregados incluindo dados PROJETADOS
 * Usado por: /networks/all-projected-aggregated, /groups/all-projected-aggregated, etc.
 */
export interface ProjectedSectorsAggregateDTO {
  aggregatedBy: "network" | "group" | "region" | "hospital";
  items: ProjectedAggregatedSectorsDTO[];
}
