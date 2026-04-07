import { Request, Response } from "express";
import { UnidadeRepository } from "../repositories/unidadeRepository";
import { AvaliacaoRepository } from "../repositories/avaliacaoRepository";
// InternaÃ§Ã£o removida na migraÃ§Ã£o. Exports relacionados a internaÃ§Ã£o foram desativados.
import { xlsResumoDiario, xlsMensal } from "../utils/exporters/excel";
import { pdfDimensionamentoUnidade, pdfVariacaoSnapshot, pdfDiarioAvaliacoes, DiarioAvaliacaoPayload, pdfGrauComplexidade, GrauComplexidadePayload } from "../utils/exporters/pdf";
import { DimensionamentoService } from "../services/dimensionamentoService";
import { ComentarioUnidadeRepository } from "../repositories/comentarioUnidadeRepository";
import { AvaliacaoSCP, ClassificacaoCuidado, StatusSessaoAvaliacao } from "../entities/AvaliacaoSCP";
import { Leito, StatusLeito } from "../entities/Leito";
import { HistoricoLeitosStatus } from "../entities/HistoricoLeitosStatus";
import { LeitoEvento, LeitoEventoTipo } from "../entities/LeitoEvento";
import { DateTime } from "luxon";
import { SnapshotVariacaoReportService } from "../services/snapshotVariacaoReportService";
import { DataSource } from "typeorm";

export class ExportController {
  constructor(private ds: DataSource) {}

  /** GET /export/relatorios/resumo-diario.xlsx?unidadeId=&data=YYYY-MM-DD */
  resumoDiarioXlsx = async (req: Request, res: Response) => {
    const { unidadeId, data } = req.query as any;
    const unidadeRepo = new UnidadeRepository(this.ds);
    const avaliacaoRepo = new AvaliacaoRepository(this.ds);
    // InternaÃ§Ã£o desativada na migraÃ§Ã£o

    const unidade = await unidadeRepo.obter(unidadeId);
    if (!unidade) return res.status(404).end();

    const resumoAval = await avaliacaoRepo.resumoDiario({ data, unidadeId });
    const avalsDia = await avaliacaoRepo.listarPorDia({ data, unidadeId });
    const ocupUsada = resumoAval.totalOcupados;
    const numLeitos = unidade.leitos?.length ?? 0;
    const taxa = numLeitos ? ocupUsada / numLeitos : 0;

    // colaboradores breakdown
    const porCol: Record<
      string,
      {
        colaboradorId: string;
        nome: string;
        total: number;
        distribuicao: Record<string, number>;
      }
    > = {};
    for (const a of avalsDia) {
      const col = a.autor;
      if (!col) continue;
      if (!porCol[col.id])
        porCol[col.id] = {
          colaboradorId: col.id,
          nome: col.nome,
          total: 0,
          distribuicao: {},
        };
      porCol[col.id].total += 1;
      porCol[col.id].distribuicao[a.classificacao] =
        (porCol[col.id].distribuicao[a.classificacao] || 0) + 1;
    }

    const buf = await xlsResumoDiario({
      data,
      unidade: unidade.nome,
      numeroLeitos: numLeitos,
      ocupacao: {
        usada: ocupUsada,
      },
      taxaOcupacao: taxa,
      distribuicao: resumoAval.distribuicao as any,
      colaboradores: Object.values(porCol),
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="resumo_diario_${unidadeId}_${data}.xlsx"`
    );
    return res.send(Buffer.from(buf));
  };

  /** GET /export/relatorios/mensal.xlsx?unidadeId=&ano=&mes= */
  mensalXlsx = async (req: Request, res: Response) => {
    const { unidadeId, ano, mes } = req.query as any;
    const unidadeRepo = new UnidadeRepository(this.ds);
    const avaliacaoRepo = new AvaliacaoRepository(this.ds);
    // InternaÃ§Ã£o desativada na migraÃ§Ã£o

    const unidade = await unidadeRepo.obter(unidadeId);
    if (!unidade) return res.status(404).end();
    const dias = new Date(Number(ano), Number(mes), 0).getDate();
    const serieAval: Array<{ data: string; ocupados: number }> = [];
    let totalOcupadosMes = 0;
    let diasComDados = 0;

    for (let d = 1; d <= dias; d++) {
      const data = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(
        2,
        "0"
      )}`;

      // CORREÇÃO: Usar resumoDiario que retorna dados consolidados corretos
      const resumoDia = await avaliacaoRepo.resumoDiario({ data, unidadeId });
      const ocupadosNoDia = resumoDia.totalOcupados || 0;

      serieAval.push({ data, ocupados: ocupadosNoDia });

      // Acumular para calcular média
      if (ocupadosNoDia > 0) {
        totalOcupadosMes += ocupadosNoDia;
        diasComDados++;
      }
    }
    const numLeitos = unidade.leitos?.length ?? 0;
    const consAval = await avaliacaoRepo.consolidadoMensal(
      unidadeId,
      Number(ano),
      Number(mes)
    );

    // CORREÇÃO: Calcular valores corretos se os do consolidado estão incorretos
    const mediaOcupadosDia =
      diasComDados > 0 ? totalOcupadosMes / diasComDados : 0;
    const taxaOcupacaoMedia = numLeitos > 0 ? mediaOcupadosDia / numLeitos : 0;

    // colaboradores no mÃªs
    const dataIni = new Date(Date.UTC(Number(ano), Number(mes) - 1, 1))
      .toISOString()
      .slice(0, 10);
    const dataFimExcl = new Date(Date.UTC(Number(ano), Number(mes), 1))
      .toISOString()
      .slice(0, 10);
    const avalsMes = await avaliacaoRepo.listarNoPeriodoComAutor(
      unidadeId,
      dataIni,
      dataFimExcl
    );
    const porColMes: Record<
      string,
      {
        colaboradorId: string;
        nome: string;
        total: number;
        distribuicao: Record<string, number>;
      }
    > = {};
    for (const a of avalsMes) {
      const col = a.autor;
      if (!col) continue;
      if (!porColMes[col.id])
        porColMes[col.id] = {
          colaboradorId: col.id,
          nome: col.nome,
          total: 0,
          distribuicao: {},
        };
      porColMes[col.id].total += 1;
      porColMes[col.id].distribuicao[a.classificacao] =
        (porColMes[col.id].distribuicao[a.classificacao] || 0) + 1;
    }

    const buf = await xlsMensal({
      ano: Number(ano),
      mes: Number(mes),
      numeroLeitos: numLeitos,
      ocupacaoMensal: {
        avaliacao: serieAval,
        // CORREÇÃO: Usar valores calculados localmente
        mediaOcupadosDia: mediaOcupadosDia,
        taxaOcupacaoMedia: taxaOcupacaoMedia,
      },
      distribuicaoMensal: consAval.distribuicaoMensal as any,
      colaboradores: Object.values(porColMes),
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mensal_${unidadeId}_${ano}-${mes}.xlsx"`
    );
    return res.send(Buffer.from(buf));
  };

  /** GET /export/dimensionamento/:unidadeId/pdf?inicio=YYYY-MM-DD&fim=YYYY-MM-DD */
  dimensionamentoUnidadePdf = async (req: Request, res: Response) => {
    try {
      const unidadeId = req.params.unidadeId as string;
      const { inicio, fim } = req.query as { inicio?: string; fim?: string };
      const svc = new DimensionamentoService(this.ds);
      const data = await svc.calcularParaInternacao(unidadeId, inicio, fim);
      const pdf = await pdfDimensionamentoUnidade(data as any);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="dimensionamento_${unidadeId}.pdf"`
      );
      return res.send(pdf);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: "Erro ao gerar PDF", details });
    }
  };

  /**
   * GET /export/snapshot/:hospitalId/variacao/pdf?tipo=MAPA&escopo=QUANTIDADE&unidadeId=<uuid>
   * tipo: MAPA | DETALHAMENTO
   * escopo: QUANTIDADE | FINANCEIRO | GERAL
   * unidadeId (opcional): quando informado, gera o relatório apenas da unidade.
   * - internação: 1 tabela da unidade
   * - não internação: todas as tabelas de sítios da unidade
   */
  snapshotVariacaoPdf = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const unidadeId = req.query.unidadeId as string | undefined;
      const tipo = ((req.query.tipo as string) || "MAPA").toUpperCase() as
        | "MAPA"
        | "DETALHAMENTO";
      const escopo = ((req.query.escopo as string) || "QUANTIDADE").toUpperCase() as
        | "QUANTIDADE"
        | "FINANCEIRO"
        | "GERAL";

      const svc = new SnapshotVariacaoReportService(this.ds);
      const data = await svc.buildReportData(hospitalId, unidadeId);
      const pdf = await pdfVariacaoSnapshot(data as any, tipo, escopo);

      const fname = unidadeId
        ? `variacao_${tipo}_${escopo}_${hospitalId}_${unidadeId}.pdf`
        : `variacao_${tipo}_${escopo}_${hospitalId}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fname}"`);
      return res.send(pdf);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      if (
        details.includes("Nenhum snapshot selecionado") ||
        details.includes("Unidade não encontrada no snapshot")
      ) {
        return res.status(404).json({ error: "Snapshot não encontrado", details });
      }
      return res.status(500).json({ error: "Erro ao gerar PDF de variação", details });
    }
  };

  /** GET /export/diario-avaliacoes/:unidadeId/pdf?data=YYYY-MM-DD */
  diarioAvaliacoesPdf = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const SAO_PAULO_TZ = "America/Sao_Paulo";
      const rawData = req.query.data as string | undefined;
      // Garantir formato YYYY-MM-DD — descarta sufixo de hora ou fuso caso venha do cliente
      const data =
        rawData && /^\d{4}-\d{2}-\d{2}/.test(rawData)
          ? rawData.slice(0, 10)
          : DateTime.now().setZone(SAO_PAULO_TZ).toISODate()!;

      const unidadeRepo = new UnidadeRepository(this.ds);
      const avaliacaoRepo = new AvaliacaoRepository(this.ds);
      const comentarioRepo = new ComentarioUnidadeRepository(this.ds);

      console.log(`[DIARIO] rawData="${rawData}" data=${data} hoje=${DateTime.now().setZone(SAO_PAULO_TZ).toISODate()}`);

      const unidade = await unidadeRepo.obter(unidadeId);
      if (!unidade) return res.status(404).json({ error: "Unidade não encontrada" });

      // Fetch the raw entity for scpMetodo title
      const unidadeRaw = await this.ds.getRepository("UnidadeInternacao").findOne({
        where: { id: unidadeId },
        relations: ["scpMetodo"],
      }) as any;

      // Buscar leitos crus do banco (para garantir justificativa)
      const leitosRaw = await this.ds.getRepository(Leito).find({
        where: { unidade: { id: unidadeId } },
      });
      const leitoJustificativa = new Map<string, string | null>();
      for (const lr of leitosRaw) {
        leitoJustificativa.set(lr.id, lr.justificativa ?? null);
      }

      // Buscar último evento STATUS_ALTERADO por leito até o fim do dia solicitado
      const leitoIds = leitosRaw.map((lr) => lr.id);
      // Fim do dia em SP convertido para UTC para comparar com timestamptz
      const fimDoDia = DateTime.fromISO(data, { zone: SAO_PAULO_TZ })
        .endOf("day")
        .toUTC()
        .toISO()!;
      const inicioDoDia = DateTime.fromISO(data, { zone: SAO_PAULO_TZ })
        .startOf("day")
        .toUTC()
        .toISO()!;
      const statusEventos = leitoIds.length > 0
        ? await this.ds.getRepository(LeitoEvento)
            .createQueryBuilder("ev")
            .where("ev.leito_id IN (:...leitoIds)", { leitoIds })
            .andWhere("ev.tipo = :tipo", { tipo: LeitoEventoTipo.STATUS_ALTERADO })
            .andWhere("ev.data_hora >= :inicioDoDia AND ev.data_hora <= :fimDoDia", { inicioDoDia, fimDoDia })
            .orderBy("ev.data_hora", "DESC")
            .getRawMany()
        : [];
      // Manter apenas o evento mais recente por leito (já vem em DESC order)
      const ultimoStatusEvento = new Map<string, { autorNome: string | null; motivo: string | null; statusNovo: string | null; dataHora: Date | null }>();
      for (const ev of statusEventos) {
        const lid: string = ev.ev_leito_id;
        if (!ultimoStatusEvento.has(lid)) {
          ultimoStatusEvento.set(lid, {
            autorNome: ev.ev_autor_nome ?? null,
            motivo: ev.ev_motivo ?? null,
            statusNovo: ev.ev_payload?.statusNovo ?? null,
            dataHora: ev.ev_data_hora ? new Date(ev.ev_data_hora) : null,
          });
        }
      }

      // Buscar eventos ALTA no dia — leitos que tiveram paciente e receberem alta
      const altaEventosDia = leitoIds.length > 0
        ? await this.ds.getRepository(LeitoEvento)
            .createQueryBuilder("ev")
            .where("ev.leito_id IN (:...leitoIds)", { leitoIds })
            .andWhere("ev.tipo = :tipo", { tipo: LeitoEventoTipo.ALTA })
            .andWhere("ev.data_hora >= :inicioDoDia AND ev.data_hora <= :fimDoDia", { inicioDoDia, fimDoDia })
            .orderBy("ev.data_hora", "DESC")
            .getRawMany()
        : [];
      // Mapa leito → timestamp da última alta no dia (para comparar com avaliações posteriores)
      const ultimaAltaPorLeito = new Map<string, Date>();
      for (const ev of altaEventosDia) {
        const lid = ev.ev_leito_id as string;
        const evDate = ev.ev_data_hora ? new Date(ev.ev_data_hora) : new Date(0);
        const prev = ultimaAltaPorLeito.get(lid);
        if (!prev || evDate > prev) {
          ultimaAltaPorLeito.set(lid, evDate);
        }
      }

      const leitos = unidade.leitos ?? [];
      const numLeitos = leitos.length;

      // Avaliações do dia — usando find() do TypeORM que trata corretamente a coluna `date`
      const avalsDia = await avaliacaoRepo.listarPorDia({ data, unidadeId });
      console.log(`[DIARIO] avalsDia (data=${data}): ${avalsDia.length} avaliações | dataAplicacao encontrados: [${[...new Set(avalsDia.map(a => a.dataAplicacao))].join(', ')}]`);

      // Mapa leito → avaliação mais recente do dia
      const avalPorLeito = new Map<string, AvaliacaoSCP>();
      for (const a of avalsDia) {
        if (!a.leito) continue;
        const prev = avalPorLeito.get(a.leito.id);
        if (!prev || new Date(a.created_at) > new Date(prev.created_at)) {
          avalPorLeito.set(a.leito.id, a);
        }
      }

      // Para evolução: buscar avaliações do dia anterior
      const dataAnterior = DateTime.fromISO(data, { zone: SAO_PAULO_TZ })
        .minus({ days: 1 })
        .toISODate()!;
      const avalsAnterior = await avaliacaoRepo.listarPorDia({ data: dataAnterior, unidadeId });
      console.log(`[DIARIO] avalsAnterior (dataAnterior=${dataAnterior}): ${avalsAnterior.length} avaliações | dataAplicacao: [${[...new Set(avalsAnterior.map(a => a.dataAplicacao))].join(', ')}]`);
      const avalAnteriorPorLeito = new Map<string, AvaliacaoSCP>();
      for (const a of avalsAnterior) {
        if (!a.leito) continue;
        const prev = avalAnteriorPorLeito.get(a.leito.id);
        if (!prev || new Date(a.created_at) > new Date(prev.created_at)) {
          avalAnteriorPorLeito.set(a.leito.id, a);
        }
      }

      // Classificação map
      const classMap: Record<string, string> = {
        MINIMOS: "Cuidados Mínimos",
        INTERMEDIARIOS: "Cuidados Intermediários",
        ALTA_DEPENDENCIA: "Alta Dependência",
        SEMI_INTENSIVOS: "Semi-Intensivo",
        INTENSIVOS: "Intensivo",
      };

      // Ordem de severidade para evolução
      const nivelOrdem: Record<string, number> = {
        MINIMOS: 1,
        INTERMEDIARIOS: 2,
        ALTA_DEPENDENCIA: 3,
        SEMI_INTENSIVOS: 4,
        INTENSIVOS: 5,
      };

      // Status map
      const statusMap: Record<string, string> = {
        ATIVO: "Ocupado",
        PENDENTE: "Pendente",
        VAGO: "Vago",
        INATIVO: "Inativo",
      };

      const hoje = DateTime.now().setZone(SAO_PAULO_TZ).toISODate()!;
      const ehHoje = data === hoje;

      // Contadores de status — para dias passados usar HistoricoLeitosStatus (snapshot salvo antes do job de expiração)
      let ocupados: number;
      let pendentes: number;
      let inativos: number;
      let vagos: number;
      let baseLeitosAtivos: number;

      if (!ehHoje) {
        // Buscar snapshot histórico do dia — más recente do dia (pode haver vários por actualizações)
        // O job de expiração guarda o registo de D às 00:00 de D+1, por isso alargamos o intervalo
        // para incluir registos guardados nas primeiras horas de D+1 (até às 06:00 UTC de D+1 = 03:00 SP)
        const inicioJanela = DateTime.fromISO(data, { zone: SAO_PAULO_TZ })
          .startOf("day")
          .toUTC()
          .toISO()!;
        const fimJanela = DateTime.fromISO(data, { zone: SAO_PAULO_TZ })
          .plus({ days: 1 })
          .startOf("day")
          .plus({ hours: 6 })
          .toUTC()
          .toISO()!;
        const historico = await this.ds.getRepository(HistoricoLeitosStatus)
          .createQueryBuilder("h")
          .leftJoin("h.unidade", "u")
          .where("u.id = :unidadeId", { unidadeId })
          .andWhere("h.data >= :inicioJanela AND h.data <= :fimJanela", { inicioJanela, fimJanela })
          .orderBy("h.data", "DESC")
          .getOne();
        console.log(`[DIARIO] historico (janela ${inicioJanela} → ${fimJanela}): ${historico ? `encontrado data=${new Date(historico.data).toISOString()} evaluated=${historico.evaluated} vacant=${historico.vacant} inactive=${historico.inactive}` : 'NÃO encontrado → fallback'}`);

        if (historico) {
          ocupados = historico.evaluated;
          vagos = historico.vacant;
          inativos = historico.inactive;
          pendentes = historico.bedCount - ocupados - vagos - inativos;
          baseLeitosAtivos = historico.bedCount - inativos;
        } else {
          // Sem snapshot — reconstruir contadores a partir dos eventos STATUS_ALTERADO + avaliações do dia
          // statusNovo nos eventos pode ser ATIVO/VAGO/INATIVO/PENDENTE
          ocupados = avalPorLeito.size;
          inativos = 0;
          vagos = 0;
          for (const l of leitos) {
            if (avalPorLeito.has(l.id)) continue; // já contado em ocupados
            const ev = ultimoStatusEvento.get(l.id);
            const sn = ev?.statusNovo ?? null;
            if (sn === "INATIVO") inativos++;
            else if (sn === "VAGO") vagos++;
          }
          pendentes = numLeitos - ocupados - inativos - vagos;
          baseLeitosAtivos = numLeitos - inativos;
        }
      } else {
        // Hoje: um leito é "ocupado" se tem status ATIVO e a avaliação é posterior à última alta
        // (ou não houve alta). Se a alta foi depois da última avaliação, leito está livre.
        ocupados = 0;
        pendentes = 0;
        inativos = 0;
        vagos = 0;
        for (const l of leitos) {
          const ultimaAlta = ultimaAltaPorLeito.get(l.id);
          const ultimaAval = avalPorLeito.get(l.id);
          // Alta "ativa" = houve alta E não há avaliação posterior a ela
          const altaAtiva = ultimaAlta != null &&
            (!ultimaAval || new Date(ultimaAval.created_at) <= ultimaAlta);
          if ((l.status === StatusLeito.ATIVO || ultimaAval != null) && !altaAtiva) {
            ocupados++;
          } else if (l.status === StatusLeito.INATIVO) {
            inativos++;
          } else if (l.status === StatusLeito.VAGO) {
            vagos++;
          } else {
            pendentes++;
          }
        }
        baseLeitosAtivos = numLeitos - inativos;
      }

      // Função auxiliar: alta é "ativa" se houve alta e não há avaliação POSTERIOR a ela
      const altaAtivaPara = (leitoId: string): boolean => {
        const ultimaAlta = ultimaAltaPorLeito.get(leitoId);
        if (!ultimaAlta) return false;
        const ultimaAval = avalPorLeito.get(leitoId);
        return !ultimaAval || new Date(ultimaAval.created_at) <= ultimaAlta;
      };

      // Status efetivo por leito (para a tabela)
      const statusEfetivo = new Map<string, string>();
      for (const l of leitos) {
        if (ehHoje) {
          if (altaAtivaPara(l.id)) {
            statusEfetivo.set(l.id, "Alta");
          } else if (avalPorLeito.has(l.id)) {
            statusEfetivo.set(l.id, "Ocupado");
          } else {
            statusEfetivo.set(l.id, statusMap[l.status] ?? l.status);
          }
        } else {
          if (altaAtivaPara(l.id)) {
            statusEfetivo.set(l.id, "Alta");
          } else if (avalPorLeito.has(l.id)) {
            statusEfetivo.set(l.id, "Ocupado");
          } else {
            const ev = ultimoStatusEvento.get(l.id);
            const sn = ev?.statusNovo ?? null;
            if (sn === "INATIVO") statusEfetivo.set(l.id, "Inativo");
            else if (sn === "VAGO") statusEfetivo.set(l.id, "Vago");
            else if (sn === "ATIVO") statusEfetivo.set(l.id, "Ocupado");
            else statusEfetivo.set(l.id, "Pendente");
          }
        }
      }

      // Distribuição de níveis
      const distNiveis: Record<string, number> = {};
      for (const [, a] of avalPorLeito) {
        distNiveis[a.classificacao] = (distNiveis[a.classificacao] || 0) + 1;
      }
      // Leitos avaliados = todos que NÃO estão pendentes (ativo + vago + inativo)
      const totalAvaliados = numLeitos - pendentes;

      // Nível máximo de cuidado
      let nivelMax = "Sem avaliações";
      if (totalAvaliados > 0) {
        let maxOrdem = 0;
        for (const [, a] of avalPorLeito) {
          const o = nivelOrdem[a.classificacao] ?? 0;
          if (o > maxOrdem) {
            maxOrdem = o;
            nivelMax = classMap[a.classificacao] ?? a.classificacao;
          }
        }
      }

      // Desvio de perfil (leitos fora do intervalo pontuação)
      let desvioQtd = 0;
      if (unidade.pontuacao_min != null || unidade.pontuacao_max != null) {
        for (const [, a] of avalPorLeito) {
          const pts = a.totalPontos;
          if (
            (unidade.pontuacao_min != null && pts < Number(unidade.pontuacao_min)) ||
            (unidade.pontuacao_max != null && pts > Number(unidade.pontuacao_max))
          ) {
            desvioQtd++;
          }
        }
      }
      const desvioPerc = avalPorLeito.size > 0 ? (desvioQtd / avalPorLeito.size) * 100 : 0;

      // Percentuais de níveis (sobre leitos que têm classificação SCP)
      const leitosComClassificacao = avalPorLeito.size;
      const pctNivel = (key: string) =>
        leitosComClassificacao > 0 ? ((distNiveis[key] || 0) / leitosComClassificacao) * 100 : 0;

      const taxaOcupacao =
        numLeitos > 0 ? (ocupados / numLeitos) * 100 : 0;
      const leitosAvaliadosPerc =
        numLeitos > 0 ? (totalAvaliados / numLeitos) * 100 : 0;

      // Comentários do dia
      const comentariosRaw = await comentarioRepo.listarPorDia(unidadeId, data);
      const comentarios = comentariosRaw.map((c: any) => ({
        texto: c.texto,
        autor: c.autor?.nome ?? "Sistema",
        hora: DateTime.fromJSDate(c.criadoEm)
          .setZone(SAO_PAULO_TZ)
          .toFormat("HH:mm"),
      }));

      // Linhas da tabela
      const leitosRows = leitos
        .sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }))
        .map((l) => {
          const aval = avalPorLeito.get(l.id);
          const avalAnt = avalAnteriorPorLeito.get(l.id);
          const statusEv = ultimoStatusEvento.get(l.id);

          const statusAtualLeito = statusEfetivo.get(l.id) ?? "Pendente";
          // Para "Alta": avaliação ainda é mostrada (registro do paciente), mas status = Alta
          // Para "Pendente": nunca mostrar dados de eventos antigos
          const isPendente = statusAtualLeito === "Pendente";
          const isAlta = statusAtualLeito === "Alta";

          // Evolução: compara classificação de hoje com a do dia anterior.
          // Só faz sentido se o prontuário for o mesmo (mesmo paciente no leito).
          // ↑ = piorou  ↓ = melhorou  → = igual  * = primeiro registro deste paciente
          let evolucao = "";
          if (aval && !isAlta) {
            const mesmoPaciente =
              aval.prontuario &&
              avalAnt?.prontuario &&
              aval.prontuario === avalAnt.prontuario;
            if (mesmoPaciente) {
              const cur = nivelOrdem[aval.classificacao] ?? 0;
              const ant = nivelOrdem[avalAnt!.classificacao] ?? 0;
              evolucao = cur > ant ? "\u2191" : cur < ant ? "\u2193" : "\u2192";
            } else if (aval.prontuario) {
              evolucao = "*"; // paciente novo neste leito (ou sem histórico anterior)
            }
          }

          // Avaliador e data/hora: para leito PENDENTE nunca mostrar dados de eventos antigos
          // Para Alta: mostrar avaliador da avaliação (o paciente foi avaliado antes da alta)
          // Para Vago/Inativo: mostrar quem alterou e quando
          const avaliador = aval?.autor?.nome ?? (isPendente ? "" : statusEv?.autorNome ?? "");
          return {
            numero: l.numero,
            dataHoraAvaliacao: aval
              ? DateTime.fromJSDate(aval.created_at)
                  .setZone(SAO_PAULO_TZ)
                  .toFormat("dd/MM/yyyy HH:mm")
              : !isPendente && statusEv?.dataHora
              ? DateTime.fromJSDate(statusEv.dataHora)
                  .setZone(SAO_PAULO_TZ)
                  .toFormat("dd/MM/yyyy HH:mm")
              : "",
            prontuario: aval?.prontuario ?? "",
            statusLeito: statusAtualLeito,
            tipoCuidado: aval ? (classMap[aval.classificacao] ?? aval.classificacao) : "",
            evolucao,
            pontos: aval ? String(aval.totalPontos) : "",
            avaliador,
            justificativa: (() => {
              const parts: string[] = [];
              const leitoJust = leitoJustificativa.get(l.id);
              const statusEv = ultimoStatusEvento.get(l.id);
              // Justificativa da avaliação (edição/ajuste)
              if (aval?.justificativa?.trim()) {
                const autor = aval.autor?.nome ?? "Sistema";
                parts.push(`Avaliação (${autor}): ${aval.justificativa.trim()}`);
              }
              // Justificativa do status do leito — só para Inativo
              const statusAtual = statusEfetivo.get(l.id);
              if (statusAtual === "Inativo") {
                const motivo = statusEv?.motivo?.trim() || leitoJust?.trim();
                const autor = statusEv?.autorNome?.trim();
                const prefixo = autor ? `Leito Inativo (${autor})` : `Leito Inativo`;
                parts.push(motivo ? `${prefixo}: ${motivo}` : prefixo);
              }
              return parts.join(" | ");
            })(),
          };
        });

      const payload: DiarioAvaliacaoPayload = {
        data,
        hora: DateTime.now().setZone(SAO_PAULO_TZ).toFormat("HH:mm"),
        unidade: unidade.nome,
        numeroLeitos: numLeitos,
        scpUtilizado: unidadeRaw?.scpMetodo?.title ?? "Padrão",
        nivelMaximoCuidado: nivelMax,
        taxaOcupacaoDia: taxaOcupacao,
        leitosAvaliadosPerc,
        leitosAvaliadosQtd: totalAvaliados,
        leitosOcupados: ocupados,
        leitosPendentes: pendentes,
        leitosInativos: inativos,
        leitosVagos: vagos,
        desvioPerfil: { qtd: desvioQtd, perc: desvioPerc },
        niveisPct: {
          minimos: pctNivel("MINIMOS"),
          intermediarios: pctNivel("INTERMEDIARIOS"),
          altaDependencia: pctNivel("ALTA_DEPENDENCIA"),
          semiIntensivos: pctNivel("SEMI_INTENSIVOS"),
          intensivos: pctNivel("INTENSIVOS"),
        },
        comentarios,
        leitos: leitosRows,
      };

      const pdf = await pdfDiarioAvaliacoes(payload);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="diario_avaliacoes_${unidadeId}_${data}.pdf"`
      );
      return res.send(pdf);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: "Erro ao gerar PDF do diário", details });
    }
  };

  /** GET /export/grau-complexidade/:unidadeId/pdf?inicio=YYYY-MM-DD&fim=YYYY-MM-DD */
  grauComplexidadePdf = async (req: Request, res: Response) => {
    try {
      const { unidadeId } = req.params;
      const { inicio, fim } = req.query as { inicio?: string; fim?: string };

      if (!inicio || !fim) {
        return res.status(400).json({ error: "Parâmetros inicio e fim são obrigatórios" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
        return res.status(400).json({ error: "Formato de data inválido. Use YYYY-MM-DD" });
      }

      const SAO_PAULO_TZ = "America/Sao_Paulo";

      // Load unit with SCP relation
      const unidadeRaw = await this.ds.getRepository("UnidadeInternacao").findOne({
        where: { id: unidadeId },
        relations: ["scpMetodo"],
      }) as any;
      if (!unidadeRaw) {
        return res.status(404).json({ error: "Unidade não encontrada" });
      }

      // Query HistoricoLeitosStatus for the date range
      const inicioUTC = DateTime.fromISO(inicio, { zone: SAO_PAULO_TZ }).startOf("day").toUTC().toISO()!;
      const fimUTC   = DateTime.fromISO(fim,    { zone: SAO_PAULO_TZ }).endOf("day").toUTC().toISO()!;

      const registros = await this.ds.getRepository(HistoricoLeitosStatus)
        .createQueryBuilder("h")
        .leftJoin("h.unidade", "u")
        .where("u.id = :unidadeId", { unidadeId })
        .andWhere("h.data >= :inicioUTC AND h.data <= :fimUTC", { inicioUTC, fimUTC })
        .orderBy("h.data", "ASC")
        .getMany();

      // Build ordered month list from inicio to fim
      const MONTH_PT_BR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      const meses: string[] = [];
      // Keep the DateTime per month key so we can compute effectiveDays
      const mesDt = new Map<string, DateTime>();
      let cur = DateTime.fromISO(inicio, { zone: SAO_PAULO_TZ }).startOf("month");
      const fimMes = DateTime.fromISO(fim, { zone: SAO_PAULO_TZ }).startOf("month");
      while (cur <= fimMes) {
        const key = `${MONTH_PT_BR[cur.month - 1]}/${cur.toFormat("yy")}`;
        meses.push(key);
        mesDt.set(key, cur);
        cur = cur.plus({ months: 1 });
      }

      const iniciodt = DateTime.fromISO(inicio, { zone: SAO_PAULO_TZ }).startOf("day");
      const fimdt    = DateTime.fromISO(fim,    { zone: SAO_PAULO_TZ }).endOf("day");

      // Effective days in the period for a given month
      const effectiveDays = (mes: string): number => {
        const dt = mesDt.get(mes)!;
        const start = dt > iniciodt ? dt : iniciodt.startOf("month") === dt.startOf("month") ? iniciodt : dt;
        const end   = dt.endOf("month") < fimdt ? dt.endOf("month") : fimdt;
        return Math.max(1, Math.round(end.diff(start, "days").days) + 1);
      };

      // Group daily records by month label
      type MonthAccum = {
        totalLeitos: number[];
        ocupados: number[];
        pendentes: number[];
        inativos: number[];
        vagos: number[];
        minimumCare: number[];
        intermediateCare: number[];
        highDependency: number[];
        semiIntensive: number[];
        intensive: number[];
      };

      const byMonth = new Map<string, MonthAccum>();

      for (const r of registros) {
        const dt = DateTime.fromJSDate(new Date(r.data)).setZone(SAO_PAULO_TZ);
        const key = `${MONTH_PT_BR[dt.month - 1]}/${dt.toFormat("yy")}`;
        if (!byMonth.has(key)) {
          byMonth.set(key, {
            totalLeitos: [], ocupados: [], pendentes: [], inativos: [], vagos: [],
            minimumCare: [], intermediateCare: [], highDependency: [], semiIntensive: [], intensive: [],
          });
        }
        const m = byMonth.get(key)!;
        const bed   = r.bedCount   ?? 0;
        const eval_ = r.evaluated  ?? 0;
        const inact = r.inactive   ?? 0;
        const vac   = r.vacant     ?? 0;
        m.totalLeitos.push(bed);
        m.ocupados.push(eval_);
        m.inativos.push(inact);
        m.vagos.push(vac);
        m.pendentes.push(Math.max(0, bed - eval_ - inact - vac));
        const denom = eval_ > 0 ? eval_ : 1; // avoid division by zero
        m.minimumCare.push(((r.minimumCare ?? 0) / denom) * 100);
        m.intermediateCare.push(((r.intermediateCare ?? 0) / denom) * 100);
        m.highDependency.push(((r.highDependency ?? 0) / denom) * 100);
        m.semiIntensive.push(((r.semiIntensive ?? 0) / denom) * 100);
        m.intensive.push(((r.intensive ?? 0) / denom) * 100);
      }

      const avg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

      const dados: GrauComplexidadePayload["dados"] = meses.map((mes) => {
        const m = byMonth.get(mes);
        const days = effectiveDays(mes);

        if (!m) {
          return {
            totalLeitos: 0, ocupados: 0, pendentes: 0, inativos: 0, vagos: 0,
            minimumCare: 0, intermediateCare: 0, highDependency: 0,
            semiIntensive: 0, intensive: 0, taxaOcupacao: 0,
          };
        }

        // dias com registro vs. dias faltando
        const recordDays  = m.totalLeitos.length;
        const missingDays = Math.max(0, days - recordDays);
        // bedCount é o total de leitos da unidade — usa o último valor conhecido do mês
        const knownBed    = m.totalLeitos[m.totalLeitos.length - 1] ?? 0;

        // dias sem registro → todos os leitos ficam pendentes
        const totalLeitos = Math.round(sum(m.totalLeitos) + missingDays * knownBed);
        const ocupados    = Math.round(sum(m.ocupados));
        const inativos    = Math.round(sum(m.inativos));
        const vagos       = Math.round(sum(m.vagos));
        const pendentes   = Math.round(sum(m.pendentes)  + missingDays * knownBed);

        return {
          totalLeitos,
          ocupados,
          pendentes,
          inativos,
          vagos,
          minimumCare:      avg(m.minimumCare),
          intermediateCare: avg(m.intermediateCare),
          highDependency:   avg(m.highDependency),
          semiIntensive:    avg(m.semiIntensive),
          intensive:        avg(m.intensive),
          taxaOcupacao:     totalLeitos > 0 ? (ocupados / totalLeitos) * 100 : 0,
        };
      });

      // Simple average across months that have data
      const avgField = (field: keyof typeof dados[0]) => {
        const vals = dados.filter((d) => d.totalLeitos > 0).map((d) => d[field] as number);
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };

      const medias: GrauComplexidadePayload["medias"] = {
        totalLeitos:      avgField("totalLeitos"),
        ocupados:         avgField("ocupados"),
        pendentes:        avgField("pendentes"),
        inativos:         avgField("inativos"),
        vagos:            avgField("vagos"),
        minimumCare:      avgField("minimumCare"),
        intermediateCare: avgField("intermediateCare"),
        highDependency:   avgField("highDependency"),
        semiIntensive:    avgField("semiIntensive"),
        intensive:        avgField("intensive"),
        taxaOcupacao:     avgField("taxaOcupacao"),
      };

      const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

      const pdfPayload: GrauComplexidadePayload = {
        unidade:      unidadeRaw.nome,
        periodo:      `${fmtDate(inicio)} a ${fmtDate(fim)}`,
        scpUtilizado: unidadeRaw?.scpMetodo?.title ?? "Padrão",
        meses,
        dados,
        medias,
      };

      const pdf = await pdfGrauComplexidade(pdfPayload);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="grau_complexidade_${unidadeId}.pdf"`
      );
      return res.send(pdf);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: "Erro ao gerar PDF de grau de complexidade", details });
    }
  };
}
