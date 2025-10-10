import { Router } from "express";
import { DataSource } from "typeorm";
import { HospitalSectorsAggregateRepository } from "../repositories/hospitalSectorsAggregateRepository";
import { HospitalSectorsAggregateController } from "../controllers/hospitalSectorsAggregateController";

export const HospitalSectorsAggregateRoutes = (ds: DataSource): Router => {
  const router = Router();
  const repo = new HospitalSectorsAggregateRepository(ds);
  const controller = new HospitalSectorsAggregateController(repo);

  // Rota para buscar setores por rede
  router.get("/network/:networkId", controller.getSectorsByNetwork);

  // Rota para buscar setores por grupo
  router.get("/group/:groupId", controller.getSectorsByGroup);

  // Rota para buscar setores por região
  router.get("/region/:regionId", controller.getSectorsByRegion);

  return router;
};