import { Router } from "express";
import { DataSource } from "typeorm";
import { HospitalSectorsAggregateRepository } from "../repositories/hospitalSectorsAggregateRepository";
import { HospitalSectorsAggregateController } from "../controllers/hospitalSectorsAggregateController";

export const HospitalSectorsAggregateRoutes = (ds: DataSource): Router => {
  const router = Router();
  const repo = new HospitalSectorsAggregateRepository(ds);
  const controller = new HospitalSectorsAggregateController(repo);

  // ===== ROTAS ANTIGAS (por hospital) =====
  // Mantidas para compatibilidade retroativa

  // Rota para buscar setores de TODOS os hospitais (agrupados por hospital)
  router.get("/all", controller.getAllSectors);

  // Rota para buscar setores por rede (agrupados por hospital)
  router.get("/network/:networkId", controller.getSectorsByNetwork);

  // Rota para buscar setores por grupo (agrupados por hospital)
  router.get("/group/:groupId", controller.getSectorsByGroup);

  // Rota para buscar setores por região (agrupados por hospital)
  router.get("/region/:regionId", controller.getSectorsByRegion);

  // ===== ROTAS OTIMIZADAS (múltiplas entidades em 1 chamada) =====
  // Retornam TODAS as entidades agregadas em uma única query (performance crítica)

  // Rota para buscar TODAS as redes agregadas
  router.get("/networks/all-aggregated", controller.getAllNetworksAggregated);

  // Rota para buscar TODOS os grupos agregados
  router.get("/groups/all-aggregated", controller.getAllGroupsAggregated);

  // Rota para buscar TODAS as regiões agregadas
  router.get("/regions/all-aggregated", controller.getAllRegionsAggregated);

  // Rota para buscar TODOS os hospitais agregados
  router.get("/hospitals/all-aggregated", controller.getAllHospitalsAggregated);

  // ===== ROTAS PROJETADAS (setores agregados por nome com dados projetados) =====
  // Retornam setores agregados por NOME dentro de cada entidade, incluindo dados ATUAIS e PROJETADOS

  // Rota para buscar TODAS as redes com setores agregados PROJETADOS
  router.get(
    "/networks/all-projected-aggregated",
    controller.getAllNetworksProjectedAggregated
  );

  // Rota para buscar TODOS os grupos com setores agregados PROJETADOS
  router.get(
    "/groups/all-projected-aggregated",
    controller.getAllGroupsProjectedAggregated
  );

  // Rota para buscar TODAS as regiões com setores agregados PROJETADOS
  router.get(
    "/regions/all-projected-aggregated",
    controller.getAllRegionsProjectedAggregated
  );

  // Rota para buscar TODOS os hospitais com setores agregados PROJETADOS
  router.get(
    "/hospitals/all-projected-aggregated",
    controller.getAllHospitalsProjectedAggregated
  );

  return router;
};
