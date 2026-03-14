import { Request, Response } from "express";
import { UnidadeRepository } from "../repositories/unidadeRepository";
import { AvaliacaoRepository } from "../repositories/avaliacaoRepository";
// InternaÃ§Ã£o removida na migraÃ§Ã£o. Exports relacionados a internaÃ§Ã£o foram desativados.
import { xlsResumoDiario, xlsMensal } from "../utils/exporters/excel";
import { pdfDimensionamentoUnidade, pdfVariacaoSnapshot } from "../utils/exporters/pdf";
import { DimensionamentoService } from "../services/dimensionamentoService";
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
}
