export interface CreateColaboradorDTO {
  hospitalId: string;
  nome: string;
  email: string;
  cpf: string;
  coren?: string;
  senha?: string; // se não informado, gerar padrão e forçar troca futura
  // Valores granulares (tipo). Mantido o nome do campo por compatibilidade.
  permissao:
    | "ADMIN"
    | "AVALIADOR"
    | "GESTOR_TATICO_TEC_ADM"
    | "GESTOR_TATICO_TECNICO"
    | "GESTOR_TATICO_ADM"
    | "GESTOR_ESTRATEGICO_HOSPITAL"
    | "GESTOR_ESTRATEGICO_REDE"
    // Legado
    | "ADMIN_GLOBAL"
    | "GESTOR_ESTRATEGICO"
    | "GESTOR_TATICO"
    | "GESTOR"
    | "CONSULTOR"
    | "COMUM";
}

export interface UpdateColaboradorDTO {
  nome?: string;
  email?: string;
  cpf?: string;
  coren?: string;
  permissao?:
    | "ADMIN"
    | "AVALIADOR"
    | "GESTOR_TATICO_TEC_ADM"
    | "GESTOR_TATICO_TECNICO"
    | "GESTOR_TATICO_ADM"
    | "GESTOR_ESTRATEGICO_HOSPITAL"
    | "GESTOR_ESTRATEGICO_REDE"
    // Legado
    | "ADMIN_GLOBAL"
    | "GESTOR_ESTRATEGICO"
    | "GESTOR_TATICO"
    | "GESTOR"
    | "CONSULTOR"
    | "COMUM";
}

export interface CreateAdminDTO {
  nome?: string;
  cpf?: string;
  coren?: string;
  email?: string;
  senha?: string;
}

export interface LoginAdminDTO {
  email: string;
  senha: string;
}
