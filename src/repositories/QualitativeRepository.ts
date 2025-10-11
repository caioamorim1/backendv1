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

}
