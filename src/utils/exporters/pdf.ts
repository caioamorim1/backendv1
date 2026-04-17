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

// --- Fonte Unicode (setas e símbolos) ---
const FONT_UNICODE_PATH = path.join(process.cwd(), "src", "utils", "exporters", "seguisym.ttf");
const FONT_UNICODE = "SegoeUISymbol";

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
    font?: string;
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

    doc.fontSize(8).fillColor("#333333");
    let currentX = startX;
    rowData.forEach((cell, i) => {
      doc.font(headers[i].font ?? FONT_NORMAL);
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
  options?: { landscape?: boolean; pageSize?: [number, number] }
): Promise<Buffer> {
  return new Promise((resolve) => {
    const landscape = options?.landscape ?? false;
    const defaultSize: [number, number] = landscape ? [841.89, 595.28] : [595.28, 841.89];
    const size = options?.pageSize ?? defaultSize;
    const doc = new PDFDocument({ margin: 40, size });
    // Register Unicode font for symbols (arrows etc.)
    try { doc.registerFont(FONT_UNICODE, FONT_UNICODE_PATH); } catch (_) {}
    const chunks: Buffer[] = [];

    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const drawHeader = () => {
      if (logo) {
        doc.image(logo, 40, 25, { width: 90 });
      }
      // Title must avoid the logo (right edge ~130) and emission date (left edge ~page.width-150)
      const titleX = logo ? 140 : doc.page.margins.left;
      const titleW = doc.page.width - titleX - 120;
      doc
        .fontSize(14)
        .font(FONT_BOLD)
        .fillColor("#333333")
        .text(title, titleX, 32, { align: "center", width: titleW });
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

// Helper: formata string YYYY-MM-DD → DD/MM/YYYY sem passar por new Date()
// (new Date("YYYY-MM-DD") interpreta como UTC meia-noite e pode deslocar um dia
// em servidores com timezone negativa como America/Sao_Paulo)
function isoDateToBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
  ALTA_DEPENDENCIA:{ horas: 10, percEnf: 38, percTec: 62 },
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
    taxaOcupacaoCustomizada?: {
      taxa: number;
      leitosOcupados: number;
      totalPacientesMedio: number;
      utilizarComoBaseCalculo?: boolean | null;
      distribuicaoClassificacao?: Record<string, number> | null;
      distribuicaoTotalClassificacaoReal?: Record<string, number>;
      mediaDiariaClassificacaoReal?: Record<string, number>;
      leitosSimulados?: {
        leitosOcupados: number;
        vagosInativos: number;
        leitosPendentes: number;
        leitosAvaliados: number;
      } | null;
      createdAt?: string;
      updatedAt?: string;
    };
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
      nomeEnfermeiro?: string | null;
      numeroCoren?: string | null;
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
      .text("TOTAL DE LEITOS", ML + 340, infoY + 7);
    doc.fontSize(10).font(FONT_BOLD).fillColor("#1a365d")
      .text(ag.unidadeNome, ML + 8, infoY + 19, { width: 185 })
      .text(ag.metodoAvaliacaoSCP?.title ?? "—", ML + 200, infoY + 19, { width: 130 })
      .text(`${ag.totalLeitos}`, ML + 340, infoY + 19, { width: 70 });
    doc.y = infoY + 60;

    // ── 2. PARÂMETROS ─────────────────────────────────────────────────────
    sectionTitle(doc, "Parâmetros");
    const pW = pageW / 3;
    const pCards = [
      ["Enfermeiro Responsável",          ag.parametros.nomeEnfermeiro ?? "Não informado"],
      ["COREN",                            ag.parametros.numeroCoren ?? "Não informado"],
      ["Valor do IST",                    `${ag.parametros.istPercent}%`],
      ["Dias de Trabalho por Semana",     `${ag.parametros.diasTrabalhoSemana}`],
      ["Jornada Semanal Enfermeiro",      `${ag.parametros.cargaHorariaEnfermeiro}h`],
      ["Jornada Semanal Técnico",         `${ag.parametros.cargaHorariaTecnico}h`],
      ["Equipe com Restrições",           ag.parametros.equipeComRestricoes ? "Sim" : "Não"],
      ["Método de Cálculo",               ag.parametros.metodoCalculo ?? "Não informado"],
    ];
    const pRowCount = Math.ceil(pCards.length / 3);
    if (doc.y + pRowCount * 40 + 12 > doc.page.height - doc.page.margins.bottom) doc.addPage();
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

    // ── 3. PERÍODO DE ANÁLISE ─────────────────────────────────────────────
    sectionTitle(doc, "Período de Análise");
    const cw = pageW / 3;
    if (doc.y + 52 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const periodY = doc.y;
    infoCard(doc, ML,          periodY, cw, 44, "Data Início",   isoDateToBR(ag.periodo.inicio));
    infoCard(doc, ML + cw,     periodY, cw, 44, "Data Fim",      isoDateToBR(ag.periodo.fim));
    infoCard(doc, ML + cw * 2, periodY, cw, 44, "Total de Dias", `${ag.periodo.dias}`);
    doc.y = periodY + 52;

    // ── 4. OCUPAÇÃO E AVALIAÇÕES ───────────────────────────────────────────
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


    // Distribuição da Classificação
    const classOrder = ["MINIMOS", "INTERMEDIARIOS", "ALTA_DEPENDENCIA", "SEMI_INTENSIVOS", "INTENSIVOS"];
    const modoSimulado =
      ag.taxaOcupacaoCustomizada?.utilizarComoBaseCalculo === true &&
      ag.taxaOcupacaoCustomizada?.distribuicaoClassificacao != null;
    let distHeadersOc = classOrder.map(k => ({
      text: CLASSIFICACAO_LABEL[k],
      width: pageW / 5,
      align: "center" as const,
    }));
    // Distribuição real — sempre usa dados históricos nesta seção
    const distRealOc = ag.taxaOcupacaoCustomizada?.distribuicaoTotalClassificacaoReal ?? ag.distribuicaoTotalClassificacao;
    const totalDistOc = classOrder.reduce((s, k) => s + (distRealOc[k] ?? 0), 0);
    const distRowsOc = [
      classOrder.map(k => {
        const n = distRealOc[k] ?? 0;
        const pct = totalDistOc > 0 ? ((n / totalDistOc) * 100).toFixed(2) : "0.00";
        return `${n} (${pct}%)`;
      })
    ];
    doc.moveDown(0.4);
    doc.fontSize(8).font(FONT_BOLD).fillColor("#555555")
      .text("Distribuição da Classificação", ML, doc.y);
    doc.moveDown(0.3);
    generateTable(doc, distHeadersOc, distRowsOc, { headerHeight: 30 });
    doc.moveDown(0.4);

    // ── 5. BASE DE CÁLCULO ────────────────────────────────────────────────
    // Só exibido quando utilizarComoBaseCalculo === true
    if (modoSimulado) {
      sectionTitle(doc, "Base de Cálculo");
      const tc = ag.taxaOcupacaoCustomizada!;
      const sim = tc.leitosSimulados;

      // 8 cards com os valores simulados
      const cw9 = pageW / 8;
      if (doc.y + 52 > doc.page.height - doc.page.margins.bottom) doc.addPage();
      const calcY9 = doc.y;
      const cards9: [string, string][] = [
        ["Taxa de\nOcupação",     `${tc.taxa}%`],
        ["Leitos\nDia/Período",   `${ag.totalLeitosDia}`],
        ["Total de\nAvaliações",  `${ag.totalAvaliacoes}`],
        ["Leitos\nOcupados",      sim ? `${sim.leitosOcupados}` : "—"],
        ["Vagos &\nInativos",     sim ? `${sim.vagosInativos}` : "—"],
        ["Leitos\nPendentes",     sim ? `${sim.leitosPendentes}` : "—"],
        ["Leitos\nAvaliados",     sim ? `${sim.leitosAvaliados}` : "—"],
        ["Pacientes\nMédio/dia",  `${Number(tc.totalPacientesMedio).toFixed(2)}`],
      ];
      cards9.forEach(([lbl, val], i) => {
        const cx = ML + cw9 * i;
        doc.rect(cx, calcY9, cw9, 50).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
        doc.fontSize(6.5).font(FONT_NORMAL).fillColor("#888888")
          .text(lbl, cx + 4, calcY9 + 6, { width: cw9 - 8, align: "center" });
        doc.y = calcY9 + 6;
        doc.fontSize(10).font(FONT_BOLD).fillColor("#1a365d")
          .text(val, cx + 4, calcY9 + 28, { width: cw9 - 8, align: "center" });
        doc.y = calcY9 + 28;
      });
      doc.y = calcY9 + 58;

      // Distribuição SCP simulada com % e quantidade
      doc.moveDown(0.5);
      doc.fontSize(8).font(FONT_BOLD).fillColor("#555555")
        .text("Distribuição por nível SCP", ML, doc.y);
      doc.moveDown(0.3);
      const distSim = tc.distribuicaoClassificacao!;
      const somaSimPerc = classOrder.reduce((s, k) => s + (distSim[k] ?? 0), 0);
      const leitosOcSim = sim?.leitosOcupados ?? tc.leitosOcupados;
      const simHeaders = classOrder.map(k => ({
        text: CLASSIFICACAO_LABEL[k],
        width: pageW / 5,
        align: "center" as const,
      }));
      const simRows = [
        classOrder.map(k => {
          const v = distSim[k] ?? 0;
          const pct = somaSimPerc > 0 ? ((v / somaSimPerc) * 100).toFixed(1) : "0.0";
          const n = Math.round(leitosOcSim * (somaSimPerc > 0 ? v / somaSimPerc : 0));
          return `${n} (${pct}%)`;
        }),
      ];
      generateTable(doc, simHeaders, simRows, { headerHeight: 30 });
      doc.moveDown(0.6);
    }

    // ── 6. HORAS DE ENFERMAGEM POR CLASSIFICAÇÃO ──────────────────────────
    // Evita quebra da tabela no meio: se não houver espaço para a seção inteira,
    // inicia em uma nova página.
    const heSectionEstimatedHeight = 200; // título + tabela (header + 5 linhas) + total
    if (
      doc.y + heSectionEstimatedHeight >
      doc.page.height - doc.page.margins.bottom
    ) {
      doc.addPage();
    }
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

    // ── 8. CLASSIFICAÇÃO DE PACIENTE ──────────────────────────────────────
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

    // ── 9. QUADRO DE PESSOAL DIMENSIONADO ────────────────────────────────
    if (doc.y + 150 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    sectionTitle(doc, "Quadro de Pessoal Dimensionado");
    doc
      .fontSize(9).font(FONT_BOLD).fillColor("#1a365d")
      .text(`TOTAL de Profissionais: ${ag.qpTotal.toFixed(2)}`, ML, doc.y);
    doc.moveDown(0.6);
    const qpHeaders = [
      { text: "",                          width: pageW * 0.34, align: "left"   as const },
      { text: "Enfermeiros",  width: pageW * 0.33, align: "center" as const },
      { text: "Técnicos",    width: pageW * 0.33, align: "center" as const },
    ];
    const qpRows = [
      ["Cuidado",              `${ag.cuidadoEnfermeiro.toFixed(2)}`,   `${ag.cuidadoTecnico.toFixed(2)}`],
      ["Segurança técnica",    `${ag.segurancaEnfermeiro.toFixed(2)}`, `${ag.segurancaTecnico.toFixed(2)}`],
      ["Total de Profissionais", `${ag.qpEnfermeiros.toFixed(2)}`,     `${ag.qpTecnicos.toFixed(2)}`],
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
  // DETALHAMENTO GERAL — renderizado em A3 landscape (~1110pt úteis)
  // Proporções ajustadas para evitar quebra de linha nos cabeçalhos QTD
  return [
    { text: "CARGO",          width: pageW * 0.14, align: L },
    { text: "ATUAL (R$)",     width: pageW * 0.07, align: R },
    { text: "AT. QTD",        width: pageW * 0.06, align: C },
    { text: "BASE. (R$)",     width: pageW * 0.07, align: R },
    { text: "BASE. QTD",      width: pageW * 0.06, align: C },
    { text: "CALC. (R$)",     width: pageW * 0.07, align: R },
    { text: "CALC. QTD",      width: pageW * 0.06, align: C },
    { text: "AJ. (R$)",       width: pageW * 0.07, align: R },
    { text: "AJ. QTD",        width: pageW * 0.05, align: C },
    { text: "PROJ. (R$)",     width: pageW * 0.07, align: R },
    { text: "PROJ. QTD",      width: pageW * 0.06, align: C },
    { text: "VAR. (R$)",      width: pageW * 0.07, align: R },
    { text: "VAR. QTD",       width: pageW * 0.06, align: C },
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
  // DETALHAMENTO-GERAL tem 14 colunas; usa A3 landscape para evitar cabeçalhos cortados
  const isGeralDetalhamento = tipo === "DETALHAMENTO" && escopo === "GERAL";
  const pageSize: [number, number] | undefined = isGeralDetalhamento ? [1190.55, 841.89] : undefined;
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
  }, { landscape, pageSize });
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

// ─── Diário de Avaliações (Termômetro) ───

export interface DiarioAvaliacaoPayload {
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
  unidade: string;
  numeroLeitos: number;
  scpUtilizado: string;
  nivelMaximoCuidado: string;
  // quadro resumo
  taxaOcupacaoDia: number; // %
  leitosAvaliadosPerc: number; // %
  leitosAvaliadosQtd: number;
  leitosOcupados: number;
  leitosPendentes: number;
  leitosInativos: number;
  leitosVagos: number;
  desvioPerfil: { qtd: number; perc: number };
  niveisPct: {
    minimos: number;
    intermediarios: number;
    altaDependencia: number;
    semiIntensivos: number;
    intensivos: number;
  };
  // comentários do dia
  comentarios: Array<{ texto: string; autor: string; hora: string }>;
  // tabela de leitos
  leitos: Array<{
    numero: string;
    dataHoraAvaliacao: string;
    prontuario: string;
    statusLeito: string;
    tipoCuidado: string;
    evolucao: string; // "→" manteve, "↑" subiu, "↓" desceu, "" sem avaliação anterior
    pontos: string;
    avaliador: string;
    justificativa: string;
  }>;
}

export async function pdfDiarioAvaliacoes(
  payload: DiarioAvaliacaoPayload
): Promise<Buffer> {
  return bufferFromDoc(
    "DIÁRIO DE AVALIAÇÕES",
    (doc) => {
      const ML = doc.page.margins.left;
      const pageW = doc.page.width - ML - doc.page.margins.right;

      // ── Info da unidade ──
      const infoY = doc.y;
      const boxH = 44;
      doc.rect(ML, infoY, pageW, boxH).strokeColor("#d9d9d9").lineWidth(0.5).stroke();

      const col1 = ML + 6;
      const col2 = ML + pageW * 0.42;

      doc.fontSize(7.5).fillColor("#333333");
      doc.font(FONT_BOLD).text("UNIDADE DE INTERNAÇÃO:", col1, infoY + 5, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.unidade}`);
      doc.font(FONT_BOLD).text("NÚMERO DE LEITOS:", col2, infoY + 5, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.numeroLeitos}`);

      doc.font(FONT_BOLD).text("DATA:", col1, infoY + 17, { continued: true })
        .font(FONT_NORMAL).text(` ${isoDateToBR(payload.data)}`);
      doc.font(FONT_BOLD).text("HORA:", col2, infoY + 17, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.hora}`);

      doc.font(FONT_BOLD).text("SCP UTILIZADO:", col1, infoY + 29, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.scpUtilizado}`);
      doc.font(FONT_BOLD).text("NÍVEL MÁXIMO DE CUIDADO:", col2, infoY + 29, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.nivelMaximoCuidado}`);

      doc.y = infoY + boxH + 6;

      // ── QUADRO RESUMO ──
      sectionTitle(doc, "QUADRO RESUMO");
      const qY = doc.y;
      const colW = pageW / 3;

      // Helper: label + value in a line
      const kvLine = (label: string, val: string, x: number, y: number, valX?: number) => {
        doc.font(FONT_NORMAL).fontSize(7.5).fillColor("#333333")
          .text(label, x, y, { width: (valX ?? x + colW * 0.68) - x });
        doc.font(FONT_BOLD).text(val, valX ?? x + colW * 0.68, y);
      };

      // Coluna esquerda
      kvLine("Taxa de Ocupação do dia (%)", `${payload.taxaOcupacaoDia.toFixed(1)}%`, col1, qY);
      kvLine("Leitos Avaliados (%)", `${payload.leitosAvaliadosPerc.toFixed(0)}%`, col1, qY + 13);
      kvLine("Leitos Avaliados (Qtd)", `${payload.leitosAvaliadosQtd}`, col1, qY + 26);

      // Coluna central
      const midX = ML + colW + 6;
      const midVX = ML + colW + colW * 0.72;
      kvLine("Leitos Ocupados (Qtd)", `${payload.leitosOcupados}`, midX, qY, midVX);
      kvLine("Leitos Pendentes (Qtd)", `${payload.leitosPendentes}`, midX, qY + 13, midVX);
      kvLine("Leitos Inativos (Qtd)", `${payload.leitosInativos}`, midX, qY + 26, midVX);
      kvLine("Leitos Vagos (Qtd)", `${payload.leitosVagos}`, midX, qY + 39, midVX);

      // Coluna direita: desvio + níveis
      const rX = ML + colW * 2 + 6;
      const rVX = rX + colW * 0.72;

      doc.font(FONT_BOLD).fontSize(7.5).fillColor("#e53e3e")
        .text("DESVIO DO PERFIL", rX, qY)
        .text(`${payload.desvioPerfil.qtd}`, rVX - 30, qY)
        .text(`(${payload.desvioPerfil.perc.toFixed(0)}%)`, rVX, qY);

      doc.fillColor("#333333");
      const nivEntries: [string, number][] = [
        ["Cuidados Mínimos (%)", payload.niveisPct.minimos],
        ["Cuidados Intermediários (%)", payload.niveisPct.intermediarios],
        ["Alta Dependência (%)", payload.niveisPct.altaDependencia],
        ["Semi-Intensivo (%)", payload.niveisPct.semiIntensivos],
        ["Intensivos (%)", payload.niveisPct.intensivos],
      ];
      nivEntries.forEach(([label, val], i) => {
        kvLine(label, `${val.toFixed(0)}%`, rX, qY + 13 + i * 13, rVX);
      });

      doc.y = qY + 13 * 6 + 8;

      // ── FEED DE COMENTÁRIOS ──
      sectionTitle(doc, "FEED DE COMENTÁRIOS");
      if (payload.comentarios.length === 0) {
        doc.fontSize(7.5).font(FONT_NORMAL).fillColor("#888888")
          .text("Nenhum comentário registrado para este dia.", ML);
      } else {
        payload.comentarios.forEach((c) => {
          if (doc.y + 18 > doc.page.height - doc.page.margins.bottom) doc.addPage();
          doc.fontSize(7.5).font(FONT_BOLD).fillColor("#333333")
            .text(`${c.hora} — ${c.autor}:`, ML, doc.y, { continued: true })
            .font(FONT_NORMAL).text(` ${c.texto}`);
          doc.moveDown(0.15);
        });
      }
      doc.moveDown(0.4);

      // ── TABELA DE LEITOS ──
      sectionTitle(doc, "LEITOS");

      if (payload.leitos.length === 0) {
        doc.fontSize(9).font(FONT_NORMAL).fillColor("#888888")
          .text("Nenhuma avaliação registrada para este dia.", doc.page.margins.left);
        return;
      }

      const headers = [
        { text: "LEITO", width: 48, align: "center" as const },
        { text: "DATA / HORA\nAVALIAÇÃO", width: 78, align: "center" as const },
        { text: "PRONTUÁRIO", width: 70, align: "center" as const },
        { text: "STATUS\nLEITO", width: 62, align: "center" as const },
        { text: "TIPO DE\nCUIDADO", width: 88, align: "center" as const },
        { text: "EVOLUÇÃO", width: 52, align: "center" as const, font: FONT_UNICODE },
        { text: "PONTOS", width: 46, align: "center" as const },
        { text: "AVALIADOR", width: 100, align: "left" as const },
        { text: "JUSTIFICATIVA", width: pageW - 48 - 78 - 70 - 62 - 88 - 52 - 46 - 100, align: "left" as const },
      ];

      const rows = payload.leitos.map((l) => [
        l.numero,
        l.dataHoraAvaliacao,
        l.prontuario,
        l.statusLeito,
        l.tipoCuidado,
        l.evolucao,
        l.pontos,
        l.avaliador,
        l.justificativa,
      ]);

      generateTable(doc, headers, rows, { headerHeight: 22, dynamicRowHeight: true });
    },
    { landscape: true }
  );
}

// ─── Grau de Complexidade ───────────────────────────────────────────────────

export interface GrauComplexidadePayload {
  unidade: string;
  periodo: string;      // e.g. "01/06/2025 a 31/10/2025"
  scpUtilizado: string;
  meses: string[];      // e.g. ["jun/25", "jul/25", ...]
  dados: Array<{
    totalLeitos: number;
    ocupados: number;
    pendentes: number;
    inativos: number;
    vagos: number;
    minimumCare: number;     // percentage of evaluated
    intermediateCare: number;
    highDependency: number;
    semiIntensive: number;
    intensive: number;
    taxaOcupacao: number;    // percentage of bedCount
  }>;
  medias: {
    totalLeitos: number;
    ocupados: number;
    pendentes: number;
    inativos: number;
    vagos: number;
    minimumCare: number;
    intermediateCare: number;
    highDependency: number;
    semiIntensive: number;
    intensive: number;
    taxaOcupacao: number;
  };
}

export async function pdfGrauComplexidade(
  payload: GrauComplexidadePayload
): Promise<Buffer> {
  const nMeses = payload.meses.length;
  // Use A3 landscape when there are many months to avoid column overflow
  const useA3 = nMeses > 12;
  const pageSize: [number, number] | undefined = useA3 ? [1190.55, 841.89] : undefined;

  return bufferFromDoc(
    "GRAU DE COMPLEXIDADE",
    (doc) => {
      const ML = doc.page.margins.left;
      const pageW = doc.page.width - ML - doc.page.margins.right;

      // ── Info box ──
      const infoY = doc.y;
      const boxH = 44;
      doc.rect(ML, infoY, pageW, boxH).strokeColor("#d9d9d9").lineWidth(0.5).stroke();

      const col1 = ML + 6;
      const col2 = ML + pageW * 0.36;
      const col3 = ML + pageW * 0.70;

      doc.fontSize(7.5).fillColor("#333333");
      doc.font(FONT_BOLD).text("UNIDADE DE INTERNAÇÃO:", col1, infoY + 14, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.unidade}`);
      doc.font(FONT_BOLD).text("PERÍODO:", col2, infoY + 14, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.periodo}`);
      doc.font(FONT_BOLD).text("SCP UTILIZADO:", col3, infoY + 14, { continued: true })
        .font(FONT_NORMAL).text(` ${payload.scpUtilizado}`);

      doc.y = infoY + boxH + 6;

      // Column widths
      const firstColW = useA3 ? 180 : 155;
      const mediaColW = useA3 ? 75 : 62;
      const remainingW = pageW - firstColW - mediaColW;
      const monthColW = nMeses > 0 ? remainingW / nMeses : remainingW;

      const mkHeaders = (firstLabel: string, lastLabel: string) => [
        { text: firstLabel, width: firstColW, align: "left" as const },
        ...payload.meses.map((m) => ({ text: m, width: monthColW, align: "center" as const })),
        { text: lastLabel, width: mediaColW, align: "center" as const },
      ];

      const pct = (v: number) => `${v.toFixed(1)}%`;
      const qtd = (v: number) => Math.round(v).toString();

      // ── GRAU DE COMPLEXIDADE ──────────────────────────────────────────
      sectionTitle(doc, "GRAU DE COMPLEXIDADE");

      const complexRows: string[][] = [
        ["Cuidados Mínimos (%)",       ...payload.dados.map((d) => pct(d.minimumCare)),      pct(payload.medias.minimumCare)],
        ["Cuidados Intermediários (%)", ...payload.dados.map((d) => pct(d.intermediateCare)), pct(payload.medias.intermediateCare)],
        ["Alta Dependência (%)",        ...payload.dados.map((d) => pct(d.highDependency)),   pct(payload.medias.highDependency)],
        ["Semi-Intensivos (%)",         ...payload.dados.map((d) => pct(d.semiIntensive)),    pct(payload.medias.semiIntensive)],
        ["Intensivos (%)",              ...payload.dados.map((d) => pct(d.intensive)),        pct(payload.medias.intensive)],
      ];

      generateTable(doc, mkHeaders("TIPO DE CUIDADOS", "Média (%)"), complexRows, { headerHeight: 22 });
      doc.moveDown(0.5);

      // ── LEITOS DIA ────────────────────────────────────────────────────
      sectionTitle(doc, "LEITOS DIA");

      const leitosRows: string[][] = [
        ["Total leitos dia (Qtd)", ...payload.dados.map((d) => qtd(d.totalLeitos)), qtd(payload.medias.totalLeitos)],
        ["Ocupados",               ...payload.dados.map((d) => qtd(d.ocupados)),   qtd(payload.medias.ocupados)],
        ["Pendentes",              ...payload.dados.map((d) => qtd(d.pendentes)),  qtd(payload.medias.pendentes)],
        ["Inativos",               ...payload.dados.map((d) => qtd(d.inativos)),   qtd(payload.medias.inativos)],
        ["Vagos",                  ...payload.dados.map((d) => qtd(d.vagos)),      qtd(payload.medias.vagos)],
      ];

      generateTable(doc, mkHeaders("LEITOS DIA", "Média"), leitosRows, { headerHeight: 22 });
      doc.moveDown(0.5);

      // ── TAXA DE OCUPAÇÃO ──────────────────────────────────────────────
      sectionTitle(doc, "TAXA DE OCUPAÇÃO");

      const taxaRows: string[][] = [
        ["Taxa de Ocupação (%)", ...payload.dados.map((d) => pct(d.taxaOcupacao)), pct(payload.medias.taxaOcupacao)],
      ];

      generateTable(doc, mkHeaders("TAXA DE OCUPAÇÃO (%)", "Média (%)"), taxaRows, { headerHeight: 22 });
    },
    { landscape: true, pageSize }
  );
}
