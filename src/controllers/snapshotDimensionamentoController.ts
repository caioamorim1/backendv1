import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { SnapshotDimensionamentoService } from "../services/snapshotDimensionamentoService";

export class SnapshotDimensionamentoController {
  private service: SnapshotDimensionamentoService;

  constructor(private ds: DataSource) {
    this.service = new SnapshotDimensionamentoService(ds);
  }

  /**
   * POST /snapshots/hospital/:hospitalId
   * Criar snapshot completo do hospital
   */
  criarSnapshotHospital = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { observacao } = req.body;
      const usuarioId = (req as any).usuario?.id;

      console.log("🚀 [CONTROLLER] Iniciando criação de snapshot");
      console.log("Hospital ID:", hospitalId);
      console.log("Observação:", observacao);
      console.log("User:", usuarioId);

      const resultado = await this.service.criarSnapshotHospital(
        hospitalId,
        usuarioId,
        observacao
      );

      // Verificar se retornou erro de validação
      if ("error" in resultado) {
        console.log("⚠️ [CONTROLLER] Validação de status falhou");
        return res.status(400).json(resultado);
      }

      console.log("✅ [CONTROLLER] Snapshot criado com sucesso");
      res.status(201).json({
        message: "Snapshot do hospital criado com sucesso",
        snapshot: resultado,
      });
    } catch (error) {
      console.error("❌ [CONTROLLER] Erro ao criar snapshot:", error);

      // Log detalhado do erro
      if (error instanceof Error) {
        console.error("Erro.message:", error.message);
        console.error("Erro.stack:", error.stack);
      }

      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao criar snapshot do hospital",
        details: message,
      });
    }
  };

  /**
   * POST /snapshots/unidade-internacao/:unidadeId
   * Criar snapshot de unidade de internação
   */
  criarSnapshotUnidadeInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const { hospitalId, observacao } = req.body;
      const usuarioId = (req as any).usuario?.id;

      if (!hospitalId) {
        return res.status(400).json({ error: "hospitalId é obrigatório" });
      }

      const snapshot = await this.service.criarSnapshotUnidadeInternacao(
        hospitalId,
        unidadeId,
        usuarioId,
        observacao
      );

      res.status(201).json({
        message: "Snapshot da unidade criado com sucesso",
        snapshot,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao criar snapshot da unidade",
        details: message,
      });
    }
  };

  /**
   * POST /snapshots/unidade-nao-internacao/:unidadeId
   * Criar snapshot de unidade de não internação
   */
  criarSnapshotUnidadeNaoInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const { hospitalId, observacao } = req.body;
      const usuarioId = (req as any).usuario?.id;

      if (!hospitalId) {
        return res.status(400).json({ error: "hospitalId é obrigatório" });
      }

      const snapshot = await this.service.criarSnapshotUnidadeNaoInternacao(
        hospitalId,
        unidadeId,
        usuarioId,
        observacao
      );

      res.status(201).json({
        message: "Snapshot da unidade criado com sucesso",
        snapshot,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao criar snapshot da unidade",
        details: message,
      });
    }
  };

  /**
   * GET /snapshots/hospital/:hospitalId
   * Listar snapshots do hospital
   */
  listarSnapshotsHospital = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const limite = req.query.limite
        ? parseInt(req.query.limite as string)
        : undefined;

      const snapshots = await this.service.buscarSnapshotsHospital(
        hospitalId,
        limite
      );

      res.json({
        hospitalId,
        total: snapshots.length,
        snapshots,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao listar snapshots",
        details: message,
      });
    }
  };

  /**
   * GET /snapshots/hospital/:hospitalId/ultimo
   * Buscar último snapshot do hospital
   */
  buscarUltimoSnapshot = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;

      const snapshot = await this.service.buscarUltimoSnapshotHospital(
        hospitalId
      );

      if (!snapshot) {
        return res.status(404).json({
          message: "Nenhum snapshot encontrado para este hospital",
        });
      }

      res.json({ snapshot });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao buscar último snapshot",
        details: message,
      });
    }
  };

  /**
   * GET /snapshots/:id
   * Buscar snapshot por ID
   */
  buscarSnapshotPorId = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const snapshot = await this.service.buscarSnapshotPorId(id);

      if (!snapshot) {
        return res.status(404).json({ error: "Snapshot não encontrado" });
      }

      res.json({ snapshot });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao buscar snapshot",
        details: message,
      });
    }
  };

  /**
   * GET /snapshots/comparar/:id1/:id2
   * Comparar dois snapshots
   */
  compararSnapshots = async (req: Request, res: Response) => {
    try {
      const { id1, id2 } = req.params;

      const comparacao = await this.service.compararSnapshots(id1, id2);

      res.json({ comparacao });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao comparar snapshots",
        details: message,
      });
    }
  };

  /**
   * GET /snapshots/hospital/:hospitalId/estatisticas
   * Estatísticas dos snapshots
   */
  estatisticas = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;

      const estatisticas = await this.service.estatisticas(hospitalId);

      res.json({ estatisticas });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao buscar estatísticas",
        details: message,
      });
    }
  };

  /**
   * DELETE /snapshots/limpar
   * Limpar snapshots antigos
   */
  limparAntigos = async (req: Request, res: Response) => {
    try {
      const meses = parseInt(req.query.meses as string) || 24;

      const resultado = await this.service.limparSnapshotsAntigos(meses);

      res.json({
        message: `Snapshots anteriores a ${resultado.dataLimite.toLocaleDateString(
          "pt-BR"
        )} removidos`,
        removidos: resultado.removidos,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao limpar snapshots",
        details: message,
      });
    }
  };

  /**
   * PATCH /snapshots/:id/selecionado
   * Alterar status de selecionado de um snapshot
   */
  alterarSelecionado = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { selecionado } = req.body;

      if (typeof selecionado !== "boolean") {
        return res.status(400).json({
          error: "O campo 'selecionado' deve ser um booleano (true/false)",
        });
      }

      const snapshot = await this.service.alterarSelecionado(id, selecionado);

      if (!snapshot) {
        return res.status(404).json({ error: "Snapshot não encontrado" });
      }

      res.json({
        message:
          "Status de selecionado atualizado com sucesso, status atual : " +
          selecionado,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao atualizar snapshot",
        message,
      });
    }
  };

  /**
   * GET /snapshots/hospital/:hospitalId/selecionado
   * Buscar snapshot selecionado de um hospital
   */
  buscarSelecionado = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;

      const snapshot = await this.service.buscarSelecionadoPorHospital(
        hospitalId
      );

      if (!snapshot) {
        return res.status(404).json({
          message: "Nenhum snapshot selecionado encontrado para este hospital",
        });
      }

      res.json({ snapshot });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao buscar snapshot selecionado",
        details: message,
      });
    }
  };

  /**
   * GET /snapshots/aggregated
   * Query: snapshotId=... (opcional) & groupBy=rede|grupo|regiao|hospital
   * - Se snapshotId não for informado, retorna agregação dos ÚLTIMOS snapshots de todos os hospitais.
   */
  buscarSnapshotAgregado = async (req: Request, res: Response) => {
    try {
      const { snapshotId } = req.query as any;
      const groupBy = (req.query.groupBy as string) || "hospital";

      // snapshotId é opcional. Se ausente, o serviço agrega os últimos snapshots de todos hospitais.
      const result = await this.service.agregarSnapshot(snapshotId, groupBy);

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res
        .status(500)
        .json({ error: "Erro ao agregar snapshot", details: message });
    }
  };

  /**
   * GET /snapshots/aggregated/all
   * Retorna um objeto com agregações prontas para frontend nos níveis: hospital, regiao, grupo, rede
   * Exemplo: { hospital: {...}, regiao: {...}, grupo: {...}, rede: {...} }
   */
  buscarSnapshotAgregadoAll = async (req: Request, res: Response) => {
    try {
      // Sem snapshotId - agregamos últimos snapshots de todos os hospitais
      const [hospitalAgg, regiaoAgg, grupoAgg, redeAgg] = await Promise.all([
        this.service.agregarSnapshot(undefined, "hospital"),
        this.service.agregarSnapshot(undefined, "regiao"),
        this.service.agregarSnapshot(undefined, "grupo"),
        this.service.agregarSnapshot(undefined, "rede"),
      ]);

      res.json({
        hospital: hospitalAgg,
        regiao: regiaoAgg,
        grupo: grupoAgg,
        rede: redeAgg,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res
        .status(500)
        .json({ error: "Erro ao agregar snapshots (all)", details: message });
    }
  };
}
