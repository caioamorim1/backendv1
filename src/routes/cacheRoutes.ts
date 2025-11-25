import { Router } from "express";
import { CacheController } from "../controllers/cacheController";

const router = Router();

// Limpar cache por unidade
router.delete("/unit/:unidadeId", CacheController.clearByUnit);

// Limpar cache por hospital
router.delete("/hospital/:hospitalId", CacheController.clearByHospital);

// Limpar todo o cache
router.delete("/all", CacheController.clearAll);

// Limpar caches expirados
router.delete("/expired", CacheController.clearExpired);

// Obter estatísticas do cache
router.get("/stats", CacheController.getStats);

export default router;
