import { Router } from "express";
import { DataSource } from "typeorm";
import {
  runSessionExpiryForDate,
  processPendingSessionExpiries,
} from "../jobs/sessionExpiry";
import { DateTime } from "luxon";
import { AvaliacaoSCP, StatusSessaoAvaliacao } from "../entities/AvaliacaoSCP";

export const JobsRoutes = (dataSource: DataSource) => {
  const router = Router();

  // GET /jobs/session-expiry/check
  // Verifica TODAS as datas (exceto hoje) que ainda possuem avaliações ATIVAS.
  // Retorna a lista de datas com contagem por data.
  router.get("/session-expiry/check", async (req, res) => {
    try {
      const ZONE = "America/Sao_Paulo";
      const today = DateTime.now().setZone(ZONE).toISODate();
      if (!today) {
        return res.status(500).json({ error: "Falha ao obter data de hoje" });
      }

      const repo = dataSource.getRepository(AvaliacaoSCP);
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

      const dates = rows.map((r) => ({
        date: r.date,
        activeEvaluations: parseInt(r.count, 10) || 0,
      }));
      const totalActive = dates.reduce(
        (acc, d) => acc + d.activeEvaluations,
        0
      );

      return res
        .status(200)
        .json({ today, hasAny: totalActive > 0, totalActive, dates });
    } catch (e: any) {
      console.error("Failed to check session expiry status:", e);
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // POST /jobs/session-expiry { date: 'YYYY-MM-DD' }
  router.post("/session-expiry", async (req, res) => {
    const { date } = req.body || {};
    if (!date || typeof date !== "string") {
      return res
        .status(400)
        .json({ error: "body must include 'date' as YYYY-MM-DD" });
    }

    try {
      await runSessionExpiryForDate(dataSource, date);
      return res.status(200).json({ ok: true, date });
    } catch (e: any) {
      console.error("Failed to run session expiry:", e);
      return res
        .status(500)
        .json({ ok: false, error: e?.message || String(e) });
    }
  });

  // POST /jobs/session-expiry/process-pending
  // Processa todas as sessões pendentes (avaliações ATIVAS de dias anteriores)
  // Executa o mesmo processo que roda ao iniciar o servidor
  router.post("/session-expiry/process-pending", async (req, res) => {
    try {
      const ZONE = "America/Sao_Paulo";
      const today = DateTime.now().setZone(ZONE).toISODate();
      if (!today) {
        return res.status(500).json({ error: "Falha ao obter data de hoje" });
      }

      // Verificar se há sessões pendentes antes de processar
      const repo = dataSource.getRepository(AvaliacaoSCP);
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
        return res.status(200).json({
          ok: true,
          message: "Nenhuma sessão pendente para processar",
          processed: 0,
          dates: [],
        });
      }

      const dates = rows.map((r) => ({
        date: r.date,
        count: parseInt(r.count, 10) || 0,
      }));
      const totalActive = dates.reduce((acc, d) => acc + d.count, 0);

      console.log(
        `[Jobs API] Iniciando processamento manual de ${totalActive} sessões pendentes em ${rows.length} datas...`
      );

      await processPendingSessionExpiries(dataSource);

      return res.status(200).json({
        ok: true,
        message: `${totalActive} sessões pendentes processadas com sucesso`,
        processed: totalActive,
        dates: dates,
      });
    } catch (e: any) {
      console.error("[Jobs API] Erro ao processar sessões pendentes:", e);
      return res.status(500).json({
        ok: false,
        error: e?.message || String(e),
      });
    }
  });

  return router;
};
