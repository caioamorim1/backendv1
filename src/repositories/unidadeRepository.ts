import { DataSource, Repository } from "typeorm";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { CreateUnidadeDTO, UpdateUnidadeDTO } from "../dto/unidade.dto";
import { Hospital } from "../entities/Hospital";
import { ScpMetodo } from "../entities/ScpMetodo";
import { CargoUnidadeRepository } from "./cargoUnidadeRepository";
import { AvaliacaoSCP, StatusSessaoAvaliacao } from "../entities/AvaliacaoSCP";

export class UnidadeRepository {
  private repo: Repository<UnidadeInternacao>;
  private hospitalRepo: Repository<Hospital>;
  private cargoUnidadeRepo: CargoUnidadeRepository;

  constructor(ds: DataSource) {
    this.repo = ds.getRepository(UnidadeInternacao);
    this.hospitalRepo = ds.getRepository(Hospital);
    this.cargoUnidadeRepo = new CargoUnidadeRepository(ds);
  }

  async criar(data: CreateUnidadeDTO) {
    try {
      const hospital = await this.hospitalRepo.findOneByOrFail({
        id: data.hospitalId,
      });

      // Validar cargos se fornecidos
      if (data.cargos_unidade && data.cargos_unidade.length > 0) {
        console.log("Validando cargos:", data.cargos_unidade);
        await this.cargoUnidadeRepo.validarCargosPertencemHospital(
          data.cargos_unidade,
          data.hospitalId
        );
      }

      return await this.repo.manager.transaction(async (trx) => {
        const uRepo = trx.getRepository(UnidadeInternacao);
        const lRepo = trx.getRepository(require("../entities/Leito").Leito);
        const mRepo = trx.getRepository(ScpMetodo);

        // Validate numeroLeitos is provided and is a non-negative integer
        const qtd = Number(data.numeroLeitos);
        if (Number.isNaN(qtd) || !Number.isInteger(qtd) || qtd < 0) {
          throw new Error(
            "numeroLeitos é obrigatório e deve ser inteiro não-negativo"
          );
        }

        // Optional: attach SCP method if provided
        let metodo: ScpMetodo | null = null;
        if (data.scpMetodoId) {
          metodo = await mRepo.findOne({ where: { id: data.scpMetodoId } });
          if (!metodo) throw new Error("scpMetodoId inválido");
        }

        const ent = uRepo.create({
          hospital,
          nome: data.nome,
          horas_extra_reais: data.horas_extra_reais,
          horas_extra_projetadas: data.horas_extra_projetadas,
          pontuacao_max: data.pontuacao_max ?? null,
          pontuacao_min: data.pontuacao_min ?? null,
          gatilho: data.gatilho ?? null,
          scpMetodo: metodo ?? null,
        });
        const unidade = await uRepo.save(ent);

        if (qtd > 0) {
          const novos = Array.from({ length: qtd }, (_, i) => {
            const numero = String(i + 1).padStart(3, "0");
            return lRepo.create({ numero, unidade });
          });
          await lRepo.save(novos);
        }

        // Criar cargos da unidade se fornecidos
        if (data.cargos_unidade && data.cargos_unidade.length > 0) {
          const cargoUnidadeRepo = trx.getRepository(
            require("../entities/CargoUnidade").CargoUnidade
          );
          const cargoRepo = trx.getRepository(
            require("../entities/Cargo").Cargo
          );

          for (const cargoData of data.cargos_unidade) {
            // Verificar se o cargo existe
            const cargo = await cargoRepo.findOneBy({ id: cargoData.cargoId });
            if (!cargo) {
              throw new Error(`Cargo ${cargoData.cargoId} não encontrado`);
            }

            const cargoUnidade = cargoUnidadeRepo.create({
              unidadeId: unidade.id,
              cargoId: cargoData.cargoId,
              quantidade_funcionarios: cargoData.quantidade_funcionarios,
            });

            await cargoUnidadeRepo.save(cargoUnidade);
          }
        }

        return await uRepo.findOneOrFail({
          where: { id: unidade.id },
          relations: [
            "leitos",
            "hospital",
            "scpMetodo",
            "cargosUnidade",
            "cargosUnidade.cargo",
          ],
        });
      });
    } catch (err: any) {
      console.error("Erro ao criar unidade:", err);
      throw err;
    }
  }

  async listar(hospitalId?: string) {
    const where: any = {};
    if (hospitalId) where.hospital = { id: hospitalId };

    const itens = await this.repo.find({
      where,
      relations: [
        "hospital",
        "leitos",
        "scpMetodo",
        "cargosUnidade",
        "cargosUnidade.cargo",
      ],
    });

    // Fetch all active sessions for the queried units in one shot
    const unidadeIds = itens.map((u) => u.id);
    const sessoesAtivas = unidadeIds.length
      ? await this.repo.manager.getRepository(AvaliacaoSCP).find({
          where: unidadeIds.map((id) => ({
            unidade: { id },
            statusSessao: StatusSessaoAvaliacao.ATIVA,
          })),
          relations: ["leito", "unidade"],
        })
      : [];

    // Group sessions by unidadeId → leitoId
    const sessoesPorUnidade = new Map<string, Map<string, { totalPontos: number; classificacao: any }>>();
    for (const s of sessoesAtivas) {
      if (!s.leito?.id || !s.unidade?.id) continue;
      if (!sessoesPorUnidade.has(s.unidade.id)) {
        sessoesPorUnidade.set(s.unidade.id, new Map());
      }
      sessoesPorUnidade.get(s.unidade.id)!.set(s.leito.id, {
        totalPontos: s.totalPontos,
        classificacao: s.classificacao,
      });
    }

    // Map items to include scpMetodoId and hospitalId explicitly
    return itens.map((u: any) => {
      const pontuacaoMin = u.pontuacao_min != null ? Number(u.pontuacao_min) : null;
      const pontuacaoMax = u.pontuacao_max != null ? Number(u.pontuacao_max) : null;
      const intervaloDefinido = pontuacaoMin !== null && pontuacaoMax !== null;
      const sessaoByLeito = sessoesPorUnidade.get(u.id) ?? new Map();

      return {
        id: u.id,
        nome: u.nome,
        hospitalId: u.hospital?.id ?? null,
        horas_extra_reais: u.horas_extra_reais,
        horas_extra_projetadas: u.horas_extra_projetadas,
        pontuacao_max: u.pontuacao_max ?? null,
        pontuacao_min: u.pontuacao_min ?? null,
        gatilho: u.gatilho ?? null,
        leitos: (u.leitos ?? []).map((l: any) => {
          const sessao = sessaoByLeito.get(l.id);
          const totalPontos = sessao?.totalPontos;
          let pontuacaoDentroIntervalo: boolean | null = null;
          if (totalPontos !== undefined && intervaloDefinido) {
            pontuacaoDentroIntervalo =
              totalPontos >= pontuacaoMin! && totalPontos <= pontuacaoMax!;
          }
          return {
            ...l,
            pontuacaoDentroIntervalo,
            classificacaoScp: sessao?.classificacao ?? null,
          };
        }),
        cargos_unidade:
          u.cargosUnidade?.map((cu: any) => ({
            id: cu.id,
            cargoId: cu.cargoId,
            quantidade_funcionarios: cu.quantidade_funcionarios,
            quantidade_atualizada_em: cu.quantidade_atualizada_em ?? null,
            cargo: {
              id: cu.cargo.id,
              nome: cu.cargo.nome,
              salario: cu.cargo.salario,
              carga_horaria: cu.cargo.carga_horaria,
              descricao: cu.cargo.descricao,
              adicionais_tributos: cu.cargo.adicionais_tributos,
            },
          })) ?? [],
        scpMetodoKey: u.scpMetodo ? u.scpMetodo.key : null,
        scpMetodoId: u.scpMetodo ? u.scpMetodo.id : null,
        created_at: u.created_at,
        updated_at: u.updated_at,
      };
    });
  }

  // retorna unidades (entidades completas) de um hospital — utilitário para estatísticas
  async listarPorHospital(hospitalId: string) {
    return this.repo.find({
      where: { hospital: { id: hospitalId } },
      relations: [
        "hospital",
        "leitos",
        "scpMetodo",
        "cargosUnidade",
        "cargosUnidade.cargo",
      ],
    });
  }

  async obter(id: string) {
    const u = await this.repo.findOne({
      where: { id },
      relations: [
        "hospital",
        "leitos",
        "scpMetodo",
        "cargosUnidade",
        "cargosUnidade.cargo",
      ],
    });
    if (!u) return null;

    // Fetch active sessions to compute pontuacaoDentroIntervalo per leito
    const sessoesAtivas = await this.repo.manager
      .getRepository(AvaliacaoSCP)
      .find({
        where: { unidade: { id }, statusSessao: StatusSessaoAvaliacao.ATIVA },
        relations: ["leito"],
      });
    const pontuacaoMin = u.pontuacao_min != null ? Number(u.pontuacao_min) : null;
    const pontuacaoMax = u.pontuacao_max != null ? Number(u.pontuacao_max) : null;
    const intervaloDefinido = pontuacaoMin !== null && pontuacaoMax !== null;
    const sessaoByLeito = new Map(
      sessoesAtivas
        .filter((s) => s.leito?.id)
        .map((s) => [s.leito!.id, { totalPontos: s.totalPontos, classificacao: s.classificacao }])
    );

    return {
      id: u.id,
      nome: u.nome,
      hospitalId: u.hospital?.id ?? null,
      horas_extra_reais: u.horas_extra_reais,
      horas_extra_projetadas: u.horas_extra_projetadas,
      pontuacao_max: u.pontuacao_max ?? null,
      pontuacao_min: u.pontuacao_min ?? null,
      gatilho: u.gatilho ?? null,
      leitos: (u.leitos ?? []).map((l) => {
        const sessao = sessaoByLeito.get(l.id);
        const totalPontos = sessao?.totalPontos;
        let pontuacaoDentroIntervalo: boolean | null = null;
        if (totalPontos !== undefined && intervaloDefinido) {
          pontuacaoDentroIntervalo =
            totalPontos >= pontuacaoMin! && totalPontos <= pontuacaoMax!;
        }
        return {
          ...l,
          pontuacaoDentroIntervalo,
          classificacaoScp: sessao?.classificacao ?? null,
        };
      }),
      cargos_unidade:
        u.cargosUnidade?.map((cu: any) => ({
          id: cu.id,
          cargoId: cu.cargoId,
          quantidade_funcionarios: cu.quantidade_funcionarios,
          quantidade_atualizada_em: cu.quantidade_atualizada_em ?? null,
          cargo: {
            id: cu.cargo.id,
            nome: cu.cargo.nome,
            salario: cu.cargo.salario,
            carga_horaria: cu.cargo.carga_horaria,
            descricao: cu.cargo.descricao,
            adicionais_tributos: cu.cargo.adicionais_tributos,
          },
        })) ?? [],
      scpMetodoKey: u.scpMetodo ? u.scpMetodo.key : null,
      scpMetodoId: u.scpMetodo ? u.scpMetodo.id : null,
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
  }

  async atualizar(id: string, data: UpdateUnidadeDTO) {
    const unidade = await this.repo.findOne({
      where: { id },
      relations: ["hospital"],
    });
    if (!unidade) throw new Error("Unidade não encontrada");

    // Validar cargos se fornecidos
    if (data.cargos_unidade && data.cargos_unidade.length > 0) {
      await this.cargoUnidadeRepo.validarCargosPertencemHospital(
        data.cargos_unidade,
        unidade.hospital.id
      );
    }

    return await this.repo.manager.transaction(async (trx) => {
      const uRepo = trx.getRepository(UnidadeInternacao);

      // Atualizar campos básicos da unidade
      const updateData: any = {
        nome: data.nome,
        horas_extra_reais: data.horas_extra_reais,
        horas_extra_projetadas: data.horas_extra_projetadas,
        ...(data.pontuacao_max !== undefined && { pontuacao_max: data.pontuacao_max }),
        ...(data.pontuacao_min !== undefined && { pontuacao_min: data.pontuacao_min }),
        ...(data.gatilho !== undefined && { gatilho: data.gatilho }),
      };

      // Atualizar SCP método se fornecido
      if (data.scpMetodoId !== undefined) {
        if (data.scpMetodoId) {
          const mRepo = trx.getRepository(ScpMetodo);
          const metodo = await mRepo.findOne({
            where: { id: data.scpMetodoId },
          });
          if (!metodo) throw new Error("scpMetodoId inválido");
          updateData.scpMetodo = metodo;
        } else {
          updateData.scpMetodo = null;
        }
      }

      await uRepo.update(id, updateData);

      // Atualizar cargos da unidade se fornecidos
      if (data.cargos_unidade !== undefined) {
        if (data.cargos_unidade.length > 0) {
          await this.cargoUnidadeRepo.substituirCargosPorUnidade(
            id,
            data.cargos_unidade
          );
        } else {
          // Se array vazio, remove todos os cargos
          await this.cargoUnidadeRepo.deletarPorUnidade(id);
        }
      }

      const novo = await this.obter(id);
      if (!novo) throw new Error("Unidade não encontrada após atualização");
      return novo;
    });
  }

  async deletar(id: string) {
    // Perform a transactional cascade delete of related data to avoid FK violations
    return await this.repo.manager.transaction(async (manager) => {
      // Ensure unidade exists
      const u = await manager.getRepository(UnidadeInternacao).findOne({
        where: { id },
        relations: ["leitos"],
      });
      if (!u) return false;

      const leitoIds = (u.leitos || []).map((l: any) => l.id);

      // 1) Delete historicos_ocupacao for these leitos
      if (leitoIds.length > 0) {
        await manager
          .getRepository(
            require("../entities/HistoricoOcupacao").HistoricoOcupacao
          )
          .createQueryBuilder()
          .delete()
          .where("leitoId IN (:...ids)", { ids: leitoIds })
          .execute();
      }

      // 2) Delete avaliacoes_scp related to this unidade or these leitos
      await manager
        .getRepository(require("../entities/AvaliacaoSCP").AvaliacaoSCP)
        .createQueryBuilder()
        .delete()
        .where("unidadeId = :unidadeId", { unidadeId: id })
        .orWhere(leitoIds.length > 0 ? "leitoId IN (:...ids)" : "1=0", {
          ids: leitoIds,
        })
        .execute();

      // 3) Delete cargos_unidade for this unidade
      await manager
        .getRepository(require("../entities/CargoUnidade").CargoUnidade)
        .createQueryBuilder()
        .delete()
        .where("unidadeId = :unidadeId", { unidadeId: id })
        .execute();

      // 4) Delete leitos of the unidade
      if (leitoIds.length > 0) {
        await manager
          .getRepository(require("../entities/Leito").Leito)
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: leitoIds })
          .execute();
      }

      // 5) Finally delete the unidade
      const del = await manager.getRepository(UnidadeInternacao).delete({ id });
      return (del.affected ?? 0) > 0;
    });
  }
}
