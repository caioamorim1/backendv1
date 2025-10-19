import { Router } from "express";
import { DataSource } from "typeorm";
import { DimensionamentoService } from "../services/dimensionamentoService";
import { DimensionamentoController } from "../controllers/dimensionamentoController";
import { ProjetadoFinalService } from "../services/projetadoFinalService";
import { ProjetadoFinalController } from "../controllers/projetadoFinalController";

export const DimensionamentoRoutes = (ds: DataSource): Router => {
  const router = Router();
  const service = new DimensionamentoService(ds);
  const controller = new DimensionamentoController(service);
  const projService = new ProjetadoFinalService(ds);
  const projController = new ProjetadoFinalController(projService);

  // Rota para obter a análise de uma unidade de INTERNAÇÃO
  router.get("/internacao/:unidadeId", controller.analiseInternacao);

  // Rota para obter a análise de uma unidade de NÃO INTERNAÇÃO
  router.get("/nao-internacao/:unidadeId", controller.analiseNaoInternacao);

  // Projetado Final - Internação
  router.post(
    "/internacao/:unidadeId/projetado-final",
    projController.salvarInternacao
  );
  router.get(
    "/internacao/:unidadeId/projetado-final",
    projController.buscarInternacao
  );

  // Projetado Final - Não-Internação
  router.post(
    "/nao-internacao/:unidadeId/projetado-final",
    projController.salvarNaoInternacao
  );
  router.get(
    "/nao-internacao/:unidadeId/projetado-final",
    projController.buscarNaoInternacao
  );

  return router;
};
