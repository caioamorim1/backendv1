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
    | "ADMIN_GLOBAL" // legado
    | "GESTOR_ESTRATEGICO"
    | "GESTOR_TATICO"
    | "GESTOR" // legado
    | "AVALIADOR"
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
    | "ADMIN_GLOBAL" // legado
    | "GESTOR_ESTRATEGICO"
    | "GESTOR_TATICO"
    | "GESTOR" // legado
    | "AVALIADOR"
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
