import { DataSource, getRepository } from "typeorm";

import { Colaborador } from "../entities/Colaborador";
import { Hospital } from "../entities/Hospital";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "secreto";

export type AuthResult = {
  token: string;
  nome: string;
  id: string;
  hospital?: { id: string; nome: string };
  tipo?: string;
  role?: string;
  mustChangePassword?: boolean;
  redeId?: string;
};

function roleFromTipo(tipo: string | undefined): "ADMIN" | "GESTOR" | "COMUM" {
  if (!tipo) return "COMUM";
  if (tipo === "ADMIN" || tipo === "ADMIN_GLOBAL") return "ADMIN";
  if (tipo.startsWith("GESTOR_")) return "GESTOR";
  return "COMUM";
}

function normalizeTipo(tipo: string | undefined): string | undefined {
  if (!tipo) return undefined;
  if (tipo === "ADMIN_GLOBAL") return "ADMIN";
  if (tipo === "GESTOR") return "GESTOR_TATICO";
  return tipo;
}

export class AuthService {
  private colaboradorRepo = this.ds.getRepository(Colaborador);

  constructor(private ds: DataSource) {}

  /**
   * Unified login: tries admin by email first, then collaborator by email.
   * Returns AuthResult with token + nome + hospital + cargo + role.
   */
  async login(email: string, senha: string): Promise<AuthResult | null> {
    console.log("[AuthService] buscando colaborador com email:", email);
    const user = (await this.colaboradorRepo.findOne({
      where: { email },
      relations: ["hospital", "hospital.rede", "hospital.regiao", "hospital.regiao.grupo", "hospital.regiao.grupo.rede"],
    })) as Colaborador;
    if (!user) {
      console.log("[AuthService] colaborador não encontrado:", email);
      return null;
    }
    if (!user.senha) {
      console.log("[AuthService] colaborador sem senha definida:", email);
      return null;
    }
    const okCol = await bcrypt.compare(senha, user.senha as string);
    if (!okCol) {
      console.log("[AuthService] senha incorreta para:", email, "| tem CPF:", (user as any).cpf ? "sim (senha padrão = CPF)" : "não (senha padrão = email)");
      return null;
    }
    console.log("[AuthService] autenticado:", email, "| permissao:", (user as any).permissao, "| mustChangePassword:", user.mustChangePassword);
    console.log("[AuthService] info: senha padrão é o CPF (se tiver) ou o email. CPF cadastrado:", (user as any).cpf ? "sim" : "não");

    const tipoRaw = (user as any).permissao as string | undefined;
    const tipo = normalizeTipo(tipoRaw);
    const role = roleFromTipo(tipo);

    // Resolve redeId para GESTOR_ESTRATEGICO_REDE
    let redeId: string | undefined;
    if (tipo === "GESTOR_ESTRATEGICO_REDE") {
      redeId =
        (user.hospital as any)?.rede?.id ??
        (user.hospital as any)?.regiao?.grupo?.rede?.id;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        nome: user.nome,
        tipo,
        role,
        mustChangePassword: user.mustChangePassword,
        hospital: user.hospital
          ? { id: user.hospital.id, nome: user.hospital.nome }
          : undefined,
        redeId,
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return {
      token,
      nome: user.nome,
      id: user.id,
      hospital: user.hospital
        ? { id: user.hospital.id, nome: user.hospital.nome }
        : undefined,
      tipo,
      role,
      mustChangePassword: user.mustChangePassword,
      redeId,
    };
  }

  // Keep a simple logout verifier that just checks token validity (stateless)
  async verifyToken(token: string): Promise<boolean> {
    try {
      jwt.verify(token, JWT_SECRET);
      return true;
    } catch {
      return false;
    }
  }
}
