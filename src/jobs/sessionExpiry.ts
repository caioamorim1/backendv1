import { DataSource, IsNull } from "typeorm";
import { DateTime } from "luxon";
import { AvaliacaoSCP, StatusSessaoAvaliacao } from "../entities/AvaliacaoSCP";
import { HistoricoOcupacao } from "../entities/HistoricoOcupacao";
import { Leito, StatusLeito } from "../entities/Leito";
import { LeitosStatusService } from "../services/leitosStatusService";
import { LeitoEvento, LeitoEventoTipo } from "../entities/LeitoEvento";

/**
 * Job que executa À MEIA-NOITE para:
 * 1. Finalizar históricos de ocupação do dia (marca fim = now)
 * 2. Mudar status dos leitos para PENDENTE
 * 3. Marcar avaliações como EXPIRADA
 * 4. Atualizar leitos_status de todas as unidades afetadas
 *
 * IMPORTANTE: Os históricos JÁ FORAM CRIADOS quando a avaliação foi feita.
 * Este job apenas FINALIZA os históricos ativos (marca fim = now).
 */
export async function runSessionExpiryForDate(
  ds: DataSource,
  dateInput: string | Date
) {
  const ZONE = "America/Sao_Paulo";
  // Normaliza entrada (banco pode retornar Date em getRawMany)
  // Se for Date do banco, já está normalizado para o dia correto em UTC (meia-noite)
  // Apenas extrair ano/mês/dia sem aplicar conversão de timezone
  let dateStr: string | null;
  if (typeof dateInput === "string") {
    dateStr = DateTime.fromISO(dateInput, { zone: ZONE }).toISODate();
  } else {
    // Date do PostgreSQL: Wed Jan 21 2026 00:00:00 GMT+0000
    // Usar UTC para não deslocar o dia
    dateStr = DateTime.fromJSDate(dateInput, { zone: "UTC" }).toISODate();
  }

  if (!dateStr) {
    throw new Error(
      `Data inválida recebida em runSessionExpiryForDate: ${String(dateInput)}`
    );
  }

  console.log(`🌙 [SessionExpiry] Processando fim do dia: ${dateStr}`);

  try {
    await ds.transaction(async (manager) => {
      const avalRepo = manager.getRepository(AvaliacaoSCP);
      const histRepo = manager.getRepository(HistoricoOcupacao);
      const leitoRepo = manager.getRepository(Leito);
      const evRepo = manager.getRepository(LeitoEvento);

      // 1. Buscar avaliações ativas do dia
      const avals = await avalRepo.find({
        where: {
          dataAplicacao: dateStr,
          statusSessao: StatusSessaoAvaliacao.ATIVA,
        },
        relations: ["leito", "unidade"],
      });

      // Timestamp canônico do reset: início de D+1 em São Paulo, salvo em UTC.
      const inicioProximoDiaUTC = DateTime.fromISO(dateStr, { zone: ZONE })
        .plus({ days: 1 })
        .startOf("day")
        .toUTC()
        .toJSDate();

      if (avals.length === 0) {
        console.log(
          "✅ [SessionExpiry] Nenhuma avaliação ativa para processar."
        );
        const leitosParaReset = await leitoRepo.find({
          where: [
            { status: StatusLeito.ATIVO },
            { status: StatusLeito.VAGO },
            { status: StatusLeito.INATIVO },
          ],
          relations: ["unidade", "unidade.hospital"],
        });

        // Resetar todos os leitos operáveis para PENDENTE no início do novo dia
        await leitoRepo
          .createQueryBuilder()
          .update(Leito)
          .set({ status: StatusLeito.PENDENTE })
          .where("status IN (:...statuses)", {
            statuses: [StatusLeito.ATIVO, StatusLeito.VAGO, StatusLeito.INATIVO],
          })
          .execute();

        for (const l of leitosParaReset) {
          try {
            await evRepo.save(
              evRepo.create({
                leito: l,
                tipo: LeitoEventoTipo.STATUS_ALTERADO,
                dataHora: inicioProximoDiaUTC,
                unidadeId: (l as any).unidade?.id ?? null,
                hospitalId: (l as any).unidade?.hospital?.id ?? null,
                leitoNumero: l.numero,
                avaliacaoId: null,
                historicoOcupacaoId: null,
                autorId: null,
                autorNome: null,
                motivo: "Reset diário automático",
                payload: {
                  statusAnterior: l.status,
                  statusNovo: StatusLeito.PENDENTE,
                  via: "sessionExpiry",
                  origemDia: dateStr,
                },
              })
            );
          } catch (e) {
            console.warn("⚠️  Falha ao registrar STATUS_ALTERADO (sessionExpiry sem avaliações):", e);
          }
        }
        return;
      }

      console.log(
        `📊 [SessionExpiry] Processando ${avals.length} avaliações ativas...`
      );

      const unidadesAfetadas = new Set<string>();
      const endLocal = DateTime.fromISO(dateStr, { zone: ZONE }).endOf("day");
      const fimDodia = endLocal.toUTC().toJSDate();

      // 2. Finalizar históricos ativos
      for (const av of avals) {
        if (!av.leito) continue;

        // 2.1. Finalizar histórico de ocupação
        const historicoAtivo = await histRepo.findOne({
          where: {
            leito: { id: av.leito.id },
            fim: IsNull(),
          },
          order: { inicio: "DESC" },
        });

        if (historicoAtivo) {
          historicoAtivo.fim = fimDodia;
          await histRepo.save(historicoAtivo);
          console.log(`  ✅ Histórico finalizado - Leito ${av.leito.numero}`);

          // ✅ Evento de finalização de ocupação por expiração
          try {
            await evRepo.save(
              evRepo.create({
                leito: av.leito,
                tipo: LeitoEventoTipo.OCUPACAO_FINALIZADA,
                dataHora: fimDodia,
                unidadeId: av.unidade?.id || null,
                hospitalId: null,
                leitoNumero: av.leito.numero,
                avaliacaoId: av.id,
                historicoOcupacaoId: historicoAtivo.id,
                autorId: null,
                autorNome: null,
                motivo: "Sessão expirada (fim do dia)",
                payload: { via: "sessionExpiry", dateStr },
              })
            );
          } catch (e) {
            console.warn(
              "⚠️  Falha ao registrar evento OCUPACAO_FINALIZADA (sessionExpiry):",
              e
            );
          }
        } else {
          console.warn(
            `  ⚠️  Histórico não encontrado para leito ${av.leito.numero}`
          );
        }

        // 2.2. Registrar unidade para atualização
        if (av.unidade?.id) {
          unidadesAfetadas.add(av.unidade.id);
        }
      }

      // 3. Resetar todos os leitos operáveis para PENDENTE no início do novo dia
      const leitosParaReset = await leitoRepo.find({
        where: [
          { status: StatusLeito.ATIVO },
          { status: StatusLeito.VAGO },
          { status: StatusLeito.INATIVO },
        ],
        relations: ["unidade", "unidade.hospital"],
      });

      await leitoRepo
        .createQueryBuilder()
        .update(Leito)
        .set({ status: StatusLeito.PENDENTE })
        .where("status IN (:...statuses)", {
          statuses: [StatusLeito.ATIVO, StatusLeito.VAGO, StatusLeito.INATIVO],
        })
        .execute();

      for (const l of leitosParaReset) {
        try {
          await evRepo.save(
            evRepo.create({
              leito: l,
              tipo: LeitoEventoTipo.STATUS_ALTERADO,
              dataHora: inicioProximoDiaUTC,
              unidadeId: (l as any).unidade?.id ?? null,
              hospitalId: (l as any).unidade?.hospital?.id ?? null,
              leitoNumero: l.numero,
              avaliacaoId: null,
              historicoOcupacaoId: null,
              autorId: null,
              autorNome: null,
              motivo: "Reset diário automático",
              payload: {
                statusAnterior: l.status,
                statusNovo: StatusLeito.PENDENTE,
                via: "sessionExpiry",
                origemDia: dateStr,
              },
            })
          );
        } catch (e) {
          console.warn("⚠️  Falha ao registrar STATUS_ALTERADO (sessionExpiry):", e);
        }
      }

      console.log("🔄 [SessionExpiry] Todos os leitos resetados para PENDENTE (ATIVO + VAGO + INATIVO)");

      // 4. Marcar avaliações como EXPIRADA
      await avalRepo
        .createQueryBuilder()
        .update(AvaliacaoSCP)
        .set({ statusSessao: StatusSessaoAvaliacao.EXPIRADA })
        .where('"dataAplicacao" = :d', { d: dateStr })
        .execute();

      console.log(
        `✅ [SessionExpiry] ${avals.length} avaliações marcadas como EXPIRADA`
      );

      // ✅ Eventos de sessão expirada (auditoria)
      for (const av of avals) {
        if (!av.leito) continue;
        try {
          await evRepo.save(
            evRepo.create({
              leito: av.leito,
              tipo: LeitoEventoTipo.SESSAO_EXPIRADA,
              dataHora: fimDodia,
              unidadeId: av.unidade?.id || null,
              hospitalId: null,
              leitoNumero: av.leito.numero,
              avaliacaoId: av.id,
              historicoOcupacaoId: null,
              autorId: null,
              autorNome: null,
              motivo: null,
              payload: { dateStr },
            })
          );
        } catch (e) {
          console.warn("⚠️  Falha ao registrar evento SESSAO_EXPIRADA:", e);
        }
      }

      // 5. Atualizar leitos_status das unidades afetadas
      if (unidadesAfetadas.size > 0) {
        console.log(
          `🔄 [SessionExpiry] Atualizando status de ${unidadesAfetadas.size} unidades...`
        );

        const leitosStatusService = new LeitosStatusService(ds);

        for (const unidadeId of unidadesAfetadas) {
          try {
            await leitosStatusService.atualizarStatusUnidade(unidadeId);
          } catch (error) {
            console.error(
              `❌ [SessionExpiry] Erro ao atualizar status da unidade ${unidadeId}:`,
              error
            );
          }
        }

        console.log("✅ [SessionExpiry] leitos_status atualizado.");
      }

      console.log(
        `🌙 [SessionExpiry] Processamento concluído para ${dateStr}!`
      );
    });
  } catch (e) {
    console.error("❌ [SessionExpiry] Erro ao processar fim do dia:", e);
    throw e;
  }
}

/**
 * Calcula quanto tempo falta até a próxima meia-noite (00:00:00)
 * na timezone de São Paulo (America/Sao_Paulo)
 */
function getMillisecondsUntilMidnight(): number {
  const ZONE = "America/Sao_Paulo";
  const now = DateTime.now().setZone(ZONE);
  const nextMidnight = now.plus({ days: 1 }).startOf("day");
  return nextMidnight.toMillis() - now.toMillis();
}

/**
 * Inicia o job de processamento de fim de dia
 * Executa à meia-noite (00:00:00) de São Paulo todos os dias
 */
export function scheduleSessionExpiry(ds: DataSource) {
  const ZONE = "America/Sao_Paulo";

  console.log(
    "🚀 [SessionExpiry] Job agendado para executar À MEIA-NOITE (São Paulo)"
  );

  const runForYesterday = async () => {
    // Processa o dia ANTERIOR (que acabou de terminar à meia-noite)
    const yesterday = DateTime.now()
      .setZone(ZONE)
      .minus({ days: 1 })
      .startOf("day");
    const dateStr = yesterday.toISODate(); // yyyy-mm-dd

    if (dateStr) {
      try {
        await runSessionExpiryForDate(ds, dateStr);
      } catch (error) {
        console.error("❌ [SessionExpiry] Erro na execução:", error);
      }
    }
  };

  // Referência mutável para o handle atual — necessário para cleanup correto em qualquer iteração
  let currentHandle: ReturnType<typeof setTimeout>;

  // Função que agenda o próximo disparo baseado em meia-noite (DST-safe)
  const scheduleNext = () => {
    const msUntilMidnight = getMillisecondsUntilMidnight();
    const nextRun = DateTime.now()
      .setZone(ZONE)
      .plus({ milliseconds: msUntilMidnight });

    console.log(
      `⏰ [SessionExpiry] Próxima execução em ${Math.round(
        msUntilMidnight / 1000 / 60
      )} minutos (${nextRun.toLocaleString(DateTime.DATETIME_FULL)})`
    );

    currentHandle = setTimeout(async () => {
      await runForYesterday();
      scheduleNext(); // Re-agenda para a próxima meia-noite (recalcula para lidar com DST)
    }, msUntilMidnight);
  };

  scheduleNext();

  // Retorna função de cleanup — cancela o próximo disparo pendente, seja qual for a iteração
  return () => {
    clearTimeout(currentHandle);
  };
}

/**
 * Ao iniciar o servidor, verifica se existem sessões ATIVAS em dias anteriores a hoje
 * e executa o processamento de expiração para cada uma dessas datas.
 *
 * IMPORTANTE: Também reseta TODOS os leitos para PENDENTE no início do dia,
 * caso o servidor não tenha rodado à meia-noite.
 */
export async function processPendingSessionExpiries(ds: DataSource) {
  const ZONE = "America/Sao_Paulo";
  const today = DateTime.now().setZone(ZONE).toISODate();
  if (!today) return;

  try {
    const repo = ds.getRepository(AvaliacaoSCP);
    const leitoRepo = ds.getRepository(Leito);

    const rows = await repo
      .createQueryBuilder("a")
      .select("a.dataAplicacao", "date")
      .addSelect("COUNT(*)", "count")
      .where("a.statusSessao = :status", {
        status: StatusSessaoAvaliacao.ATIVA,
      })
      .andWhere("a.dataAplicacao <> :today", { today })
      .groupBy("a.dataAplicacao")
      .orderBy("a.dataAplicacao", "ASC")
      .getRawMany<{ date: string; count: string }>();

    if (rows.length === 0) {
      console.log(
        "[SessionExpiry] Nenhuma sessão ativa pendente de dias anteriores."
      );

      // Resetar apenas leitos ATIVO para PENDENTE (preserva VAGO e INATIVO)
      await leitoRepo
        .createQueryBuilder()
        .update(Leito)
        .set({ status: StatusLeito.PENDENTE })
        .where("status = :s", { s: StatusLeito.ATIVO })
        .execute();

      return;
    }

    console.log(
      `[SessionExpiry] Encontradas ${rows.length} datas com sessões ATIVAS pendentes (antes de ${today}).`
    );

    for (const r of rows) {
      const raw: any = (r as any).date;
      const date: string | Date = raw instanceof Date ? raw : String(raw);
      const count = parseInt(r.count, 10) || 0;
      console.log(
        `→ Processando expiração do dia ${date} (ativos: ${count})...`
      );
      try {
        await runSessionExpiryForDate(ds, date);
      } catch (e) {
        console.error(`[SessionExpiry] Erro ao processar data ${date}:`, e);
      }
    }

    // ✅ APÓS PROCESSAR SESSÕES PENDENTES: Resetar todos os leitos para PENDENTE
    // Isso garante que quando o servidor não rodou à meia-noite, os leitos sejam resetados
    console.log(
      "[SessionExpiry] Resetando TODOS os leitos para PENDENTE (servidor não rodou à meia-noite)..."
    );
    const result = await leitoRepo
      .createQueryBuilder()
      .update(Leito)
      .set({ status: StatusLeito.PENDENTE })
      .execute();
    console.log(
      `✅ [SessionExpiry] ${result.affected || 0} leitos resetados para PENDENTE`
    );
  } catch (e) {
    console.error(
      "[SessionExpiry] Falha ao verificar sessões pendentes no startup:",
      e
    );
  }
}
