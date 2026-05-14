import { Request, Response } from "express";
import { DimensionamentoService } from "../services/dimensionamentoService";

export class DimensionamentoController {
  constructor(private service: DimensionamentoService) {}

  // Controller para rota de internação
  analiseInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const inicio = (req.query.inicio as string) || undefined;
      const fim = (req.query.fim as string) || undefined;
      const resultado = await this.service.calcularParaInternacao(
        unidadeId,
        inicio,
        fim
      );
      res.json(resultado);
    } catch (error) {
      console.error("[dimensionamentoController] erro internacao:", error);
      res.status(500).json({
        error: "Erro ao calcular análise para unidade de internação",
      });
    }
  };

  // Controller para rota de não internação
  analiseNaoInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const resultado = await this.service.calcularParaNaoInternacao(unidadeId);
      res.json(resultado);
    } catch (error) {
      console.error("[dimensionamentoController] erro nao internacao:", error);
      res.status(500).json({
        error: "Erro ao calcular análise para unidade de não internação",
      });
    }
  };
}
