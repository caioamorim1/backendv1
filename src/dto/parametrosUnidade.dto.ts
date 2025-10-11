export interface CreateParametrosDTO {
  nome: string;
  numero_coren: string;
  aplicarIST?: boolean;
  ist?: number;
  diasSemana?: number;
  cargaHorariaEnfermeiro?: number; // Carga horária semanal (padrão 36h)
  cargaHorariaTecnico?: number; // Carga horária semanal (padrão 36h)
}
