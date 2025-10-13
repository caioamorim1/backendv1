import { Request, Response } from "express";
import { OccupationAnalysisService } from "../services/occupationAnalysisService";

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

      console.log(
        `📊 [OccupationAnalysis] Request para hospital: ${hospitalId}${
          dataCalculo ? ` - Data: ${dataCalculo.toISOString().split('T')[0]}` : ''
        }`
      );

      const result = await this.service.calcularAnaliseOcupacao(hospitalId, dataCalculo);

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
}
