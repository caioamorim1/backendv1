import { Router } from "express";
import { DataSource } from "typeorm";
import { LeitoRepository } from "../repositories/leitoRepository";
import { LeitoController } from "../controllers/leitoController";

export const LeitoRoutes = (ds: DataSource): Router => {
  const r = Router();
  const repo = new LeitoRepository(ds);
  const ctrl = new LeitoController(repo, ds);

  r.post("/", ctrl.criar);
  r.get("/", ctrl.listar);
  r.get("/taxa-ocupacao-status", ctrl.taxaOcupacaoPorStatus); // ?unidadeId=... OU ?hospitalId=... (sem params retorna tudo)
  r.get("/taxa-ocupacao-agregada", ctrl.taxaOcupacaoAgregada); // ?aggregationType=hospital|grupo|regiao|rede&entityId=... (optional)
  r.patch("/:id", ctrl.atualizar);
  r.patch("/:id/status", ctrl.atualizarStatus);
  r.post("/:id/alta", ctrl.alta);
  r.delete("/:id", ctrl.deletar);

  return r;
};
