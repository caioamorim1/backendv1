import { DataSource } from "typeorm";
import { QualitativeCategory, Questionnaire } from "../dto/qualitative.dto";

export class QualitativeRepository {
  constructor(private ds: DataSource) {}

  async obterQuestionario(id: number): Promise<any> {
    const rows = await this.ds.query(
      `SELECT * FROM public.qualitative_questionnaire WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return rows[0];
  }

  async listarCategorias(): Promise<QualitativeCategory[]> {
    console.log("listando categorias qualitativas...");

    const query = `
      SELECT * FROM public.qualitative_category 
      WHERE deleted_at IS NULL
      ORDER BY name
        
    `;

    const categorias = await this.ds.query(query);
    console.log(`Categorias encontradas: ${categorias.length}`);
    return categorias;
  }

  async atualizarCategoria(
    id: number,
    data: { name: string; meta: number }
  ): Promise<void> {
    await this.ds.query(
      `UPDATE public.qualitative_category SET name = $1, meta = $2 WHERE id = $3`,
      [data.name, data.meta, id]
    );
  }

  async criarCategoria(data: {
    name: string;
    meta: number;
  }): Promise<QualitativeCategory> {
    const result = await this.ds.query(
      `INSERT INTO public.qualitative_category (name, meta) VALUES ($1, $2) RETURNING *`,
      [data.name, data.meta]
    );
    return result[0];
  }

  async excluirCategoria(id: number): Promise<void> {
    await this.ds.query(
      `UPDATE public.qualitative_category SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async criarQuestionario(data: {
    name: string;
    questions: any[];
  }): Promise<void> {
    const query = `
    INSERT INTO public.qualitative_questionnaire 
      (name, questions, is_active, version, created_at, updated_at) 
    VALUES ($1, $2::jsonb, $3, $4, NOW(), NOW())
    RETURNING *
  `;

    const values = [
      data.name,
      JSON.stringify(data.questions),
      true, // is_active padrão como true
      1, // version inicial como 1
    ];

    const result = await this.ds.query(query, values);
    return result[0];
  }

  async listarQuestionarios(): Promise<Questionnaire[]> {
    const query = `
      SELECT * FROM public.qualitative_questionnaire
      WHERE deleted_at IS NULL
      ORDER BY name
    `;

    const questionarios = await this.ds.query(query);
    return questionarios;
  }

  async atualizarQuestionario(
    id: number,
    data: { name: string; questions: any[] }
  ): Promise<void> {
    const query = `
      UPDATE public.qualitative_questionnaire
      SET name = $1, questions = $2::jsonb
      WHERE id = $3
    `;

    await this.ds.query(query, [data.name, JSON.stringify(data.questions), id]);
  }

  async excluirQuestionario(id: number): Promise<void> {
    await this.ds.query(
      `UPDATE public.qualitative_questionnaire SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async criarAvaliacao(data: any): Promise<void> {
    const query = `
      INSERT INTO public.qualitative_evaluation 
        (title, evaluator, date, status, questionnaire_id, questionnaire, answers, calculate_rate, sector_id, hospital_id, unidade_type, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      data.title,
      data.evaluator,
      data.date,
      data.status,
      data.questionnaireId,
      data.questionnaire,
      JSON.stringify(data.answers),
      data.rate,
      data.sectorId,
      data.hospitalId ?? null,
      data.unidadeType ?? null,
    ];

    const result = await this.ds.query(query, values);
    return result[0];
  }
  async listarAvaliacoes(): Promise<any[]> {
    const query = `
      SELECT qe.*, qq.name AS "questionnaire", qe.questionnaire_id AS "questionnaireId", qe.calculate_rate AS "calculateRate"
      FROM public.qualitative_evaluation qe
      JOIN public.qualitative_questionnaire qq ON qe.questionnaire_id = qq.id
      WHERE qe.deleted_at IS NULL
      ORDER BY qe.date DESC
    `;
    const result = await this.ds.query(query);
    return result;
  }
  async listarAvaliacoesPorSetor(sectorId: string): Promise<any[]> {
    const query = `
      SELECT qe.*, qq.name AS "questionnaire", qe.questionnaire_id AS "questionnaireId", qe.calculate_rate AS "calculateRate"
      FROM public.qualitative_evaluation qe
      JOIN public.qualitative_questionnaire qq ON qe.questionnaire_id = qq.id
      WHERE qe.sector_id = $1 AND qe.deleted_at IS NULL
      ORDER BY qe.date DESC
    `;
    const result = await this.ds.query(query, [sectorId]);
    return result;
  }
  async obterAvaliacao(id: number): Promise<any> {
    const query = `
      SELECT qe.*, qq.name AS questionnaire
      FROM public.qualitative_evaluation qe
      JOIN public.qualitative_questionnaire qq ON qe.questionnaire_id = qq.id
      WHERE qe.id = $1 AND qe.deleted_at IS NULL
    `;
    const result = await this.ds.query(query, [id]);
    return result[0];
  }
  async atualizarAvaliacao(id: number, data: any): Promise<void> {
    const query = `
      UPDATE public.qualitative_evaluation
      SET title = $1, evaluator = $2, date = $3, status = $4, questionnaire_id = $5, answers = $6::jsonb, calculate_rate = $7, sector_id = $8, hospital_id = $9, unidade_type = $10, updated_at = NOW()
      WHERE id = $11
    `;

    const values = [
      data.title,
      data.evaluator,
      data.date,
      data.status,
      data.questionnaireId,
      JSON.stringify(data.answers),
      data.rate,
      data.sectorId,
      data.hospitalId ?? null,
      data.unidadeType ?? null,
      id,
    ];

    await this.ds.query(query, values);
  }
  async excluirAvaliacao(id: number): Promise<void> {
    await this.ds.query(
      `UPDATE public.qualitative_evaluation SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async obterUltimaAvaliacaoCompletaPorSetor(
    sectorId: string
  ): Promise<any | null> {
    const query = `
      SELECT *
      FROM public.qualitative_evaluation
      WHERE sector_id = $1
        AND status = 'completed'
        AND deleted_at IS NULL
      ORDER BY date DESC, id DESC
      LIMIT 1
    `;
    const rows = await this.ds.query(query, [sectorId]);
    return rows[0] ?? null;
  }

  async excluirProjectionPorSetor(sectorId: string): Promise<void> {
    await this.ds.query(
      `DELETE FROM public.qualitative_projection WHERE unidade_id = $1`,
      [sectorId]
    );
  }

  async saveCalculatedProjection(
    unidadeId: string,
    hospitalId: string,
    unidadeType: string,
    rates: any,
    status: string
  ): Promise<void> {
    const query = `
      INSERT INTO public.qualitative_projection (unidade_id, hospital_id, unidade_type, status_available, rates, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (unidade_id)
      DO UPDATE SET rates = EXCLUDED.rates, status_available = EXCLUDED.status_available, updated_at = NOW()
    `;
    await this.ds.query(query, [
      unidadeId,
      hospitalId,
      unidadeType,
      status,
      JSON.stringify(rates),
    ]);
  }

  async getQualitativeAverages(
    unidade_id: string,
    unidade_type: string,
    hospital_id: string
  ) {
    const query = `
      SELECT 
        qc.id AS category_id,
        qc.name,
        qc.meta,
        AVG((elem->>'score')::numeric) AS media_score
      FROM public.qualitative_projection qp
      JOIN public.qualitative_category qc
        ON qc.id = (elem->>'categoryId')::int
      CROSS JOIN LATERAL jsonb_array_elements(qp.rates) AS elem
      WHERE 
        ($1::uuid IS NULL OR qp.unidade_id = $1)
        AND ($2::text IS NULL OR qp.unidade_type = $2)
        AND ($3::uuid IS NULL OR qp.hospital_id = $3)
      GROUP BY qc.id, qc.name, qc.meta
      ORDER BY qc.id;
    `;

    return await this.ds.query(query, [
      unidade_id || null,
      unidade_type || null,
      hospital_id || null,
    ]);
  }

  async getQualitativeAggregatesByHospital(hospitalId: string): Promise<
    Array<{
      unidade_type: string | null;
      unidade_id: string | null;
      category_id: number;
      name: string;
      meta: number | null;
      media_score: number;
      samples: number;
    }>
  > {
    const query = `
      SELECT
        CASE WHEN GROUPING(qp.unidade_type) = 1 THEN NULL ELSE qp.unidade_type END AS unidade_type,
        CASE WHEN GROUPING(qp.unidade_id) = 1 THEN NULL ELSE qp.unidade_id END AS unidade_id,
        qc.id AS category_id,
        qc.name,
        qc.meta,
        CASE 
          WHEN SUM((elem->>'max')::numeric) > 0 
          THEN (SUM((elem->>'obtained')::numeric) / SUM((elem->>'max')::numeric)) * 100
          ELSE 0
        END AS media_score,
        COUNT(*) AS samples
      FROM public.qualitative_projection qp
      JOIN public.qualitative_category qc
        ON TRUE
      CROSS JOIN LATERAL jsonb_array_elements(qp.rates) AS elem
      WHERE
        qp.hospital_id = $1
        AND qc.id = (elem->>'categoryId')::int
      GROUP BY GROUPING SETS
        ((qp.unidade_id, qp.unidade_type, qc.id, qc.name, qc.meta), (qp.unidade_type, qc.id, qc.name, qc.meta), (qc.id, qc.name, qc.meta))
      ORDER BY unidade_id NULLS FIRST, unidade_type NULLS FIRST, qc.id;
    `;

    return await this.ds.query(query, [hospitalId]);
  }

  async listarQuestionariosCompletosComCategorias(
    hospitalId: string
  ): Promise<any[]> {
    const query = `
      SELECT 
        qe.id AS evaluation_id,
        qe.title,
        qe.evaluator,
        qe.date,
        qe.status,
        qe.sector_id,
        qe.calculate_rate AS total_score,
        qq.id AS questionnaire_id,
        qq.name AS questionnaire_name,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'category_id', qc.id,
              'category_name', qc.name,
              'category_meta', qc.meta,
              'category_score', (
                SELECT COALESCE(SUM((ans->>'score')::numeric), 0)
                FROM jsonb_array_elements(qe.answers) AS ans
                WHERE (ans->>'categoryId')::int = qc.id
              )
            ) ORDER BY qc.id
          )
          FROM (
            SELECT DISTINCT (q->>'categoryId')::int AS cat_id
            FROM jsonb_array_elements(qq.questions) AS q
            WHERE q->>'categoryId' IS NOT NULL
          ) AS unique_cats
          JOIN public.qualitative_category qc ON qc.id = unique_cats.cat_id AND qc.deleted_at IS NULL
        ) AS categories
      FROM public.qualitative_evaluation qe
      JOIN public.qualitative_questionnaire qq ON qe.questionnaire_id = qq.id
      LEFT JOIN public.qualitative_projection qp ON qp.unidade_id = qe.sector_id
      WHERE qe.status = 'completed'
        AND qe.deleted_at IS NULL
        AND qp.hospital_id = $1
      ORDER BY qe.date DESC
    `;

    const result = await this.ds.query(query, [hospitalId]);
    return result;
  }
}
