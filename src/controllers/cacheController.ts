import { Request, Response } from "express";
import { AppDataSource } from "../ormconfig";
import { DimensionamentoCacheRepository } from "../repositories/dimensionamentoCacheRepository";

export class CacheController {
  /**
   * Limpar cache de uma unidade específica
   */
  static async clearByUnit(req: Request, res: Response) {
    try {
      const { unidadeId } = req.params;

      if (!unidadeId) {
        return res.status(400).json({ error: "unidadeId é obrigatório" });
      }

      const cacheRepo = new DimensionamentoCacheRepository(AppDataSource);
      const count = await cacheRepo.limparCachePorUnidade(unidadeId);

      return res.json({
        success: true,
        message: `Cache limpo para unidade ${unidadeId}`,
        cachesRemovidos: count,
      });
    } catch (error) {
      console.error("Erro ao limpar cache por unidade:", error);
      return res.status(500).json({ error: "Erro ao limpar cache" });
    }
  }

  /**
   * Limpar cache de um hospital específico
   */
  static async clearByHospital(req: Request, res: Response) {
    try {
      const { hospitalId } = req.params;

      if (!hospitalId) {
        return res.status(400).json({ error: "hospitalId é obrigatório" });
      }

      const cacheRepo = new DimensionamentoCacheRepository(AppDataSource);
      const count = await cacheRepo.limparCachePorHospital(hospitalId);

      return res.json({
        success: true,
        message: `Cache limpo para hospital ${hospitalId}`,
        cachesRemovidos: count,
      });
    } catch (error) {
      console.error("Erro ao limpar cache por hospital:", error);
      return res.status(500).json({ error: "Erro ao limpar cache" });
    }
  }

  /**
   * Limpar todo o cache
   */
  static async clearAll(req: Request, res: Response) {
    try {
      const cacheRepo = new DimensionamentoCacheRepository(AppDataSource);
      const count = await cacheRepo.limparTodoCache();

      return res.json({
        success: true,
        message: "Todo o cache foi limpo",
        cachesRemovidos: count,
      });
    } catch (error) {
      console.error("Erro ao limpar todo o cache:", error);
      return res.status(500).json({ error: "Erro ao limpar cache" });
    }
  }

  /**
   * Limpar caches expirados
   */
  static async clearExpired(req: Request, res: Response) {
    try {
      const validadeMinutos = parseInt(req.query.minutes as string) || 30;

      const cacheRepo = new DimensionamentoCacheRepository(AppDataSource);
      const count = await cacheRepo.limparCachesExpirados(validadeMinutos);

      return res.json({
        success: true,
        message: `Caches expirados (>${validadeMinutos}min) foram limpos`,
        cachesRemovidos: count,
      });
    } catch (error) {
      console.error("Erro ao limpar caches expirados:", error);
      return res.status(500).json({ error: "Erro ao limpar cache" });
    }
  }

  /**
   * Obter estatísticas do cache
   */
  static async getStats(req: Request, res: Response) {
    try {
      const cacheRepo = new DimensionamentoCacheRepository(AppDataSource);
      const stats = await cacheRepo.obterEstatisticas();

      return res.json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error("Erro ao obter estatísticas do cache:", error);
      return res.status(500).json({ error: "Erro ao obter estatísticas" });
    }
  }
}
