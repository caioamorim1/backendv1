import { Request, Response } from "express";
import { OccupationAnalysisService } from "../services/occupationAnalysisService";
import { calcularProjecao } from "../calculoTaxaOcupacao/calculation";
import { ProjecaoParams } from "../calculoTaxaOcupacao/interfaces";

export class OccupationAnalysisController {
  constructor(private service: OccupationAnalysisService) {}

  /**
   * GET /hospital-sectors/:hospitalId/occupation-analysis
   *
   * Retorna análise de taxa de ocupação pré-calculada para o hospital
   *
   * Query params:
   * - dataReferencia (opcional): data no formato YYYY-MM-DD
   */
  getOccupationAnalysis = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { dataReferencia } = req.query;

      if (!hospitalId) {
        return res.status(400).json({
          error: "hospitalId é obrigatório",
        });
      }

      // Validar e parsear data se fornecida
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
      const result = await this.service.calcularAnaliseOcupacao(
        hospitalId,
        dataCalculo
      );
      const t1 = Date.now();

      return res.json(result);
    } catch (error) {
      console.error("[OccupationAnalysisController] Erro:", error);

      const msg = error instanceof Error ? error.message : String(error);

      // Se não encontrou o hospital
      if (msg.includes("não encontrado")) {
        return res.status(404).json({
          error: msg,
        });
      }

      // Erro genérico
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao calcular análise de ocupação",
          details: msg,
        });
      }

      return res.status(500).json({
        error: "Erro ao calcular análise de ocupação",
      });
    }
  };

  /**
   * GET /hospital-sectors/:hospitalId/occupation-analysis/test
   *
   * Endpoint de verificação para o frontend: retorna a mesma análise
   * junto com metadados da requisição e do período considerado.
   */
  getOccupationAnalysisTest = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      if (!hospitalId) {
        return res.status(400).json({ error: "hospitalId é obrigatório" });
      }

      // Período: mês atual (sem precisar informar data)
      const now = new Date();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );
      const endOfPeriod = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999
      );

      const t0 = Date.now();
      const analysis = await this.service.calcularAnaliseOcupacao(hospitalId);
      const t1 = Date.now();

      const sizes = {
        sectors: analysis.sectors.length,
        totalLeitos: analysis.sectors.reduce(
          (s, x) => s + (x.totalLeitos || 0),
          0
        ),
      };

      return res.json({
        request: {
          hospitalId,
          receivedAt: new Date().toISOString(),
          period: {
            startOfMonth: startOfMonth.toISOString(),
            endOfPeriod: endOfPeriod.toISOString(),
          },
        },
        sizes,
        analysis,
        perfMs: t1 - t0,
      });
    } catch (error) {
      console.error("[OccupationAnalysisController:test] Erro:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return res
        .status(500)
        .json({ error: "Erro ao calcular análise (test)", details: msg });
    }
  };

  /**
   * POST /hospital-sectors/occupation-analysis/simulate
   * Body: ProjecaoParams
   * Retorna o resultado bruto de calcularProjecao para validar unidade (% vs fração)
   */
  simulateProjection = async (req: Request, res: Response) => {
    try {
      const params = req.body as ProjecaoParams;
      if (!params) {
        return res.status(400).json({ error: "Body inválido" });
      }

      const result = calcularProjecao(params);
      return res.json({
        input: params,
        raw: result,
        // Conveniência: também retornamos em % caso o front queira comparar facilmente
        ocupacaoMaximaAtendivelPct: Number(
          (result.ocupacaoMaximaAtendivel * 100).toFixed(2)
        ),
      });
    } catch (error) {
      console.error("[OccupationAnalysisController:simulate] Erro:", error);
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: "Erro na simulação", details: msg });
    }
  };

  /**
   * GET /hospital-sectors/:hospitalId/occupation-dashboard
   *
   * Dashboard de ocupação: ocupação máxima atendível + histórico 4 meses
   * Para exibir em gráficos de barras por setor ou resumo do hospital
   *
   * Query params:
   * - dataReferencia (opcional): data no formato YYYY-MM-DD
   *
   * Response:
   * {
   *   hospitalId: "uuid",
   *   hospitalName: "Hospital X",
   *   sectors: [
   *     {
   *       sectorId: "uuid",
   *       sectorName: "UTI",
   *       ocupacaoMaximaAtendivel: 85.5,
   *       historico4Meses: [
   *         { month: "2025-08", monthLabel: "Agosto/2025", taxaOcupacao: 78.2 },
   *         { month: "2025-09", monthLabel: "Setembro/2025", taxaOcupacao: 82.1 },
   *         { month: "2025-10", monthLabel: "Outubro/2025", taxaOcupacao: 79.5 },
   *         { month: "2025-11", monthLabel: "Novembro/2025", taxaOcupacao: 83.8 }
   *       ]
   *     }
   *   ],
   *   summary: {
   *     ocupacaoMaximaAtendivel: 82.3,
   *     historico4Meses: [...]
   *   }
   * }
   */
  getDashboardOccupation = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { dataReferencia } = req.query;

      if (!hospitalId) {
        return res.status(400).json({
          error: "hospitalId é obrigatório",
        });
      }

      // Validar e parsear data se fornecida
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
      const result = await this.service.calcularDashboardOcupacao(
        hospitalId,
        dataCalculo
      );
      const t1 = Date.now();

      return res.json(result);
    } catch (error) {
      console.error("[OccupationAnalysisController:dashboard] Erro:", error);

      const msg = error instanceof Error ? error.message : String(error);

      // Se não encontrou o hospital
      if (msg.includes("não encontrado")) {
        return res.status(404).json({
          error: msg,
        });
      }

      // Erro genérico
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao calcular dashboard de ocupação",
          details: msg,
        });
      }

      return res.status(500).json({
        error: "Erro ao calcular dashboard de ocupação",
      });
    }
  };
}
