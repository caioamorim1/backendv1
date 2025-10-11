import { Router } from "express";
import { DataSource } from "typeorm";
import { QualitativeController } from "../controllers/qualitativeController";
import { QualitativeRepository } from "../repositories/QualitativeRepository";

export const QualitativeRoutes = (ds: DataSource): Router => {
    const router = Router();
    const repo = new QualitativeRepository(ds);
    const ctrl = new QualitativeController(repo);

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
    router.get("/evaluations/:id", ctrl.obterAvaliacao);
    router.put("/evaluations/:id", ctrl.atualizarAvaliacao);
    router.delete("/evaluations/:id", ctrl.excluirAvaliacao);

    return router;
};
