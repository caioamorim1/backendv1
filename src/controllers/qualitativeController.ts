import { Request, Response } from "express";
import { QualitativeCategory, Questionnaire } from "../dto/qualitative.dto";
import { QualitativeRepository } from "../repositories/QualitativeRepository";
import { ColaboradorRepository } from "../repositories/colaboradorRepository";
import { computeCategoryRatesFromComputedAnswers } from "../services/qualitativeCalculation";
import { computeQualitativeScores } from "../services/qualitativeCalculation";

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
      categories,
      sectorId,
      hospitalId,
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
      !categories ||
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

      const qq = await this.repo.obterQuestionario(Number(questionnaireId));
      if (!qq) {
        return res.status(404).json({ error: "Questionário não encontrado." });
      }

      // Frontend já manda os cálculos prontos no formato categories
      const categoriesArray = Array.isArray(categories) ? categories : [];

      // Calcular total geral (soma de todas categorias)
      let totalObtained = 0;
      let totalMax = 0;

      const ratesForProjection = categoriesArray.map((cat: any) => {
        const obtained = Number(cat.totalScore ?? 0);
        const max = Number(cat.maxScore ?? 0);
        totalObtained += obtained;
        totalMax += max;

        const score = max > 0 ? (obtained / max) * 100 : 0;
        return {
          categoryId: Number(cat.categoryId),
          categoryName: cat.categoryName,
          obtained,
          max,
          score: Math.round((score + Number.EPSILON) * 100) / 100,
        };
      });

      const totalPercent = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

      const result = await this.repo.criarAvaliacao({
        title,
        evaluator,
        date,
        status,
        questionnaire: questionnaire ?? qq.name,
        questionnaireId,
        answers: categoriesArray,
        sectorId,
        hospitalId,
        unidadeType,
        rate: Math.round((totalPercent + Number.EPSILON) * 100) / 100,
      });

      if (status === "completed") {
        await this.repo.saveCalculatedProjection(
          sectorId,
          hospitalId,
          unidadeType,
          ratesForProjection,
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
      categories,
      sectorId,
      hospitalId,
      unidadeType,
    } = req.body;
    const colaboradorId: string | undefined = req.body.evaluator;

    if (
      !title ||
      !date ||
      !status ||
      !questionnaireId ||
      !categories ||
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

      const qq = await this.repo.obterQuestionario(Number(questionnaireId));
      if (!qq) {
        return res.status(404).json({ error: "Questionário não encontrado." });
      }

      // Frontend já manda os cálculos prontos no formato categories
      const categoriesArray = Array.isArray(categories) ? categories : [];

      // Calcular total geral (soma de todas categorias)
      let totalObtained = 0;
      let totalMax = 0;

      const ratesForProjection = categoriesArray.map((cat: any) => {
        const obtained = Number(cat.totalScore ?? 0);
        const max = Number(cat.maxScore ?? 0);
        totalObtained += obtained;
        totalMax += max;

        const score = max > 0 ? (obtained / max) * 100 : 0;
        return {
          categoryId: Number(cat.categoryId),
          categoryName: cat.categoryName,
          obtained,
          max,
          score: Math.round((score + Number.EPSILON) * 100) / 100,
        };
      });

      const totalPercent = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;

      await this.repo.atualizarAvaliacao(id, {
        title,
        evaluator,
        date,
        status,
        questionnaireId,
        answers: categoriesArray,
        sectorId,
        hospitalId,
        unidadeType,
        rate: Math.round((totalPercent + Number.EPSILON) * 100) / 100,
      });

      if (status === "completed") {
        await this.repo.saveCalculatedProjection(
          sectorId,
          hospitalId,
          unidadeType,
          ratesForProjection,
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
      const before = await this.repo.obterAvaliacao(id);
      if (!before) {
        return res.status(404).json({ error: "Avaliação não encontrada." });
      }

      await this.repo.excluirAvaliacao(id);

      // Se for uma avaliação completa, precisamos recalcular a projeção do setor.
      const status = String((before as any).status ?? "").toLowerCase();
      const sectorId = String(
        (before as any).sector_id ?? (before as any).sectorId ?? ""
      );
      if (status === "completed" && sectorId) {
        const latest =
          await this.repo.obterUltimaAvaliacaoCompletaPorSetor(sectorId);
        if (!latest) {
          // Não sobrou nenhuma avaliação completa -> remove projeção do setor
          await this.repo.excluirProjectionPorSetor(sectorId);
        } else {
          // Recria projeção com base na última avaliação completa disponível
          const hospitalId = String(
            (latest as any).hospital_id ?? (latest as any).hospitalId ?? ""
          );
          const unidadeType = String(
            (latest as any).unidade_type ?? (latest as any).unidadeType ?? ""
          );

          try {
            const answers = (latest as any).answers;
            const rebuilt = computeCategoryRatesFromComputedAnswers(
              Array.isArray(answers) ? answers : []
            );
            if (hospitalId && unidadeType) {
              await this.repo.saveCalculatedProjection(
                sectorId,
                hospitalId,
                unidadeType,
                rebuilt.categories,
                "completed"
              );
            } else {
              // Sem chaves suficientes, remove para não ficar dado stale
              await this.repo.excluirProjectionPorSetor(sectorId);
            }
          } catch (e) {
            console.warn(
              "Não foi possível reconstruir a projeção do setor após exclusão; removendo projeção:",
              e
            );
            await this.repo.excluirProjectionPorSetor(sectorId);
          }
        }
      }

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
      return res.status(400).json({ error: "ID do hospital é obrigatório." });
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

  obterAgregadosPorCategoria = async (req: Request, res: Response) => {
    const hospitalId = String(req.query.hospitalId ?? "").trim();
    if (!hospitalId) {
      return res.status(400).json({ error: "hospitalId é obrigatório." });
    }

    try {
      const rows =
        await this.repo.getQualitativeAggregatesByHospital(hospitalId);

      const byUnitType: Record<
        string,
        Array<{
          categoryId: number;
          name: string;
          meta: number | null;
          averageScore: number;
          samples: number;
        }>
      > = {};

      const bySector: Record<
        string,
        {
          sectorId: string;
          unidadeType: string | null;
          categories: Array<{
            categoryId: number;
            name: string;
            meta: number | null;
            averageScore: number;
            samples: number;
          }>;
        }
      > = {};

      const hospital: Array<{
        categoryId: number;
        name: string;
        meta: number | null;
        averageScore: number;
        samples: number;
      }> = [];

      for (const r of rows) {
        const payload = {
          categoryId: Number((r as any).category_id),
          name: String((r as any).name),
          meta: (r as any).meta === null ? null : Number((r as any).meta),
          averageScore: Number((r as any).media_score),
          samples: Number((r as any).samples),
        };

        const unidadeType = (r as any).unidade_type as string | null;
        const unidadeId = (r as any).unidade_id as string | null;

        // Per-sector rows: have unidade_id
        if (unidadeId) {
          if (!bySector[unidadeId]) {
            bySector[unidadeId] = {
              sectorId: unidadeId,
              unidadeType: unidadeType ?? null,
              categories: [],
            };
          }
          bySector[unidadeId].categories.push(payload);
          continue;
        }

        // Hospital total rows: unidade_type = NULL and unidade_id = NULL
        if (!unidadeType) {
          hospital.push(payload);
        } else {
          if (!byUnitType[unidadeType]) byUnitType[unidadeType] = [];
          byUnitType[unidadeType].push(payload);
        }
      }

      return res.json({ hospitalId, bySector, byUnitType, hospital });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Erro ao obter agregados por categoria." });
    }
  };

  obterAgregadosPorSetor = async (req: Request, res: Response) => {
    const sectorId = String(req.query.sectorId ?? "").trim();
    if (!sectorId) {
      return res.status(400).json({ error: "sectorId é obrigatório." });
    }

    try {
      const result = await this.repo.getQualitativeAggregatesBySector(sectorId);

      return res.json({
        sectorId,
        aggregates: result.aggregates,
        evaluations: result.evaluations,
      });
    } catch (err) {
      console.error(err);
      return res
        .status(500)
        .json({ error: "Erro ao obter agregados por setor." });
    }
  };
}
