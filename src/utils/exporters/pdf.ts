import PDFDocument from "pdfkit";
import { readFileSync } from "fs";
import path from "path";

// --- Carregamento da Logo ---
let logo: Buffer | null = null;
try {
  const logoPath = path.join(
    process.cwd(),
    "src",
    "utils",
    "exporters",
    "logo.png"
  );
  logo = readFileSync(logoPath);
} catch (error) {
  if (error instanceof Error) {
    console.error(
      "Erro ao ler o arquivo da logo. Verifique o caminho:",
      error.message
    );
  } else {
    console.error(
      "Ocorreu um erro desconhecido ao ler o arquivo da logo:",
      error
    );
  }
}

// --- Funções Auxiliares de Formatação ---
const FONT_NORMAL = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";
const BRAND_COLOR = "#00a99d"; // Verde da logo

// Mapa para traduzir as classificações para texto legível
const classificationMap: Record<string, string> = {
  MINIMOS: "Cuidados Mínimos",
  INTERMEDIARIOS: "Cuidados Intermediários",
  ALTA_DEPENDENCIA: "Alta Dependência",
  SEMI_INTENSIVOS: "Cuidado Semi-Intensivo",
  INTENSIVOS: "Cuidado Intensivo",
};

/**
 * Função genérica para criar tabelas com grade completa, cabeçalho e quebra de página.
 */
function generateTable(
  doc: PDFKit.PDFDocument,
  headers: {
    text: string;
    width: number;
    align?: "left" | "center" | "right";
  }[],
  rows: string[][],
  options?: { headerHeight?: number; dynamicRowHeight?: boolean }
) {
  const MIN_ROW_H = 20;
  const headerHeight = options?.headerHeight ?? 18;
  const columnWidths = headers.map((h) => h.width);
  const startX = doc.page.margins.left;

  const measureRowHeight = (rowData: string[]): number => {
    if (!options?.dynamicRowHeight) return MIN_ROW_H;
    let maxH = MIN_ROW_H;
    rowData.forEach((cell, i) => {
      const h =
        doc.fontSize(8).heightOfString(cell, {
          width: headers[i].width - 10,
        }) + 10; // 5px top + 5px bottom padding
      if (h > maxH) maxH = h;
    });
    return maxH;
  };

  const drawHeader = () => {
    const startY = doc.y;
    doc
      .rect(
        startX,
        startY,
        columnWidths.reduce((a, b) => a + b),
        headerHeight
      )
      .fill(BRAND_COLOR);
    doc.fontSize(8).fillColor("#FFFFFF").font(FONT_BOLD);
    const textPad = Math.max(3, Math.floor((headerHeight - 10) / 2));
    let currentX = startX;
    headers.forEach((header) => {
      doc.text(header.text, currentX + 4, startY + textPad, {
        width: header.width - 8,
        align: header.align || "left",
        lineBreak: true,
      });
      currentX += header.width;
    });
    // Vertically centre text within headerHeight
    doc.y = startY + headerHeight;
  };

  const drawRow = (rowData: string[], isEven: boolean) => {
    const rowHeight = measureRowHeight(rowData);
    let startY = doc.y;
    if (startY + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
      startY = doc.y;
    }

    const tableWidth = columnWidths.reduce((a, b) => a + b);
    doc
      .rect(startX, startY, tableWidth, rowHeight)
      .fill(isEven ? "#f7f7f7" : "#ffffff");

    doc.fontSize(8).fillColor("#333333").font(FONT_NORMAL);
    let currentX = startX;
    rowData.forEach((cell, i) => {
      const vPad = Math.max(5, Math.floor((rowHeight - doc.fontSize(8).heightOfString(cell, { width: headers[i].width - 10 })) / 2));
      doc.text(cell, currentX + 5, startY + vPad, {
        width: headers[i].width - 10,
        align: headers[i].align || "left",
        lineBreak: !!options?.dynamicRowHeight,
      });
      currentX += headers[i].width;
    });

    doc
      .moveTo(startX, startY + rowHeight)
      .lineTo(startX + tableWidth, startY + rowHeight)
      .strokeColor("#d9d9d9")
      .lineWidth(0.5)
      .stroke();
    let accumulatedWidth = startX;
    doc
      .moveTo(accumulatedWidth, startY)
      .lineTo(accumulatedWidth, startY + rowHeight)
      .strokeColor("#d9d9d9")
      .lineWidth(0.5)
      .stroke();
    columnWidths.forEach((width) => {
      accumulatedWidth += width;
      doc
        .moveTo(accumulatedWidth, startY)
        .lineTo(accumulatedWidth, startY + rowHeight)
        .strokeColor("#d9d9d9")
        .lineWidth(0.5)
        .stroke();
    });

    doc.y = startY + rowHeight;
  };

  drawHeader();
  rows.forEach((row, i) => drawRow(row, i % 2 !== 0));
}

/**
 * Função principal que cria o documento, com cabeçalho e rodapé.
 */
function bufferFromDoc(
  title: string,
  make: (doc: PDFKit.PDFDocument) => void,
  options?: { landscape?: boolean }
): Promise<Buffer> {
  return new Promise((resolve) => {
    const landscape = options?.landscape ?? false;
    const size: [number, number] = landscape ? [841.89, 595.28] : [595.28, 841.89];
    const doc = new PDFDocument({ margin: 40, size });
    const chunks: Buffer[] = [];

    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const drawHeader = () => {
      if (logo) {
        doc.image(logo, 40, 25, { width: 90 });
      }
      doc
        .fontSize(14)
        .font(FONT_BOLD)
        .fillColor("#333333")
        .text(title, { align: "center" });
      doc
        .fontSize(8)
        .font(FONT_NORMAL)
        .fillColor("#666666")
        .text(
          `Emitido em: ${new Date().toLocaleDateString("pt-BR")}`,
          doc.page.width - 40 - 100,
          40,
          {
            align: "right",
            width: 100,
          }
        );
      doc
        .moveTo(40, 75)
        .lineTo(doc.page.width - 40, 75)
        .strokeColor("#cccccc")
        .stroke();
    };

    doc.on("pageAdded", () => {
      drawHeader();
      doc.y = 90;
    });

    drawHeader();
    doc.y = 90;

    make(doc);

    doc.end();
  });
}

// --- Funções de Geração de PDF ---

// Helper: renders a small labelled info card.
// Saves and restores doc.y so parallel columns don't compound cursor drift.
function infoCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string
) {
  doc.rect(x, y, w, h).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
  doc
    .fontSize(7)
    .font(FONT_NORMAL)
    .fillColor("#888888")
    .text(label, x + 6, y + 6, { width: w - 12 });
  doc
    .fontSize(11)
    .font(FONT_BOLD)
    .fillColor("#1a365d")
    .text(value, x + 6, y + 18, { width: w - 12 });
  // Always leave doc.y at the bottom of the card, never lower
  if (doc.y < y + h) doc.y = y + h;
}

// Helper: section title
function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.8);
  doc
    .fontSize(11)
    .font(FONT_BOLD)
    .fillColor("#1a365d")
    .text(title, doc.page.margins.left, doc.y);
  doc
    .moveTo(doc.page.margins.left, doc.y + 2)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.6);
}

const COFEN: Record<string, { horas: number; percEnf: number; percTec: number }> = {
  MINIMOS:         { horas: 4,  percEnf: 33, percTec: 67 },
  INTERMEDIARIOS:  { horas: 6,  percEnf: 33, percTec: 67 },
  ALTA_DEPENDENCIA:{ horas: 10, percEnf: 16, percTec: 84 },
  SEMI_INTENSIVOS: { horas: 10, percEnf: 42, percTec: 58 },
  INTENSIVOS:      { horas: 18, percEnf: 52, percTec: 48 },
};

const CLASSIFICACAO_LABEL: Record<string, string> = {
  MINIMOS:          "MINIMOS",
  INTERMEDIARIOS:   "INTERMEDIARIOS",
  ALTA_DEPENDENCIA: "ALTA DEPENDENCIA",
  SEMI_INTENSIVOS:  "SEMI INTENSIVOS",
  INTENSIVOS:       "INTENSIVOS",
};

export async function pdfDimensionamentoUnidade(payload: {
  agregados: {
    unidadeNome: string;
    metodoAvaliacaoSCP?: { title: string; key: string };
    periodo: { inicio: string; fim: string; dias: number };
    totalLeitos: number;
    totalLeitosDia: number;
    leitosOcupados: number;
    leitosVagos: number;
    leitosInativos: number;
    leitosPendentes: number;
    percentualLeitosAvaliados: number;
    totalAvaliacoes: number;
    totalPacientesMedio: number;
    taxaOcupacaoPeriodoPercent: number;
    taxaOcupacaoCustomizada?: { taxa: number };
    distribuicaoTotalClassificacao: Record<string, number>;
    mediaDiariaClassificacao: Record<string, number>;
    totalHorasEnfermagem: number;
    qpEnfermeiros: number;
    qpTecnicos: number;
    qpTotal: number;
    percentualEnfermeiroPercent: number;
    percentualTecnicoPercent: number;
    nivelCuidadoPredominante: string;
    cuidadoEnfermeiro: number;
    segurancaEnfermeiro: number;
    cuidadoTecnico: number;
    segurancaTecnico: number;
    kmEnfermeiro: number;
    kmTecnico: number;
    parametros: {
      istPercent: number;
      diasTrabalhoSemana: number;
      cargaHorariaEnfermeiro: string | number;
      cargaHorariaTecnico: string | number;
      equipeComRestricoes: boolean;
      fatorRestricao?: number;
      metodoCalculo?: string | null;
    };
  };
  tabela: Array<{
    cargoNome: string;
    isScpCargo: boolean;
    salario?: number;
    adicionais?: number;
    cargaHoraria?: number;
    custoPorFuncionario?: number;
    quantidadeAtual: number;
    quantidadeProjetada: number;
  }>;
}): Promise<Buffer> {
  const { agregados: ag, tabela } = payload;
  const title = `${ag.unidadeNome}`;

  return bufferFromDoc(title, (doc) => {
    const ML = doc.page.margins.left;
    const MR = doc.page.margins.right;
    const pageW = doc.page.width - ML - MR;

    doc.y += 6;

    // ── 1. INFORMAÇÕES DA UNIDADE ──────────────────────────────────────────
    const infoY = doc.y;
    doc.rect(ML, infoY, pageW, 52).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    doc.fontSize(8).font(FONT_BOLD).fillColor("#888888")
      .text("UNIDADE", ML + 8, infoY + 7)
      .text("MÉTODO SCP", ML + 200, infoY + 7)
      .text("TOTAL DE LEITOS", ML + 340, infoY + 7)
      .text("PERÍODO", ML + 420, infoY + 7);
    doc.fontSize(10).font(FONT_BOLD).fillColor("#1a365d")
      .text(ag.unidadeNome, ML + 8, infoY + 19, { width: 185 })
      .text(ag.metodoAvaliacaoSCP?.title ?? "—", ML + 200, infoY + 19, { width: 130 })
      .text(`${ag.totalLeitos}`, ML + 340, infoY + 19, { width: 70 })
      .text(
        `${new Date(ag.periodo.inicio).toLocaleDateString("pt-BR")} a ${new Date(ag.periodo.fim).toLocaleDateString("pt-BR")}`,
        ML + 420, infoY + 19, { width: pageW - 420 - 8 }
      );
    doc.y = infoY + 60;

    // ── 2. PERÍODO DE ANÁLISE ─────────────────────────────────────────────
    sectionTitle(doc, "Período de Análise");
    const cw = pageW / 3;
    if (doc.y + 52 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const periodY = doc.y;
    infoCard(doc, ML,          periodY, cw, 44, "Data Início",   new Date(ag.periodo.inicio).toLocaleDateString("pt-BR"));
    infoCard(doc, ML + cw,     periodY, cw, 44, "Data Fim",      new Date(ag.periodo.fim).toLocaleDateString("pt-BR"));
    infoCard(doc, ML + cw * 2, periodY, cw, 44, "Total de Dias", `${ag.periodo.dias}`);
    doc.y = periodY + 52;

    // ── 3. OCUPAÇÃO E AVALIAÇÕES ───────────────────────────────────────────
    sectionTitle(doc, "Ocupação e Avaliações");
    const cw8 = pageW / 8;
    if (doc.y + 58 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const ocY = doc.y;
    const taxa = ag.taxaOcupacaoPeriodoPercent.toFixed(2);
    const cards8 = [
      ["Taxa Média de\nOcupação (Período)", `${taxa}%`],
      ["Leitos\nAvaliados (%)", `${ag.percentualLeitosAvaliados.toFixed(1)}%`],
      ["Leitos\nDia/Período",   `${ag.totalLeitosDia}`],
      ["Total de\nAvaliações",  `${ag.totalAvaliacoes}`],
      ["Leitos\nOcupados",      `${ag.leitosOcupados}`],
      ["Leitos\nVagos",         `${ag.leitosVagos}`],
      ["Leitos\nInativos",      `${ag.leitosInativos}`],
      ["Leitos\nPendentes",     `${ag.leitosPendentes}`],
    ];
    cards8.forEach(([lbl, val], i) => {
      const cx = ML + cw8 * i;
      doc.rect(cx, ocY, cw8, 50).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
      doc.fontSize(6.5).font(FONT_NORMAL).fillColor("#888888")
        .text(lbl, cx + 4, ocY + 6, { width: cw8 - 8, align: "center" });
      // Restore y so the next card label starts at the same absolute y
      doc.y = ocY + 6;
      doc.fontSize(10).font(FONT_BOLD).fillColor("#1a365d")
        .text(val, cx + 4, ocY + 28, { width: cw8 - 8, align: "center" });
      doc.y = ocY + 28;
    });
    doc.y = ocY + 58;

    // ── 4. BASE DE CÁLCULO ────────────────────────────────────────────────
    sectionTitle(doc, "Base de Cálculo");
    const cw3 = pageW / 3;
    if (doc.y + 52 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const calcY = doc.y;
    const taxaCalc = ag.taxaOcupacaoCustomizada?.taxa ?? ag.taxaOcupacaoPeriodoPercent;
    infoCard(doc, ML,          calcY, cw3, 44, "Taxa de Ocupação (para fins de cálculo)", `${taxaCalc}%`);
    infoCard(doc, ML + cw3,    calcY, cw3, 44, "Leitos Ocupados",    `${ag.leitosOcupados}`);
    infoCard(doc, ML + cw3*2,  calcY, cw3, 44, "Pacientes Médio/dia", `${ag.totalPacientesMedio.toFixed(2)}`);
    doc.y = calcY + 52;

    // ── 5. DISTRIBUIÇÃO DA CLASSIFICAÇÃO ──────────────────────────────────
    sectionTitle(doc, "Distribuição da Classificação");
    const classOrder = ["MINIMOS", "INTERMEDIARIOS", "ALTA_DEPENDENCIA", "SEMI_INTENSIVOS", "INTENSIVOS"];
    const totalDist = classOrder.reduce((s, k) => s + (ag.distribuicaoTotalClassificacao[k] ?? 0), 0);
    const distHeaders = [
      ...classOrder.map(k => ({ text: CLASSIFICACAO_LABEL[k], width: (pageW * 0.8) / 5, align: "center" as const })),
      { text: "(%) Período", width: pageW * 0.2, align: "center" as const },
    ];
    const distHeaderHeight = 30; // tall enough for two-word names
    const distRows = [
      classOrder.map(k => {
        const n = ag.distribuicaoTotalClassificacao[k] ?? 0;
        const pct = totalDist > 0 ? ((n / totalDist) * 100).toFixed(2) : "0.00";
        // Single-line cell — avoids rowHeight overflow in generateTable
        return `${n} (${pct}%)`;
      }).concat(["100%"]),
    ];
    generateTable(doc, distHeaders, distRows, { headerHeight: distHeaderHeight });
    doc.moveDown(0.6);

    // ── 6. HORAS DE ENFERMAGEM POR CLASSIFICAÇÃO ──────────────────────────
    sectionTitle(doc, "Horas de Enfermagem por Classificação");
    const heHeaders = [
      { text: "Classificação",             width: pageW * 0.22, align: "left"   as const },
      { text: "Hora/Paciente (Art. 3°, I)", width: pageW * 0.13, align: "center" as const },
      { text: "Enfermeiros % (Art. 3°, II)", width: pageW * 0.17, align: "center" as const },
      { text: "Técnicos/Aux % (Art. 3°, II)", width: pageW * 0.17, align: "center" as const },
      { text: "Média Diária de Pacientes",  width: pageW * 0.16, align: "center" as const },
      { text: "Horas de Enfermagem (THE)",  width: pageW * 0.15, align: "center" as const },
    ];
    const heRows = classOrder.map(k => {
      const c = COFEN[k];
      const media = ag.mediaDiariaClassificacao[k] ?? 0;
      const theParcial = media * c.horas;
      return [
        CLASSIFICACAO_LABEL[k],
        `${c.horas}h`,
        `${c.percEnf}%`,
        `${c.percTec}%`,
        `${media.toFixed(2)}`,
        `${theParcial.toFixed(2)}h`,
      ];
    });
    generateTable(doc, heHeaders, heRows, { headerHeight: 30 });

    // Total linha
    const totalTHE = ag.totalHorasEnfermagem;
    doc.moveDown(0.3);
    doc
      .fontSize(8).font(FONT_BOLD).fillColor("#333333")
      .text(`Total de Horas de Enfermagem: ${totalTHE.toFixed(2)}h`, ML, doc.y, {
        width: pageW,
        align: "right",
      });
    doc.moveDown(0.6);

    // ── 7. CLASSIFICAÇÃO DE PACIENTE ──────────────────────────────────────
    sectionTitle(doc, "Classificação de Paciente");
    const cpW = pageW / 6;
    if (doc.y + 58 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const cpY = doc.y;
    const cpCards = [
      ["Total Horas\nEnfermagem (Período)", `${ag.totalHorasEnfermagem.toFixed(2)}h`],
      ["KM\n(Enfermeiro)", `${ag.kmEnfermeiro.toFixed(3)}`],
      ["KM\n(Técnico)",    `${ag.kmTecnico.toFixed(3)}`],
      ["Nível de Cuidado\nPredominante",    ag.nivelCuidadoPredominante],
      ["% Enfermeiro",     `${ag.percentualEnfermeiroPercent}%`],
      ["% Técnico",        `${ag.percentualTecnicoPercent}%`],
    ];
    cpCards.forEach(([lbl, val], i) => {
      const cx = ML + cpW * i;
      doc.rect(cx, cpY, cpW, 50).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
      doc.fontSize(6.5).font(FONT_NORMAL).fillColor("#888888")
        .text(lbl, cx + 4, cpY + 5, { width: cpW - 8, align: "center" });
      // Restore y so the next card label starts at the same absolute y
      doc.y = cpY + 5;
      doc.fontSize(9).font(FONT_BOLD).fillColor("#1a365d")
        .text(val, cx + 4, cpY + 28, { width: cpW - 8, align: "center" });
      doc.y = cpY + 28;
    });
    doc.y = cpY + 58;

    // ── 8. PARÂMETROS + 9. QUADRO DE PESSOAL ─────────────────────────────
    // Estimate total height for both sections so we add AT MOST one page break.
    const pW = pageW / 3;
    const pCards = [
      ["Valor do IST",                    `${ag.parametros.istPercent}%`],
      ["Dias de Trabalho por Semana",     `${ag.parametros.diasTrabalhoSemana}`],
      ["Jornada Semanal Enfermeiro",      `${ag.parametros.cargaHorariaEnfermeiro}h`],
      ["Jornada Semanal Técnico",         `${ag.parametros.cargaHorariaTecnico}h`],
      ["Equipe com Restrições",           ag.parametros.equipeComRestricoes ? "Sim" : "Não"],
      ["Fator de Restrição",              ag.parametros.fatorRestricao != null ? `${ag.parametros.fatorRestricao}` : "—"],
      ["Método de Cálculo",               ag.parametros.metodoCalculo ?? "Não informado"],
    ];
    const pRowCount = Math.ceil(pCards.length / 3);
    // section 8: title(~35) + cards rows
    // section 9: title(~35) + subtitle(~20) + header(~30) + 3 rows(~60)
    const sectionsNeeded = 35 + pRowCount * 40 + 35 + 20 + 30 + 60;
    if (doc.y + sectionsNeeded > doc.page.height - doc.page.margins.bottom) doc.addPage();

    sectionTitle(doc, "Parâmetros");
    const pY = doc.y;
    pCards.forEach(([lbl, val], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = ML + pW * col;
      const cy = pY + row * 40;
      infoCard(doc, cx, cy, pW, 36, lbl, val);
      const isLastInRow = (col === 2) || (i === pCards.length - 1);
      if (!isLastInRow) doc.y = cy;
    });
    doc.y = pY + pRowCount * 40 + 8;

    // ── 9. QUADRO DE PESSOAL DIMENSIONADO ────────────────────────────────
    sectionTitle(doc, "Quadro de Pessoal Dimensionado");
    doc
      .fontSize(9).font(FONT_BOLD).fillColor("#1a365d")
      .text(`TOTAL de Profissionais: ${ag.qpTotal.toFixed(2)}`, ML, doc.y);
    doc.moveDown(0.6);
    const qpHeaders = [
      { text: "",                          width: pageW * 0.34, align: "left"   as const },
      { text: "THE Semanal (Enfermagem)",  width: pageW * 0.33, align: "center" as const },
      { text: "THE Semanal (Técnicos)",    width: pageW * 0.33, align: "center" as const },
    ];
    const qpRows = [
      ["Cuidado",              `${ag.cuidadoEnfermeiro.toFixed(2)}`,   `${ag.cuidadoTecnico.toFixed(2)}`],
      ["Segurança técnica",    `${ag.segurancaEnfermeiro.toFixed(2)}`, `${ag.segurancaTecnico.toFixed(2)}`],
      ["TOTAL de Profissionais", `${ag.qpEnfermeiros.toFixed(2)}`,     `${ag.qpTecnicos.toFixed(2)}`],
    ];
    generateTable(doc, qpHeaders, qpRows);
  });
}

// ── TIPOS PARA OS 6 RELATÓRIOS DE VARIAÇÃO ───────────────────────────────────

interface CargoRowPdf {
  cargoNome: string;
  atualQtd: number;
  baselineQtd: number;
  calculadoQtd: number | null;
  ajusteQtd: number;          // projetado - atual (ajuste qualitativo)
  projetadoQtd: number;
  variacaoQtd: number | null; // projetado - calculado (variação)
  atualRs: number;
  baselineRs: number;
  calculadoRs: number | null;
  ajusteRs: number;
  projetadoRs: number;
  variacaoRs: number | null;
  observacao: string;
}

interface TabelaVariacaoPdf {
  setor: string;
  snapshotNome: string;
  snapshotData: string;
  variacaoPercQtd: number;
  variacaoPercRs: number;
  cargos: CargoRowPdf[];
}

interface SnapshotVariacaoInput {
  hospitalNome: string;
  snapshotData: string;
  snapshotNome: string;
  tabelas: TabelaVariacaoPdf[];
}

// Helpers de formatação
const fmtRs = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Formato compacto para tabelas com muitas colunas: sem prefixo "R$ "
const fmtRsC = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQtd = (n: number) => n.toFixed(0);
const fmtNull = (n: number | null, fmt: (v: number) => string) =>
  n == null ? "—" : fmt(n);

// Bloco de metadados de seção (SETOR / BASELINE / CRIADO EM / VARIAÇÃO %)
function drawMetaHeader(
  doc: PDFKit.PDFDocument,
  tabela: TabelaVariacaoPdf,
  escopo: "QUANTIDADE" | "FINANCEIRO" | "GERAL",
  ML: number,
  tableW: number  // deve ser a soma exata das larguras das colunas
) {
  const rowH = 16;
  if (doc.y + rowH * 2 + 4 > doc.page.height - doc.page.margins.bottom)
    doc.addPage();
  const y0 = doc.y;
  const col1W = tableW * 0.40;
  const col2W = tableW * 0.35;
  const col3W = tableW - col1W - col2W;

  doc.rect(ML, y0,        tableW, rowH).fill("#e0e0e0");
  doc.rect(ML, y0 + rowH, tableW, rowH).fill("#eeeeee");

  // Linha 1
  doc.fontSize(7).font(FONT_BOLD).fillColor("#444444")
    .text("SETOR:", ML + 4, y0 + 5, { width: 38 });
  doc.font(FONT_NORMAL)
    .text(tabela.setor, ML + 42, y0 + 5, { width: col1W - 46 });

  doc.font(FONT_BOLD)
    .text("BASELINE:", ML + col1W + 4, y0 + 5, { width: 52 });
  doc.font(FONT_NORMAL)
    .text(tabela.snapshotNome, ML + col1W + 56, y0 + 5, { width: col2W - 60 });

  doc.font(FONT_BOLD)
    .text("CRIADO EM:", ML + col1W + col2W + 4, y0 + 5, { width: 56 });
  doc.font(FONT_NORMAL)
    .text(tabela.snapshotData, ML + col1W + col2W + 60, y0 + 5, { width: col3W - 64 });

  // Linha 2: variação
  const varLabel =
    escopo === "FINANCEIRO"
      ? "VARIAÇÃO (%) - FINANCEIRO:"
      : "VARIAÇÃO (%) - QUANTIDADE:";
  const varValue =
    escopo === "FINANCEIRO"
      ? `${tabela.variacaoPercRs.toFixed(2)}%`
      : `${tabela.variacaoPercQtd.toFixed(2)}%`;

  doc.fontSize(7).font(FONT_BOLD).fillColor("#444444")
    .text(varLabel, ML + 4, y0 + rowH + 5, { width: 140 });
  doc.font(FONT_NORMAL)
    .text(varValue, ML + 144, y0 + rowH + 5, { width: 60 });

  doc.y = y0 + rowH * 2 + 6;
}

// Linha de TOTAL abaixo da tabela
function drawTotalRow(
  doc: PDFKit.PDFDocument,
  cargos: CargoRowPdf[],
  headers: { text: string; width: number; align?: "left" | "center" | "right" }[],
  escopo: "QUANTIDADE" | "FINANCEIRO" | "GERAL",
  tipo: "MAPA" | "DETALHAMENTO",
  ML: number
) {
  const rowH = 20;
  const tableW = headers.reduce((s, h) => s + h.width, 0);
  if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const y0 = doc.y;

  doc.rect(ML, y0, tableW, rowH).fill("#e8e8e8");

  const totAtualQtd  = cargos.reduce((s, r) => s + r.atualQtd, 0);
  const totBaseQtd   = cargos.reduce((s, r) => s + r.baselineQtd, 0);
  const totCalcQtd   = cargos.some((r) => r.calculadoQtd != null)
    ? cargos.reduce((s, r) => s + (r.calculadoQtd ?? 0), 0) : null;
  // ajuste qualitativo (projetado-atual) é sempre definido; variação (projetado-calculado) é nullable
  const totAjusteQtd = cargos.reduce((s, r) => s + r.ajusteQtd, 0);
  const totProjQtd   = cargos.reduce((s, r) => s + r.projetadoQtd, 0);
  const totVarQtd    = cargos.some((r) => r.variacaoQtd != null)
    ? cargos.reduce((s, r) => s + (r.variacaoQtd ?? 0), 0) : null;
  const totAtualRs   = cargos.reduce((s, r) => s + r.atualRs, 0);
  const totBaseRs    = cargos.reduce((s, r) => s + r.baselineRs, 0);
  const totCalcRs    = cargos.some((r) => r.calculadoRs != null)
    ? cargos.reduce((s, r) => s + (r.calculadoRs ?? 0), 0) : null;
  const totAjusteRs  = cargos.reduce((s, r) => s + r.ajusteRs, 0);
  const totProjRs    = cargos.reduce((s, r) => s + r.projetadoRs, 0);
  const totVarRs     = cargos.some((r) => r.variacaoRs != null)
    ? cargos.reduce((s, r) => s + (r.variacaoRs ?? 0), 0) : null;

  const cells = buildRowCells(
    { cargoNome: "TOTAL", atualQtd: totAtualQtd, baselineQtd: totBaseQtd,
      calculadoQtd: totCalcQtd, ajusteQtd: totAjusteQtd,
      projetadoQtd: totProjQtd, variacaoQtd: totVarQtd,
      atualRs: totAtualRs, baselineRs: totBaseRs,
      calculadoRs: totCalcRs, ajusteRs: totAjusteRs,
      projetadoRs: totProjRs, variacaoRs: totVarRs, observacao: "" },
    escopo, tipo
  );

  let cx = ML;
  doc.fontSize(7).font(FONT_BOLD).fillColor("#333333");
  cells.forEach((cell, i) => {
    doc.text(cell, cx + 4, y0 + 7, {
      width: headers[i].width - 8,
      align: headers[i].align ?? "left",
    });
    cx += headers[i].width;
  });
  doc.y = y0 + rowH;
}

// Converte um CargoRow em array de células de acordo com escopo/tipo
function buildRowCells(
  r: CargoRowPdf,
  escopo: "QUANTIDADE" | "FINANCEIRO" | "GERAL",
  tipo: "MAPA" | "DETALHAMENTO"
): string[] {
  const v = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const vRs = (n: number) => (n >= 0 ? `+${fmtRs(n)}` : fmtRs(n));
  const vRsC = (n: number) => (n >= 0 ? `+${fmtRsC(n)}` : fmtRsC(n));

  if (tipo === "MAPA") {
    // No MAPA não há coluna CALCULADO; VARIAÇÃO = projetado - atual (ajuste qualitativo)
    if (escopo === "QUANTIDADE")
      return [r.cargoNome, fmtQtd(r.atualQtd), fmtQtd(r.baselineQtd), fmtQtd(r.projetadoQtd), v(Math.round(r.ajusteQtd))];
    if (escopo === "FINANCEIRO")
      return [r.cargoNome, fmtRs(r.atualRs), fmtRs(r.baselineRs), fmtRs(r.projetadoRs), vRs(r.ajusteRs)];
    // GERAL
    return [r.cargoNome, fmtRs(r.atualRs), fmtQtd(r.atualQtd), fmtRs(r.baselineRs), fmtQtd(r.baselineQtd), fmtRs(r.projetadoRs), fmtQtd(r.projetadoQtd), vRs(r.ajusteRs), v(Math.round(r.ajusteQtd))];
  }
  // DETALHAMENTO
  if (escopo === "QUANTIDADE")
    return [r.cargoNome, fmtQtd(r.atualQtd), fmtQtd(r.baselineQtd),
      fmtNull(r.calculadoQtd, fmtQtd), v(Math.round(r.ajusteQtd)),
      fmtQtd(r.projetadoQtd), fmtNull(r.variacaoQtd, (n) => v(Math.round(n))), r.observacao];
  if (escopo === "FINANCEIRO")
    return [r.cargoNome, fmtRs(r.atualRs), fmtRs(r.baselineRs),
      fmtNull(r.calculadoRs, fmtRs), vRs(r.ajusteRs),
      fmtRs(r.projetadoRs), fmtNull(r.variacaoRs, vRs), r.observacao];
  // GERAL — usa formato compacto (sem "R$ ") para caber nas colunas estreitas
  return [r.cargoNome, fmtRsC(r.atualRs), fmtQtd(r.atualQtd),
    fmtRsC(r.baselineRs), fmtQtd(r.baselineQtd),
    fmtNull(r.calculadoRs, fmtRsC), fmtNull(r.calculadoQtd, fmtQtd),
    vRsC(r.ajusteRs), v(Math.round(r.ajusteQtd)),
    fmtRsC(r.projetadoRs), fmtQtd(r.projetadoQtd),
    fmtNull(r.variacaoRs, vRsC), fmtNull(r.variacaoQtd, (n) => v(Math.round(n))), r.observacao];
}

function buildHeaders(
  escopo: "QUANTIDADE" | "FINANCEIRO" | "GERAL",
  tipo: "MAPA" | "DETALHAMENTO",
  pageW: number
): { text: string; width: number; align?: "left" | "center" | "right" }[] {
  const L = "left" as const;
  const C = "center" as const;
  const R = "right" as const;

  if (tipo === "MAPA") {
    if (escopo === "QUANTIDADE") return [
      { text: "CARGO",           width: pageW * 0.32, align: L },
      { text: "ATUAL (QTD)",     width: pageW * 0.17, align: C },
      { text: "BASELINE (QTD)", width: pageW * 0.17, align: C },
      { text: "PROJETADO (QTD)",width: pageW * 0.17, align: C },
      { text: "VARIAÇÃO (QTD)", width: pageW * 0.17, align: C },
    ];
    if (escopo === "FINANCEIRO") return [
      { text: "CARGO",          width: pageW * 0.32, align: L },
      { text: "ATUAL (R$)",     width: pageW * 0.17, align: R },
      { text: "BASELINE (R$)", width: pageW * 0.17, align: R },
      { text: "PROJETADO (R$)",width: pageW * 0.17, align: R },
      { text: "VARIAÇÃO (R$)", width: pageW * 0.17, align: R },
    ];
    // GERAL
    return [
      { text: "CARGO",         width: pageW * 0.18, align: L },
      { text: "ATUAL (R$)",    width: pageW * 0.10, align: R },
      { text: "ATUAL (QTD)",   width: pageW * 0.09, align: C },
      { text: "BASE. (R$)",    width: pageW * 0.10, align: R },
      { text: "BASE. (QTD)",   width: pageW * 0.09, align: C },
      { text: "PROJ. (R$)",    width: pageW * 0.11, align: R },
      { text: "PROJ. (QTD)",   width: pageW * 0.09, align: C },
      { text: "VAR. (R$)",     width: pageW * 0.12, align: R },
      { text: "VAR. (QTD)",    width: pageW * 0.12, align: C },
    ];
  }
  // DETALHAMENTO — todos em landscape (~762px disponível)
  if (escopo === "QUANTIDADE") return [
    { text: "CARGO",            width: pageW * 0.22, align: L },
    { text: "ATUAL (QTD)",      width: pageW * 0.09, align: C },
    { text: "BASELINE (QTD)",   width: pageW * 0.10, align: C },
    { text: "CALCULADO (QTD)",  width: pageW * 0.10, align: C },
    { text: "AJUSTE QUALIT.",   width: pageW * 0.10, align: C },
    { text: "PROJETADO (QTD)",  width: pageW * 0.10, align: C },
    { text: "VARIAÇÃO (QTD)",   width: pageW * 0.10, align: C },
    { text: "OBSERVAÇÃO",       width: pageW * 0.19, align: L },
  ];
  if (escopo === "FINANCEIRO") return [
    { text: "CARGO",            width: pageW * 0.16, align: L },
    { text: "ATUAL (R$)",       width: pageW * 0.11, align: R },
    { text: "BASELINE (R$)",    width: pageW * 0.11, align: R },
    { text: "CALCULADO (R$)",   width: pageW * 0.11, align: R },
    { text: "AJUSTE (R$)",      width: pageW * 0.11, align: R },
    { text: "PROJETADO (R$)",   width: pageW * 0.11, align: R },
    { text: "VARIAÇÃO (R$)",    width: pageW * 0.11, align: R },
    { text: "OBSERVAÇÃO",       width: pageW * 0.18, align: L },
  ];
  // DETALHAMENTO GERAL landscape — células R$ usam formato compacto (sem prefixo R$)
  return [
    { text: "CARGO",          width: pageW * 0.15, align: L },
    { text: "ATUAL (R$)",     width: pageW * 0.09, align: R },
    { text: "AT. QTD",        width: pageW * 0.04, align: C },
    { text: "BASE. (R$)",     width: pageW * 0.09, align: R },
    { text: "BASE. QTD",      width: pageW * 0.04, align: C },
    { text: "CALC. (R$)",     width: pageW * 0.09, align: R },
    { text: "CALC. QTD",      width: pageW * 0.04, align: C },
    { text: "AJ. (R$)",       width: pageW * 0.075, align: R },
    { text: "AJ. QTD",        width: pageW * 0.035, align: C },
    { text: "PROJ. (R$)",     width: pageW * 0.09, align: R },
    { text: "PROJ. QTD",      width: pageW * 0.04, align: C },
    { text: "VAR. (R$)",      width: pageW * 0.09, align: R },
    { text: "VAR. QTD",       width: pageW * 0.04, align: C },
    { text: "OBS",            width: pageW * 0.09, align: L },
  ];
}

const RELATORIO_NOMES: Record<string, string> = {
  "MAPA-QUANTIDADE":       "Mapa de Variação — Quantidade",
  "MAPA-FINANCEIRO":       "Mapa de Variação — Financeiro",
  "MAPA-GERAL":            "Mapa de Variação — Geral",
  "DETALHAMENTO-QUANTIDADE": "Detalhamento de Variação — Quantidade",
  "DETALHAMENTO-FINANCEIRO": "Detalhamento de Variação — Financeiro",
  "DETALHAMENTO-GERAL":      "Detalhamento de Variação — Geral",
};

export async function pdfVariacaoSnapshot(
  data: SnapshotVariacaoInput,
  tipo: "MAPA" | "DETALHAMENTO",
  escopo: "QUANTIDADE" | "FINANCEIRO" | "GERAL"
): Promise<Buffer> {
  // Todos os DETALHAMENTO usam landscape — muitas colunas não cabem em retrato
  const landscape = tipo === "DETALHAMENTO" || escopo === "GERAL";
  const relNome = RELATORIO_NOMES[`${tipo}-${escopo}`] ?? `${tipo} ${escopo}`;
  const title = `${relNome} — ${data.hospitalNome}`;

  return bufferFromDoc(title, (doc) => {
    const ML = doc.page.margins.left;
    const pageW = doc.page.width - ML - doc.page.margins.right;
    const headers = buildHeaders(escopo, tipo, pageW);

    for (const tabela of data.tabelas) {
      // Estimate space needed: metaHeader (~38) + tableHeader (~30) + rows (20 each) + total (20)
      const estimatedH = 38 + 30 + tabela.cargos.length * 20 + 20;
      if (doc.y + estimatedH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }

      drawMetaHeader(doc, tabela, escopo, ML, headers.reduce((s, h) => s + h.width, 0));

      const rows = tabela.cargos.map((c) => buildRowCells(c, escopo, tipo));
      generateTable(doc, headers, rows, { headerHeight: 24, dynamicRowHeight: tipo === "DETALHAMENTO" });

      drawTotalRow(doc, tabela.cargos, headers, escopo, tipo, ML);
      doc.moveDown(1.2);
    }
  }, { landscape });
}

export async function pdfResumoDiario(payload: {
  data: string;
  unidade: string;
  numeroLeitos: number;
  ocupacao: { usada: number };
  taxaOcupacao: number;
  distribuicao: Record<string, number>;
  colaboradores?: Array<{
    nome: string;
    total: number;
    distribuicao: Record<string, number>;
  }>;
  avaliacoes?: Array<{
    leito?: { numero?: string; status?: string };
    created_at?: string | Date;
    autor?: { nome?: string };
    classificacao?: string;
  }>;
}): Promise<Buffer> {
  return bufferFromDoc("Resumo Diário da Unidade", (doc) => {
    doc.y += 10;
    doc
      .rect(40, doc.y, doc.page.width - 80, 80)
      .strokeColor("#eeeeee")
      .stroke();
    const summaryY = doc.y;
    doc
      .fontSize(10)
      .font(FONT_BOLD)
      .text("Data:", 50, summaryY + 10)
      .text("Unidade:", 50, summaryY + 25)
      .text("Total de Leitos:", 50, summaryY + 40)
      .text("Ocupação Atual:", 50, summaryY + 55);
    doc
      .font(FONT_NORMAL)
      .text(
        new Date(payload.data).toLocaleDateString("pt-BR", { timeZone: "UTC" }),
        150,
        summaryY + 10
      )
      .text(payload.unidade, 150, summaryY + 25)
      .text(`${payload.numeroLeitos}`, 150, summaryY + 40)
      .text(`${payload.ocupacao.usada}`, 150, summaryY + 55);
    doc.font(FONT_BOLD).text("Taxa de Ocupação:", 300, summaryY + 10);
    doc
      .font(FONT_NORMAL)
      // payload.taxaOcupacao is decimal 0..1 — display as percentage with 2 decimals
      .text(`${(payload.taxaOcupacao * 100).toFixed(2)}%`, 420, summaryY + 10);
    doc.y = summaryY + 95;

    if (payload.avaliacoes && payload.avaliacoes.length) {
      doc
        .fontSize(12)
        .font(FONT_BOLD)
        .text("Avaliações Realizadas", { align: "center" })
        .moveDown(0.5);
      const headers = [
        { text: "Leito", width: 80, align: "center" as const },
        { text: "Horário", width: 100, align: "center" as const },
        { text: "Autor", width: 200 },
        { text: "Classificação", width: 135 },
      ];
      const rows = payload.avaliacoes.map((a) => [
        a.leito?.numero || "-",
        a.created_at ? new Date(a.created_at).toLocaleTimeString("pt-BR") : "-",
        a.autor?.nome || "-",
        a.classificacao || "-",
      ]);
      generateTable(doc, headers, rows);
    }
    doc.moveDown(2);

    // Tabela de Distribuição das Classificações
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Distribuição das Classificações", doc.page.margins.left, doc.y, {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    doc.moveDown(1.5);

    const distribuicaoHeaders = [
      { text: "Classificação", width: 300, align: "left" as const },
      { text: "Quantidade", width: 215, align: "center" as const },
    ];

    const classificacoes = [
      { key: "MINIMOS", label: "Cuidados Mínimos" },
      { key: "INTERMEDIARIOS", label: "Cuidados Intermediários" },
      { key: "ALTA_DEPENDENCIA", label: "Alta Dependência" },
      { key: "SEMI_INTENSIVOS", label: "Cuidados Semi-Intensivos" },
      { key: "INTENSIVOS", label: "Cuidados Intensivos" },
    ];

    const distribuicaoRows = classificacoes.map((cls) => [
      cls.label,
      `${payload.distribuicao[cls.key] || 0}`,
    ]);

    generateTable(doc, distribuicaoHeaders, distribuicaoRows);

    const legendY = doc.page.height - 70;
    if (doc.y < legendY - 20) {
      doc.y = legendY - 20;
    }
    doc
      .moveTo(40, doc.y)
      .lineTo(doc.page.width - 40, doc.y)
      .strokeColor("#cccccc")
      .stroke()
      .moveDown(0.5);
    doc.fontSize(9).font(FONT_BOLD).text("Legenda:", 40, doc.y);
    doc
      .fontSize(8)
      .font(FONT_NORMAL)
      .text(
        "MIN: Cuidados Mínimos  •  INT: Cuidados Intermediários  •  AD: Alta Dependência  •  SI: Cuidado Semi-Intensivo  •  IN: Cuidado Intensivo",
        { align: "left", lineGap: 2 }
      );
  });
}

export async function pdfListagemLeitos(payload: {
  data: string;
  unidade: string;
  leitos: Array<{
    numero: string;
    status: string;
    classificacao?: string;
  }>;
}): Promise<Buffer> {
  const title = `Listagem de Leitos - ${payload.unidade}`;
  return bufferFromDoc(title, (doc) => {
    doc.y += 10;
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Situação dos Leitos", { align: "center" });
    doc
      .fontSize(10)
      .font(FONT_NORMAL)
      .text(
        `Relatório do dia: ${new Date(payload.data).toLocaleDateString(
          "pt-BR",
          { timeZone: "UTC" }
        )}`,
        { align: "center" }
      );
    doc.moveDown(1.5);

    const headers = [
      { text: "Leito", width: 120, align: "left" as const },
      { text: "Status", width: 150, align: "left" as const },
      { text: "Classificação do Paciente", width: 245, align: "left" as const },
    ];
    const rows = payload.leitos.map((leito) => {
      const classificacaoTexto = leito.classificacao
        ? classificationMap[leito.classificacao.toUpperCase()] ||
          leito.classificacao
        : "-";
      return [leito.numero, leito.status, classificacaoTexto];
    });
    generateTable(doc, headers, rows);
  });
}

export async function pdfMensal(payload: {
  ano: number;
  mes: number;
  unidade: string;
  numeroLeitos: number;
  ocupacaoMensal: {
    mediaOcupadosDia: number;
    taxaOcupacaoMedia: number;
    avaliacao: Array<{ data: string; ocupados: number }>;
  };
  distribuicaoMensal: Record<string, number>;
  colaboradores?: Array<{
    nome: string;
    total: number;
    distribuicao: Record<string, number>;
  }>;
}): Promise<Buffer> {
  const title = `Relatório Mensal - ${payload.unidade}`;
  return bufferFromDoc(title, (doc) => {
    doc.y += 10;
    doc
      .rect(40, doc.y, doc.page.width - 80, 80)
      .strokeColor("#eeeeee")
      .stroke();
    const summaryY = doc.y;
    doc
      .fontSize(10)
      .font(FONT_BOLD)
      .text("Período:", 50, summaryY + 10)
      .text("Leitos na Unidade:", 50, summaryY + 25)
      .text("Média de Ocupação:", 50, summaryY + 40);
    doc
      .font(FONT_NORMAL)
      .text(
        `${String(payload.mes).padStart(2, "0")}/${payload.ano}`,
        160,
        summaryY + 10
      )
      .text(`${payload.numeroLeitos}`, 160, summaryY + 25)
      .text(
        `${payload.ocupacaoMensal.mediaOcupadosDia.toFixed(2)} / dia`,
        160,
        summaryY + 40
      );
    doc
      .font(FONT_BOLD)
      .text("Taxa Média Ocupação:", 300, summaryY + 10)
      .text("Distribuição Geral:", 300, summaryY + 25);
    const distribuicaoText = Object.entries(payload.distribuicaoMensal || {})
      .map(([k, v]) => `${k.slice(0, 3)}: ${v}`)
      .join(" / ");
    doc
      .font(FONT_NORMAL)
      // taxaOcupacaoMedia stored as decimal 0..1 — show as percentage with 2 decimals
      .text(
        `${(payload.ocupacaoMensal.taxaOcupacaoMedia * 100).toFixed(2)}%`,
        430,
        summaryY + 10
      )
      .text(distribuicaoText, 430, summaryY + 25, { width: 140 });
    doc.y = summaryY + 95;

    // AJUSTE: Título "Ocupação Diária da Unidade" centralizado e em uma linha
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Ocupação Diária da Unidade", doc.page.margins.left, doc.y, {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    doc.moveDown(1.5); // Espaço depois do título
    const ocupacaoHeaders = [
      { text: "Data", width: 257 },
      { text: "Leitos Ocupados", width: 258, align: "center" as const },
    ];
    const ocupacaoRows = payload.ocupacaoMensal.avaliacao.map((item) => [
      new Date(item.data).toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      `${item.ocupados}`,
    ]);
    generateTable(doc, ocupacaoHeaders, ocupacaoRows);
    doc.moveDown(2);

    if (payload.colaboradores && payload.colaboradores.length) {
      doc
        .fontSize(12)
        .font(FONT_BOLD)
        .text(
          "Desempenho Mensal dos Colaboradores",
          doc.page.margins.left,
          doc.y,
          {
            align: "center",
            width:
              doc.page.width - doc.page.margins.left - doc.page.margins.right,
          }
        );
      doc.moveDown(1.5);
      const headers = [
        { text: "Nome do Colaborador", width: 235 },
        { text: "Total", width: 40, align: "center" as const },
        { text: "MIN", width: 40, align: "center" as const },
        { text: "INT", width: 40, align: "center" as const },
        { text: "AD", width: 40, align: "center" as const },
        { text: "SI", width: 40, align: "center" as const },
        { text: "IN", width: 40, align: "center" as const },
      ];
      const rows = payload.colaboradores.map((c) => [
        c.nome,
        `${c.total}`,
        `${c.distribuicao["MINIMOS"] || 0}`,
        `${c.distribuicao["INTERMEDIARIOS"] || 0}`,
        `${c.distribuicao["ALTA_DEPENDENCIA"] || 0}`,
        `${c.distribuicao["SEMI_INTENSIVOS"] || 0}`,
        `${c.distribuicao["INTENSIVOS"] || 0}`,
      ]);
      generateTable(doc, headers, rows);
    }

    const legendY = doc.page.height - 70;
    if (doc.y < legendY - 20) {
      doc.y = legendY - 20;
    }
    doc
      .moveTo(40, doc.y)
      .lineTo(doc.page.width - 40, doc.y)
      .strokeColor("#cccccc")
      .stroke()
      .moveDown(0.5);
    doc.fontSize(9).font(FONT_BOLD).text("Legenda:", 40, doc.y);
    doc
      .fontSize(8)
      .font(FONT_NORMAL)
      .text(
        "MIN: Cuidados Mínimos  •  INT: Cuidados Intermediários  •  AD: Alta Dependência  •  SI: Cuidado Semi-Intensivo  •  IN: Cuidado Intensivo",
        { align: "left", lineGap: 2 }
      );
  });
}

export async function pdfConsolidadoMensal(payload: {
  unidade: string;
  dataInicial: string;
  dataFinal: string;
  historicoMensal: Array<{
    mesAno: string;
    cuidadosMinimos: number;
    cuidadosIntermediarios: number;
    cuidadosAltaDependencia: number;
    cuidadosSemiIntensivos: number;
    cuidadosIntensivos: number;
    somaLeitos: number;
    leitosOperacionais: number;
    percentualOcupacao: number;
  }>;
}): Promise<Buffer> {
  const title = `Relatório Consolidado Mensal - ${payload.unidade}`;
  return bufferFromDoc(title, (doc) => {
    doc.y += 10;

    // Cabeçalho do relatório
    doc
      .rect(40, doc.y, doc.page.width - 80, 60)
      .strokeColor("#eeeeee")
      .stroke();
    const summaryY = doc.y;
    doc
      .fontSize(10)
      .font(FONT_BOLD)
      .text("Período:", 50, summaryY + 10)
      .text("Unidade:", 50, summaryY + 25)
      .text("Total de Meses:", 50, summaryY + 40);

    doc
      .font(FONT_NORMAL)
      .text(
        `${payload.dataInicial} até ${payload.dataFinal}`,
        160,
        summaryY + 10
      )
      .text(payload.unidade, 160, summaryY + 25)
      .text(`${payload.historicoMensal.length}`, 160, summaryY + 40);

    doc.y = summaryY + 75;

    // Título da tabela
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Histórico Mensal de Ocupação", doc.page.margins.left, doc.y, {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    doc.moveDown(1.5);

    // Cabeçalhos da tabela
    const headers = [
      { text: "Mês/Ano", width: 60, align: "center" as const },
      { text: "Min", width: 35, align: "center" as const },
      { text: "Int", width: 35, align: "center" as const },
      { text: "AD", width: 35, align: "center" as const },
      { text: "SI", width: 35, align: "center" as const },
      { text: "In", width: 35, align: "center" as const },
      { text: "Soma Leitos", width: 70, align: "center" as const },
      { text: "Operacionais", width: 75, align: "center" as const },
      { text: "% Ocupação", width: 65, align: "center" as const },
    ];

    // Linhas de dados
    const rows = payload.historicoMensal.map((item) => [
      item.mesAno,
      item.cuidadosMinimos.toString(),
      item.cuidadosIntermediarios.toString(),
      item.cuidadosAltaDependencia.toString(),
      item.cuidadosSemiIntensivos.toString(),
      item.cuidadosIntensivos.toString(),
      item.somaLeitos.toString(),
      item.leitosOperacionais.toString(),
      `${item.percentualOcupacao}%`,
    ]);

    generateTable(doc, headers, rows);

    // Calcular médias
    if (payload.historicoMensal.length > 0) {
      doc.moveDown(1);

      const totais = payload.historicoMensal.reduce(
        (acc, item) => ({
          cuidadosMinimos: acc.cuidadosMinimos + item.cuidadosMinimos,
          cuidadosIntermediarios:
            acc.cuidadosIntermediarios + item.cuidadosIntermediarios,
          cuidadosAltaDependencia:
            acc.cuidadosAltaDependencia + item.cuidadosAltaDependencia,
          cuidadosSemiIntensivos:
            acc.cuidadosSemiIntensivos + item.cuidadosSemiIntensivos,
          cuidadosIntensivos: acc.cuidadosIntensivos + item.cuidadosIntensivos,
          somaLeitos: acc.somaLeitos + item.somaLeitos,
          leitosOperacionais: acc.leitosOperacionais + item.leitosOperacionais,
          percentualOcupacao: acc.percentualOcupacao + item.percentualOcupacao,
        }),
        {
          cuidadosMinimos: 0,
          cuidadosIntermediarios: 0,
          cuidadosAltaDependencia: 0,
          cuidadosSemiIntensivos: 0,
          cuidadosIntensivos: 0,
          somaLeitos: 0,
          leitosOperacionais: 0,
          percentualOcupacao: 0,
        }
      );

      const medias = {
        cuidadosMinimos: Math.round(
          totais.cuidadosMinimos / payload.historicoMensal.length
        ),
        cuidadosIntermediarios: Math.round(
          totais.cuidadosIntermediarios / payload.historicoMensal.length
        ),
        cuidadosAltaDependencia: Math.round(
          totais.cuidadosAltaDependencia / payload.historicoMensal.length
        ),
        cuidadosSemiIntensivos: Math.round(
          totais.cuidadosSemiIntensivos / payload.historicoMensal.length
        ),
        cuidadosIntensivos: Math.round(
          totais.cuidadosIntensivos / payload.historicoMensal.length
        ),
        somaLeitos: Math.round(
          totais.somaLeitos / payload.historicoMensal.length
        ),
        leitosOperacionais: Math.round(
          totais.leitosOperacionais / payload.historicoMensal.length
        ),
        percentualOcupacao: Math.round(
          totais.percentualOcupacao / payload.historicoMensal.length
        ),
      };

      // Linha de média destacada
      const startY = doc.y;
      const tableWidth = headers.reduce((acc, h) => acc + h.width, 0);
      doc
        .rect(40, startY, tableWidth, 20)
        .fill("#e8f4f8")
        .strokeColor("#00a99d")
        .stroke();

      doc.fontSize(8).fillColor("#333333").font(FONT_BOLD);
      const mediaRow = [
        "MÉDIA",
        medias.cuidadosMinimos.toString(),
        medias.cuidadosIntermediarios.toString(),
        medias.cuidadosAltaDependencia.toString(),
        medias.cuidadosSemiIntensivos.toString(),
        medias.cuidadosIntensivos.toString(),
        medias.somaLeitos.toString(),
        medias.leitosOperacionais.toString(),
        `${medias.percentualOcupacao}%`,
      ];

      let currentX = 40;
      mediaRow.forEach((cell, i) => {
        doc.text(cell, currentX + 5, startY + 7, {
          width: headers[i].width - 10,
          align: headers[i].align || "left",
        });
        currentX += headers[i].width;
      });
      doc.y = startY + 25;
    }

    // Legenda
    const legendY = doc.page.height - 70;
    if (doc.y < legendY - 20) {
      doc.y = legendY - 20;
    }
    doc
      .moveTo(40, doc.y)
      .lineTo(doc.page.width - 40, doc.y)
      .strokeColor("#cccccc")
      .stroke()
      .moveDown(0.5);
    doc.fontSize(9).font(FONT_BOLD).text("Legenda:", 40, doc.y);
    doc
      .fontSize(8)
      .font(FONT_NORMAL)
      .text(
        "Min: Cuidados Mínimos  •  Int: Intermediários  •  AD: Alta Dependência  •  SI: Semi-Intensivo  •  In: Intensivo",
        { align: "left", lineGap: 2 }
      );
  });
}

export async function pdfDimensionamento(payload: {
  unidade: {
    nome: string;
    scpMetodoKey?: string;
    numeroLeitos: number;
  };
  dimensionamento: {
    enfermeiroCargoHorario: number;
    enfermeiroPercentualEquipe: number;
    tecnicoEnfermagemCargoHorario: number;
    tecnicoEnfermagemPercentualEquipe: number;
    indiceTecnico: number;
    quantidadeLeitos: number;
    taxaOcupacao: number;
    diasSemana: number;
    idadeEquipeRestricoes: string;
    pcm: number;
    pci: number;
    pcad: number;
    pcsi: number;
    pcit: number;
    constanteMarinhoEnfermeiro: number;
    constanteMarinhoTecnico: number;
    totalHorasEnfermagem: number;
    quadroPessoalTotal: number;
    quadroPessoalEnfermeiro: number;
    quadroPessoalTecnico: number;
  };
}): Promise<Buffer> {
  const title = `${payload.unidade.nome}`;
  return bufferFromDoc(title, (doc) => {
    doc.y += 10;

    // Informações da Unidade
    doc
      .rect(40, doc.y, doc.page.width - 80, 80)
      .strokeColor("#eeeeee")
      .stroke();
    const summaryY = doc.y;
    doc
      .fontSize(10)
      .font(FONT_BOLD)
      .text("Unidade:", 50, summaryY + 10)
      .text("Método SCP:", 50, summaryY + 25)
      .text("Total de Leitos:", 50, summaryY + 40)
      .text("Data/Hora:", 50, summaryY + 55);

    doc
      .font(FONT_NORMAL)
      .text(payload.unidade.nome, 160, summaryY + 10)
      .text(payload.unidade.scpMetodoKey || "Não informado", 160, summaryY + 25)
      .text(`${payload.unidade.numeroLeitos}`, 160, summaryY + 40)
      .text(new Date().toLocaleString("pt-BR"), 160, summaryY + 55);

    doc.y = summaryY + 95;

    // Configuração da Equipe
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Configuração da Equipe", { align: "center" });
    doc.moveDown(1);

    const equipeHeaders = [
      { text: "Categoria", width: 200, align: "left" as const },
      { text: "Carga Horária", width: 100, align: "center" as const },
      { text: "% da Equipe", width: 100, align: "center" as const },
      { text: "Observações", width: 115, align: "center" as const },
    ];

    const equipeRows = [
      [
        "Enfermeiro",
        `${payload.dimensionamento.enfermeiroCargoHorario}h`,
        `${(payload.dimensionamento.enfermeiroPercentualEquipe * 100).toFixed(
          1
        )}%`,
        "-",
      ],
      [
        "Técnico de Enfermagem",
        `${payload.dimensionamento.tecnicoEnfermagemCargoHorario}h`,
        `${(
          payload.dimensionamento.tecnicoEnfermagemPercentualEquipe * 100
        ).toFixed(1)}%`,
        "-",
      ],
    ];

    generateTable(doc, equipeHeaders, equipeRows);
    doc.moveDown(1.5);

    // Parâmetros
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Parâmetros de Dimensionamento", { align: "center" });
    doc.moveDown(1);

    const parametrosHeaders = [
      { text: "Parâmetro", width: 250, align: "left" as const },
      { text: "Valor", width: 265, align: "center" as const },
    ];

    const parametrosRows = [
      [
        "Índice de Segurança Técnica (%)",
        `${payload.dimensionamento.indiceTecnico}%`,
      ],
      ["Quantidade de Leitos", `${payload.dimensionamento.quantidadeLeitos}`],
      // dimensionamento.taxaOcupacao is decimal 0..1 — display as percentage with 2 decimals
      [
        "Taxa de Ocupação (%)",
        `${(payload.dimensionamento.taxaOcupacao * 100).toFixed(2)}%`,
      ],
      ["Dias da Semana", `${payload.dimensionamento.diasSemana}`],
      [
        "Idade da Equipe/Restrições",
        payload.dimensionamento.idadeEquipeRestricoes === "sim" ? "Sim" : "Não",
      ],
    ];

    generateTable(doc, parametrosHeaders, parametrosRows);
    doc.moveDown(1.5);

    // Distribuição de Pacientes
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Distribuição de Pacientes", { align: "center" });
    doc.moveDown(1);

    const pacientesHeaders = [
      { text: "Tipo de Cuidado", width: 200, align: "left" as const },
      { text: "Quantidade", width: 80, align: "center" as const },
      { text: "Horas/Paciente", width: 90, align: "center" as const },
      { text: "Total Horas", width: 145, align: "center" as const },
    ];

    const pacientesRows = [
      [
        "Cuidados Mínimos (PCM)",
        `${payload.dimensionamento.pcm}`,
        "4h",
        `${payload.dimensionamento.pcm * 4}h`,
      ],
      [
        "Cuidados Intermediários (PCI)",
        `${payload.dimensionamento.pci}`,
        "6h",
        `${payload.dimensionamento.pci * 6}h`,
      ],
      [
        "Alta Dependência (PCAD)",
        `${payload.dimensionamento.pcad}`,
        "10h",
        `${payload.dimensionamento.pcad * 10}h`,
      ],
      [
        "Semi-Intensivos (PCSI)",
        `${payload.dimensionamento.pcsi}`,
        "10h",
        `${payload.dimensionamento.pcsi * 10}h`,
      ],
      [
        "Intensivos (PCIT)",
        `${payload.dimensionamento.pcit}`,
        "18h",
        `${payload.dimensionamento.pcit * 18}h`,
      ],
    ];

    generateTable(doc, pacientesHeaders, pacientesRows);
    doc.moveDown(1.5);

    // Resultados Calculados
    doc
      .fontSize(12)
      .font(FONT_BOLD)
      .text("Resultados do Dimensionamento", { align: "center" });
    doc.moveDown(1);

    const resultadosHeaders = [
      { text: "Indicador", width: 300, align: "left" as const },
      { text: "Valor", width: 215, align: "center" as const },
    ];

    const resultadosRows = [
      [
        "Total de Horas de Enfermagem (THE)",
        `${payload.dimensionamento.totalHorasEnfermagem.toFixed(2)}h`,
      ],
      [
        "Quadro de Pessoal Total (QP)",
        `${payload.dimensionamento.quadroPessoalTotal.toFixed(
          2
        )} profissionais`,
      ],
      [
        "Quadro de Pessoal - Enfermeiros",
        `${payload.dimensionamento.quadroPessoalEnfermeiro.toFixed(
          2
        )} enfermeiros`,
      ],
      [
        "Quadro de Pessoal - Técnicos",
        `${payload.dimensionamento.quadroPessoalTecnico.toFixed(2)} técnicos`,
      ],
    ];

    generateTable(doc, resultadosHeaders, resultadosRows);
    doc.moveDown(2);

    // Fórmula
    doc
      .fontSize(10)
      .font(FONT_BOLD)
      .text("Fórmula Utilizada:", { align: "left" });
    doc
      .fontSize(9)
      .font(FONT_NORMAL)
      .text(
        "QP = [(PCM × 4) + (PCI × 6) + (PCAD × 10) + (PCSI × 10) + (PCIT × 18)] × DS × IST / CHS",
        { align: "left" }
      )
      .moveDown(0.5)
      .text("Onde:", { align: "left" })
      .text("• QP = Quadro de Pessoal", { align: "left" })
      .text("• DS = Dias da Semana", { align: "left" })
      .text("• IST = Índice de Segurança Técnica", { align: "left" })
      .text("• CHS = Carga Horária Semanal", { align: "left" });
  });
}
