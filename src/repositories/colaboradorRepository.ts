import { DataSource, In, Repository } from "typeorm";
import { Colaborador } from "../entities/Colaborador";
import { Hospital } from "../entities/Hospital";
// import { Cargo } from "../entities/Cargo";
import {
  CreateAdminDTO,
  CreateColaboradorDTO,
  UpdateColaboradorDTO,
} from "../dto/colaborador.dto";
import * as bcrypt from "bcrypt";
import { hash } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "secreto";

type ColaboradorTipo =
  | "ADMIN"
  | "ADMIN_GLOBAL"
  | "GESTOR_ESTRATEGICO"
  | "GESTOR_TATICO"
  | "AVALIADOR"
  | "CONSULTOR"
  | "COMUM";

function mapLegacyPermissao(permissao: string | undefined): ColaboradorTipo {
  // Compatibilidade com payloads antigos (ADMIN/GESTOR/COMUM)
  if (!permissao) return "COMUM";
  const p = permissao.toUpperCase();
  if (p === "ADMIN") return "ADMIN";
  if (p === "ADMIN_GLOBAL") return "ADMIN";
  if (p === "GESTOR") return "GESTOR_TATICO";
  if (p === "COMUM") return "COMUM";
  // Se já veio um tipo novo, tenta passar direto
  return permissao as ColaboradorTipo;
}

function normalizeTipoForResponse(
  permissao: string | undefined
): ColaboradorTipo {
  return mapLegacyPermissao(permissao);
}

export class ColaboradorRepository {
  private repo: Repository<Colaborador>;
  private hospitalRepo: Repository<Hospital>;
  // private cargoRepo: Repository<Cargo>;

  constructor(ds: DataSource) {
    this.repo = ds.getRepository(Colaborador);
    this.hospitalRepo = ds.getRepository(Hospital);
    // this.cargoRepo = ds.getRepository(Cargo);
  }

  criar = async (data: CreateColaboradorDTO) => {
    const hospital = await this.hospitalRepo.findOneByOrFail({
      id: data.hospitalId,
    });

    // CPF único (se fornecido)
    if (data.cpf) {
      const existing = await this.repo.findOne({ where: { cpf: data.cpf } });
      if (existing) {
        throw new Error("CPF já cadastrado");
      }
    }

    // Senha padrão: CPF se fornecido, senão o email
    const initialPlain = data.cpf || data.email;
    const senhaHash = await bcrypt.hash(initialPlain, 10);

    const tipo = mapLegacyPermissao(
      (data as any).tipo ?? (data as any).permissao
    );
    if (tipo === "AVALIADOR" && !data.coren) {
      throw new Error("coren é obrigatório quando tipo/permissao é AVALIADOR");
    }

    const novo = this.repo.create({
      hospital: hospital,
      nome: data.nome,
      email: data.email,
      cpf: data.cpf,
      coren: data.coren,
      senha: senhaHash,
      mustChangePassword: true,
      permissao: tipo,
    } as any);
    const saved = await this.repo.save(novo);
    // não retornar hash
    const { senha, ...rest } = saved as any;
    return { ...rest, tipo: normalizeTipoForResponse(rest.permissao) };
  };

  /**
   * Troca a senha do colaborador.
   * - se oldPassword for fornecida, valida antes de trocar.
   * - se não for fornecida (ex.: admin forçando primeiro reset), apenas atualiza.
   */
  changePassword = async (id: string, newPassword: string) => {
    const col = await this.repo.findOneByOrFail({ id });

    const hash = await bcrypt.hash(newPassword, 10);
    col.senha = hash;
    col.mustChangePassword = false;
    await this.repo.save(col);
    const { senha, ...rest } = col as any;
    return rest;
  };

  listar = async (hospitalId?: string) => {
    const base = this.repo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.hospital", "hospital")
      .orderBy("c.nome", "ASC");
    if (hospitalId) base.where("hospital.id = :hid", { hid: hospitalId });
    const rows = await base.getMany();
    return rows.map(({ senha, ...rest }) => ({
      ...(rest as any),
      tipo: normalizeTipoForResponse((rest as any).permissao),
    }));
  };

  criarAdmin = async (data: CreateAdminDTO) => {
    const { nome, cpf, email, senha } = data;
    if (!senha) throw new Error("Senha é obrigatória para criar admin");
    if (!email) throw new Error("Email é obrigatório para criar admin");

    const hash = await bcrypt.hash(senha, 10);

    const novo = this.repo.create({
      nome: nome,
      cpf: cpf || undefined,
      email: email,
      senha: hash,
      permissao: "ADMIN",
      mustChangePassword: true,
    });

    await this.repo.save(novo);
    const { senha: _, ...rest } = novo as any;
    return rest;
  };

  deletarAdmin = async (id: string) => {
    const r = await this.repo.delete({
      id,
      permissao: In(["ADMIN", "ADMIN_GLOBAL"]) as any,
    });
    return (r.affected ?? 0) > 0;
  };

  listarAdmins = async () => {
    const rows = await this.repo.find({
      where: { permissao: In(["ADMIN", "ADMIN_GLOBAL"]) as any },
    });
    return rows.map(({ senha, ...rest }) => ({
      ...(rest as any),
      tipo: normalizeTipoForResponse((rest as any).permissao),
    }));
  };

  obter = async (id: string) => {
    const col = await this.repo.findOne({
      where: { id },
      relations: ["hospital", "hospital.unidades"],
    });
    if (!col) throw new Error("Colaborador não encontrado");
    const { senha, ...rest } = col as any;
    return { ...rest, tipo: normalizeTipoForResponse(rest.permissao) };
  };

  atualizar = async (
    id: string,
    data: UpdateColaboradorDTO & { hospitalId?: string }
  ) => {
    // Buscar o colaborador atual para obter o hospitalId
    const colaboradorAtual = await this.repo.findOne({
      where: { id },
      relations: ["hospital"],
    });
    if (!colaboradorAtual) throw new Error("Colaborador não encontrado");

    // Clone dos dados recebidos
    const updateData: Partial<Colaborador> = { ...data } as any;
    const incomingTipo = (data as any).tipo ?? (data as any).permissao;
    if (incomingTipo) {
      const tipo = mapLegacyPermissao(incomingTipo);
      (updateData as any).permissao = tipo;
      if (tipo === "AVALIADOR" && (data as any).coren === undefined) {
        // mantém regra: avaliador precisa de coren
        throw new Error(
          "coren é obrigatório quando tipo/permissao é AVALIADOR"
        );
      }
    }
    if (data.coren !== undefined) {
      updateData.coren = data.coren;
    }

    if ((data as any).hospitalId) {
      const hospital = await this.hospitalRepo.findOneByOrFail({
        id: (data as any).hospitalId,
      });
      (updateData as any).hospital = hospital;
      delete (updateData as any).hospitalId;
    }

    // Executa update (TypeORM aceita objeto com relação atribuída)
    await this.repo.update(id, updateData as any);

    // Retorna o colaborador atualizado com relação carregada
    const col = await this.repo.findOne({
      where: { id },
      relations: ["hospital"],
    });
    if (!col) throw new Error("Colaborador não encontrado");
    const { senha, ...rest } = col as any;
    return { ...rest, tipo: normalizeTipoForResponse(rest.permissao) };
  };

  deletar = async (id: string) => {
    const r = await this.repo.delete(id);
    return (r.affected ?? 0) > 0;
  };
}
