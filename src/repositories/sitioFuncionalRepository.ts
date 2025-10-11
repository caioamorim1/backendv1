import { DataSource, Repository } from "typeorm";
import { SitioFuncional } from "../entities/SitioFuncional";
import { UnidadeNaoInternacao } from "../entities/UnidadeNaoInternacao";
// FormularioColeta removed from sitio - no direct relationship
import {
  CriarSitioFuncionalDTO,
  AtualizarSitioFuncionalDTO,
  CriarSitioFuncionalDTOWithCargos,
  AtualizarSitioFuncionalDTOWithCargos,
  SitioCargoInputDTO,
  SitioDistribuicaoInputDTO,
} from "../dto/sitioFuncional.dto";
import { CargoUnidade } from "../entities/CargoUnidade";
import { CargoSitio } from "../entities/CargoSitio";
import { SitioDistribuicao } from "../entities/SitioDistribuicao";

export class SitioFuncionalRepository {
  constructor(private ds: DataSource) {}

  private repo = () => this.ds.getRepository(SitioFuncional);
  private unidadeRepo = () => this.ds.getRepository(UnidadeNaoInternacao);

  async listarPorUnidade(unidadeId: string) {
    const sitios = await this.repo().find({
      where: { unidade: { id: unidadeId } },
      relations: [
        "unidade",
        "cargosSitio",
        "cargosSitio.cargoUnidade",
        "cargosSitio.cargoUnidade.cargo",
        "distribuicoes",
      ],
      order: { created_at: "ASC" },
    });

    return sitios.map((s: any) => ({
      ...s,
      cargos_total: (s.cargosSitio || []).reduce(
        (sum: number, cs: any) => sum + (cs.quantidade_funcionarios || 0),
        0
      ),
    }));
  }

  async obter(id: string) {
    const sitio = await this.repo().findOne({
      where: { id },
      relations: [
        "unidade",
        "cargosSitio",
        "cargosSitio.cargoUnidade",
        "cargosSitio.cargoUnidade.cargo",
        "distribuicoes",
      ],
    });

    if (!sitio) return null;

    (sitio as any).cargos_total =
      (sitio as any).cargosSitio?.reduce(
        (sum: number, cs: any) => sum + (cs.quantidade_funcionarios || 0),
        0
      ) ?? 0;
    return sitio;
  }

  async listar() {
    const sitios = await this.repo().find({
      relations: [
        "unidade",
        "cargosSitio",
        "cargosSitio.cargoUnidade",
        "cargosSitio.cargoUnidade.cargo",
        "distribuicoes",
      ],
      order: { created_at: "ASC" },
    });

    return sitios.map((s: any) => ({
      ...s,
      cargos_total: (s.cargosSitio || []).reduce(
        (sum: number, cs: any) => sum + (cs.quantidade_funcionarios || 0),
        0
      ),
    }));
  }

  async criar(
    dadosRaw: CriarSitioFuncionalDTO | CriarSitioFuncionalDTOWithCargos
  ) {
    const dados = dadosRaw as CriarSitioFuncionalDTOWithCargos;

    const unidade = await this.unidadeRepo().findOne({
      where: { id: dados.unidadeId },
    });
    if (!unidade) return null;
    // Use transaction to create sitio and optional cargos
    const created = await this.ds.transaction(async (manager) => {
      const sitioRepo = manager.getRepository(SitioFuncional);
      const cargoUnidadeRepo = manager.getRepository(CargoUnidade);
      const cargoSitioRepo = manager.getRepository(CargoSitio);
      const distribRepo = manager.getRepository(SitioDistribuicao);

      const entidade = sitioRepo.create({
        nome: dados.nome,
        descricao: dados.descricao,
        unidade,
      } as Partial<SitioFuncional>);

      const sitioSalvo = await sitioRepo.save(entidade);

      // If cargos provided, create CargoSitio entries. Each item may include
      // cargoUnidadeId or cargoId.
      if (Array.isArray(dados.cargos) && dados.cargos.length > 0) {
        for (const c of dados.cargos as SitioCargoInputDTO[]) {
          let cargoUnidadeId = c.cargoUnidadeId;
          const cargoId = c.cargoId;

          if (!cargoUnidadeId) {
            if (!cargoId)
              throw new Error("cargoUnidadeId ou cargoId é obrigatório");
            const cuFound = await cargoUnidadeRepo.findOne({
              where: { cargoId: cargoId, unidadeNaoInternacaoId: unidade.id },
            });
            if (!cuFound)
              throw new Error(
                "CargoUnidade não encontrado para o cargo informado na unidade do sítio"
              );
            cargoUnidadeId = cuFound.id;
          }

          // prevent duplicate
          const exists = await cargoSitioRepo.findOne({
            where: { cargoUnidadeId, sitioId: (sitioSalvo as any).id },
          });
          if (exists) continue;

          const cs = cargoSitioRepo.create({
            cargoUnidadeId,
            sitioId: (sitioSalvo as any).id,
            quantidade_funcionarios: c.quantidade_funcionarios ?? 1,
          } as any);

          await cargoSitioRepo.save(cs);
        }
      }

      if (Array.isArray(dados.distribuicoes)) {
        await this.persistDistribuicoes(
          distribRepo,
          sitioSalvo,
          dados.distribuicoes
        );
      }

      return sitioSalvo;
    });

    return this.obter((created as any as SitioFuncional).id);
  }

  /**
   * Retorna um resumo consolidado das distribuições (ENF/TEC) por sítio de uma unidade,
   * incluindo totais por período (SegSex/SabDom) e total geral por categoria.
   * Isso é apenas leitura e não altera o comportamento das rotas existentes.
   */
  async resumoDistribuicoesPorUnidade(unidadeId: string) {
    const sitios = await this.repo().find({
      where: { unidade: { id: unidadeId } },
      relations: ["distribuicoes"],
      order: { created_at: "ASC" },
    });

    const buildResumo = (dist?: any) => {
      const segSex = {
        manha: dist?.segSexManha ?? 0,
        tarde: dist?.segSexTarde ?? 0,
        noite1: dist?.segSexNoite1 ?? 0,
        noite2: dist?.segSexNoite2 ?? 0,
      };
      const sabDom = {
        manha: dist?.sabDomManha ?? 0,
        tarde: dist?.sabDomTarde ?? 0,
        noite1: dist?.sabDomNoite1 ?? 0,
        noite2: dist?.sabDomNoite2 ?? 0,
      };
      const totalSegSex =
        segSex.manha + segSex.tarde + segSex.noite1 + segSex.noite2;
      const totalSabDom =
        sabDom.manha + sabDom.tarde + sabDom.noite1 + sabDom.noite2;
      const totalGeral = totalSegSex + totalSabDom;
      return { segSex, sabDom, totalSegSex, totalSabDom, totalGeral };
    };

    const payload = sitios.map((s) => {
      const enf = (s as any).distribuicoes?.find(
        (d: any) => d.categoria === "ENF"
      );
      const tec = (s as any).distribuicoes?.find(
        (d: any) => d.categoria === "TEC"
      );
      const ENF = buildResumo(enf);
      const TEC = buildResumo(tec);
      return {
        id: (s as any).id,
        nome: (s as any).nome,
        descricao: (s as any).descricao,
        ENF,
        TEC,
      };
    });

    const totaisUnidade = payload.reduce(
      (acc, item) => {
        acc.ENF.totalSegSex += item.ENF.totalSegSex;
        acc.ENF.totalSabDom += item.ENF.totalSabDom;
        acc.ENF.totalGeral += item.ENF.totalGeral;
        acc.TEC.totalSegSex += item.TEC.totalSegSex;
        acc.TEC.totalSabDom += item.TEC.totalSabDom;
        acc.TEC.totalGeral += item.TEC.totalGeral;
        return acc;
      },
      {
        ENF: { totalSegSex: 0, totalSabDom: 0, totalGeral: 0 },
        TEC: { totalSegSex: 0, totalSabDom: 0, totalGeral: 0 },
      }
    );

    return { unidadeId, sitios: payload, totaisUnidade };
  }

  async atualizar(
    id: string,
    dadosRaw: AtualizarSitioFuncionalDTO | AtualizarSitioFuncionalDTOWithCargos
  ) {
    const dados = dadosRaw as AtualizarSitioFuncionalDTOWithCargos;

    const existente = await this.repo().findOne({
      where: { id },
      relations: ["unidade"],
    });
    if (!existente) return null;

    // ✅ VERIFICAR SE A UNIDADE TEM MÚLTIPLOS SÍTIOS
    const totalSitios = await this.repo().count({
      where: { unidade: { id: existente.unidade?.id } },
    });
    const temMultiplosSitios = totalSitios > 1;

    console.log(`\n🔍 UPDATE SÍTIO: ${existente.nome}`);
    console.log(`   Unidade: ${existente.unidade?.nome}`);
    console.log(`   Total de sítios na unidade: ${totalSitios}`);
    console.log(
      `   Validação de quantidade: ${
        temMultiplosSitios
          ? "❌ DESABILITADA (múltiplos sítios)"
          : "✅ HABILITADA"
      }`
    );

    // use transaction to update sitio and reconcile cargos if provided
    await this.ds.transaction(async (manager) => {
      const sitioRepo = manager.getRepository(SitioFuncional);
      const cargoUnidadeRepo = manager.getRepository(CargoUnidade);
      const cargoSitioRepo = manager.getRepository(CargoSitio);
      const distribRepo = manager.getRepository(SitioDistribuicao);

      Object.assign(existente, {
        nome: dados.nome ?? existente.nome,
        descricao: dados.descricao ?? existente.descricao,
      });

      await sitioRepo.save(existente);

      if (Array.isArray(dados.cargos)) {
        // Strategy: incremental merge/upsert. For each provided cargo item,
        // update existing CargoSitio (if present) or create a new one.
        for (const c of dados.cargos as SitioCargoInputDTO[]) {
          let cargoUnidadeId = c.cargoUnidadeId;
          const cargoId = c.cargoId;

          if (!cargoUnidadeId) {
            if (!cargoId)
              throw new Error("cargoUnidadeId ou cargoId é obrigatório");
            const cuFound = await cargoUnidadeRepo.findOne({
              where: {
                cargoId: cargoId,
                unidadeNaoInternacaoId: existente.unidade?.id,
              },
            });
            if (!cuFound)
              throw new Error(
                "CargoUnidade não encontrado para o cargo informado na unidade do sítio"
              );
            cargoUnidadeId = cuFound.id;
          }

          // check existing association
          const existingAssoc = await cargoSitioRepo.findOne({
            where: { cargoUnidadeId, sitioId: id },
          });
          if (existingAssoc) {
            // update only if quantidade_funcionarios provided, otherwise leave as-is
            if (typeof c.quantidade_funcionarios === "number") {
              // ✅ SÓ VALIDAR SE NÃO FOR UNIDADE COM MÚLTIPLOS SÍTIOS
              if (!temMultiplosSitios) {
                // Lock CargoUnidade and validate availability (excluding current alloc)
                const cuLocked = await manager
                  .createQueryBuilder(CargoUnidade, "cu")
                  .setLock("pessimistic_write")
                  .where("cu.id = :id", { id: cargoUnidadeId })
                  .getOne();
                if (!cuLocked) throw new Error("CargoUnidade não encontrado");

                const raw = await cargoSitioRepo
                  .createQueryBuilder("cs")
                  .select("COALESCE(SUM(cs.quantidade_funcionarios),0)", "sum")
                  .where("cs.cargo_unidade_id = :id", { id: cargoUnidadeId })
                  .andWhere("cs.id != :currentId", {
                    currentId: existingAssoc.id,
                  })
                  .getRawOne();

                const allocatedExcluding = Number(raw?.sum ?? 0);
                if (
                  allocatedExcluding + Number(c.quantidade_funcionarios) >
                  (cuLocked.quantidade_funcionarios ?? 0)
                ) {
                  throw new Error(
                    "Quantidade solicitada excede a disponibilidade do cargo na unidade"
                  );
                }
              }

              existingAssoc.quantidade_funcionarios = c.quantidade_funcionarios;
              await cargoSitioRepo.save(existingAssoc);
            }
            continue;
          }

          // create new association with availability check
          // ✅ SÓ VALIDAR SE NÃO FOR UNIDADE COM MÚLTIPLOS SÍTIOS
          if (!temMultiplosSitios) {
            const cuLockedForCreate = await manager
              .createQueryBuilder(CargoUnidade, "cu")
              .setLock("pessimistic_write")
              .where("cu.id = :id", { id: cargoUnidadeId })
              .getOne();
            if (!cuLockedForCreate)
              throw new Error("CargoUnidade não encontrado");

            const raw2 = await cargoSitioRepo
              .createQueryBuilder("cs")
              .select("COALESCE(SUM(cs.quantidade_funcionarios),0)", "sum")
              .where("cs.cargo_unidade_id = :id", { id: cargoUnidadeId })
              .getRawOne();

            const allocatedNow = Number(raw2?.sum ?? 0);
            const requestedNow = Number(c.quantidade_funcionarios ?? 1);
            if (
              allocatedNow + requestedNow >
              (cuLockedForCreate.quantidade_funcionarios ?? 0)
            ) {
              throw new Error(
                "Quantidade solicitada excede a disponibilidade do cargo na unidade"
              );
            }
          }

          const cs = cargoSitioRepo.create({
            cargoUnidadeId,
            sitioId: id,
            quantidade_funcionarios: c.quantidade_funcionarios ?? 1,
          } as any);

          await cargoSitioRepo.save(cs);
        }
      }

      if (Array.isArray(dados.distribuicoes)) {
        await distribRepo
          .createQueryBuilder()
          .delete()
          .where("sitio_id = :id", { id })
          .execute();

        await this.persistDistribuicoes(
          distribRepo,
          existente,
          dados.distribuicoes
        );
      }
    });

    return this.obter(id);
  }

  private async persistDistribuicoes(
    repo: Repository<SitioDistribuicao>,
    sitio: SitioFuncional,
    distribuicoes: SitioDistribuicaoInputDTO[]
  ) {
    for (const dist of distribuicoes) {
      if (!dist?.categoria) continue;
      const sitioId = sitio.id;
      if (!sitioId) continue;
      const entidade = repo.create({
        sitio,
        sitioId,
        categoria: dist.categoria,
        segSexManha: dist.segSexManha ?? 0,
        segSexTarde: dist.segSexTarde ?? 0,
        segSexNoite1: dist.segSexNoite1 ?? 0,
        segSexNoite2: dist.segSexNoite2 ?? 0,
        sabDomManha: dist.sabDomManha ?? 0,
        sabDomTarde: dist.sabDomTarde ?? 0,
        sabDomNoite1: dist.sabDomNoite1 ?? 0,
        sabDomNoite2: dist.sabDomNoite2 ?? 0,
      });
      await repo.save(entidade);
    }
  }

  async deletar(id: string) {
    const res = await this.repo().delete(id);
    return res.affected && res.affected > 0;
  }
}
