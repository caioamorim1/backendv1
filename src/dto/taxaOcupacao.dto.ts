export interface SalvarTaxaOcupacaoDTO {
  unidadeId: string;
  taxa: number; // Porcentagem (0-100)
  distribuicaoClassificacao?: Record<string, number> | null;
  utilizarComoBaseCalculo?: boolean | null;
}

export interface TaxaOcupacaoResponse {
  id: string;
  unidadeId: string;
  taxa: number;
  distribuicaoClassificacao: Record<string, number> | null;
  utilizarComoBaseCalculo: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
