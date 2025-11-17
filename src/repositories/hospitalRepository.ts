import { DataSource, Repository } from "typeorm";
import { Hospital } from "../entities/Hospital";
import { Baseline } from "../entities/Baseline";
import { Regiao } from "../entities/Regiao";
import { Rede } from "../entities/Rede";
import { Grupo } from "../entities/Grupo";
import { AtualizarHospitalDTO, CreateHospitalDTO } from "../dto/hospital.dto";
import { create } from "domain";

export class HospitalRepository {
  private repo: Repository<Hospital>;
  private baselineRepo: Repository<Baseline>;
  private regiaoRepo: Repository<Regiao>;
  private redeRepo: Repository<Rede>;
  private grupoRepo: Repository<Grupo>;
  constructor(private ds: DataSource) {
    this.repo = ds.getRepository(Hospital);
    this.baselineRepo = ds.getRepository(Baseline);
    this.regiaoRepo = ds.getRepository(Regiao);
    this.redeRepo = ds.getRepository(Rede);
    this.grupoRepo = ds.getRepository(Grupo);
  }

  async criar(data: CreateHospitalDTO) {
    console.log(
      "[HospitalRepository] criar - entrada data:",
      JSON.stringify(data)
    );

    try {
      // valida duplicidade de CNPJ
      if (data.cnpj) {
        const exists = await this.repo.findOne({
          where: { cnpj: String(data.cnpj) },
        });
        if (exists) {
          console.warn("[HospitalRepository] CNPJ já cadastrado:", data.cnpj);
          throw new Error("CNPJ já cadastrado");
        }
      }

      // Separa os dados do baseline dos dados do hospital
      const { baseline, ...hospitalData } = data;

      // Cria o hospital primeiro (sem baseline)
      const hospital = this.repo.create({
        ...hospitalData,
        telefone:
          hospitalData?.telefone !== undefined &&
          hospitalData?.telefone !== null
            ? String(hospitalData.telefone)
            : undefined,
      });

      // Se vier regiaoId, busca a Regiao e associa ao hospital
      if ((hospitalData as any).regiaoId) {
        const regiao = await this.regiaoRepo.findOne({
          where: { id: (hospitalData as any).regiaoId },
        });
        if (regiao) {
          (hospital as any).regiao = regiao;
        } else {
          console.warn(
            "[HospitalRepository] regiaoId informado mas Regiao não encontrada:",
            (hospitalData as any).regiaoId
          );
        }
      }

      // Se vier redeId, busca a Rede e associa ao hospital
      if ((hospitalData as any).redeId) {
        const rede = await this.redeRepo.findOne({
          where: { id: (hospitalData as any).redeId },
        });
        if (rede) {
          (hospital as any).rede = rede;
        } else {
          console.warn(
            "[HospitalRepository] redeId informado mas Rede não encontrada:",
            (hospitalData as any).redeId
          );
        }
      }

      // Se vier grupoId, busca o Grupo e associa ao hospital
      if ((hospitalData as any).grupoId) {
        const grupo = await this.grupoRepo.findOne({
          where: { id: (hospitalData as any).grupoId },
        });
        if (grupo) {
          (hospital as any).grupo = grupo;
        } else {
          console.warn(
            "[HospitalRepository] grupoId informado mas Grupo não encontrado:",
            (hospitalData as any).grupoId
          );
        }
      }

      const savedHospital = await this.repo.save(hospital);
      console.log("[HospitalRepository] hospital salvo id=", savedHospital.id);

      // Se tem baseline, cria depois com o ID do hospital
      if (baseline) {
        try {
          console.log(
            "[HospitalRepository] criando baseline para hospital=",
            savedHospital.id
          );
          // Associate via relation property so TypeORM correctly sets the FK
          const baselineEntity = this.baselineRepo.create({
            ...baseline,
            hospital: savedHospital,
          } as any);
          const savedBaseline = await this.baselineRepo.save(baselineEntity);
          console.log(
            "[HospitalRepository] baseline salvo id=",
            (savedBaseline as any).id
          );
        } catch (e) {
          console.error(
            "[HospitalRepository] erro ao criar baseline:",
            e instanceof Error ? e.message : e
          );
          // rethrow to let controller report failure (or decide partial success)
          throw e;
        }
      }

      return savedHospital;
    } catch (err) {
      console.error(
        "[HospitalRepository] criar - erro:",
        err instanceof Error ? err.message : err,
        err
      );
      throw err;
    }
  }

  buscarTodos() {
    console.log(
      "Buscando todos os hospitais com relações (baseline, regiao.grupo.rede, rede, grupo)..."
    );
    // Usamos QueryBuilder para garantir join em profundidade: regiao -> grupo -> rede
    // E também os relacionamentos diretos com rede e grupo
    return this.repo
      .createQueryBuilder("hospital")
      .leftJoinAndSelect("hospital.baseline", "baseline")
      .leftJoinAndSelect("hospital.regiao", "regiao")
      .leftJoinAndSelect("regiao.grupo", "grupo")
      .leftJoinAndSelect("grupo.rede", "rede")
      .leftJoinAndSelect("hospital.rede", "hospitalRede")
      .leftJoinAndSelect("hospital.grupo", "hospitalGrupo")
      .getMany();
  }

  buscarPorId(id: string) {
    // Buscar hospital por id incluindo colaboradores, unidades e também regiao -> grupo -> rede
    // Além dos relacionamentos diretos com rede e grupo
    return this.repo
      .createQueryBuilder("hospital")
      .where("hospital.id = :id", { id })
      .leftJoinAndSelect("hospital.colaboradores", "colaboradores")
      .leftJoinAndSelect("hospital.unidades", "unidades")
      .leftJoinAndSelect(
        "hospital.unidadesNaoInternacao",
        "unidadesNaoInternacao"
      )
      .leftJoinAndSelect("hospital.baseline", "baseline")
      .leftJoinAndSelect("hospital.regiao", "regiao")
      .leftJoinAndSelect("regiao.grupo", "grupo")
      .leftJoinAndSelect("grupo.rede", "rede")
      .leftJoinAndSelect("hospital.rede", "hospitalRede")
      .leftJoinAndSelect("hospital.grupo", "hospitalGrupo")
      .getOne();
  }

  async deletar(id: string) {
    const r = await this.repo.delete(id);
    return (r.affected ?? 0) > 0;
  }

  async atualizar(id: string, data: AtualizarHospitalDTO) {
    const patch: any = { ...data };
    delete (patch as any).scpMetodoId;
    if (
      (patch as any).telefone !== undefined &&
      (patch as any).telefone !== null
    ) {
      patch.telefone = String((patch as any).telefone);
    }
    // Se veio regiaoId no patch, tentamos buscar e associar a Regiao
    if ((patch as any).regiaoId !== undefined) {
      // Se for null ou string vazia, remove o relacionamento
      if ((patch as any).regiaoId === null || (patch as any).regiaoId === "") {
        (patch as any).regiao = null;
      } else {
        // Se for um ID válido, busca e associa
        try {
          const regiao = await this.regiaoRepo.findOne({
            where: { id: (patch as any).regiaoId },
          });
          if (regiao) {
            // atualizamos a relação atribuindo a entidade
            (patch as any).regiao = regiao as any;
          } else {
            console.warn(
              "[HospitalRepository] regiaoId informado mas Regiao não encontrada:",
              (patch as any).regiaoId
            );
          }
        } catch (e) {
          console.error("Erro ao buscar Regiao para atualizar hospital:", e);
        }
      }
      // removemos o campo regiaoId para evitar colunas inexistentes no update
      delete (patch as any).regiaoId;
    }

    // Se veio redeId no patch, tentamos buscar e associar a Rede
    if ((patch as any).redeId !== undefined) {
      // Se for null ou string vazia, remove o relacionamento
      if ((patch as any).redeId === null || (patch as any).redeId === "") {
        (patch as any).rede = null;
      } else {
        // Se for um ID válido, busca e associa
        try {
          const rede = await this.redeRepo.findOne({
            where: { id: (patch as any).redeId },
          });
          if (rede) {
            (patch as any).rede = rede as any;
          } else {
            console.warn(
              "[HospitalRepository] redeId informado mas Rede não encontrada:",
              (patch as any).redeId
            );
          }
        } catch (e) {
          console.error("Erro ao buscar Rede para atualizar hospital:", e);
        }
      }
      delete (patch as any).redeId;
    }

    // Se veio grupoId no patch, tentamos buscar e associar o Grupo
    if ((patch as any).grupoId !== undefined) {
      // Se for null ou string vazia, remove o relacionamento
      if ((patch as any).grupoId === null || (patch as any).grupoId === "") {
        (patch as any).grupo = null;
      } else {
        // Se for um ID válido, busca e associa
        try {
          const grupo = await this.grupoRepo.findOne({
            where: { id: (patch as any).grupoId },
          });
          if (grupo) {
            (patch as any).grupo = grupo as any;
          } else {
            console.warn(
              "[HospitalRepository] grupoId informado mas Grupo não encontrado:",
              (patch as any).grupoId
            );
          }
        } catch (e) {
          console.error("Erro ao buscar Grupo para atualizar hospital:", e);
        }
      }
      delete (patch as any).grupoId;
    }

    try {
      const result = await this.repo.update(id, patch);
      return (result.affected ?? 0) > 0;
    } catch (error) {
      console.error("Erro ao atualizar hospital:", error);
    }

    return false;
  }
}
