export interface SalvarTaxaOcupacaoDTO {
  unidadeId: string;
  taxa: number; // Porcentagem (0-100)
  percentualLeitosAvaliados?: number | null;
  distribuicaoClassificacao?: Record<string, number> | null;
  utilizarComoBaseCalculo?: boolean | null;
}

export interface TaxaOcupacaoResponse {
  id: string;
  unidadeId: string;
  taxa: number;
  percentualLeitosAvaliados: number | null;
  distribuicaoClassificacao: Record<string, number> | null;
  utilizarComoBaseCalculo: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}
