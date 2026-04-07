import { DataSource, Repository, Between, IsNull, Not } from "typeorm";
import { DateTime } from "luxon";
import {
  AvaliacaoSCP,
  ClassificacaoCuidado,
  StatusSessaoAvaliacao,
} from "../entities/AvaliacaoSCP";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { Leito, StatusLeito } from "../entities/Leito";
import {
  CreateAvaliacaoSCPDTO,
  FiltroAvaliacaoDTO,
  ResumoDiarioDTO,
} from "../dto/avaliacao.dto";
import { classificarTotal } from "../utils/scpFaixas";
import { ScpMetodo } from "../entities/ScpMetodo";
import { Colaborador } from "../entities/Colaborador";
import { LeitosStatusService } from "../services/leitosStatusService";
import { HistoricoOcupacao } from "../entities/HistoricoOcupacao";
import { LeitoEvento, LeitoEventoTipo } from "../entities/LeitoEvento";

export class AvaliacaoRepository {
  private repo: Repository<AvaliacaoSCP>;
  private unidadeRepo: Repository<UnidadeInternacao>;
  private scpMetodoRepo: Repository<ScpMetodo>;
  private colaboradorRepo: Repository<Colaborador>;
  private leitosStatusService: LeitosStatusService;

  constructor(ds: DataSource) {
    this.repo = ds.getRepository(AvaliacaoSCP);
    this.unidadeRepo = ds.getRepository(UnidadeInternacao);
    this.scpMetodoRepo = ds.getRepository(ScpMetodo);
    this.colaboradorRepo = ds.getRepository(Colaborador);
    this.leitosStatusService = new LeitosStatusService(ds);
  }

  /**
   * Busca o último prontuário usado em avaliações de um leito específico
   * Retorna o prontuário mais recente ou null se não houver histórico
   */
  async buscarUltimoProntuarioPorLeito(leitoId: string): Promise<{
    prontuario: string | null;
    dataAplicacao: string | null;
    avaliacaoId: string | null;
  }> {
    console.log("\n💾 [REPOSITORY] Buscando último prontuário");
    console.log("   Leito ID:", leitoId);

    console.log(
      "\n🔎 1ª Tentativa: Buscar com prontuário preenchido (NOT NULL)..."
    );
    const ultimaAvaliacao = await this.repo.findOne({
      where: {
        leito: { id: leitoId },
        prontuario: Not(IsNull()), // Busca onde prontuário NÃO é null
      },
      order: {
        dataAplicacao: "DESC",
        created_at: "DESC",
      },
      select: ["id", "prontuario", "dataAplicacao", "created_at"], // Incluir created_at no select
    });

    if (ultimaAvaliacao) {
      console.log("   ✅ Encontrou avaliação com prontuário:");
      console.log("      - ID:", ultimaAvaliacao.id);
      console.log("      - Prontuário:", ultimaAvaliacao.prontuario);
      console.log("      - Data:", ultimaAvaliacao.dataAplicacao);
      console.log("      - Created At:", ultimaAvaliacao.created_at);
    } else {
      console.log("   ⚠️ Não encontrou avaliação com prontuário preenchido");
    }

    // Se não encontrou com prontuário preenchido, buscar qualquer uma
    if (!ultimaAvaliacao || !ultimaAvaliacao.prontuario) {
      console.log("\n🔎 2ª Tentativa: Buscar qualquer avaliação do leito...");

      const qualquerAvaliacao = await this.repo.findOne({
        where: {
          leito: { id: leitoId },
        },
        order: {
          dataAplicacao: "DESC",
          created_at: "DESC",
        },
        select: ["id", "prontuario", "dataAplicacao", "created_at"], // Incluir created_at no select
      });

      if (qualquerAvaliacao) {
        console.log("   ✅ Encontrou avaliação:");
        console.log("      - ID:", qualquerAvaliacao.id);
        console.log(
          "      - Prontuário:",
          qualquerAvaliacao.prontuario || "(null)"
        );
        console.log("      - Data:", qualquerAvaliacao.dataAplicacao);
        console.log("      - Created At:", qualquerAvaliacao.created_at);
      } else {
        console.log("   ℹ️ Nenhuma avaliação encontrada para este leito");
      }

      console.log("\n📤 Retornando resultado (fallback):");
      const resultado = {
        prontuario: qualquerAvaliacao?.prontuario || null,
        dataAplicacao: qualquerAvaliacao?.dataAplicacao || null,
        avaliacaoId: qualquerAvaliacao?.id || null,
      };
      console.log(JSON.stringify(resultado, null, 2));

      return resultado;
    }

    console.log("\n📤 Retornando resultado (com prontuário):");
    const resultado = {
      prontuario: ultimaAvaliacao.prontuario,
      dataAplicacao: ultimaAvaliacao.dataAplicacao,
      avaliacaoId: ultimaAvaliacao.id,
    };
    console.log(JSON.stringify(resultado, null, 2));

    return resultado;
  }

  /**
   * Sessão por Leito: cria avaliação cuja expiração é definida como o fim do dia
   * local (America/Sao_Paulo). A expiração diária é tratada pelo job de
   * sessionExpiry que roda à meia-noite.
   */
  async criarSessaoPorLeito(params: {
    leitoId: string;
    unidadeId: string;
    scp: string;
    itens: Record<string, number>;
    colaboradorId: string;
    prontuario?: string | null;
    dataAplicacao?: string; // yyyy-mm-dd format for historical data
    ifExists?: "reject" | "overwrite" | "replace";
  }) {
    // garantir atomicidade e evitar condições de corrida
    return await this.repo.manager.transaction(async (manager) => {
      const { leitoId, unidadeId, scp, itens, colaboradorId } = params;
      const prontuario = params.prontuario ?? null;
      const ifExists = params.ifExists ?? "overwrite";

      const unidade = await manager
        .getRepository(UnidadeInternacao)
        .findOneOrFail({
          where: { id: unidadeId },
          relations: ["hospital", "scpMetodo"],
        });

      const leito = await manager.getRepository(Leito).findOneOrFail({
        where: { id: leitoId },
        relations: ["unidade"],
      });
      if (leito.unidade.id !== unidade.id)
        throw new Error("Leito não pertence à unidade informada");
      if (leito.status === StatusLeito.INATIVO)
        throw new Error("Leito bloqueado");

      const expectedKey = unidade.scpMetodo?.key?.toUpperCase();
      if (!expectedKey)
        throw new Error("Unidade não tem método SCP configurado.");
      if (expectedKey !== scp.toUpperCase())
        throw new Error("SCP enviado difere do SCP configurado na unidade.");

      // valida itens contra schema dinâmico se existir
      const metodo = await manager.getRepository(ScpMetodo).findOne({
        where: { key: expectedKey },
      });
      if (metodo) {
        const validKeys = new Set(metodo.questions.map((q) => q.key));
        for (const k of Object.keys(itens))
          if (!validKeys.has(k))
            throw new Error(`Item inválido para método ${scp}: ${k}`);
      }

      const total = Object.values(itens).reduce(
        (a, b) => a + (Number(b) || 0),
        0
      );
      const classe = metodo
        ? (metodo.faixas.find((f) => total >= f.min && total <= f.max)
            ?.classe as ClassificacaoCuidado)
        : classificarTotal(expectedKey as any, total);
      console.log(
        `criarSessaoPorLeito: leitoId=${leitoId} total=${total} classificacao=${classe}`
      );
      const colaboradorRepo = manager.getRepository(Colaborador);
      console.log("Buscando colaborador por ID:", colaboradorId);
      let autor: Colaborador | null = await colaboradorRepo.findOne({
        where: { id: colaboradorId },
      });

      if (!autor) {
        throw new Error("Colaborador não encontrado");
      }

      // Usa a data LOCAL (America/Sao_Paulo) como dataAplicacao para evitar
      // discrepâncias em relação ao front e filtros por dia.
      const ZONE = "America/Sao_Paulo";
      const nowLocal = DateTime.now().setZone(ZONE);

      const dataHoje =
        params.dataAplicacao ||
        nowLocal.toISODate() ||
        new Date().toISOString().slice(0, 10);

      // For historical data, set expiration to the end of that specific day
      const targetDate = params.dataAplicacao
        ? DateTime.fromISO(params.dataAplicacao).setZone(ZONE)
        : nowLocal;
      const endLocalForToday = targetDate.endOf("day");
      const expiresAt = endLocalForToday.toUTC().toJSDate();
      // Verifica se já existe sessão ATIVA para o mesmo leito e dataAplicacao
      const existing = await manager.getRepository(AvaliacaoSCP).findOne({
        where: {
          leito: { id: leitoId },
          dataAplicacao: dataHoje,
          statusSessao: StatusSessaoAvaliacao.ATIVA,
        },
        relations: ["leito", "unidade", "autor"],
      });
      if (existing) {
        if (ifExists === "reject") {
          throw new Error(
            "Já existe uma sessão ativa neste leito para a data."
          );
        }

        if (ifExists === "overwrite") {
          // atualiza a sessão existente (mantém id)
          existing.itens = itens;
          existing.totalPontos = total;
          existing.classificacao = classe;
          existing.prontuario = prontuario;
          existing.scp = expectedKey;
          existing.expiresAt = expiresAt;
          existing.statusSessao = StatusSessaoAvaliacao.ATIVA;
          existing.autor = autor;

          // garante que o leito esteja marcado como ATIVO
          try {
            const leitoRepo = manager.getRepository(Leito);
            if (existing.leito) {
              const statusAnterior = existing.leito.status;
              existing.leito.status = StatusLeito.ATIVO;
              const leitoAtualizado = await leitoRepo.save(existing.leito);
              if (statusAnterior !== StatusLeito.ATIVO) {
                const evRepo = manager.getRepository(LeitoEvento);
                await evRepo.save(
                  evRepo.create({
                    leito: leitoAtualizado,
                    tipo: LeitoEventoTipo.STATUS_ALTERADO,
                    dataHora: new Date(),
                    unidadeId: unidade.id,
                    hospitalId: unidade.hospital?.id || null,
                    leitoNumero: leitoAtualizado.numero,
                    avaliacaoId: existing.id,
                    historicoOcupacaoId: null,
                    autorId: autor.id,
                    autorNome: autor.nome,
                    motivo: "Sessão ativa (overwrite)",
                    payload: {
                      statusAnterior,
                      statusNovo: StatusLeito.ATIVO,
                    },
                  })
                );
              }
            }
          } catch (e) {
            console.warn("Não foi possível atualizar status do leito:", e);
          }

          // **ATUALIZAR HISTÓRICO ATIVO**
          const historicoRepo = manager.getRepository(HistoricoOcupacao);
          const historicoAtivo = await historicoRepo.findOne({
            where: {
              leito: { id: leitoId },
              fim: IsNull(),
            },
            order: { inicio: "DESC" },
          });

          if (historicoAtivo) {
            console.log(
              `Atualizando historico ativo id=${historicoAtivo.id} com classificacao=${classe} total=${total}`
            );
            historicoAtivo.totalPontos = total;
            historicoAtivo.classificacao = classe;
            historicoAtivo.itens = itens;
            historicoAtivo.autorId = autor.id;
            historicoAtivo.autorNome = autor.nome;
            await historicoRepo.save(historicoAtivo);

            // ✅ Evento de atualização de avaliação (overwrite)
            try {
              const evRepo = manager.getRepository(LeitoEvento);
              await evRepo.save(
                evRepo.create({
                  leito: existing.leito!,
                  tipo: LeitoEventoTipo.AVALIACAO_ATUALIZADA,
                  dataHora: new Date(),
                  unidadeId: unidade.id,
                  hospitalId: unidade.hospital?.id || null,
                  leitoNumero: existing.leito?.numero ?? null,
                  avaliacaoId: existing.id,
                  historicoOcupacaoId: historicoAtivo.id,
                  autorId: autor.id,
                  autorNome: autor.nome,
                  motivo: "overwrite",
                  payload: {
                    scp: expectedKey,
                    totalPontos: total,
                    classificacao: classe,
                  },
                })
              );
            } catch (e) {
              console.warn(
                "Não foi possível registrar evento AVALIACAO_ATUALIZADA (overwrite):",
                e
              );
            }
          }

          return await manager.getRepository(AvaliacaoSCP).save(existing);
        }

        if (ifExists === "replace") {
          // tenta remover a existente; em caso de falha, marca como liberada e segue
          try {
            await manager.getRepository(AvaliacaoSCP).remove(existing);
          } catch (e) {
            existing.statusSessao = StatusSessaoAvaliacao.LIBERADA;
            existing.expiresAt = new Date();
            await manager.getRepository(AvaliacaoSCP).save(existing);
          }
          // continua para criar uma nova sessão abaixo
        }
      }

      const avaliacao = manager.getRepository(AvaliacaoSCP).create({
        dataAplicacao: dataHoje as string,
        unidade,
        autor,
        scp: expectedKey,
        itens,
        totalPontos: total,
        classificacao: classe,
        leito,
        prontuario,
        expiresAt,
        statusSessao: StatusSessaoAvaliacao.ATIVA,
      });

      // garante que o leito esteja marcado como ATIVO (usando o mesmo manager)
      try {
        const leitoRepo = manager.getRepository(Leito);
        const statusAnterior = leito.status;
        leito.status = StatusLeito.ATIVO;
        const leitoAtualizado = await leitoRepo.save(leito);
        if (statusAnterior !== StatusLeito.ATIVO) {
          const evRepo = manager.getRepository(LeitoEvento);
          await evRepo.save(
            evRepo.create({
              leito: leitoAtualizado,
              tipo: LeitoEventoTipo.STATUS_ALTERADO,
              dataHora: new Date(),
              unidadeId: unidade.id,
              hospitalId: unidade.hospital?.id || null,
              leitoNumero: leitoAtualizado.numero,
              avaliacaoId: null,
              historicoOcupacaoId: null,
              autorId: autor.id,
              autorNome: autor.nome,
              motivo: "Sessão iniciada",
              payload: {
                statusAnterior,
                statusNovo: StatusLeito.ATIVO,
              },
            })
          );
        }
      } catch (e) {
        console.warn("Não foi possível atualizar status do leito:", e);
      }

      const saved = await manager.getRepository(AvaliacaoSCP).save(avaliacao);
      console.log(
        `Sessao criada id=${saved.id} leito=${leitoId} classificacao=${saved.classificacao} total=${saved.totalPontos}`
      );

      // **CRIAR HISTÓRICO DE OCUPAÇÃO IMEDIATAMENTE**
      const historicoRepo = manager.getRepository(HistoricoOcupacao);
      const startLocal = DateTime.fromISO(dataHoje, { zone: ZONE }).startOf(
        "day"
      );

      const historico = historicoRepo.create({
        leito,
        unidadeId: unidade.id,
        hospitalId: unidade.hospital?.id || null,
        leitoNumero: leito.numero,
        leitoStatus: StatusLeito.ATIVO,
        scp: expectedKey,
        totalPontos: total,
        classificacao: classe,
        itens,
        autorId: autor.id,
        autorNome: autor.nome,
        inicio: startLocal.toUTC().toJSDate(),
        fim: undefined, // Registro ativo (será finalizado à meia-noite)
      });

      await historicoRepo.save(historico);
      console.log(
        `Historico criado id=${historico.id} leito=${leitoId} classificacao=${historico.classificacao} inicio=${historico.inicio}`
      );

      // ✅ Registrar eventos (auditoria)
      try {
        const evRepo = manager.getRepository(LeitoEvento);
        const agora = new Date();

        await evRepo.save(
          evRepo.create({
            leito,
            tipo: LeitoEventoTipo.AVALIACAO_CRIADA,
            dataHora: agora,
            unidadeId: unidade.id,
            hospitalId: unidade.hospital?.id || null,
            leitoNumero: leito.numero,
            avaliacaoId: saved.id,
            historicoOcupacaoId: historico.id,
            autorId: autor.id,
            autorNome: autor.nome,
            motivo: null,
            payload: {
              scp: expectedKey,
              totalPontos: total,
              classificacao: classe,
            },
          })
        );

        await evRepo.save(
          evRepo.create({
            leito,
            tipo: LeitoEventoTipo.OCUPACAO_INICIADA,
            dataHora: agora,
            unidadeId: unidade.id,
            hospitalId: unidade.hospital?.id || null,
            leitoNumero: leito.numero,
            avaliacaoId: saved.id,
            historicoOcupacaoId: historico.id,
            autorId: autor.id,
            autorNome: autor.nome,
            motivo: null,
            payload: {
              scp: expectedKey,
              classificacao: classe,
            },
          })
        );
      } catch (e) {
        console.warn("Não foi possível registrar eventos do leito:", e);
      }

      // Atualiza leitos_status da unidade após criar/atualizar avaliação
      try {
        console.log(
          `Chamando leitosStatusService.atualizarStatusUnidade para unidadeId=${unidadeId} (within transaction)`
        );
        await this.leitosStatusService.atualizarStatusUnidade(
          unidadeId,
          manager
        );
      } catch (e) {
        console.warn("Não foi possível atualizar leitos_status:", e);
      }

      return saved;
    });
  }

  async liberarSessao(avaliacaoId: string) {
    return await this.repo.manager.transaction(async (manager) => {
      const av = await manager.getRepository(AvaliacaoSCP).findOneOrFail({
        where: { id: avaliacaoId },
        relations: ["leito", "unidade"],
      });

      if (av.statusSessao !== StatusSessaoAvaliacao.ATIVA) return av;

      av.statusSessao = StatusSessaoAvaliacao.LIBERADA;
      av.expiresAt = av.expiresAt ?? new Date();

      // **FINALIZAR HISTÓRICO DE OCUPAÇÃO**
      if (av.leito) {
        const historicoRepo = manager.getRepository(HistoricoOcupacao);
        const historicoAtivo = await historicoRepo.findOne({
          where: {
            leito: { id: av.leito.id },
            fim: IsNull(),
          },
          order: { inicio: "DESC" },
        });

        if (historicoAtivo) {
          console.log(
            `Finalizando historico id=${historicoAtivo.id} leito=${historicoAtivo.leito?.id}`
          );
          historicoAtivo.fim = new Date();
          await historicoRepo.save(historicoAtivo);

          // ✅ Evento de finalização de ocupação (liberação de sessão)
          try {
            if (av.leito) {
              const evRepo = manager.getRepository(LeitoEvento);
              await evRepo.save(
                evRepo.create({
                  leito: av.leito,
                  tipo: LeitoEventoTipo.OCUPACAO_FINALIZADA,
                  dataHora: new Date(),
                  unidadeId: av.unidade?.id || null,
                  hospitalId: null,
                  leitoNumero: av.leito.numero,
                  avaliacaoId: av.id,
                  historicoOcupacaoId: historicoAtivo.id,
                  autorId: null,
                  autorNome: null,
                  motivo: "Sessão liberada",
                  payload: { via: "liberarSessao" },
                })
              );
            }
          } catch (e) {
            console.warn(
              "Não foi possível registrar evento OCUPACAO_FINALIZADA:",
              e
            );
          }
        }
      }

      // ao liberar, marcar leito como PENDENTE
      try {
        const leitoRepo = manager.getRepository(Leito);
        if (av.leito) {
          const statusAnterior = av.leito.status;
          av.leito.status = StatusLeito.PENDENTE;
          const leitoAtualizado = await leitoRepo.save(av.leito);
          if (statusAnterior !== StatusLeito.PENDENTE) {
            const evRepo = manager.getRepository(LeitoEvento);
            await evRepo.save(
              evRepo.create({
                leito: leitoAtualizado,
                tipo: LeitoEventoTipo.STATUS_ALTERADO,
                dataHora: new Date(),
                unidadeId: av.unidade?.id || null,
                hospitalId: null,
                leitoNumero: leitoAtualizado.numero,
                avaliacaoId: av.id,
                historicoOcupacaoId: null,
                autorId: null,
                autorNome: null,
                motivo: "Sessão liberada",
                payload: {
                  statusAnterior,
                  statusNovo: StatusLeito.PENDENTE,
                },
              })
            );
          }
        }
      } catch (e) {
        console.warn(
          "Não foi possível atualizar status do leito ao liberar:",
          e
        );
      }

      const saved = await manager.getRepository(AvaliacaoSCP).save(av);
      console.log(
        `Sessao liberada id=${saved.id} leito=${saved.leito?.id} statusSessao=${saved.statusSessao}`
      );

      // ✅ Evento de liberação de sessão
      try {
        if (saved.leito) {
          const evRepo = manager.getRepository(LeitoEvento);
          await evRepo.save(
            evRepo.create({
              leito: saved.leito,
              tipo: LeitoEventoTipo.SESSAO_LIBERADA,
              dataHora: new Date(),
              unidadeId: saved.unidade?.id || null,
              hospitalId: null,
              leitoNumero: saved.leito.numero,
              avaliacaoId: saved.id,
              historicoOcupacaoId: null,
              autorId: null,
              autorNome: null,
              motivo: null,
              payload: { statusSessao: saved.statusSessao },
            })
          );
        }
      } catch (e) {
        console.warn("Não foi possível registrar evento SESSAO_LIBERADA:", e);
      }

      // Atualiza leitos_status da unidade após liberar sessão
      if (av.unidade?.id) {
        try {
          console.log(
            `Chamando leitosStatusService.atualizarStatusUnidade (liberar) unidadeId=${av.unidade.id} (within transaction)`
          );
          await this.leitosStatusService.atualizarStatusUnidade(
            av.unidade.id,
            manager
          );
        } catch (e) {
          console.warn("Não foi possível atualizar leitos_status:", e);
        }
      }

      return saved;
    });
  }

  /**
   * Atualiza uma sessão/avaliação existente.
   * params pode conter: itens, colaboradorId (novo autor), prontuario e scp (opcional).
   * Recalcula total/classificação e atualiza expiresAt para o fim do dia.
   */
  async atualizarSessao(
    avaliacaoId: string,
    params: {
      itens?: Record<string, number>;
      colaboradorId?: string;
      prontuario?: string | null;
      justificativa?: string | null;
      scp?: string;
    }
  ) {
    const {
      itens,
      colaboradorId,
      prontuario = null,
      justificativa,
      scp,
    } = params;
    console.log(avaliacaoId);

    const av = await this.repo.findOne({
      where: { id: avaliacaoId },
      relations: ["leito", "unidade", "autor"],
    });
    if (!av) throw new Error("Avaliação não encontrada");
    console.log(scp);
    // decide o SCP efetivo (param ou existente)
    const effectiveScp = scp ? scp.toUpperCase() : av.scp;
    console.log(effectiveScp);
    // valida SCP contra o método configurado na unidade
    const unidade = av.unidade;
    console.log(unidade);
    const expectedKey = effectiveScp;

    // valida itens contra schema dinâmico se existir
    const metodo = await this.scpMetodoRepo.findOne({
      where: { key: expectedKey },
    });
    if (metodo && itens) {
      const validKeys = new Set(metodo.questions.map((q) => q.key));
      for (const k of Object.keys(itens))
        if (!validKeys.has(k))
          throw new Error(`Item inválido para método ${effectiveScp}: ${k}`);
    }

    // atualiza autor se fornecido
    if (colaboradorId) {
      const autor = await this.colaboradorRepo.findOneOrFail({
        where: { id: colaboradorId },
      });
      av.autor = autor;
    }

    // atualiza itens/prontuario/scp
    if (itens) av.itens = itens;
    av.prontuario = prontuario ?? av.prontuario;
    if (Object.prototype.hasOwnProperty.call(params, "justificativa")) {
      av.justificativa = justificativa ?? null;
    }
    av.scp = effectiveScp;

    // recalc total e classificacao
    const total = Object.values(av.itens || {}).reduce(
      (a, b) => a + (Number(b) || 0),
      0
    );
    const classe = metodo
      ? (metodo.faixas.find((f) => total >= f.min && total <= f.max)
          ?.classe as ClassificacaoCuidado)
      : classificarTotal(effectiveScp as any, total);

    av.totalPontos = total;
    av.classificacao = classe;

    // redefine expiresAt para o fim do dia local
    const ZONE = "America/Sao_Paulo";
    const nowLocal = DateTime.now().setZone(ZONE);
    const dataHoje = nowLocal.toISODate();
    const endLocalForToday = nowLocal.endOf("day");
    av.expiresAt = endLocalForToday.toUTC().toJSDate();

    av.statusSessao = StatusSessaoAvaliacao.ATIVA;

    // garante que o leito esteja marcado como ATIVO
    try {
      const leitoRepo = this.repo.manager.getRepository(Leito);
      if (av.leito) {
        const statusAnterior = av.leito.status;
        av.leito.status = StatusLeito.ATIVO;
        const leitoAtualizado = await leitoRepo.save(av.leito);
        if (statusAnterior !== StatusLeito.ATIVO) {
          const evRepo = this.repo.manager.getRepository(LeitoEvento);
          await evRepo.save(
            evRepo.create({
              leito: leitoAtualizado,
              tipo: LeitoEventoTipo.STATUS_ALTERADO,
              dataHora: new Date(),
              unidadeId: av.unidade?.id || null,
              hospitalId: null,
              leitoNumero: leitoAtualizado.numero,
              avaliacaoId: av.id,
              historicoOcupacaoId: null,
              autorId: av.autor?.id || null,
              autorNome: av.autor?.nome || null,
              motivo: "Sessão atualizada",
              payload: {
                statusAnterior,
                statusNovo: StatusLeito.ATIVO,
              },
            })
          );
        }
      }
    } catch (e) {
      console.warn(
        "Não foi possível atualizar status do leito ao atualizar sessão:",
        e
      );
    }

    const saved = await this.repo.save(av);

    // ✅ Evento de atualização de avaliação
    try {
      if (saved.leito) {
        const evRepo = this.repo.manager.getRepository(LeitoEvento);
        await evRepo.save(
          evRepo.create({
            leito: saved.leito,
            tipo: LeitoEventoTipo.AVALIACAO_ATUALIZADA,
            dataHora: new Date(),
            unidadeId: saved.unidade?.id || null,
            hospitalId: null,
            leitoNumero: saved.leito.numero,
            avaliacaoId: saved.id,
            historicoOcupacaoId: null,
            autorId: saved.autor?.id || null,
            autorNome: saved.autor?.nome || null,
            motivo: "atualizarSessao",
            payload: {
              scp: saved.scp,
              totalPontos: saved.totalPontos,
              classificacao: saved.classificacao,
              updatedFields: {
                itens: Boolean(itens),
                colaboradorId: Boolean(colaboradorId),
                prontuario: Object.prototype.hasOwnProperty.call(
                  params,
                  "prontuario"
                ),
                justificativa: Object.prototype.hasOwnProperty.call(
                  params,
                  "justificativa"
                ),
                scp: Boolean(scp),
              },
              justificativa: Object.prototype.hasOwnProperty.call(
                params,
                "justificativa"
              )
                ? saved.justificativa
                : undefined,
            },
          })
        );
      }
    } catch (e) {
      console.warn(
        "Não foi possível registrar evento AVALIACAO_ATUALIZADA (atualizarSessao):",
        e
      );
    }

    // **ATUALIZAR HISTÓRICO ATIVO**
    if ((itens || colaboradorId) && av.leito) {
      const historicoRepo = this.repo.manager.getRepository(HistoricoOcupacao);
      const historicoAtivo = await historicoRepo.findOne({
        where: {
          leito: { id: av.leito.id },
          fim: IsNull(),
        },
        order: { inicio: "DESC" },
      });

      if (historicoAtivo) {
        if (itens) {
          historicoAtivo.totalPontos = total;
          historicoAtivo.classificacao = classe;
          historicoAtivo.itens = av.itens;
        }
        if (colaboradorId && av.autor) {
          historicoAtivo.autorId = av.autor.id;
          historicoAtivo.autorNome = av.autor.nome;
        }
        await historicoRepo.save(historicoAtivo);
      }
    }

    // Atualiza leitos_status da unidade após atualizar sessão
    if (av.unidade?.id) {
      try {
        await this.leitosStatusService.atualizarStatusUnidade(av.unidade.id);
      } catch (e) {
        console.warn("Não foi possível atualizar leitos_status:", e);
      }
    }

    return saved;
  }

  async listarSessoesAtivasPorUnidade(unidadeId: string) {
    return this.repo.find({
      where: {
        unidade: { id: unidadeId },
        statusSessao: StatusSessaoAvaliacao.ATIVA,
      },
      relations: ["leito", "autor"],
    });
  }

  async listarSessoesAtivasComIntervalo(unidadeId: string) {
    const [sessoes, unidade] = await Promise.all([
      this.listarSessoesAtivasPorUnidade(unidadeId),
      this.unidadeRepo.findOne({ where: { id: unidadeId } }),
    ]);

    const pontuacaoMin =
      unidade?.pontuacao_min != null ? Number(unidade.pontuacao_min) : null;
    const pontuacaoMax =
      unidade?.pontuacao_max != null ? Number(unidade.pontuacao_max) : null;

    return sessoes.map((s) => {
      let pontuacaoDentroIntervalo: boolean | null = null;
      if (pontuacaoMin !== null && pontuacaoMax !== null) {
        pontuacaoDentroIntervalo =
          s.totalPontos >= pontuacaoMin && s.totalPontos <= pontuacaoMax;
      }
      return { ...s, pontuacaoDentroIntervalo };
    });
  }

  async listarLeitosDisponiveisPorUnidade(unidadeId: string) {
    const leiRepo = this.repo.manager.getRepository(Leito);
    const leitos = await leiRepo.find({
      where: { unidade: { id: unidadeId } },
    });
    const ativas = await this.listarSessoesAtivasPorUnidade(unidadeId);
    const ocupados = new Set(
      ativas.map((a) => a.leito?.id).filter(Boolean) as string[]
    );
    return leitos.filter(
      (l) => !ocupados.has(l.id) && l.status !== StatusLeito.INATIVO
    );
  }

  /**
   * Calcula a taxa de ocupação do dia com base nas avaliações ativas
   * @param params.unidadeId ID da unidade específica
   * @param params.hospitalId ID do hospital (retorna todas unidades do hospital)
   * @returns Taxa de ocupação com detalhes
   */
  async calcularTaxaOcupacaoDia(params?: {
    unidadeId?: string;
    hospitalId?: string;
  }) {
    const leitoRepo = this.repo.manager.getRepository(Leito);
    const unidadeId = params?.unidadeId;
    const hospitalId = params?.hospitalId;

    if (unidadeId) {
      // Taxa de ocupação para uma unidade específica
      const leitos = await leitoRepo.find({
        where: { unidade: { id: unidadeId }, status: StatusLeito.ATIVO },
      });
      const totalLeitos = leitos.length;

      const avaliacoesAtivas = await this.listarSessoesAtivasPorUnidade(
        unidadeId
      );
      const leitosOcupados = avaliacoesAtivas.filter((a) => a.leito?.id).length;

      const taxaOcupacao =
        totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

      return {
        unidadeId,
        totalLeitos,
        leitosOcupados,
        leitosDisponiveis: totalLeitos - leitosOcupados,
        taxaOcupacao: Number(taxaOcupacao.toFixed(2)),
        avaliacoesAtivas: avaliacoesAtivas.length,
      };
    } else if (hospitalId) {
      // Taxa de ocupação para todas as unidades de um hospital específico
      const unidades = await this.unidadeRepo.find({
        where: { hospital: { id: hospitalId } },
        relations: ["leitos", "hospital"],
      });

      const resultados = await Promise.all(
        unidades.map(async (unidade) => {
          const leitosAtivos =
            unidade.leitos?.filter((l) => l.status === StatusLeito.ATIVO) || [];
          const totalLeitos = leitosAtivos.length;

          const avaliacoesAtivas = await this.listarSessoesAtivasPorUnidade(
            unidade.id
          );
          const leitosOcupados = avaliacoesAtivas.filter(
            (a) => a.leito?.id
          ).length;

          const taxaOcupacao =
            totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

          return {
            unidadeId: unidade.id,
            unidadeNome: unidade.nome,
            totalLeitos,
            leitosOcupados,
            leitosDisponiveis: totalLeitos - leitosOcupados,
            taxaOcupacao: Number(taxaOcupacao.toFixed(2)),
            avaliacoesAtivas: avaliacoesAtivas.length,
          };
        })
      );

      // Cálculo consolidado do hospital
      const totalHospitalLeitos = resultados.reduce(
        (sum, r) => sum + r.totalLeitos,
        0
      );
      const totalHospitalOcupados = resultados.reduce(
        (sum, r) => sum + r.leitosOcupados,
        0
      );
      const taxaHospitalOcupacao =
        totalHospitalLeitos > 0
          ? (totalHospitalOcupados / totalHospitalLeitos) * 100
          : 0;

      return {
        hospitalId,
        hospitalNome: unidades[0]?.hospital?.nome || "N/A",
        consolidadoHospital: {
          totalLeitos: totalHospitalLeitos,
          leitosOcupados: totalHospitalOcupados,
          leitosDisponiveis: totalHospitalLeitos - totalHospitalOcupados,
          taxaOcupacao: Number(taxaHospitalOcupacao.toFixed(2)),
          totalUnidades: unidades.length,
        },
        porUnidade: resultados,
      };
    } else {
      // Taxa de ocupação para todas as unidades (todos os hospitais)
      const unidades = await this.unidadeRepo.find({
        relations: ["leitos", "hospital"],
      });

      const resultados = await Promise.all(
        unidades.map(async (unidade) => {
          const leitosAtivos =
            unidade.leitos?.filter((l) => l.status === StatusLeito.ATIVO) || [];
          const totalLeitos = leitosAtivos.length;

          const avaliacoesAtivas = await this.listarSessoesAtivasPorUnidade(
            unidade.id
          );
          const leitosOcupados = avaliacoesAtivas.filter(
            (a) => a.leito?.id
          ).length;

          const taxaOcupacao =
            totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

          return {
            unidadeId: unidade.id,
            unidadeNome: unidade.nome,
            hospitalId: unidade.hospital?.id,
            hospitalNome: unidade.hospital?.nome,
            totalLeitos,
            leitosOcupados,
            leitosDisponiveis: totalLeitos - leitosOcupados,
            taxaOcupacao: Number(taxaOcupacao.toFixed(2)),
            avaliacoesAtivas: avaliacoesAtivas.length,
          };
        })
      );

      // Cálculo geral (todos os hospitais)
      const totalGeralLeitos = resultados.reduce(
        (sum, r) => sum + r.totalLeitos,
        0
      );
      const totalGeralOcupados = resultados.reduce(
        (sum, r) => sum + r.leitosOcupados,
        0
      );
      const taxaGeralOcupacao =
        totalGeralLeitos > 0
          ? (totalGeralOcupados / totalGeralLeitos) * 100
          : 0;

      return {
        geral: {
          totalLeitos: totalGeralLeitos,
          leitosOcupados: totalGeralOcupados,
          leitosDisponiveis: totalGeralLeitos - totalGeralOcupados,
          taxaOcupacao: Number(taxaGeralOcupacao.toFixed(2)),
        },
        porUnidade: resultados,
      };
    }
  }

  listarTodas() {
    return this.repo.find({
      relations: ["unidade", "autor", "leito"],
      order: { dataAplicacao: "DESC", created_at: "DESC" },
    });
  }

  listarPorDia({ data, unidadeId }: FiltroAvaliacaoDTO) {
    // data é yyyy-mm-dd e representa dia em UTC
    return this.repo.find({
      where: { dataAplicacao: data, unidade: { id: unidadeId } },
      relations: ["unidade", "autor", "leito"],
      order: { created_at: "ASC" },
    });
  }

  // No AvaliacaoRepository
  listarPorUnidade = async (unidadeId: string) => {
    return await this.repo.find({
      where: { unidade: { id: unidadeId } },
      relations: ["unidade", "autor", "leito"],
      order: { dataAplicacao: "DESC" },
    });
  };

  async resumoDiario({
    data,
    unidadeId,
  }: FiltroAvaliacaoDTO): Promise<ResumoDiarioDTO> {
    const unidade = await this.unidadeRepo.findOneOrFail({
      where: { id: unidadeId },
      relations: ["leitos"],
    });
    const avals = await this.listarPorDia({ data, unidadeId });

    const totalOcupados = avals.length;
    const numeroLeitos = unidade.leitos.length;
    const taxaOcupacao = numeroLeitos > 0 ? totalOcupados / numeroLeitos : 0;

    const distribuicao: Partial<Record<ClassificacaoCuidado, number>> = {};
    for (const a of avals) {
      distribuicao[a.classificacao] = (distribuicao[a.classificacao] || 0) + 1;
    }

    return {
      data,
      unidadeId,
      totalOcupados,
      numeroLeitos,
      taxaOcupacao,
      distribuicao,
    };
  }

  async consolidadoMensal(unidadeId: string, ano: number, mes1a12: number) {
    const unidade = await this.unidadeRepo.findOneOrFail({
      where: { id: unidadeId },
      relations: ["leitos"],
    });

    const start = new Date(Date.UTC(ano, mes1a12 - 1, 1));
    const end = new Date(Date.UTC(ano, mes1a12, 1)); // exclusiv
    const dataIni = start.toISOString().slice(0, 10);
    const dataFim = end.toISOString().slice(0, 10);

    const avals = await this.repo.find({
      where: {
        dataAplicacao: Between(dataIni, dataFim),
        unidade: { id: unidadeId },
      },
    });

    // mapa por dia
    const porDia = new Map<string, AvaliacaoSCP[]>();
    for (const a of avals) {
      const arr = porDia.get(a.dataAplicacao) || [];
      arr.push(a);
      porDia.set(a.dataAplicacao, arr);
    }

    let somaOcupados = 0;
    const distGeral: Record<string, number> = {};
    let diasComMedicao = 0;

    for (const [, arr] of porDia) {
      diasComMedicao++;
      somaOcupados += arr.length;
      for (const a of arr) {
        distGeral[a.classificacao] = (distGeral[a.classificacao] || 0) + 1;
      }
    }

    const mediaOcupadosDia = diasComMedicao ? somaOcupados / diasComMedicao : 0;
    const taxaOcupacaoMedia = unidade.leitos.length
      ? mediaOcupadosDia / unidade.leitos.length
      : 0;

    return {
      ano,
      mes: mes1a12,
      unidadeId,
      diasComMedicao,
      mediaOcupadosDia,
      taxaOcupacaoMedia,
      distribuicaoMensal: distGeral,
    };
  }

  async buscarPorAutor(colaboradorId: string) {
    return await this.repo.find({
      where: {
        autor: { id: colaboradorId },
      },
      relations: ["autor"], // se quiser trazer os dados do colaborador também
      order: {
        created_at: "DESC", // opcional: ordena pela data
      },
    });
  }

  /** Lista avaliações no período [dataIni, dataFimExclusiva) com autor e outras relações úteis */
  async listarNoPeriodoComAutor(
    unidadeId: string,
    dataIni: string,
    dataFimExclusiva: string
  ) {
    return this.repo.find({
      where: {
        dataAplicacao: Between(dataIni, dataFimExclusiva),
        unidade: { id: unidadeId },
      },
      relations: ["autor", "unidade", "leito"],
      order: { dataAplicacao: "ASC", created_at: "ASC" },
    });
  }
}
