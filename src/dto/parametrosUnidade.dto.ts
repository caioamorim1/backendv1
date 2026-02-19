export interface CreateParametrosDTO {
  nome_enfermeiro?: string;
  numero_coren?: string;
  aplicarIST?: boolean;
  ist?: number;
  diasSemana?: number | string;
  cargaHorariaEnfermeiro?: number;
  cargaHorariaTecnico?: number;
  metodoCalculo?: string;
}
