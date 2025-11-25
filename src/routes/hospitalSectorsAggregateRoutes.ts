import { Router } from "express";
import { DataSource } from "typeorm";
import { HospitalSectorsAggregateRepository } from "../repositories/hospitalSectorsAggregateRepository";
import { HospitalComparativeService } from "../services/hospitalComparativeService";
import { HospitalComparativeSnapshotService } from "../services/hospitalComparativeSnapshotService";
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

  // Rota para buscar PROJETADO para um único hospital
  router.get(
    "/hospitals/:hospitalId/projected",
    controller.getProjectedByHospital
  );

  // Rotas para buscar PROJETADO agregado por rede/grupo/região
  router.get("/rede/:redeId/projected", controller.getProjectedByRede);
  router.get("/grupo/:grupoId/projected", controller.getProjectedByGrupo);
  router.get("/regiao/:regiaoId/projected", controller.getProjectedByRegiao);

  // Rota para buscar COMPARATIVO (atual + projetado) para um único hospital
  // NOVA VERSÃO: Usa snapshot selecionado
  router.get("/hospitals/:hospitalId/comparative", async (req, res) => {
    try {
      const { hospitalId } = req.params;
      if (!hospitalId)
        return res.status(400).json({ error: "hospitalId é obrigatório" });

      const service = new HospitalComparativeSnapshotService(ds);
      const payload = await service.getHospitalComparative(hospitalId);
      return res.json(payload);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateRoutes] erro comparativo hospital:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar comparativo do hospital",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar comparativo do hospital" });
    }
  });

  // Rotas para buscar COMPARATIVO agregado por rede/grupo/região
  router.get("/rede/:redeId/comparative", async (req, res) => {
    try {
      const { redeId } = req.params;
      if (!redeId)
        return res.status(400).json({ error: "redeId é obrigatório" });

      const service = new HospitalComparativeSnapshotService(ds);
      const payload = await service.getRedeComparative(redeId);
      return res.json(payload);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateRoutes] erro comparativo rede:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar comparativo da rede",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar comparativo da rede" });
    }
  });

  router.get("/grupo/:grupoId/comparative", async (req, res) => {
    try {
      const { grupoId } = req.params;
      if (!grupoId)
        return res.status(400).json({ error: "grupoId é obrigatório" });

      const service = new HospitalComparativeSnapshotService(ds);
      const payload = await service.getGrupoComparative(grupoId);
      return res.json(payload);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateRoutes] erro comparativo grupo:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar comparativo do grupo",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar comparativo do grupo" });
    }
  });

  router.get("/regiao/:regiaoId/comparative", async (req, res) => {
    try {
      const { regiaoId } = req.params;
      if (!regiaoId)
        return res.status(400).json({ error: "regiaoId é obrigatório" });

      const service = new HospitalComparativeSnapshotService(ds);
      const payload = await service.getRegiaoComparative(regiaoId);
      return res.json(payload);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateRoutes] erro comparativo região:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar comparativo da região",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar comparativo da região" });
    }
  });

  return router;
};
