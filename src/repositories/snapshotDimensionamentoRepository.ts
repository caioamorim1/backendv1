import { DataSource, Repository } from "typeorm";
import { SnapshotDimensionamento } from "../entities/SnapshotDimensionamento";

export class SnapshotDimensionamentoRepository {
  private repo: Repository<SnapshotDimensionamento>;

  constructor(private ds: DataSource) {
    this.repo = ds.getRepository(SnapshotDimensionamento);
  }

  /**
   * Criar novo snapshot
   */
  async criar(
    snapshot: Partial<SnapshotDimensionamento>
  ): Promise<SnapshotDimensionamento> {
    console.log("📦 [REPOSITORY] Antes de criar snapshot:", {
      escopo: snapshot.escopo,
      hospitalId: snapshot.hospitalId,
      dadosType: typeof snapshot.dados,
      dadosKeys: snapshot.dados ? Object.keys(snapshot.dados).slice(0, 5) : [],
      resumoType: typeof snapshot.resumo,
      resumoKeys: snapshot.resumo ? Object.keys(snapshot.resumo) : [],
    });

    const novoSnapshot = this.repo.create(snapshot);

    console.log("📦 [REPOSITORY] Depois de repo.create():", {
      id: novoSnapshot.id,
      escopo: novoSnapshot.escopo,
      dadosType: typeof novoSnapshot.dados,
      resumoType: typeof novoSnapshot.resumo,
    });

    console.log("📦 [REPOSITORY] Iniciando repo.save()...");
    const saved = await this.repo.save(novoSnapshot);
    console.log("✅ [REPOSITORY] Snapshot salvo com sucesso!", {
      id: saved.id,
    });

    return saved;
  }

  /**
   * Buscar todos os snapshots de um hospital
   */
  async buscarPorHospital(
    hospitalId: string,
    limite?: number
  ): Promise<SnapshotDimensionamento[]> {
    const query = this.repo
      .createQueryBuilder("snapshot")
      .where("snapshot.hospitalId = :hospitalId", { hospitalId })
      .orderBy("snapshot.dataHora", "DESC");

    if (limite) {
      query.take(limite);
    }

    return await query.getMany();
  }

  /**
   * Buscar último snapshot de um hospital
   */
  async buscarUltimoPorHospital(
    hospitalId: string
  ): Promise<SnapshotDimensionamento | null> {
    return await this.repo
      .createQueryBuilder("snapshot")
      .where("snapshot.hospitalId = :hospitalId", { hospitalId })
      .andWhere("snapshot.escopo = :escopo", { escopo: "HOSPITAL" })
      .orderBy("snapshot.dataHora", "DESC")
      .getOne();
  }

  /**
   * Buscar snapshots de uma unidade de internação
   */
  async buscarPorUnidadeInternacao(
    unidadeId: string,
    limite?: number
  ): Promise<SnapshotDimensionamento[]> {
    const query = this.repo
      .createQueryBuilder("snapshot")
      .where("snapshot.unidadeInternacaoId = :unidadeId", { unidadeId })
      .orderBy("snapshot.dataHora", "DESC");

    if (limite) {
      query.take(limite);
    }

    return await query.getMany();
  }

  /**
   * Buscar snapshots de uma unidade de não internação
   */
  async buscarPorUnidadeNaoInternacao(
    unidadeId: string,
    limite?: number
  ): Promise<SnapshotDimensionamento[]> {
    const query = this.repo
      .createQueryBuilder("snapshot")
      .where("snapshot.unidadeNaoInternacaoId = :unidadeId", { unidadeId })
      .orderBy("snapshot.dataHora", "DESC");

    if (limite) {
      query.take(limite);
    }

    return await query.getMany();
  }

  /**
   * Buscar snapshots por período
   */
  async buscarPorPeriodo(
    hospitalId: string,
    dataInicio: Date,
    dataFim: Date
  ): Promise<SnapshotDimensionamento[]> {
    return await this.repo
      .createQueryBuilder("snapshot")
      .where("snapshot.hospitalId = :hospitalId", { hospitalId })
      .andWhere("snapshot.dataHora BETWEEN :dataInicio AND :dataFim", {
        dataInicio,
        dataFim,
      })
      .orderBy("snapshot.dataHora", "DESC")
      .getMany();
  }

  /**
   * Buscar snapshot específico por ID
   */
  async buscarPorId(id: string): Promise<SnapshotDimensionamento | null> {
    return await this.repo.findOne({
      where: { id },
      relations: [
        "hospital",
        "unidadeInternacao",
        "unidadeNaoInternacao",
        "cargo",
        "usuario",
      ],
    });
  }

  /**
   * Comparar dois snapshots
   */
  async compararSnapshots(
    id1: string,
    id2: string
  ): Promise<{
    snapshot1: SnapshotDimensionamento | null;
    snapshot2: SnapshotDimensionamento | null;
  }> {
    const [snapshot1, snapshot2] = await Promise.all([
      this.buscarPorId(id1),
      this.buscarPorId(id2),
    ]);

    return { snapshot1, snapshot2 };
  }

  /**
   * Deletar snapshots antigos
   */
  async deletarAnterioresA(data: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where("dataHora < :data", { data })
      .execute();

    return result.affected || 0;
  }

  /**
   * Contar snapshots por hospital
   */
  async contarPorHospital(hospitalId: string): Promise<number> {
    return await this.repo
      .createQueryBuilder("snapshot")
      .where("snapshot.hospitalId = :hospitalId", { hospitalId })
      .getCount();
  }

  /**
   * Estatísticas de snapshots
   */
  async estatisticas(hospitalId: string): Promise<{
    total: number;
    porEscopo: { escopo: string; count: number }[];
    porAcao: { acao: string; count: number }[];
    primeiroSnapshot: Date | null;
    ultimoSnapshot: Date | null;
  }> {
    const [total, porEscopo, porAcao, datas] = await Promise.all([
      this.contarPorHospital(hospitalId),

      this.repo
        .createQueryBuilder("snapshot")
        .select("snapshot.escopo", "escopo")
        .addSelect("COUNT(*)", "count")
        .where("snapshot.hospitalId = :hospitalId", { hospitalId })
        .groupBy("snapshot.escopo")
        .getRawMany(),

      this.repo
        .createQueryBuilder("snapshot")
        .select("snapshot.acao", "acao")
        .addSelect("COUNT(*)", "count")
        .where("snapshot.hospitalId = :hospitalId", { hospitalId })
        .groupBy("snapshot.acao")
        .getRawMany(),

      this.repo
        .createQueryBuilder("snapshot")
        .select("MIN(snapshot.dataHora)", "primeiro")
        .addSelect("MAX(snapshot.dataHora)", "ultimo")
        .where("snapshot.hospitalId = :hospitalId", { hospitalId })
        .getRawOne(),
    ]);

    return {
      total,
      porEscopo: porEscopo.map((p) => ({
        escopo: p.escopo,
        count: parseInt(p.count),
      })),
      porAcao: porAcao.map((p) => ({ acao: p.acao, count: parseInt(p.count) })),
      primeiroSnapshot: datas?.primeiro || null,
      ultimoSnapshot: datas?.ultimo || null,
    };
  }
}
