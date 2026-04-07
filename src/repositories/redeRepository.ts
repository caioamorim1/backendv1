import { DataSource, Repository } from "typeorm";
import { Rede } from "../entities/Rede";
import { Hospital } from "../entities/Hospital";
import { CreateRedeDTO, AtualizarRedeDTO } from "../dto/rede.dto";

export class RedeRepository {
  private repo: Repository<Rede>;
  constructor(private ds: DataSource) {
    this.repo = ds.getRepository(Rede);
  }

  criar(data: CreateRedeDTO) {
    const r = this.repo.create(data as any);
    return this.repo.save(r);
  }

  buscarTodos() {
    return this.repo.find();
  }

  buscarPorId(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  async deletar(id: string) {
    const r = await this.repo.delete(id);
    return (r.affected ?? 0) > 0;
  }

  async atualizar(id: string, data: AtualizarRedeDTO) {
    const result = await this.repo.update(id, data as any);
    return (result.affected ?? 0) > 0;
  }

  async buscarHospitais(redeId: string): Promise<{ id: string; nome: string }[]> {
    const hospRepo = this.ds.getRepository(Hospital);

    // Hospitais vinculados diretamente à rede
    const diretos = await hospRepo
      .createQueryBuilder("h")
      .select(["h.id", "h.nome"])
      .where("h.redeId = :redeId", { redeId })
      .getMany();

    // Hospitais vinculados via regiao.grupo.rede
    const viaRegiao = await hospRepo
      .createQueryBuilder("h")
      .select(["h.id", "h.nome"])
      .innerJoin("h.regiao", "reg")
      .innerJoin("reg.grupo", "grp")
      .innerJoin("grp.rede", "rede")
      .where("rede.id = :redeId", { redeId })
      .andWhere("h.redeId IS NULL")
      .getMany();

    const byId = new Map<string, { id: string; nome: string }>();
    for (const h of [...diretos, ...viaRegiao]) {
      byId.set(h.id, { id: h.id, nome: h.nome });
    }

    return Array.from(byId.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }
}
