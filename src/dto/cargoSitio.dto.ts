export interface CreateCargoSitioDTO {
  cargoUnidadeId: string;
  sitioId: string;
  quantidade_funcionarios: number;
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

export interface UpdateCargoSitioDTO {
  quantidade_funcionarios?: number;
  cargoUnidadeId?: string;
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

export interface CargoSitioDTO {
  id: string;
  cargoUnidadeId: string;
  sitioId: string;
  quantidade_funcionarios: number;
  quantidade_atualizada_em?: Date | string;
  // Distribuição por turnos
  seg_sex_manha?: number;
  seg_sex_tarde?: number;
  seg_sex_noite1?: number;
  seg_sex_noite2?: number;
  sab_dom_manha?: number;
  sab_dom_tarde?: number;
  sab_dom_noite1?: number;
  sab_dom_noite2?: number;
}
