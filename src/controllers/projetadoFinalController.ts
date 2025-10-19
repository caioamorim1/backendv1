import { Request, Response } from "express";
import { ProjetadoFinalService } from "../services/projetadoFinalService";

export class ProjetadoFinalController {
  constructor(private service: ProjetadoFinalService) {}

  // POST /dimensionamento/internacao/:unidadeId/projetado-final
  salvarInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const { hospitalId, unidadeId: bodyUnidadeId, cargos } = req.body || {};
      if (!hospitalId || !unidadeId) {
        return res
          .status(400)
          .json({ error: "hospitalId e unidadeId são obrigatórios" });
      }
      if (bodyUnidadeId && bodyUnidadeId !== unidadeId) {
        return res
          .status(400)
          .json({ error: "unidadeId do body difere do path" });
      }
      if (!Array.isArray(cargos)) {
        return res.status(400).json({ error: "cargos deve ser um array" });
      }
      await this.service.salvarInternacao(unidadeId, hospitalId, cargos);
      return res.json({ ok: true });
    } catch (err) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  // GET /dimensionamento/internacao/:unidadeId/projetado-final
  buscarInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const data = await this.service.buscarInternacao(unidadeId);
      return res.json(data);
    } catch (err) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  // POST /dimensionamento/nao-internacao/:unidadeId/projetado-final
  salvarNaoInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const { hospitalId, unidadeId: bodyUnidadeId, sitios } = req.body || {};
      if (!hospitalId || !unidadeId) {
        return res
          .status(400)
          .json({ error: "hospitalId e unidadeId são obrigatórios" });
      }
      if (bodyUnidadeId && bodyUnidadeId !== unidadeId) {
        return res
          .status(400)
          .json({ error: "unidadeId do body difere do path" });
      }
      if (!Array.isArray(sitios)) {
        return res.status(400).json({ error: "sitios deve ser um array" });
      }
      await this.service.salvarNaoInternacao(unidadeId, hospitalId, sitios);
      return res.json({ ok: true });
    } catch (err) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  };

  // GET /dimensionamento/nao-internacao/:unidadeId/projetado-final
  buscarNaoInternacao = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const data = await this.service.buscarNaoInternacao(unidadeId);
      return res.json(data);
    } catch (err) {
      return res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
}
