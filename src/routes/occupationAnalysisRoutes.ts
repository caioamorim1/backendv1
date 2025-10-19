import { Router } from "express";
import { DataSource } from "typeorm";
import { OccupationAnalysisService } from "../services/occupationAnalysisService";
import { OccupationAnalysisController } from "../controllers/occupationAnalysisController";

export const OccupationAnalysisRoutes = (ds: DataSource): Router => {
  const router = Router();
  const service = new OccupationAnalysisService(ds);
  const controller = new OccupationAnalysisController(service);

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

  // Endpoint de teste/comprovação para frontend
  router.get(
    "/:hospitalId/occupation-analysis/test",
    controller.getOccupationAnalysisTest
  );

  // Simulação (debug): calcula projeção diretamente a partir de inputs
  router.post("/occupation-analysis/simulate", controller.simulateProjection);

  return router;
};
