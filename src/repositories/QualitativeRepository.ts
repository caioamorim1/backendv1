import { DataSource } from "typeorm";
import { QualitativeCategory, Questionnaire } from "../dto/qualitative.dto";


export class QualitativeRepository {
  constructor(private ds: DataSource) { }

  async listarCategorias(): Promise<QualitativeCategory[]> {

    console.log("listando categorias qualitativas...");

    const query = `
      SELECT * FROM qualitative_category 
      WHERE deleted_at IS NULL
      ORDER BY name
        
    `;

    const categorias = await this.ds.query(query);
    console.log(`Categorias encontradas: ${categorias.length}`);
    return categorias;
  }

  async atualizarCategoria(id: number, data: { name: string; meta: number; }): Promise<void> {
    await this.ds.query(
      `UPDATE qualitative_category SET name = $1, meta = $2 WHERE id = $3`,
      [data.name, data.meta, id]
    );
  }

  async criarCategoria(data: { name: string; meta: number; }): Promise<QualitativeCategory> {
    const result = await this.ds.query(
      `INSERT INTO qualitative_category (name, meta) VALUES ($1, $2) RETURNING *`,
      [data.name, data.meta]
    );
    return result[0];
  }

  async excluirCategoria(id: number): Promise<void> {
    await this.ds.query(
      `UPDATE qualitative_category SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
  }


  async criarQuestionario(data: { name: string; questions: any[]; }): Promise<void> {
    const query = `
    INSERT INTO qualitative_questionnaire 
      (name, questions, is_active, version, created_at, updated_at) 
    VALUES ($1, $2::jsonb, $3, $4, NOW(), NOW())
    RETURNING *
  `;

    const values = [
      data.name,
      JSON.stringify(data.questions),
      true, // is_active padrão como true
      1    // version inicial como 1
    ];

    const result = await this.ds.query(query, values);
    return result[0];
  }

  async listarQuestionarios(): Promise<Questionnaire[]> {
    const query = `
      SELECT * FROM qualitative_questionnaire
      WHERE deleted_at IS NULL
      ORDER BY name
    `;

    const questionarios = await this.ds.query(query);
    return questionarios;
  }

  async atualizarQuestionario(id: number, data: { name: string; questions: any[]; }): Promise<void> {
    const query = `
      UPDATE qualitative_questionnaire
      SET name = $1, questions = $2::jsonb
      WHERE id = $3
    `;

    await this.ds.query(query, [data.name, JSON.stringify(data.questions), id]);
  }

  async excluirQuestionario(id: number): Promise<void> {
    await this.ds.query(
      `UPDATE qualitative_questionnaire SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async criarAvaliacao(data: any): Promise<void> {
    const query = `
      INSERT INTO qualitative_evaluation 
        (title, evaluator, date, status, questionnaire_id, questionnaire, answers, calculate_rate, sector_id, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NOW(), NOW())
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
      data.sectorId
    ];

    const result = await this.ds.query(query, values);
    return result[0];
  }
  async listarAvaliacoes(): Promise<any[]> {
    const query = `
      SELECT qe.*, qq.name AS "questionnaire", qe.questionnaire_id AS "questionnaireId", qe.calculate_rate AS "calculateRate"
      FROM qualitative_evaluation qe
      JOIN qualitative_questionnaire qq ON qe.questionnaire_id = qq.id
      WHERE qe.deleted_at IS NULL
      ORDER BY qe.date DESC
    `;
    const result = await this.ds.query(query);
    return result;
  }
  async listarAvaliacoesPorSetor(sectorId: string): Promise<any[]> {
    const query = `
      SELECT qe.*, qq.name AS "questionnaire", qe.questionnaire_id AS "questionnaireId", qe.calculate_rate AS "calculateRate"
      FROM qualitative_evaluation qe
      JOIN qualitative_questionnaire qq ON qe.questionnaire_id = qq.id
      WHERE qe.sector_id = $1 AND qe.deleted_at IS NULL
      ORDER BY qe.date DESC
    `;
    const result = await this.ds.query(query, [sectorId]);
    return result;
  }
  async obterAvaliacao(id: number): Promise<any> {
    const query = `
      SELECT qe.*, qq.name AS questionnaire
      FROM qualitative_evaluation qe
      JOIN qualitative_questionnaire qq ON qe.questionnaire_id = qq.id
      WHERE qe.id = $1 AND qe.deleted_at IS NULL
    `;
    const result = await this.ds.query(query, [id]);
    return result[0];
  }
  async atualizarAvaliacao(id: number, data: any): Promise<void> {
    const query = `
      UPDATE qualitative_evaluation
      SET title = $1, evaluator = $2, date = $3, status = $4, questionnaire_id = $5, answers = $6::jsonb, calculate_rate = $7, sector_id = $8,  updated_at = NOW()
      WHERE id = $9
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
      id
    ];

    await this.ds.query(query, values);
  }
  async excluirAvaliacao(id: number): Promise<void> {
    await this.ds.query(
      `UPDATE qualitative_evaluation SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async saveCalculatedProjection(unidadeId: string, hospitalId: string, unidadeType: string, calculateRate: number, status: string): Promise<void> {
    const query = `
      INSERT INTO qualitative_projection (unidade_id, hospital_id, unidade_type, status_available, rates, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (unidade_id)
      DO UPDATE SET rates = EXCLUDED.rates, status_available = EXCLUDED.status_available, updated_at = NOW()
    `;
    await this.ds.query(query, [unidadeId, hospitalId, unidadeType, status, JSON.stringify(calculateRate)]);
  }
}
