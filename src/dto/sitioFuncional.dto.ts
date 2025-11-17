export interface SitioFuncionalDTO {
  id: string;
  unidadeId: string;
  nome?: string;
  descricao?: string;
  numeroPositions: number;
}

export interface CriarSitioFuncionalDTO {
  unidadeId: string;
  nome?: string;
  descricao?: string;
  numeroPositions: number;
}

export interface AtualizarSitioFuncionalDTO {
  numero?: string;
  nome?: string;
  descricao?: string;
  numeroPositions?: number;
}

// Allow providing cargos when creating/updating a sitio. Each item may
// include either `cargoUnidadeId` (preferred) or `cargoId` (frontend may
// provide this). quantidade_funcionarios is optional and defaults to 1.
export interface SitioCargoInputDTO {
  cargoUnidadeId?: string;
  cargoId?: string;
  quantidade_funcionarios?: number;
  // Distribuição por turnos (opcional)
  seg_sex_manha?: number;
  seg_sex_tarde?: number;
  seg_sex_noite1?: number;
  seg_sex_noite2?: number;
  sab_dom_manha?: number;
  sab_dom_tarde?: number;
  sab_dom_noite1?: number;
  sab_dom_noite2?: number;
}

export interface SitioDistribuicaoInputDTO {
  categoria: "ENF" | "TEC";
  segSexManha?: number;
  segSexTarde?: number;
  segSexNoite1?: number;
  segSexNoite2?: number;
  sabDomManha?: number;
  sabDomTarde?: number;
  sabDomNoite1?: number;
  sabDomNoite2?: number;
}

export interface CriarSitioFuncionalDTOWithCargos
  extends CriarSitioFuncionalDTO {
  cargos?: SitioCargoInputDTO[];
  distribuicoes?: SitioDistribuicaoInputDTO[];
}

export interface AtualizarSitioFuncionalDTOWithCargos
  extends AtualizarSitioFuncionalDTO {
  cargos?: SitioCargoInputDTO[];
  distribuicoes?: SitioDistribuicaoInputDTO[];
}
