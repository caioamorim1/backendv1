import { DataSource } from "typeorm";
import { ProjetadoFinalInternacao } from "../entities/ProjetadoFinalInternacao";
import { ProjetadoFinalNaoInternacao } from "../entities/ProjetadoFinalNaoInternacao";

type CargoProjetado = {
  cargoId: string;
  projetadoFinal: number;
  observacao?: string;
  status?: string;
};
type SitioEntrada = { sitioId: string; cargos: CargoProjetado[] };

export class ProjetadoFinalService {
  constructor(private ds: DataSource) {}

  // Internação
  async salvarInternacao(
    unidadeId: string,
    hospitalId: string,
    cargos: CargoProjetado[]
  ): Promise<void> {
    if (!Array.isArray(cargos)) return;
    await this.ds.transaction(async (manager) => {
      const repo = manager.getRepository(ProjetadoFinalInternacao);
      // Remover registros anteriores da unidade
      await repo.delete({ unidadeId });
      // Inserir novos
      const rows = cargos.map((c) =>
        repo.create({
          unidadeId,
          hospitalId,
          cargoId: c.cargoId,
          projetadoFinal: Math.max(0, Math.floor(c.projetadoFinal || 0)),
          observacao: c.observacao || "",
          status: c.status || "nao_iniciado",
        })
      );
      if (rows.length > 0) {
        await repo.save(rows);
      }
    });
  }

  async buscarInternacao(unidadeId: string) {
    const repo = this.ds.getRepository(ProjetadoFinalInternacao);
    const rows = await repo.find({ where: { unidadeId } });
    if (rows.length === 0) return null;
    return {
      hospitalId: rows[0].hospitalId,
      unidadeId,
      cargos: rows.map((r) => ({
        cargoId: r.cargoId,
        projetadoFinal: r.projetadoFinal,
        observacao: r.observacao,
        status: r.status,
      })),
    };
  }

  // Não-Internação
  async salvarNaoInternacao(
    unidadeId: string,
    hospitalId: string,
    sitios: SitioEntrada[]
  ): Promise<void> {
    await this.ds.transaction(async (manager) => {
      const repo = manager.getRepository(ProjetadoFinalNaoInternacao);
      // Remover anteriores da unidade
      await repo.delete({ unidadeId });
      // Inserir todos
      const rows: ProjetadoFinalNaoInternacao[] = [] as any;
      for (const s of sitios || []) {
        for (const c of s.cargos || []) {
          rows.push(
            repo.create({
              unidadeId,
              hospitalId,
              sitioId: s.sitioId,
              cargoId: c.cargoId,
              projetadoFinal: Math.max(0, Math.floor(c.projetadoFinal || 0)),
              observacao: c.observacao || "",
              status: c.status || "nao_iniciado",
            })
          );
        }
      }
      if (rows.length > 0) {
        await repo.save(rows);
      }
    });
  }

  async buscarNaoInternacao(unidadeId: string) {
    const repo = this.ds.getRepository(ProjetadoFinalNaoInternacao);
    const rows = await repo.find({ where: { unidadeId } });
    if (rows.length === 0) return null;
    // Agrupar por sítio
    const map = new Map<
      string,
      { sitioId: string; cargos: CargoProjetado[] }
    >();
    for (const r of rows) {
      if (!map.has(r.sitioId)) {
        map.set(r.sitioId, { sitioId: r.sitioId, cargos: [] });
      }
      map.get(r.sitioId)!.cargos.push({
        cargoId: r.cargoId,
        projetadoFinal: r.projetadoFinal,
        observacao: r.observacao,
        status: r.status,
      });
    }
    return {
      hospitalId: rows[0].hospitalId,
      unidadeId,
      sitios: Array.from(map.values()),
    };
  }
}
