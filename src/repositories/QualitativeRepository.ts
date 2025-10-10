import { Repository, DataSource, FindManyOptions, ILike } from "typeorm";
import { QualitativeCategory } from "../dto/qualitative.dto";


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


}
