import { Router } from "express";
import { DataSource } from "typeorm";
import { ControlePeriodoService } from "../services/controlePeriodoService";
import { ControlePeriodoController } from "../controllers/controlePeriodoController";

export const ControlePeriodoRoutes = (ds: DataSource): Router => {
  const router = Router();
  const service = new ControlePeriodoService(ds);
  const controller = new ControlePeriodoController(service);

  // POST /controle-periodo  (body: unidadeId, travado, dataInicial, dataFinal)
  router.post("/", controller.salvar);

  // GET /controle-periodo/:unidadeId  (último registro dessa unidade)
  router.get("/:unidadeId", controller.buscar);

  // GET /controle-periodo/:unidadeId/travado  (período travado dessa unidade)
  router.get("/:unidadeId/travado", controller.buscarTravado);

  return router;
};
