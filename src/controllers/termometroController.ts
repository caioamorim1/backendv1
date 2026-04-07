import { Request, Response } from "express";
import { TermometroService } from "../services/termometroService";

export class TermometroController {
  constructor(private service: TermometroService) {}

  // GET /termometro/:hospitalId/global
  global = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const result = await this.service.global(hospitalId);
      return res.json(result);
    } catch (err) {
      console.error("[Termometro] global error:", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  // GET /termometro/:hospitalId/detalhamento
  detalhamento = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { setorId, dataInicial, dataFinal } = req.query as {
        setorId?: string;
        dataInicial?: string;
        dataFinal?: string;
      };
      const result = await this.service.detalhamento(
        hospitalId,
        setorId,
        dataInicial,
        dataFinal
      );
      return res.json(result);
    } catch (err) {
      console.error("[Termometro] detalhamento error:", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  // GET /termometro/:hospitalId/serie-historica
  serieHistorica = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { setorId, dataInicial, dataFinal, granularidade } = req.query as {
        setorId?: string;
        dataInicial?: string;
        dataFinal?: string;
        granularidade?: "dia" | "mes";
      };

      if (!dataInicial || !dataFinal) {
        return res
          .status(400)
          .json({ error: "dataInicial e dataFinal são obrigatórios (yyyy-MM-dd)" });
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dataInicial) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dataFinal)
      ) {
        return res
          .status(400)
          .json({ error: "Datas devem estar no formato yyyy-MM-dd" });
      }

      if (granularidade && granularidade !== "dia" && granularidade !== "mes") {
        return res
          .status(400)
          .json({ error: "granularidade deve ser 'dia' ou 'mes'" });
      }

      const result = await this.service.serieHistorica(
        hospitalId,
        dataInicial,
        dataFinal,
        granularidade,
        setorId
      );
      return res.json(result);
    } catch (err) {
      console.error("[Termometro] serieHistorica error:", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
