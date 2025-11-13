import { Request, Response } from "express";
import { ControlePeriodoService } from "../services/controlePeriodoService";

export class ControlePeriodoController {
  constructor(private service: ControlePeriodoService) {}

  salvar = async (req: Request, res: Response) => {
    try {
      const { unidadeId, travado, dataInicial, dataFinal } = req.body;
      const registro = await this.service.salvar({
        unidadeId,
        travado: !!travado,
        dataInicial,
        dataFinal,
      });
      res.status(201).json({ message: "Registro criado", data: registro });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  buscar = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const registro = await this.service.buscarPorUnidade(unidadeId);
      if (!registro) {
        return res.status(404).json({ message: "Nenhum registro encontrado" });
      }
      res.json({ data: registro });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
