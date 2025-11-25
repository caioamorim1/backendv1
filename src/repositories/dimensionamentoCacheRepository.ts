import { DataSource, Repository, LessThan } from "typeorm";
import { DimensionamentoCache } from "../entities/DimensionamentoCache";
import * as crypto from "crypto";

export class DimensionamentoCacheRepository {
  private repo: Repository<DimensionamentoCache>;

  constructor(private ds: DataSource) {
    this.repo = ds.getRepository(DimensionamentoCache);
  }

  /**
   * Buscar cache válido para uma unidade
   * @param unidadeId - ID da unidade (internação ou não-internação)
   * @param tipoUnidade - Tipo da unidade
   * @param validadeMinutos - Minutos de validade do cache (padrão: 30)
   * @returns Cache válido ou null
   */
  async buscarCacheValido(
    unidadeId: string,
    tipoUnidade: "INTERNACAO" | "NAO_INTERNACAO",
    validadeMinutos: number = 30
  ): Promise<DimensionamentoCache | null> {
    const dataLimite = new Date();
    dataLimite.setMinutes(dataLimite.getMinutes() - validadeMinutos);

    const cache = await this.repo.findOne({
      where: {
        unidadeId,
        tipoUnidade,
      },
      order: {
        updatedAt: "DESC",
      },
    });

    // Verificar se cache existe e ainda é válido
    if (cache && cache.updatedAt >= dataLimite) {
      console.log(
        `✅ [CACHE HIT] Unidade ${unidadeId} - Cache de ${Math.round(
          (Date.now() - cache.updatedAt.getTime()) / 1000
        )}s atrás`
      );
      return cache;
    }

    if (cache) {
      console.log(
        `⏰ [CACHE EXPIRED] Unidade ${unidadeId} - Cache expirado (${Math.round(
          (Date.now() - cache.updatedAt.getTime()) / 60000
        )} min)`
      );
    } else {
      console.log(`❌ [CACHE MISS] Unidade ${unidadeId} - Sem cache`);
    }

    return null;
  }

  /**
   * Salvar ou atualizar cache para uma unidade
   */
  async salvarCache(
    hospitalId: string,
    unidadeId: string,
    tipoUnidade: "INTERNACAO" | "NAO_INTERNACAO",
    dados: any,
    parametros?: any,
    tempoCalculoMs?: number
  ): Promise<DimensionamentoCache> {
    // Gerar hash dos parâmetros (se fornecidos)
    const hashParametros = parametros
      ? crypto
          .createHash("md5")
          .update(JSON.stringify(parametros))
          .digest("hex")
      : undefined;

    // Verificar se já existe cache para esta unidade
    const cacheExistente = await this.repo.findOne({
      where: {
        unidadeId,
        tipoUnidade,
      },
    });

    if (cacheExistente) {
      // Atualizar cache existente
      cacheExistente.hospitalId = hospitalId;
      cacheExistente.dados = dados;
      cacheExistente.hashParametros = hashParametros;
      cacheExistente.metadata = {
        versaoCalculo: "1.0",
        tempoCalculoMs,
        quantidadeRegistros:
          dados?.tabela?.length || dados?.dimensionamento?.totalRegistros || 0,
      };

      const updated = await this.repo.save(cacheExistente);
      console.log(`🔄 [CACHE UPDATE] Unidade ${unidadeId} - Cache atualizado`);
      return updated;
    } else {
      // Criar novo cache
      const novoCache = this.repo.create({
        hospitalId,
        unidadeId,
        tipoUnidade,
        dados,
        hashParametros,
        metadata: {
          versaoCalculo: "1.0",
          tempoCalculoMs,
          quantidadeRegistros:
            dados?.tabela?.length ||
            dados?.dimensionamento?.totalRegistros ||
            0,
        },
      });

      const saved = await this.repo.save(novoCache);
      console.log(`💾 [CACHE CREATE] Unidade ${unidadeId} - Cache criado`);
      return saved;
    }
  }

  /**
   * Buscar múltiplos caches válidos de uma vez (batch)
   */
  async buscarCachesValidosBatch(
    unidades: Array<{
      unidadeId: string;
      tipoUnidade: "INTERNACAO" | "NAO_INTERNACAO";
    }>,
    validadeMinutos: number = 30
  ): Promise<Map<string, DimensionamentoCache>> {
    if (unidades.length === 0) {
      return new Map();
    }

    const dataLimite = new Date();
    dataLimite.setMinutes(dataLimite.getMinutes() - validadeMinutos);

    const unidadeIds = unidades.map((u) => u.unidadeId);

    const caches = await this.repo
      .createQueryBuilder("cache")
      .where("cache.unidadeId IN (:...unidadeIds)", { unidadeIds })
      .andWhere("cache.updatedAt >= :dataLimite", { dataLimite })
      .getMany();

    const map = new Map<string, DimensionamentoCache>();
    for (const cache of caches) {
      map.set(cache.unidadeId, cache);
    }

    console.log(
      `📦 [CACHE BATCH] ${map.size}/${unidades.length} caches válidos encontrados`
    );

    return map;
  }

  /**
   * Invalidar cache de uma unidade específica
   */
  async invalidarCache(
    unidadeId: string,
    tipoUnidade: "INTERNACAO" | "NAO_INTERNACAO"
  ): Promise<boolean> {
    const result = await this.repo.delete({
      unidadeId,
      tipoUnidade,
    });

    const deletado = (result.affected ?? 0) > 0;
    if (deletado) {
      console.log(
        `🗑️  [CACHE INVALIDATE] Unidade ${unidadeId} - Cache removido`
      );
    }

    return deletado;
  }

  /**
   * Invalidar todos os caches de um hospital
   */
  async invalidarCachesPorHospital(hospitalId: string): Promise<number> {
    const result = await this.repo.delete({ hospitalId });
    const count = result.affected ?? 0;
    console.log(
      `🗑️  [CACHE INVALIDATE] Hospital ${hospitalId} - ${count} caches removidos`
    );
    return count;
  }

  /**
   * Obter estatísticas do cache
   */
  async obterEstatisticas(): Promise<{
    totalCaches: number;
    cachesPorTipo: { INTERNACAO: number; NAO_INTERNACAO: number };
    tempoMedioCalculo: number;
    cachesMaisAntigos: Date | null;
  }> {
    const [total, internacao, naoInternacao] = await Promise.all([
      this.repo.count(),
      this.repo.count({ where: { tipoUnidade: "INTERNACAO" } }),
      this.repo.count({ where: { tipoUnidade: "NAO_INTERNACAO" } }),
    ]);

    const cacheMaisAntigo = await this.repo.findOne({
      order: { updatedAt: "ASC" },
    });

    // Calcular tempo médio de cálculo
    const cachesComTempo = await this.repo
      .createQueryBuilder("cache")
      .select("AVG((cache.metadata->>'tempoCalculoMs')::numeric)", "media")
      .where("cache.metadata->>'tempoCalculoMs' IS NOT NULL")
      .getRawOne();

    return {
      totalCaches: total,
      cachesPorTipo: {
        INTERNACAO: internacao,
        NAO_INTERNACAO: naoInternacao,
      },
      tempoMedioCalculo: cachesComTempo?.media
        ? parseFloat(cachesComTempo.media)
        : 0,
      cachesMaisAntigos: cacheMaisAntigo?.updatedAt || null,
    };
  }

  /**
   * Limpar cache de uma unidade específica
   */
  async limparCachePorUnidade(unidadeId: string): Promise<number> {
    const result = await this.repo.delete({ unidadeId });
    console.log(
      `🗑️ [CACHE CLEAR] Unidade ${unidadeId} - ${
        result.affected || 0
      } caches removidos`
    );
    return result.affected || 0;
  }

  /**
   * Limpar cache de um hospital específico
   */
  async limparCachePorHospital(hospitalId: string): Promise<number> {
    const result = await this.repo.delete({ hospitalId });
    console.log(
      `🗑️ [CACHE CLEAR] Hospital ${hospitalId} - ${
        result.affected || 0
      } caches removidos`
    );
    return result.affected || 0;
  }

  /**
   * Limpar todo o cache
   */
  async limparTodoCache(): Promise<number> {
    const result = await this.repo.delete({});
    console.log(
      `🗑️ [CACHE CLEAR ALL] ${result.affected || 0} caches removidos`
    );
    return result.affected || 0;
  }

  /**
   * Limpar caches expirados
   */
  async limparCachesExpirados(validadeMinutos: number = 30): Promise<number> {
    const dataLimite = new Date();
    dataLimite.setMinutes(dataLimite.getMinutes() - validadeMinutos);

    const result = await this.repo.delete({
      updatedAt: LessThan(dataLimite),
    });
    console.log(
      `🗑️ [CACHE CLEAR EXPIRED] ${
        result.affected || 0
      } caches expirados removidos`
    );
    return result.affected || 0;
  }
}
