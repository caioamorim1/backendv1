import { Router } from "express";
import { DataSource } from "typeorm";
import { OccupationAnalysisService } from "../services/occupationAnalysisService";
import { OccupationAnalysisController } from "../controllers/occupationAnalysisController";
import { OccupationAnalysisNetworkService } from "../services/occupationAnalysisNetworkService";
import { OccupationAnalysisNetworkController } from "../controllers/occupationAnalysisNetworkController";

export const OccupationAnalysisRoutes = (ds: DataSource): Router => {
  const router = Router();
  const service = new OccupationAnalysisService(ds);
  const controller = new OccupationAnalysisController(service);

  const networkService = new OccupationAnalysisNetworkService(ds);
  const networkController = new OccupationAnalysisNetworkController(
    networkService
  );

  /**
   * GET /hospital-sectors/:hospitalId/occupation-analysis
   *
   * Retorna análise de taxa de ocupação pré-calculada
   *
   * Response:
   * {
   *   hospitalId: "uuid",
   *   hospitalName: "Hospital X",
   *   sectors: [
   *     {
   *       sectorId: "uuid",
   *       sectorName: "UTI",
   *       taxaOcupacao: 85.5,
   *       ociosidade: 0,
   *       superlotacao: 0,
   *       totalLeitos: 20,
   *       leitosOcupados: 17,
   *       ...
   *     }
   *   ],
   *   summary: {
   *     sectorName: "Global",
   *     taxaOcupacao: 76.19,
   *     ociosidade: 8.81,
   *     superlotacao: 0,
   *     totalLeitos: 250,
   *     leitosOcupados: 190,
   *     ...
   *   }
   * }
   */
  router.get(
    "/:hospitalId/occupation-analysis",
    controller.getOccupationAnalysis
  );

  /**
   * GET /hospital-sectors/:hospitalId/occupation-dashboard
   *
   * Dashboard de ocupação: ocupação máxima atendível + histórico 4 meses
   * Para exibir gráficos de barras por setor ou resumo do hospital
   */
  router.get(
    "/:hospitalId/occupation-dashboard",
    controller.getDashboardOccupation
  );

  /**
   * GET /hospital-sectors/rede/:redeId/occupation-dashboard
   * Dashboard de ocupação agregado por rede (por hospital + global)
   */
  router.get(
    "/rede/:redeId/occupation-dashboard",
    networkController.getDashboardByRede
  );

  // Endpoint de teste/comprovação para frontend
  router.get(
    "/:hospitalId/occupation-analysis/test",
    controller.getOccupationAnalysisTest
  );

  // Simulação (debug): calcula projeção diretamente a partir de inputs
  router.post("/occupation-analysis/simulate", controller.simulateProjection);

  /**
   * GET /hospital-sectors/rede/:redeId/occupation-analysis
   * Análise de ocupação agregada por rede
   */
  router.get("/rede/:redeId/occupation-analysis", networkController.getByRede);

  /**
   * GET /hospital-sectors/grupo/:grupoId/occupation-analysis
   * Análise de ocupação agregada por grupo
   */
  router.get(
    "/grupo/:grupoId/occupation-analysis",
    networkController.getByGrupo
  );

  /**
   * GET /hospital-sectors/regiao/:regiaoId/occupation-analysis
   * Análise de ocupação agregada por região
   */
  router.get(
    "/regiao/:regiaoId/occupation-analysis",
    networkController.getByRegiao
  );

  return router;
};
