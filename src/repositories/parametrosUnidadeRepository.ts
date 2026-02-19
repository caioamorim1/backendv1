import { DataSource, Repository } from "typeorm";
import { ParametrosUnidade } from "../entities/ParametrosUnidade";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { CreateParametrosDTO } from "../dto/parametrosUnidade.dto";

export class ParametrosUnidadeRepository {
  private repo: Repository<ParametrosUnidade>;
  private unidadeRepo: Repository<UnidadeInternacao>;

  constructor(ds: DataSource) {
    this.repo = ds.getRepository(ParametrosUnidade);
    this.unidadeRepo = ds.getRepository(UnidadeInternacao);
  }

  async obterPorUnidadeId(unidadeId: string) {
    return this.repo.findOne({
      where: { unidade: { id: unidadeId } },
      relations: ["unidade"],
    });
  }

  async create(unidadeId: string, data: CreateParametrosDTO) {
    const unidade = await this.unidadeRepo.findOneByOrFail({ id: unidadeId });
    const existente = await this.obterPorUnidadeId(unidadeId);

    // Normaliza diasSemana para número (front pode enviar como string)
    const sanitized = {
      ...data,
      diasSemana:
        data.diasSemana !== undefined && data.diasSemana !== null
          ? parseInt(String(data.diasSemana), 10)
          : undefined,
    };

    if (existente) {
      Object.assign(existente, sanitized);
      return this.repo.save(existente);
    }

    const novo = this.repo.create({ unidade, ...sanitized });
    return this.repo.save(novo);
  }

  async deletar(unidadeId: string) {
    const existente = await this.obterPorUnidadeId(unidadeId);
    if (!existente) return false;
    const r = await this.repo.delete(existente.id);
    return (r.affected ?? 0) > 0;
  }
}
