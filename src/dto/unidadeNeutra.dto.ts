// DTOs para UnidadeNeutra

export interface CreateUnidadeNeutraDTO {
  nome: string;
  hospitalId: string;
  custoTotal: number;
  status?: string;
  descricao?: string;
}

export interface UpdateUnidadeNeutraDTO {
  nome?: string;
  custoTotal?: number;
  status?: string;
  descricao?: string;
}

export interface UnidadeNeutraResponseDTO {
  id: string;
  nome: string;
  custoTotal: number;
  status: string;
  descricao?: string;
  hospitalId: string;
  created_at: Date;
  updated_at: Date;
}
