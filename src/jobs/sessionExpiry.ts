import { DataSource, IsNull } from "typeorm";
import { DateTime } from "luxon";
import { AvaliacaoSCP, StatusSessaoAvaliacao } from "../entities/AvaliacaoSCP";
import { HistoricoOcupacao } from "../entities/HistoricoOcupacao";
import { Leito, StatusLeito } from "../entities/Leito";
import { LeitosStatusService } from "../services/leitosStatusService";

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
  dateYYYYMMDD: string
) {
  const ZONE = "America/Sao_Paulo";
  console.log(`🌙 [SessionExpiry] Processando fim do dia: ${dateYYYYMMDD}`);

  try {
    await ds.transaction(async (manager) => {
      const avalRepo = manager.getRepository(AvaliacaoSCP);
      const histRepo = manager.getRepository(HistoricoOcupacao);
      const leitoRepo = manager.getRepository(Leito);

      // 1. Buscar avaliações ativas do dia
      const avals = await avalRepo.find({
        where: {
          dataAplicacao: dateYYYYMMDD,
          statusSessao: StatusSessaoAvaliacao.ATIVA,
        },
        relations: ["leito", "unidade"],
      });

      if (avals.length === 0) {
        console.log(
          "✅ [SessionExpiry] Nenhuma avaliação ativa para processar."
        );
        // Mesmo sem avaliações, resetar todos os leitos para PENDENTE
        await leitoRepo
          .createQueryBuilder()
          .update(Leito)
          .set({ status: StatusLeito.PENDENTE })
          .execute();
        return;
      }

      console.log(
        `📊 [SessionExpiry] Processando ${avals.length} avaliações ativas...`
      );

      const unidadesAfetadas = new Set<string>();
      const endLocal = DateTime.fromISO(dateYYYYMMDD, { zone: ZONE }).endOf(
        "day"
      );
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

      // 3. Resetar TODOS os leitos para PENDENTE (novo dia)
      await leitoRepo
        .createQueryBuilder()
        .update(Leito)
        .set({ status: StatusLeito.PENDENTE })
        .execute();

      console.log("🔄 [SessionExpiry] Todos os leitos resetados para PENDENTE");

      // 4. Marcar avaliações como EXPIRADA
      await avalRepo
        .createQueryBuilder()
        .update(AvaliacaoSCP)
        .set({ statusSessao: StatusSessaoAvaliacao.EXPIRADA })
        .where('"dataAplicacao" = :d', { d: dateYYYYMMDD })
        .execute();

      console.log(
        `✅ [SessionExpiry] ${avals.length} avaliações marcadas como EXPIRADA`
      );

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
        `🌙 [SessionExpiry] Processamento concluído para ${dateYYYYMMDD}!`
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

    const timeoutHandle = setTimeout(async () => {
      await runForYesterday();
      scheduleNext(); // Re-agenda para a próxima meia-noite (recalcula para lidar com DST)
    }, msUntilMidnight);

    return timeoutHandle;
  };

  const firstHandle = scheduleNext();

  // Retorna função de cleanup
  return () => {
    clearTimeout(firstHandle);
  };
}
