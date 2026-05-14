import jwt from "jsonwebtoken";

const JWT_SECRET = "secreto"; // mesmo default do authMiddleware / authService

export interface TestUser {
  id: string;
  nome: string;
  tipo: string;
  role?: string;
  hospital?: { id: string; nome: string };
  redeId?: string;
  mustChangePassword?: boolean;
}

/**
 * Gera um JWT válido para uso nos testes.
 * O secret "secreto" é o mesmo valor padrão usado em authMiddleware.ts.
 */
export function makeToken(user: TestUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "8h" });
}

export const HOSPITAL_ID = "hosp-aaa-111";
export const REDE_ID = "rede-bbb-222";

export const TOKENS = {
  ADM: makeToken({
    id: "user-adm",
    nome: "Admin",
    tipo: "ADMIN",
    role: "ADMIN",
  }),

  AVALIADOR: makeToken({
    id: "user-av",
    nome: "Avaliador",
    tipo: "AVALIADOR",
    role: "COMUM",
    hospital: { id: HOSPITAL_ID, nome: "Hospital Teste" },
  }),

  GTT: makeToken({
    id: "user-gtt",
    nome: "Gestor Tático T+A",
    tipo: "GESTOR_TATICO_TEC_ADM",
    role: "GESTOR",
    hospital: { id: HOSPITAL_ID, nome: "Hospital Teste" },
  }),

  GEH: makeToken({
    id: "user-geh",
    nome: "Gestor Estratégico Hospital",
    tipo: "GESTOR_ESTRATEGICO_HOSPITAL",
    role: "GESTOR",
    hospital: { id: HOSPITAL_ID, nome: "Hospital Teste" },
  }),

  GER: makeToken({
    id: "user-ger",
    nome: "Gestor Estratégico Rede",
    tipo: "GESTOR_ESTRATEGICO_REDE",
    role: "GESTOR",
    redeId: REDE_ID,
  }),

  /** Usuário de hospital diferente — útil para testar bloqueio por escopo */
  GTT_OUTRO_HOSPITAL: makeToken({
    id: "user-gtt-2",
    nome: "Gestor de outro hospital",
    tipo: "GESTOR_TATICO_TEC_ADM",
    role: "GESTOR",
    hospital: { id: "outro-hospital-999", nome: "Hospital B" },
  }),
};
