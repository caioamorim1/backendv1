import { DataSource, Repository } from "typeorm";
import { ComentarioUnidade } from "../entities/ComentarioUnidade";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { Colaborador } from "../entities/Colaborador";

export class ComentarioUnidadeRepository {
  private repo: Repository<ComentarioUnidade>;
  private unidadeRepo: Repository<UnidadeInternacao>;
  private colaboradorRepo: Repository<Colaborador>;

  constructor(ds: DataSource) {
    this.repo = ds.getRepository(ComentarioUnidade);
    this.unidadeRepo = ds.getRepository(UnidadeInternacao);
    this.colaboradorRepo = ds.getRepository(Colaborador);
  }

  async criar(unidadeId: string, autorId: string, data: string, texto: string) {
    const unidade = await this.unidadeRepo.findOneByOrFail({ id: unidadeId });
    const autor = await this.colaboradorRepo.findOneBy({ id: autorId });

    const comentario = this.repo.create({
      unidade,
      autor: autor ?? null,
      data,
      texto,
    });

    const saved = await this.repo.save(comentario);
    return this.repo.findOne({
      where: { id: saved.id },
      relations: ["autor"],
    });
  }

  async listarPorDia(unidadeId: string, data: string) {
    return this.repo.find({
      where: { unidade: { id: unidadeId }, data },
      relations: ["autor"],
      order: { criadoEm: "ASC" },
    });
  }

  async deletar(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
