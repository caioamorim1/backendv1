import { Router } from "express";
import { DataSource } from "typeorm";
import { BaselineSummaryController } from "../controllers/baselineSummaryController";

export const BaselineSummaryRoutes = (ds: DataSource): Router => {
  const r = Router();
  const ctrl = new BaselineSummaryController(ds);

  // GET /hospitals/:hospitalId/baseline-summary
  r.get("/hospitals/:hospitalId/baseline-summary", ctrl.getSummary);

  return r;
};
