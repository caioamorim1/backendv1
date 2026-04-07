import { Router } from "express";
import { DataSource } from "typeorm";
import { TermometroService } from "../services/termometroService";
import { TermometroController } from "../controllers/termometroController";

export const TermometroRoutes = (ds: DataSource): Router => {
  const router = Router();
  const ctrl = new TermometroController(new TermometroService(ds));

  router.get("/:hospitalId/global", ctrl.global);
  router.get("/:hospitalId/detalhamento", ctrl.detalhamento);
  router.get("/:hospitalId/serie-historica", ctrl.serieHistorica);

  return router;
};
