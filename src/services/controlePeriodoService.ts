import { DataSource } from "typeorm";
import { UnidadePeriodoControle } from "../entities/UnidadePeriodoControle";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";

export class ControlePeriodoService {
  constructor(private ds: DataSource) {}

  private isISODate(d?: string): d is string {
    return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  }

  async salvar(params: {
    unidadeId: string;
    travado: boolean;
    dataInicial: string;
    dataFinal: string;
  }): Promise<UnidadePeriodoControle> {
    const { unidadeId, travado, dataInicial, dataFinal } = params;

    if (!unidadeId) throw new Error("unidadeId é obrigatório");
    if (!this.isISODate(dataInicial) || !this.isISODate(dataFinal)) {
      throw new Error("Datas devem estar no formato YYYY-MM-DD");
    }

    const repo = this.ds.getRepository(UnidadePeriodoControle);
    const registro = repo.create({
      unidade: { id: unidadeId } as UnidadeInternacao,
      travado: !!travado,
      dataInicial,
      dataFinal,
    });

    return await repo.save(registro);
  }

  async buscarPorUnidade(
    unidadeId: string
  ): Promise<UnidadePeriodoControle | null> {
    if (!unidadeId) throw new Error("unidadeId é obrigatório");
    const repo = this.ds.getRepository(UnidadePeriodoControle);
    return await repo.findOne({
      where: { unidade: { id: unidadeId } },
      order: { updatedAt: "DESC" },
    });
  }
}
