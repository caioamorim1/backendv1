export interface SalvarTaxaOcupacaoDTO {
  unidadeId: string;
  taxa: number; // Porcentagem (0-100)
}

export interface TaxaOcupacaoResponse {
  id: string;
  unidadeId: string;
  taxa: number;
  createdAt: Date;
  updatedAt: Date;
}
