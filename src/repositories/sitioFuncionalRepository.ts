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

            // Primeiro: Tenta buscar CargoUnidade existente (RETROCOMPATÍVEL)
            let cuFound = await cargoUnidadeRepo.findOne({
              where: { cargoId: cargoId, unidadeNaoInternacaoId: unidade.id },
            });

            // Se NÃO existe CargoUnidade, cria automaticamente (NOVA LÓGICA)
            if (!cuFound) {
              console.log(
                `⚠️  CargoUnidade não encontrado. Tentando criar automaticamente...`
              );

              // Busca o hospital através da unidade
              const unidadeComHospital = await manager
                .getRepository(UnidadeNaoInternacao)
                .findOne({
                  where: { id: unidade.id },
                  relations: ["hospital"],
                });

              if (!unidadeComHospital?.hospital) {
                throw new Error("Hospital da unidade não encontrado");
              }

              // Valida se o cargo existe no hospital
              const cargoRepo = manager.getRepository("Cargo");
              const cargoExiste = await cargoRepo.findOne({
                where: {
                  id: cargoId,
                  hospitalId: unidadeComHospital.hospital.id,
                },
              });

              if (!cargoExiste) {
                throw new Error(
                  `Cargo não encontrado no hospital. Certifique-se de que o cargo está cadastrado.`
                );
              }

              // Cria CargoUnidade automaticamente
              console.log(
                `✅ Criando CargoUnidade: Cargo ${cargoId} → Unidade ${unidade.id}`
              );

              const novoCU = new CargoUnidade();
              novoCU.cargoId = cargoId;
              novoCU.unidadeNaoInternacaoId = unidade.id;
              novoCU.quantidade_funcionarios = 0;

              cuFound = await cargoUnidadeRepo.save(novoCU);
            }

            if (!cuFound) {
              throw new Error("Erro ao criar CargoUnidade");
            }

            cargoUnidadeId = cuFound.id;
          }

          // prevent duplicate
          const exists = await cargoSitioRepo.findOne({
            where: { cargoUnidadeId, sitioId: (sitioSalvo as any).id },
          });
          if (exists) continue;

          // Calcular total se vier por turnos
          let quantidadeTotal = c.quantidade_funcionarios ?? 0;
          const temTurnos =
            c.seg_sex_manha !== undefined ||
            c.seg_sex_tarde !== undefined ||
            c.seg_sex_noite1 !== undefined ||
            c.seg_sex_noite2 !== undefined ||
            c.sab_dom_manha !== undefined ||
            c.sab_dom_tarde !== undefined ||
            c.sab_dom_noite1 !== undefined ||
            c.sab_dom_noite2 !== undefined;

          if (temTurnos) {
            // Se informou turnos, calcular o total (soma de todos os turnos)
            quantidadeTotal =
              (c.seg_sex_manha ?? 0) +
              (c.seg_sex_tarde ?? 0) +
              (c.seg_sex_noite1 ?? 0) +
              (c.seg_sex_noite2 ?? 0) +
              (c.sab_dom_manha ?? 0) +
              (c.sab_dom_tarde ?? 0) +
              (c.sab_dom_noite1 ?? 0) +
              (c.sab_dom_noite2 ?? 0);
          }

          const cs = cargoSitioRepo.create({
            cargoUnidadeId,
            sitioId: (sitioSalvo as any).id,
            quantidade_funcionarios: quantidadeTotal,
            quantidade_atualizada_em: new Date(),
            seg_sex_manha: c.seg_sex_manha,
            seg_sex_tarde: c.seg_sex_tarde,
            seg_sex_noite1: c.seg_sex_noite1,
            seg_sex_noite2: c.seg_sex_noite2,
            sab_dom_manha: c.sab_dom_manha,
            sab_dom_tarde: c.sab_dom_tarde,
            sab_dom_noite1: c.sab_dom_noite1,
            sab_dom_noite2: c.sab_dom_noite2,
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

    console.log(`\n🔍 UPDATE SÍTIO: ${existente.nome}`);
    console.log(`   Unidade: ${existente.unidade?.nome}`);

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

            // Primeiro: Tenta buscar CargoUnidade existente (RETROCOMPATÍVEL)
            let cuFound = await cargoUnidadeRepo.findOne({
              where: {
                cargoId: cargoId,
                unidadeNaoInternacaoId: existente.unidade?.id,
              },
            });

            // Se NÃO existe CargoUnidade, cria automaticamente (NOVA LÓGICA)
            if (!cuFound) {
              console.log(
                `⚠️  CargoUnidade não encontrado na atualização. Criando automaticamente...`
              );

              // Busca o hospital através da unidade
              const unidadeComHospital = await manager
                .getRepository(UnidadeNaoInternacao)
                .findOne({
                  where: { id: existente.unidade?.id },
                  relations: ["hospital"],
                });

              if (!unidadeComHospital?.hospital) {
                throw new Error("Hospital da unidade não encontrado");
              }

              // Valida se o cargo existe no hospital
              const cargoRepo = manager.getRepository("Cargo");
              const cargoExiste = await cargoRepo.findOne({
                where: {
                  id: cargoId,
                  hospitalId: unidadeComHospital.hospital.id,
                },
              });

              if (!cargoExiste) {
                throw new Error(
                  `Cargo não encontrado no hospital. Certifique-se de que o cargo está cadastrado.`
                );
              }

              // Cria CargoUnidade automaticamente
              console.log(
                `✅ Criando CargoUnidade na atualização: Cargo ${cargoId} → Unidade ${existente.unidade?.id}`
              );

              const novoCU = new CargoUnidade();
              novoCU.cargoId = cargoId;
              novoCU.unidadeNaoInternacaoId = existente.unidade?.id;
              novoCU.quantidade_funcionarios = 0; // Quantidade inicial zerada

              cuFound = await cargoUnidadeRepo.save(novoCU);
            }

            if (!cuFound) {
              throw new Error("Erro ao criar CargoUnidade");
            }

            cargoUnidadeId = cuFound.id;
          }

          // check existing association
          const existingAssoc = await cargoSitioRepo.findOne({
            where: { cargoUnidadeId, sitioId: id },
          });
          if (existingAssoc) {
            // Calcular total se vier por turnos
            const temTurnos =
              c.seg_sex_manha !== undefined ||
              c.seg_sex_tarde !== undefined ||
              c.seg_sex_noite1 !== undefined ||
              c.seg_sex_noite2 !== undefined ||
              c.sab_dom_manha !== undefined ||
              c.sab_dom_tarde !== undefined ||
              c.sab_dom_noite1 !== undefined ||
              c.sab_dom_noite2 !== undefined;

            let quantidadeTotal = c.quantidade_funcionarios;
            if (temTurnos) {
              quantidadeTotal =
                (c.seg_sex_manha ?? 0) +
                (c.seg_sex_tarde ?? 0) +
                (c.seg_sex_noite1 ?? 0) +
                (c.seg_sex_noite2 ?? 0) +
                (c.sab_dom_manha ?? 0) +
                (c.sab_dom_tarde ?? 0) +
                (c.sab_dom_noite1 ?? 0) +
                (c.sab_dom_noite2 ?? 0);
            }

            // Verificar se algo mudou (quantidade ou turnos)
            const quantidadeMudou =
              quantidadeTotal !== undefined &&
              existingAssoc.quantidade_funcionarios !== quantidadeTotal;

            const turnosMudaram =
              temTurnos &&
              (existingAssoc.seg_sex_manha !== c.seg_sex_manha ||
                existingAssoc.seg_sex_tarde !== c.seg_sex_tarde ||
                existingAssoc.seg_sex_noite1 !== c.seg_sex_noite1 ||
                existingAssoc.seg_sex_noite2 !== c.seg_sex_noite2 ||
                existingAssoc.sab_dom_manha !== c.sab_dom_manha ||
                existingAssoc.sab_dom_tarde !== c.sab_dom_tarde ||
                existingAssoc.sab_dom_noite1 !== c.sab_dom_noite1 ||
                existingAssoc.sab_dom_noite2 !== c.sab_dom_noite2);

            if (quantidadeTotal !== undefined) {
              existingAssoc.quantidade_funcionarios = quantidadeTotal;
            }

            // Atualizar turnos se fornecidos
            if (c.seg_sex_manha !== undefined)
              existingAssoc.seg_sex_manha = c.seg_sex_manha;
            if (c.seg_sex_tarde !== undefined)
              existingAssoc.seg_sex_tarde = c.seg_sex_tarde;
            if (c.seg_sex_noite1 !== undefined)
              existingAssoc.seg_sex_noite1 = c.seg_sex_noite1;
            if (c.seg_sex_noite2 !== undefined)
              existingAssoc.seg_sex_noite2 = c.seg_sex_noite2;
            if (c.sab_dom_manha !== undefined)
              existingAssoc.sab_dom_manha = c.sab_dom_manha;
            if (c.sab_dom_tarde !== undefined)
              existingAssoc.sab_dom_tarde = c.sab_dom_tarde;
            if (c.sab_dom_noite1 !== undefined)
              existingAssoc.sab_dom_noite1 = c.sab_dom_noite1;
            if (c.sab_dom_noite2 !== undefined)
              existingAssoc.sab_dom_noite2 = c.sab_dom_noite2;

            if (quantidadeMudou || turnosMudaram) {
              existingAssoc.quantidade_atualizada_em = new Date();
            }

            await cargoSitioRepo.save(existingAssoc);
            continue;
          }

          // create new association (SEM validação de disponibilidade)
          console.log(`➕ Criando nova associação CargoSitio`);

          // Primeiro, tentar encontrar CargoUnidade pelo ID
          let cargoUnidadeExiste = await cargoUnidadeRepo.findOne({
            where: { id: cargoUnidadeId },
          });

          if (!cargoUnidadeExiste) {
            console.log(
              `⚠️ CargoUnidade ${cargoUnidadeId} não existe. Interpretando como cargoId...`
            );

            // O frontend está enviando o cargoId como "cargoUnidadeId"
            const cargoIdParaCriar = cargoUnidadeId;
            
            console.log(`✅ Criando CargoUnidade automaticamente com cargo ${cargoIdParaCriar}`);

            // Buscar o hospital através da unidade
            const unidadeComHospital = await manager
              .getRepository(UnidadeNaoInternacao)
              .findOne({
                where: { id: existente.unidade?.id },
                relations: ["hospital"],
              });

            if (!unidadeComHospital?.hospital) {
              throw new Error("Hospital da unidade não encontrado");
            }

            // Valida se o cargo existe no hospital
            const cargoRepo = manager.getRepository("Cargo");
            const cargoExiste = await cargoRepo.findOne({
              where: {
                id: cargoIdParaCriar,
                hospitalId: unidadeComHospital.hospital.id,
              },
            });

            if (!cargoExiste) {
              throw new Error(
                `Cargo ${cargoIdParaCriar} não encontrado no hospital. Certifique-se de que o cargo está cadastrado.`
              );
            }

            // Cria CargoUnidade automaticamente
            const novoCU = new CargoUnidade();
            novoCU.cargoId = cargoIdParaCriar;
            novoCU.unidadeNaoInternacaoId = existente.unidade?.id;
            novoCU.quantidade_funcionarios = 0;

            cargoUnidadeExiste = await cargoUnidadeRepo.save(novoCU);
            cargoUnidadeId = cargoUnidadeExiste.id;

            console.log(
              `✅ CargoUnidade criado com sucesso: ${cargoUnidadeId}`
            );
          } else {
            console.log(`✅ CargoUnidade ${cargoUnidadeId} validado com sucesso`);
          }

          // Calcular total se vier por turnos
          let quantidadeTotal = c.quantidade_funcionarios ?? 0;
          const temTurnos =
            c.seg_sex_manha !== undefined ||
            c.seg_sex_tarde !== undefined ||
            c.seg_sex_noite1 !== undefined ||
            c.seg_sex_noite2 !== undefined ||
            c.sab_dom_manha !== undefined ||
            c.sab_dom_tarde !== undefined ||
            c.sab_dom_noite1 !== undefined ||
            c.sab_dom_noite2 !== undefined;

          if (temTurnos) {
            quantidadeTotal =
              (c.seg_sex_manha ?? 0) +
              (c.seg_sex_tarde ?? 0) +
              (c.seg_sex_noite1 ?? 0) +
              (c.seg_sex_noite2 ?? 0) +
              (c.sab_dom_manha ?? 0) +
              (c.sab_dom_tarde ?? 0) +
              (c.sab_dom_noite1 ?? 0) +
              (c.sab_dom_noite2 ?? 0);
          }

          const cs = cargoSitioRepo.create({
            cargoUnidadeId,
            sitioId: id,
            quantidade_funcionarios: quantidadeTotal,
            quantidade_atualizada_em: new Date(),
            seg_sex_manha: c.seg_sex_manha,
            seg_sex_tarde: c.seg_sex_tarde,
            seg_sex_noite1: c.seg_sex_noite1,
            seg_sex_noite2: c.seg_sex_noite2,
            sab_dom_manha: c.sab_dom_manha,
            sab_dom_tarde: c.sab_dom_tarde,
            sab_dom_noite1: c.sab_dom_noite1,
            sab_dom_noite2: c.sab_dom_noite2,
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
