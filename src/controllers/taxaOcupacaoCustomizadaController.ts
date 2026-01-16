import { Request, Response } from "express";
import { TaxaOcupacaoCustomizadaService } from "../services/taxaOcupacaoCustomizadaService";

export class TaxaOcupacaoCustomizadaController {
  constructor(private service: TaxaOcupacaoCustomizadaService) {}

  /**
   * POST /taxa-ocupacao
   * Salvar ou atualizar taxa de ocupação customizada
   */
  salvar = async (req: Request, res: Response) => {
    try {
      const { unidadeId, taxa } = req.body;

      if (!unidadeId) {
        return res.status(400).json({ error: "unidadeId é obrigatório" });
      }

      if (taxa === undefined || taxa === null) {
        return res.status(400).json({ error: "taxa é obrigatória" });
      }

      const resultado = await this.service.salvar({
        unidadeId,
        taxa: Number(taxa),
      });

      res.json(resultado);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(400).json({
        error: "Erro ao salvar taxa de ocupação",
        details: message,
      });
    }
  };

  /**
   * GET /taxa-ocupacao/:unidadeId
   * Buscar taxa de ocupação customizada de uma unidade
   */
  buscar = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const taxa = await this.service.buscar(unidadeId);

      if (!taxa) {
        return res
          .status(404)
          .json({ error: "Taxa de ocupação não encontrada" });
      }

      res.json(taxa);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao buscar taxa de ocupação",
        details: message,
      });
    }
  };

  /**
   * DELETE /taxa-ocupacao/:unidadeId
   * Deletar taxa de ocupação customizada
   */
  deletar = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const sucesso = await this.service.deletar(unidadeId);

      if (!sucesso) {
        return res
          .status(404)
          .json({ error: "Taxa de ocupação não encontrada" });
      }

      res.status(204).send();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      res.status(500).json({
        error: "Erro ao deletar taxa de ocupação",
        details: message,
      });
    }
  };
}
