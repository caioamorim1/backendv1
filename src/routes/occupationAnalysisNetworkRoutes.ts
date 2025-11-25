import { Router } from "express";
import { DataSource } from "typeorm";
import { OccupationAnalysisNetworkService } from "../services/occupationAnalysisNetworkService";
import { OccupationAnalysisNetworkController } from "../controllers/occupationAnalysisNetworkController";

export const OccupationAnalysisNetworkRoutes = (ds: DataSource): Router => {
  const router = Router();
  const service = new OccupationAnalysisNetworkService(ds);
  const controller = new OccupationAnalysisNetworkController(service);

  /**
   * GET /occupation-analysis-network/rede/:redeId
   *
   * Retorna análise de taxa de ocupação agregada para todos os hospitais de uma rede
   * Query params:
   * - dataReferencia (opcional): data no formato YYYY-MM-DD
   */
  router.get("/rede/:redeId", controller.getByRede);

  /**
   * GET /occupation-analysis-network/grupo/:grupoId
   *
   * Retorna análise de taxa de ocupação agregada para todos os hospitais de um grupo
   * Query params:
   * - dataReferencia (opcional): data no formato YYYY-MM-DD
   */
  router.get("/grupo/:grupoId", controller.getByGrupo);

  /**
   * GET /occupation-analysis-network/regiao/:regiaoId
   *
   * Retorna análise de taxa de ocupação agregada para todos os hospitais de uma região
   * Query params:
   * - dataReferencia (opcional): data no formato YYYY-MM-DD
   */
  router.get("/regiao/:regiaoId", controller.getByRegiao);

  return router;
};
