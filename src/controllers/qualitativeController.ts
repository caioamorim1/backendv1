import { Request, Response } from "express";
import { QualitativeCategory, Questionnaire } from "../dto/qualitative.dto";
import { QualitativeRepository } from "../repositories/QualitativeRepository";
import { ColaboradorRepository } from "../repositories/colaboradorRepository";

export class QualitativeController {
  constructor(
    private repo: QualitativeRepository,
    private colaboradorRepo: ColaboradorRepository
  ) {}

  listarCategorias = async (req: Request, res: Response) => {
    try {
      const result = await this.repo.listarCategorias();

      return res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao listar categorias." });
    }
  };

  atualizar = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const { name, meta } = req.body;
    if (!name || meta === undefined || isNaN(meta) || meta <= 0) {
      return res.status(400).json({
        error: "Nome e meta são obrigatórios. A meta deve ser maior que zero.",
      });
    }

    try {
      await this.repo.atualizarCategoria(id, { name, meta });
      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao atualizar categoria." });
    }
  };

  criar = async (req: Request, res: Response) => {
    const { name, meta } = req.body;
    if (!name || meta === undefined || isNaN(meta) || meta <= 0) {
      return res.status(400).json({
        error: "Nome e meta são obrigatórios. A meta deve ser maior que zero.",
      });
    }
    try {
      const result = await this.repo.criarCategoria({ name, meta });
      return res.status(201).json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao criar categoria." });
    }
  };

  excluir = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    try {
      await this.repo.excluirCategoria(id);
      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao excluir categoria." });
    }
  };

  criarQuestionario = async (req: Request, res: Response) => {
    const { name, questions }: Questionnaire = req.body;

    if (
      !name ||
      !questions ||
      !Array.isArray(questions) ||
      questions.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "Nome e perguntas são obrigatórios." });
    }

    try {
      const result = await this.repo.criarQuestionario({ name, questions });
      return res.status(201).json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao criar questionário." });
    }
  };

  listarQuestionarios = async (req: Request, res: Response) => {
    try {
      const result = await this.repo.listarQuestionarios();
      return res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao listar questionários." });
    }
  };

  atualizarQuestionario = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const { name, questions }: Questionnaire = req.body;

    if (
      !name ||
      !questions ||
      !Array.isArray(questions) ||
      questions.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "Nome e perguntas são obrigatórios." });
    }

    try {
      await this.repo.atualizarQuestionario(id, { name, questions });
      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao atualizar questionário." });
    }
  };
  excluirQuestionario = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    try {
      await this.repo.excluirQuestionario(id);
      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao excluir questionário." });
    }
  };

  criarAvaliacao = async (req: Request, res: Response) => {
    const {
      title,
      date,
      status,
      questionnaire,
      questionnaireId,
      answers,
      sectorId,
      hospitalId,
      calculateRate,
      rate,
      unidadeType,
    } = req.body;
    const colaboradorId: string | undefined = req.body.evaluator;
    console.log("Colaborador ID:", colaboradorId);
    console.log(req.body);
    if (
      !title ||
      !date ||
      !status ||
      !questionnaireId ||
      !answers ||
      !sectorId ||
      !hospitalId ||
      !unidadeType ||
      !colaboradorId
    ) {
      return res
        .status(400)
        .json({ error: "Todos os campos são obrigatórios." });
    }

    try {
      const colaborador = await this.colaboradorRepo.obter(colaboradorId);
      const evaluator = colaborador.nome;

      const result = await this.repo.criarAvaliacao({
        title,
        evaluator,
        date,
        status,
        questionnaire,
        questionnaireId,
        answers,
        sectorId,
        hospitalId,
        rate,
      });
      if (status === "completed") {
        await this.repo.saveCalculatedProjection(
          sectorId,
          hospitalId,
          unidadeType,
          calculateRate,
          status
        );
      }
      return res.status(201).json(result);
    } catch (err) {
      console.error(err);
      if ((err as Error).message === "Colaborador não encontrado") {
        return res.status(404).json({ error: "Colaborador não encontrado." });
      }
      return res.status(500).json({ error: "Erro ao criar avaliação." });
    }
  };
  listarAvaliacoes = async (req: Request, res: Response) => {
    try {
      const result = await this.repo.listarAvaliacoes();
      return res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao listar avaliações." });
    }
  };

  listarAvaliacoesPorSetor = async (req: Request, res: Response) => {
    const sectorId = req.query.sectorId as string;
    if (!sectorId) {
      return res.status(400).json({ error: "ID do setor é obrigatório." });
    }

    try {
      const result = await this.repo.listarAvaliacoesPorSetor(sectorId);
      return res.json(result);
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Erro ao listar avaliações por setor." });
    }
  };

  obterAvaliacao = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido." });
    }
    try {
      const result = await this.repo.obterAvaliacao(id);
      if (!result) {
        return res.status(404).json({ error: "Avaliação não encontrada." });
      }
      return res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao obter avaliação." });
    }
  };

  atualizarAvaliacao = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const {
      title,
      date,
      status,
      questionnaireId,
      answers,
      sectorId,
      hospitalId,
      calculateRate,
      rate,
      unidadeType,
    } = req.body;
    const colaboradorId: string | undefined = req.body.evaluator;

    if (
      !title ||
      !date ||
      !status ||
      !questionnaireId ||
      !answers ||
      !sectorId ||
      !hospitalId ||
      !unidadeType ||
      !colaboradorId
    ) {
      return res
        .status(400)
        .json({ error: "Todos os campos são obrigatórios." });
    }

    try {
      const colaborador = await this.colaboradorRepo.obter(colaboradorId);
      const evaluator = colaborador.nome;

      await this.repo.atualizarAvaliacao(id, {
        title,
        evaluator,
        date,
        status,
        questionnaireId,
        answers,
        sectorId,
        hospitalId,
        rate,
      });
      if (status === "completed") {
        await this.repo.saveCalculatedProjection(
          sectorId,
          hospitalId,
          unidadeType,
          calculateRate,
          status
        );
      }
      return res.status(204).send();
    } catch (err) {
      console.error(err);
      if ((err as Error).message === "Colaborador não encontrado") {
        return res.status(404).json({ error: "Colaborador não encontrado." });
      }
      return res.status(500).json({ error: "Erro ao atualizar avaliação." });
    }
  };
  excluirAvaliacao = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    try {
      await this.repo.excluirAvaliacao(id);
      return res.status(204).send();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao excluir avaliação." });
    }
  };
  
  listarQuestionariosCompletosComCategorias = async (
    req: Request,
    res: Response
  ) => {
    const hospitalId = req.query.hospitalId as string;

    if (!hospitalId) {
      return res
        .status(400)
        .json({ error: "ID do hospital é obrigatório." });
    }

    try {
      const result =
        await this.repo.listarQuestionariosCompletosComCategorias(hospitalId);
      return res.json(result);
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Erro ao listar questionários completos com categorias.",
      });
    }
  };
}
