import { Router } from "express";
import { DataSource } from "typeorm";
import { UnidadeNeutraController } from "../controllers/unidadeNeutraController";

export const UnidadeNeutraRoutes = (dataSource: DataSource): Router => {
  const router = Router();
  const controller = new UnidadeNeutraController(dataSource);

  // Criar unidade neutra
  router.post("/", controller.criar);

  // Listar todas as unidades neutras (opcionalmente por hospital via query)
  router.get("/", controller.listar);

  // Listar unidades neutras por hospital (via params)
  router.get("/hospital/:hospitalId", controller.listarPorHospital);

  // Obter uma unidade neutra específica
  router.get("/:id", controller.obter);

  // Atualizar unidade neutra
  router.put("/:id", controller.atualizar);

  // Remover unidade neutra
  router.delete("/:id", controller.remover);

  return router;
};
