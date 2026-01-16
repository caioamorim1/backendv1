import { Request, Response } from "express";
import { LeitoRepository } from "../repositories/leitoRepository";
import { LeitosStatusService } from "../services/leitosStatusService";
import { DataSource, IsNull } from "typeorm";
import { Leito, StatusLeito } from "../entities/Leito";
import { HistoricoOcupacao } from "../entities/HistoricoOcupacao";
import { AvaliacaoSCP, StatusSessaoAvaliacao } from "../entities/AvaliacaoSCP";
import { LeitoEvento, LeitoEventoTipo } from "../entities/LeitoEvento";

export class LeitoController {
  private leitosStatusService: LeitosStatusService;

  constructor(private repo: LeitoRepository, private ds: DataSource) {
    this.leitosStatusService = new LeitosStatusService(ds);
  }

  criar = async (req: Request, res: Response) => {
    try {
      const novo = await this.repo.criar(req.body);

      // Atualiza leitos_status após criar novo leito
      if (novo?.unidade?.id) {
        this.leitosStatusService
          .atualizarStatusUnidade(novo.unidade.id)
          .catch((err) => {
            console.warn(
              "Erro ao atualizar leitos_status após criar leito:",
              err
            );
          });
      }

      res.status(201).json(novo);
    } catch (err) {
      console.error("Erro ao criar leito:", err);
      res.status(500).json({
        mensagem: "Erro ao criar leito",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  listar = async (req: Request, res: Response) => {
    const { unidadeId } = req.query as { unidadeId?: string };
    res.json(await this.repo.listar(unidadeId));
  };

  deletar = async (req: Request, res: Response) => {
    try {
      const id = req.params.id;

      // Busca o leito antes de deletar para pegar a unidade
      const leitoRepo = this.ds.getRepository(Leito);
      const leito = await leitoRepo.findOne({
        where: { id },
        relations: ["unidade"],
      });
      const unidadeId = leito?.unidade?.id;

      const ok = await this.repo.deletar(id);

      if (!ok) {
        return res.status(404).json({ mensagem: "Leito não encontrado" });
      }

      // Atualiza leitos_status após deletar leito
      if (unidadeId) {
        this.leitosStatusService
          .atualizarStatusUnidade(unidadeId)
          .catch((err) => {
            console.warn(
              "Erro ao atualizar leitos_status após deletar leito:",
              err
            );
          });
      }

      return res.status(204).send();
    } catch (err) {
      console.error("Erro ao deletar leito:", err);
      return res.status(500).json({
        mensagem: "Erro ao deletar leito",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  atualizar = async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const updated = await this.repo.atualizar(id, req.body);

      if (!updated) {
        return res.status(404).json({ mensagem: "Leito não encontrado" });
      }

      // Atualiza leitos_status após atualizar leito
      if (updated?.unidade?.id) {
        this.leitosStatusService
          .atualizarStatusUnidade(updated.unidade.id)
          .catch((err) => {
            console.warn(
              "Erro ao atualizar leitos_status após atualizar leito:",
              err
            );
          });
      }

      return res.json(updated);
    } catch (err) {
      console.error("Erro ao atualizar leito:", err);
      return res.status(500).json({
        mensagem: "Erro ao atualizar leito",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  atualizarStatus = async (req: Request, res: Response) => {
    const id = req.params.id;
    const { status, justificativa } = req.body as {
      status: string;
      justificativa?: string | null;
    };
    try {
      const updated = await this.repo.atualizarStatus(
        id,
        status,
        justificativa
      );
      if (!updated)
        return res.status(404).json({ mensagem: "Leito não encontrado" });
      return res.json(updated);
    } catch (err: any) {
      // Leito ativo é um erro de negócio tratado como 400
      if (err && (err as any).code === "LEITO_ATIVO") {
        return res.status(400).json({ mensagem: err.message });
      }
      // Erro inesperado
      console.error("Erro em atualizarStatus controller:", err?.message ?? err);
      return res
        .status(500)
        .json({ mensagem: "Erro ao atualizar status do leito" });
    }
  };

  /**
   * POST /leitos/:id/alta
   * Dá alta no leito (encerra ocupação + libera sessão + marca como VAGO) e registra evento.
   */
  alta = async (req: Request, res: Response) => {
    const leitoId = req.params.id;
    const { motivo } = (req.body ?? {}) as { motivo?: string };

    if (!leitoId) {
      return res.status(400).json({ mensagem: "id do leito é obrigatório" });
    }

    try {
      const result = await this.ds.transaction(async (manager) => {
        const leitoRepo = manager.getRepository(Leito);
        const histRepo = manager.getRepository(HistoricoOcupacao);
        const avalRepo = manager.getRepository(AvaliacaoSCP);
        const evRepo = manager.getRepository(LeitoEvento);

        const leito = await leitoRepo.findOne({
          where: { id: leitoId },
          relations: ["unidade", "unidade.hospital"],
        });
        if (!leito) {
          return {
            status: 404 as const,
            body: { mensagem: "Leito não encontrado" },
          };
        }

        if (leito.status === StatusLeito.INATIVO) {
          return {
            status: 400 as const,
            body: { mensagem: "Não é possível dar alta em um leito INATIVO" },
          };
        }

        const now = new Date();

        // 1) Encontrar histórico de ocupação ativo (fim IS NULL) — padrão atual
        //    (se futuramente existir fim > now, o createQueryBuilder cobre)
        const historicoAtivo = await histRepo
          .createQueryBuilder("h")
          .leftJoinAndSelect("h.leito", "leito")
          .where("leito.id = :leitoId", { leitoId })
          .andWhere("(h.fim IS NULL OR h.fim > :now)", { now })
          .orderBy("h.inicio", "DESC")
          .getOne();

        if (!historicoAtivo) {
          return {
            status: 409 as const,
            body: {
              mensagem:
                "Não há ocupação ativa para este leito (nenhum histórico ativo encontrado)",
            },
          };
        }

        // 2) Encerrar ocupação
        historicoAtivo.fim = now;
        await histRepo.save(historicoAtivo);

        // 3) Liberar quaisquer sessões/avaliações ATIVAS vinculadas ao leito
        const sessoesAtivas = await avalRepo.find({
          where: {
            leito: { id: leitoId },
            statusSessao: StatusSessaoAvaliacao.ATIVA,
          },
          relations: ["leito", "unidade"],
        });
        if (sessoesAtivas.length > 0) {
          for (const av of sessoesAtivas) {
            av.statusSessao = StatusSessaoAvaliacao.LIBERADA;
            av.expiresAt = av.expiresAt ?? now;
          }
          await avalRepo.save(sessoesAtivas);
        }

        // 4) Marcar leito como PENDENTE
        const statusAnterior = leito.status;
        leito.status = StatusLeito.PENDENTE;
        await leitoRepo.save(leito);

        // 5) Registrar eventos
        const unidadeId = leito.unidade?.id ?? null;
        const hospitalId = (leito.unidade as any)?.hospital?.id ?? null;
        const leitoNumero = leito.numero ?? null;

        await evRepo.save(
          evRepo.create({
            leito,
            tipo: LeitoEventoTipo.OCUPACAO_FINALIZADA,
            dataHora: now,
            unidadeId,
            hospitalId,
            leitoNumero,
            avaliacaoId: null,
            historicoOcupacaoId: historicoAtivo.id,
            autorId: null,
            autorNome: null,
            motivo: "Alta",
            payload: {
              statusAnterior,
              sessoesLiberadas: sessoesAtivas.length,
            },
          })
        );

        await evRepo.save(
          evRepo.create({
            leito,
            tipo: LeitoEventoTipo.ALTA,
            dataHora: now,
            unidadeId,
            hospitalId,
            leitoNumero,
            avaliacaoId: null,
            historicoOcupacaoId: historicoAtivo.id,
            autorId: null,
            autorNome: null,
            motivo: motivo ?? null,
            payload: {
              statusAnterior,
              sessoesLiberadas: sessoesAtivas.length,
            },
          })
        );

        // 6) Atualizar agregados da unidade dentro da transação
        if (unidadeId) {
          await this.leitosStatusService.atualizarStatusUnidade(
            unidadeId,
            manager
          );
        }

        return {
          status: 200 as const,
          body: {
            mensagem: "Alta realizada com sucesso",
            leitoId,
            unidadeId,
            historicoOcupacaoId: historicoAtivo.id,
            sessoesLiberadas: sessoesAtivas.length,
            statusAnterior,
            statusAtual: leito.status,
          },
        };
      });

      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error("Erro ao dar alta no leito:", err);
      return res.status(500).json({
        mensagem: "Erro ao dar alta no leito",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Taxa de ocupação baseada no STATUS dos leitos (ATIVO vs VAGO)
  taxaOcupacaoPorStatus = async (req: Request, res: Response) => {
    try {
      const { unidadeId, hospitalId } = req.query as {
        unidadeId?: string;
        hospitalId?: string;
      };
      const taxa = await this.repo.calcularTaxaOcupacaoPorStatus({
        unidadeId,
        hospitalId,
      });
      return res.json(taxa);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        error: "Erro ao calcular taxa de ocupação por status",
        details,
      });
    }
  };

  // Taxa de ocupação agregada por diferentes níveis organizacionais
  taxaOcupacaoAgregada = async (req: Request, res: Response) => {
    try {
      const { aggregationType, entityId } = req.query as {
        aggregationType?: "hospital" | "grupo" | "regiao" | "rede";
        entityId?: string;
      };

      if (!aggregationType) {
        return res.status(400).json({
          error: "Parâmetro 'aggregationType' é obrigatório",
          hint: "Valores aceitos: 'hospital', 'grupo', 'regiao', 'rede'",
        });
      }

      if (!["hospital", "grupo", "regiao", "rede"].includes(aggregationType)) {
        return res.status(400).json({
          error: "Tipo de agregação inválido",
          hint: "Valores aceitos: 'hospital', 'grupo', 'regiao', 'rede'",
        });
      }

      const taxa = await this.repo.calcularTaxaOcupacaoAgregada({
        aggregationType,
        entityId,
      });

      return res.json(taxa);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        error: "Erro ao calcular taxa de ocupação agregada",
        details,
      });
    }
  };
}
