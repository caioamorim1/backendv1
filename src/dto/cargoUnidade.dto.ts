export interface CreateCargoUnidadeDTO {
  cargoId: string;
  quantidade_funcionarios: number;
}

export interface UpdateCargoUnidadeDTO {
  cargoId?: string;
  quantidade_funcionarios?: number;
}

export interface CargoUnidadeResponseDTO {
  id: string;
  cargoId: string;
  quantidade_funcionarios: number;
  quantidade_atualizada_em?: Date | string | null;
  cargo: {
    id: string;
    nome: string;
    salario?: string;
    carga_horaria?: string;
    descricao?: string;
    adicionais_tributos?: string;
  };
}
