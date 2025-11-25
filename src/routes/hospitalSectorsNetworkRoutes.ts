import { Router } from "express";
import { DataSource } from "typeorm";
import { HospitalSectorsNetworkRepository } from "../repositories/hospitalSectorsNetworkRepository";
import { HospitalSectorsNetworkController } from "../controllers/hospitalSectorsNetworkController";

export const HospitalSectorsNetworkRoutes = (ds: DataSource): Router => {
  const router = Router();
  const repo = new HospitalSectorsNetworkRepository(ds);
  const ctrl = new HospitalSectorsNetworkController(repo);

  // GET /hospital-sectors-network/rede/:redeId
  router.get("/rede/:redeId", ctrl.getByRede);

  // GET /hospital-sectors-network/grupo/:grupoId
  router.get("/grupo/:grupoId", ctrl.getByGrupo);

  // GET /hospital-sectors-network/regiao/:regiaoId
  router.get("/regiao/:regiaoId", ctrl.getByRegiao);

  return router;
};
