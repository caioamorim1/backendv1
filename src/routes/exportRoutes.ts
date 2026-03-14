import { Router } from "express";
import { DataSource } from "typeorm";
import { ExportController } from "../controllers/exportController";

export const ExportRoutes = (ds: DataSource): Router => {
  const r = Router();
  const ctrl = new ExportController(ds);

  r.get("/relatorios/resumo-diario.xlsx", ctrl.resumoDiarioXlsx);
  r.get("/relatorios/mensal.xlsx", ctrl.mensalXlsx);

  // PDF de dimensionamento de unidade
  // GET /export/dimensionamento/:unidadeId/pdf?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
  r.get("/dimensionamento/:unidadeId/pdf", ctrl.dimensionamentoUnidadePdf);

  // PDF de variação de snapshot
  // GET /export/snapshot/:hospitalId/variacao/pdf?tipo=MAPA&escopo=QUANTIDADE&unidadeId=<uuid>
  // tipo: MAPA | DETALHAMENTO
  // escopo: QUANTIDADE | FINANCEIRO | GERAL
  // unidadeId (opcional): filtra relatório para uma unidade específica
  r.get("/snapshot/:hospitalId/variacao/pdf", ctrl.snapshotVariacaoPdf);

  return r;
};
