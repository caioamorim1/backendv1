import { Request, Response } from "express";
import { ComentarioUnidadeRepository } from "../repositories/comentarioUnidadeRepository";

export class ComentarioUnidadeController {
  constructor(private repo: ComentarioUnidadeRepository) {}

  // POST /unidades/:unidadeId/comentarios
  // body: { autorId, data, texto }
  criar = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const { autorId, data, texto } = req.body as {
        autorId: string;
        data: string;
        texto: string;
      };

      if (!autorId || !data || !texto) {
        return res
          .status(400)
          .json({ error: "autorId, data e texto são obrigatórios" });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res
          .status(400)
          .json({ error: "data deve estar no formato YYYY-MM-DD" });
      }

      const comentario = await this.repo.criar(unidadeId, autorId, data, texto);
      return res.status(201).json(comentario);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: msg });
    }
  };

  // GET /unidades/:unidadeId/comentarios?data=YYYY-MM-DD
  listarPorDia = async (req: Request, res: Response) => {
    const { unidadeId } = req.params;
    const { data } = req.query as { data?: string };

    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res
        .status(400)
        .json({ error: "query param 'data' (YYYY-MM-DD) é obrigatório" });
    }

    const lista = await this.repo.listarPorDia(unidadeId, data);
    return res.json(lista);
  };

  // DELETE /unidades/:unidadeId/comentarios/:comentarioId
  deletar = async (req: Request, res: Response) => {
    const { comentarioId } = req.params;
    const ok = await this.repo.deletar(comentarioId);
    if (!ok) return res.status(404).json({ error: "Comentário não encontrado" });
    return res.status(204).send();
  };
}
