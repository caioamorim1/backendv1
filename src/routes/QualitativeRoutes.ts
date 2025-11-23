import { Router } from "express";
import { DataSource } from "typeorm";
import { QualitativeController } from "../controllers/qualitativeController";
import { QualitativeRepository } from "../repositories/QualitativeRepository";
import { ColaboradorRepository } from "../repositories/colaboradorRepository";

export const QualitativeRoutes = (ds: DataSource): Router => {
  const router = Router();
  const repo = new QualitativeRepository(ds);
  const colaboradorRepo = new ColaboradorRepository(ds);
  const ctrl = new QualitativeController(repo, colaboradorRepo);

  router.post("/categories", ctrl.criar);
  router.get("/categories", ctrl.listarCategorias);
  router.put("/categories/:id", ctrl.atualizar);
  router.delete("/categories/:id", ctrl.excluir);

  router.post("/questionnaires", ctrl.criarQuestionario);
  router.get("/questionnaires", ctrl.listarQuestionarios);
  router.put("/questionnaires/:id", ctrl.atualizarQuestionario);
  router.delete("/questionnaires/:id", ctrl.excluirQuestionario);

  router.post("/evaluations", ctrl.criarAvaliacao);
  router.get("/evaluations", ctrl.listarAvaliacoes);
  router.get("/evaluations-by-sector", ctrl.listarAvaliacoesPorSetor);
  router.get("/evaluations/:id", ctrl.obterAvaliacao);
  router.put("/evaluations/:id", ctrl.atualizarAvaliacao);
  router.delete("/evaluations/:id", ctrl.excluirAvaliacao);
  router.delete("/evaluations/:sectorid", ctrl.excluirAvaliacao);

  // Questionários completos (100%) com categorias por hospital
  router.get("/completed-with-categories", ctrl.listarQuestionariosCompletosComCategorias);

  return router;
};
