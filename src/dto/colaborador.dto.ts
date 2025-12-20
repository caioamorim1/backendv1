export interface CreateColaboradorDTO {
  hospitalId: string;
  nome: string;
  email: string;
  cpf: string;
  coren?: string;
  senha?: string; // se não informado, gerar padrão e forçar troca futura
  permissao: "ADMIN" | "GESTOR" | "COMUM";
}

export interface UpdateColaboradorDTO {
  nome?: string;
  email?: string;
  cpf?: string;
  coren?: string;
  permissao?: "ADMIN" | "GESTOR" | "COMUM";
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
