import { Request, Response } from "express";
import { OccupationAnalysisNetworkService } from "../services/occupationAnalysisNetworkService";

export class OccupationAnalysisNetworkController {
  constructor(private service: OccupationAnalysisNetworkService) {}

  /**
   * GET /hospital-sectors/rede/:redeId/occupation-dashboard
   */
  getDashboardByRede = async (req: Request, res: Response) => {
    try {
      const { redeId } = req.params;
      const { dataReferencia } = req.query;

      if (!redeId) {
        return res.status(400).json({
          error: "redeId é obrigatório",
        });
      }

      let dataCalculo: Date | undefined;
      if (dataReferencia) {
        const dateStr = String(dataReferencia);
        dataCalculo = new Date(dateStr);

        if (isNaN(dataCalculo.getTime())) {
          return res.status(400).json({
            error: "dataReferencia deve estar no formato YYYY-MM-DD",
          });
        }
      }

      const t0 = Date.now();
      const result = await this.service.dashboardRede(redeId, dataCalculo);
      const t1 = Date.now();

      return res.json(result);
    } catch (error) {
      console.error("[OccupationDashboardNetworkController] Erro:", error);
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("não encontrado") || msg.includes("não encontrada")) {
        return res.status(404).json({ error: msg });
      }

      return res.status(500).json({
        error: "Erro ao calcular dashboard de ocupação da rede",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      });
    }
  };

  /**
   * GET /occupation-analysis-network/rede/:redeId
   */
  getByRede = async (req: Request, res: Response) => {
    try {
      const { redeId } = req.params;
      const { dataReferencia } = req.query;

      if (!redeId) {
        return res.status(400).json({
          error: "redeId é obrigatório",
        });
      }

      let dataCalculo: Date | undefined;
      if (dataReferencia) {
        const dateStr = String(dataReferencia);
        dataCalculo = new Date(dateStr);

        if (isNaN(dataCalculo.getTime())) {
          return res.status(400).json({
            error: "dataReferencia deve estar no formato YYYY-MM-DD",
          });
        }
      }

      const t0 = Date.now();
      const result = await this.service.analisarRede(redeId, dataCalculo);
      const t1 = Date.now();

      return res.json(result);
    } catch (error) {
      console.error("[OccupationAnalysisNetworkController] Erro:", error);
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("não encontrado") || msg.includes("não encontrada")) {
        return res.status(404).json({ error: msg });
      }

      return res.status(500).json({
        error: "Erro ao calcular análise de ocupação da rede",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      });
    }
  };

  /**
   * GET /occupation-analysis-network/grupo/:grupoId
   */
  getByGrupo = async (req: Request, res: Response) => {
    try {
      const { grupoId } = req.params;
      const { dataReferencia } = req.query;

      if (!grupoId) {
        return res.status(400).json({
          error: "grupoId é obrigatório",
        });
      }

      let dataCalculo: Date | undefined;
      if (dataReferencia) {
        const dateStr = String(dataReferencia);
        dataCalculo = new Date(dateStr);

        if (isNaN(dataCalculo.getTime())) {
          return res.status(400).json({
            error: "dataReferencia deve estar no formato YYYY-MM-DD",
          });
        }
      }

      const t0 = Date.now();
      const result = await this.service.analisarGrupo(grupoId, dataCalculo);
      const t1 = Date.now();

      return res.json(result);
    } catch (error) {
      console.error("[OccupationAnalysisNetworkController] Erro:", error);
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("não encontrado") || msg.includes("não encontrada")) {
        return res.status(404).json({ error: msg });
      }

      return res.status(500).json({
        error: "Erro ao calcular análise de ocupação do grupo",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      });
    }
  };

  /**
   * GET /occupation-analysis-network/regiao/:regiaoId
   */
  getByRegiao = async (req: Request, res: Response) => {
    try {
      const { regiaoId } = req.params;
      const { dataReferencia } = req.query;

      if (!regiaoId) {
        return res.status(400).json({
          error: "regiaoId é obrigatório",
        });
      }

      let dataCalculo: Date | undefined;
      if (dataReferencia) {
        const dateStr = String(dataReferencia);
        dataCalculo = new Date(dateStr);

        if (isNaN(dataCalculo.getTime())) {
          return res.status(400).json({
            error: "dataReferencia deve estar no formato YYYY-MM-DD",
          });
        }
      }

      const t0 = Date.now();
      const result = await this.service.analisarRegiao(regiaoId, dataCalculo);
      const t1 = Date.now();

      return res.json(result);
    } catch (error) {
      console.error("[OccupationAnalysisNetworkController] Erro:", error);
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("não encontrado") || msg.includes("não encontrada")) {
        return res.status(404).json({ error: msg });
      }

      return res.status(500).json({
        error: "Erro ao calcular análise de ocupação da região",
        details: process.env.NODE_ENV !== "production" ? msg : undefined,
      });
    }
  };
}
