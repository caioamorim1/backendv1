import { Router } from "express";
import { DataSource } from "typeorm";
import { SnapshotSummaryController } from "../controllers/snapshotSummaryController";

export const SnapshotSummaryRoutes = (ds: DataSource): Router => {
  const r = Router();
  const ctrl = new SnapshotSummaryController(ds);

  // GET /hospitals/:hospitalId/snapshots/latest/summary
  r.get(
    "/hospitals/:hospitalId/snapshots/latest/summary",
    ctrl.getLatestSummary
  );

  return r;
};
