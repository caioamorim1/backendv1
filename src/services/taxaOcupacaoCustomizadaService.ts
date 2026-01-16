import { DataSource } from "typeorm";
import { TaxaOcupacaoCustomizada } from "../entities/TaxaOcupacaoCustomizada";
import {
  SalvarTaxaOcupacaoDTO,
  TaxaOcupacaoResponse,
} from "../dto/taxaOcupacao.dto";

export class TaxaOcupacaoCustomizadaService {
  constructor(private ds: DataSource) {}

  /**
   * Salvar ou atualizar taxa de ocupação customizada para uma unidade
   */
  async salvar(data: SalvarTaxaOcupacaoDTO): Promise<TaxaOcupacaoResponse> {
    const repo = this.ds.getRepository(TaxaOcupacaoCustomizada);

    // Validar taxa (deve estar entre 0 e 100)
    if (data.taxa < 0 || data.taxa > 100) {
      throw new Error("Taxa de ocupação deve estar entre 0 e 100");
    }

    // Verificar se já existe uma taxa para esta unidade
    const existente = await repo.findOne({
      where: { unidadeId: data.unidadeId },
    });

    if (existente) {
      // Atualizar existente
      existente.taxa = data.taxa;
      const atualizada = await repo.save(existente);
      return this.toResponse(atualizada);
    } else {
      // Criar nova
      const nova = repo.create({
        unidadeId: data.unidadeId,
        taxa: data.taxa,
      });
      const salva = await repo.save(nova);
      return this.toResponse(salva);
    }
  }

  /**
   * Buscar taxa de ocupação customizada de uma unidade
   */
  async buscar(unidadeId: string): Promise<TaxaOcupacaoResponse | null> {
    const repo = this.ds.getRepository(TaxaOcupacaoCustomizada);
    const taxa = await repo.findOne({
      where: { unidadeId },
    });

    return taxa ? this.toResponse(taxa) : null;
  }

  /**
   * Deletar taxa de ocupação customizada
   */
  async deletar(unidadeId: string): Promise<boolean> {
    const repo = this.ds.getRepository(TaxaOcupacaoCustomizada);
    const resultado = await repo.delete({ unidadeId });
    return (resultado.affected ?? 0) > 0;
  }

  private toResponse(entity: TaxaOcupacaoCustomizada): TaxaOcupacaoResponse {
    return {
      id: entity.id,
      unidadeId: entity.unidadeId,
      taxa: Number(entity.taxa),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
