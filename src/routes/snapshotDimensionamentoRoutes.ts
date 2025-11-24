import { Router } from "express";
import { DataSource } from "typeorm";
import { SnapshotDimensionamentoController } from "../controllers/snapshotDimensionamentoController";
import { authMiddleware } from "../middlewares/authMiddleware";

export const snapshotDimensionamentoRoutes = (ds: DataSource): Router => {
  const router = Router();
  const controller = new SnapshotDimensionamentoController(ds);

  // Todas as rotas protegidas por autenticação
  router.use(authMiddleware);

  // ===== CRIAR SNAPSHOTS =====

  // Criar snapshot de hospital completo
  router.post("/hospital/:hospitalId", controller.criarSnapshotHospital);

  // Criar snapshot de unidade de internação
  router.post(
    "/unidade-internacao/:unidadeId",
    controller.criarSnapshotUnidadeInternacao
  );

  // Criar snapshot de unidade de não internação
  router.post(
    "/unidade-nao-internacao/:unidadeId",
    controller.criarSnapshotUnidadeNaoInternacao
  );

  // ===== BUSCAR SNAPSHOTS =====

  // Buscar último snapshot do hospital
  router.get("/hospital/:hospitalId/ultimo", controller.buscarUltimoSnapshot);

  // Buscar snapshot selecionado do hospital
  router.get("/hospital/:hospitalId/selecionado", controller.buscarSelecionado);

  // Listar snapshots do hospital
  router.get("/hospital/:hospitalId", controller.listarSnapshotsHospital);

  // Estatísticas
  router.get("/hospital/:hospitalId/estatisticas", controller.estatisticas);

  // Buscar snapshot específico por ID
  // Agregar snapshot por groupBy (rede|grupo|regiao|hospital)
  // Example: GET /snapshot/aggregated?snapshotId=...&groupBy=regiao
  // NOTE: esta rota precisa ficar antes da rota genérica '/:id' para não ser capturada como id='aggregated'
  router.get("/aggregated", controller.buscarSnapshotAgregado);

  // Agregações prontas para frontend: retorna agregados por hospital, regiao, grupo e rede
  router.get("/aggregated/all", controller.buscarSnapshotAgregadoAll);

  // Buscar snapshots selecionados por rede, grupo ou região
  router.get("/selected-by-group", controller.buscarSnapshotsSelecionadosPorGrupo);

  // Buscar snapshot específico por ID
  router.get("/:id", controller.buscarSnapshotPorId);

  // ===== COMPARAR SNAPSHOTS =====

  // Comparar dois snapshots
  router.get("/comparar/:id1/:id2", controller.compararSnapshots);

  // ===== ATUALIZAR SNAPSHOTS =====

  // Alterar status de selecionado
  router.patch("/:id/selecionado", controller.alterarSelecionado);

  // ===== LIMPAR SNAPSHOTS =====

  // Limpar snapshots antigos
  router.delete("/limpar", controller.limparAntigos);

  return router;
};
