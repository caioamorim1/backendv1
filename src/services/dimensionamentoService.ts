import { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { UnidadeNaoInternacao } from "../entities/UnidadeNaoInternacao";
import { AvaliacaoRepository } from "../repositories/avaliacaoRepository";
import { ParametrosUnidade } from "../entities/ParametrosUnidade";
import { ParametrosNaoInternacao } from "../entities/ParametrosNaoInternacao";

import {
  AnaliseInternacaoResponse,
  AnaliseNaoInternacaoResponse,
  LinhaAnaliseFinanceira,
  GrupoCargosNaoInternacao,
} from "../dto/dimensionamento.dto";
import { HistoricoOcupacao } from "../entities/HistoricoOcupacao";
import { StatusLeito } from "../entities/Leito";
import { LeitosStatus } from "../entities/LeitosStatus";
import { HistoricoLeitosStatus } from "../entities/HistoricoLeitosStatus";

export class DimensionamentoService {
  private avaliacaoRepo: AvaliacaoRepository;

  constructor(private ds: DataSource) {
    this.avaliacaoRepo = new AvaliacaoRepository(ds);
  }

  // Lógica para Unidades de INTERNAÇÃO
  async calcularParaInternacao(
    unidadeId: string,
    inicio?: string,
    fim?: string
  ): Promise<AnaliseInternacaoResponse> {
    const unidadeRepo = this.ds.getRepository(UnidadeInternacao);
    const parametrosRepo = this.ds.getRepository(ParametrosUnidade);

    const historicoRepo = this.ds.getRepository(HistoricoOcupacao);

    const unidade = await unidadeRepo.findOne({
      where: { id: unidadeId },
      relations: ["leitos", "cargosUnidade", "cargosUnidade.cargo"],
    });

    if (!unidade) {
      throw new Error("Unidade de internação não encontrada");
    }

    // --- ETAPA 1: BUSCAR INPUTS ---
    const parametros = await parametrosRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

    const ist = Number(parametros?.ist ?? 0.15);
    const equipeComRestricoes = parametros?.aplicarIST ?? false;
    const diasTrabalhoSemana = parametros?.diasSemana ?? 7;

    // --- ETAPA 2: DEFINIÇÃO DO PERÍODO ---
    const ZONE = "America/Sao_Paulo";
    const dataAtual = DateTime.now().setZone(ZONE);

    let inicioPeriodo: DateTime;
    let fimPeriodo: DateTime;

    // Parse das datas de entrada (YYYY-MM-DD)
    if (inicio && fim) {
      inicioPeriodo = DateTime.fromISO(inicio, { zone: ZONE }).startOf("day");
      fimPeriodo = DateTime.fromISO(fim, { zone: ZONE }).endOf("day");
    } else if (inicio) {
      inicioPeriodo = DateTime.fromISO(inicio, { zone: ZONE }).startOf("day");
      fimPeriodo = inicioPeriodo.endOf("day");
    } else if (fim) {
      fimPeriodo = DateTime.fromISO(fim, { zone: ZONE }).endOf("day");
      inicioPeriodo = fimPeriodo.startOf("day");
    } else {
      // Default: primeiro dia do mês até hoje
      inicioPeriodo = dataAtual.startOf("month");
      fimPeriodo = dataAtual.endOf("day");
    }

    // Garantir ordem correta
    if (inicioPeriodo > fimPeriodo) {
      [inicioPeriodo, fimPeriodo] = [fimPeriodo, inicioPeriodo];
    }

    // Calcular dias no período
    const diasNoPeriodo =
      Math.floor(fimPeriodo.diff(inicioPeriodo, "days").days) + 1;

    // Converter para Date para queries do TypeORM
    const inicioPeriodoDate = inicioPeriodo.toJSDate();
    const fimPeriodoDate = fimPeriodo.toJSDate();

    let totalPacientesMedio = 0;
    let mediaDiariaClassificacao: { [key: string]: number } = {};
    let somaTotalClassificacao: { [key: string]: number } = {};
    let taxaOcupacaoPeriodo = 0;

    // PRIMEIRO: verificar se existem históricos para essa unidade (em qualquer período)
    const totalHistoricos = await historicoRepo
      .createQueryBuilder("h")
      .where("h.unidadeId = :unidadeId", { unidadeId })
      .getCount();

    // Busca todos os registros de histórico que se sobrepõem ao período
    const historicosDoMes = await historicoRepo
      .createQueryBuilder("h")
      .leftJoinAndSelect("h.leito", "leito")
      .where("h.unidadeId = :unidadeId", { unidadeId })
      .andWhere(
        "(h.inicio <= :fimPeriodo AND (h.fim IS NULL OR h.fim >= :inicioPeriodo))",
        {
          inicioPeriodo: inicioPeriodoDate,
          fimPeriodo: fimPeriodoDate,
        }
      )
      .getMany();

    // BUSCAR AVALIAÇÕES ATIVAS DO ÚLTIMO DIA DO PERÍODO
    const dataUltimoDia = fimPeriodo.toISODate(); // YYYY-MM-DD
    const avaliacoesHoje = await this.avaliacaoRepo.listarPorDia({
      data: dataUltimoDia!,
      unidadeId: unidadeId,
    });

    // Construir conjunto de leitos que já possuem histórico no período para evitar double-count
    const leitosComHistorico = new Set(
      historicosDoMes.map((h) => h.leito?.id).filter(Boolean) as string[]
    );

    if (diasNoPeriodo > 0) {
      if (historicosDoMes.length === 0 && avaliacoesHoje.length === 0) {
        console.warn(
          "Nenhum histórico ou avaliação ativa encontrada para o período"
        );
      }

      let totalSomaDiariaPacientes = 0;
      let diasComDados = 0;

      // Itera por cada dia do período
      for (let i = 0; i < diasNoPeriodo; i++) {
        const diaAtual = inicioPeriodo.plus({ days: i });
        const inicioDia = diaAtual.startOf("day").toJSDate();
        const fimDia = diaAtual.endOf("day").toJSDate();
        const isUltimoDia = i === diasNoPeriodo - 1;

        let pacientesNesteDia = 0;

        // Conta quantos registros de histórico estavam ativos neste dia
        for (const hist of historicosDoMes) {
          const inicioHist = new Date(hist.inicio).getTime();
          const fimHist = hist.fim ? new Date(hist.fim).getTime() : Infinity;

          if (
            inicioHist <= fimDia.getTime() &&
            fimHist >= inicioDia.getTime()
          ) {
            pacientesNesteDia += 1;
            totalSomaDiariaPacientes += 1;
            if (hist.classificacao) {
              somaTotalClassificacao[hist.classificacao] =
                (somaTotalClassificacao[hist.classificacao] || 0) + 1;
            }
          }
        }

        // Se for o último dia, adicionar as avaliações ativas
        if (isUltimoDia && avaliacoesHoje.length > 0) {
          for (const aval of avaliacoesHoje) {
            const leitoIdAval = aval.leito?.id ?? null;
            if (leitoIdAval && leitosComHistorico.has(leitoIdAval)) {
              continue;
            }

            pacientesNesteDia += 1;
            totalSomaDiariaPacientes += 1;
            if (aval.classificacao) {
              somaTotalClassificacao[aval.classificacao] =
                (somaTotalClassificacao[aval.classificacao] || 0) + 1;
            }
          }
        }

        if (pacientesNesteDia > 0) {
          diasComDados += 1;
        }
      }

      // Calcula a média dividindo a soma total pelo número de dias
      totalPacientesMedio = totalSomaDiariaPacientes / diasNoPeriodo;

      // IMPORTANTE: mediaDiariaClassificacao é a MÉDIA diária de cada tipo
      // mas distribuicaoTotalClassificacao é o TOTAL do mês (soma)
      for (const key in somaTotalClassificacao) {
        mediaDiariaClassificacao[key] =
          somaTotalClassificacao[key] / diasNoPeriodo;
      }

      const numeroLeitos = unidade.leitos.length;
      taxaOcupacaoPeriodo =
        numeroLeitos > 0 ? totalPacientesMedio / numeroLeitos : 0;
    } else {
      console.error("Erro: diasNoPeriodo inválido:", diasNoPeriodo);
    }

    // === MÉTRICA: % LEITOS AVALIADOS (OCUPADOS) NO PERÍODO ===

    const totalLeitos = unidade.leitos.length;
    let leitosOcupados = 0;
    let leitosVagos = 0;
    let leitosPendentes = 0;
    let leitosInativos = 0;

    // Verificar se estamos analisando APENAS o dia de hoje
    const isApenasHoje =
      diasNoPeriodo === 1 && fimPeriodo.hasSame(dataAtual, "day");

    if (isApenasHoje) {
      // Período de 1 dia apenas (hoje) - usar dados da tabela leitos_status

      const leitosStatusRepo = this.ds.getRepository(LeitosStatus);
      const leitosStatus = await leitosStatusRepo.findOne({
        where: { unidade: { id: unidadeId } },
      });

      if (leitosStatus) {
        leitosOcupados = leitosStatus.evaluated;
        leitosInativos = leitosStatus.inactive;
        leitosVagos = leitosStatus.vacant;
      } else {
        leitosOcupados = 0;
        leitosPendentes = 0;
        leitosInativos = 0;

        // Contar por status
        for (const leito of unidade.leitos) {
          if (leito.status === StatusLeito.INATIVO) {
            leitosInativos++;
          } else if (leito.status === StatusLeito.PENDENTE) {
            leitosPendentes++;
          }
        }

        // Contar ocupados do histórico atual
        const leitosOcupadosSet = new Set<string>();
        for (const hist of historicosDoMes) {
          if (hist.leito?.id) leitosOcupadosSet.add(hist.leito.id);
        }
        for (const aval of avaliacoesHoje) {
          if (aval.leito?.id) leitosOcupadosSet.add(aval.leito.id);
        }
        leitosOcupados = leitosOcupadosSet.size;

        // Vagos = Total - Pendentes - Inativos - Ocupados
        leitosVagos =
          totalLeitos - leitosPendentes - leitosInativos - leitosOcupados;
      }
    } else {
      // Período passado - buscar dados históricos salvos

      const historicoLeitosStatusRepo = this.ds.getRepository(
        HistoricoLeitosStatus
      );

      // Query timezone-aware para buscar registros do período
      const inicioStr = inicioPeriodo.toISODate()!;
      const fimStr = fimPeriodo.toISODate()!;

      const historicosStatus = await historicoLeitosStatusRepo
        .createQueryBuilder("hls")
        .leftJoinAndSelect("hls.unidade", "unidade")
        .where("unidade.id = :unidadeId", { unidadeId })
        .andWhere(
          "(hls.data AT TIME ZONE 'America/Sao_Paulo')::DATE >= :inicio::DATE",
          { inicio: inicioStr }
        )
        .andWhere(
          "(hls.data AT TIME ZONE 'America/Sao_Paulo')::DATE <= :fim::DATE",
          { fim: fimStr }
        )
        .orderBy("hls.data", "DESC")
        .getMany();

      // Log detalhado dos registros encontrados
      if (historicosStatus.length > 0) {
        historicosStatus.forEach((h, index) => {
          const dataSP = DateTime.fromJSDate(h.data, { zone: "UTC" })
            .setZone("America/Sao_Paulo")
            .toFormat("dd/MM/yyyy HH:mm:ss");
        });
      }

      if (historicosStatus.length > 0) {
        // CORREÇÃO: Usar TOTAL (soma) ao invés de média
        let somaOcupados = 0;
        let somaVagos = 0;
        let somaInativos = 0;

        historicosStatus.forEach((h) => {
          somaOcupados += h.evaluated;
          somaVagos += h.vacant;
          somaInativos += h.inactive;
        });

        // Usar o total (soma)
        leitosOcupados = somaOcupados;
        leitosVagos = somaVagos;
        leitosInativos = somaInativos;
      } else {
        leitosOcupados = 0;
        leitosVagos = 0;
        leitosInativos = 0;
        leitosPendentes = 0;
      }
    }

    // Calcular total de leitos-dia (total de leitos × dias no período)
    const totalLeitosDia = totalLeitos * diasNoPeriodo;

    // Calcular percentual de leitos avaliados do período
    // Soma total de avaliações (vagos + ocupados + inativos) dividido pelo total de leitos-dia
    const percentualLeitosAvaliados =
      totalLeitosDia > 0
        ? Number(
            (
              ((leitosVagos + leitosOcupados + leitosInativos) /
                totalLeitosDia) *
              100
            ).toFixed(2)
          )
        : 0;

    // taxaOcupacaoPeriodo já foi calculado antes como fração (0..1)
    // Não precisa recalcular

    // --- ETAPA 3: CALCULAR TOTAL DE HORAS DE ENFERMAGEM (THE) ---
    // Mapeamento de classificações do banco para horas de enfermagem
    const horasPorClassificacao: { [key: string]: number } = {
      MINIMOS: 4, // PCM - Pacientes de Cuidados Mínimos
      INTERMEDIARIOS: 6, // PCI - Pacientes de Cuidados Intermediários
      ALTA_DEPENDENCIA: 10, // PADC - Pacientes de Alta Dependência de Cuidados
      SEMI_INTENSIVOS: 10, // PCSI - Pacientes de Cuidados Semi-Intensivos
      INTENSIVOS: 18, // PCIt - Pacientes de Cuidados Intensivos
    };

    const totalHorasEnfermagem = Object.keys(somaTotalClassificacao).reduce(
      (total, key) => {
        const horas = horasPorClassificacao[key] ?? 0;
        const quantidadeTotal = somaTotalClassificacao[key];
        const horasClassificacao = horas * quantidadeTotal;

        return total + horasClassificacao;
      },
      0
    );

    // --- ETAPA 4: CALCULAR PERCENTUAL DA EQUIPE (ENF / TEC) ---
    // Agora: usar o TOTAL DE HORAS por classificação (não a média diária)
    // Total de horas por classificação já tem as "horas por paciente" multiplicadas pelo total mensal de pacientes daquela classificação
    const hMinimos =
      (horasPorClassificacao["MINIMOS"] || 0) *
      (somaTotalClassificacao["MINIMOS"] || 0);
    const hIntermediarios =
      (horasPorClassificacao["INTERMEDIARIOS"] || 0) *
      (somaTotalClassificacao["INTERMEDIARIOS"] || 0);
    const hAltaDependencia =
      (horasPorClassificacao["ALTA_DEPENDENCIA"] || 0) *
      (somaTotalClassificacao["ALTA_DEPENDENCIA"] || 0);
    const hSemiIntensivos =
      (horasPorClassificacao["SEMI_INTENSIVOS"] || 0) *
      (somaTotalClassificacao["SEMI_INTENSIVOS"] || 0);
    const hIntensivos =
      (horasPorClassificacao["INTENSIVOS"] || 0) *
      (somaTotalClassificacao["INTENSIVOS"] || 0);

    // Equivalente do S (PCM + PCI), mas em HORAS totais
    const S = hMinimos + hIntermediarios;

    let percentualEnfermeiro = 0.52;
    let criterioAplicado = "Padrão (0.52)";

    // Critério 1 (agora com HORAS): if (S >= PADC and S >= PCSI and S >= PCIt) then f = 0.33

    if (S >= hAltaDependencia && S >= hSemiIntensivos && S >= hIntensivos) {
      percentualEnfermeiro = 0.33;
      criterioAplicado = "S (PCM+PCI) predominante (0.33)";
    } else {
      // Critério 2 (HORAS): else if (PADC > S and PADC >= PCSI and PADC >= PCIt) then f = 0.37

      if (
        hAltaDependencia > S &&
        hAltaDependencia >= hSemiIntensivos &&
        hAltaDependencia >= hIntensivos
      ) {
        percentualEnfermeiro = 0.37;
        criterioAplicado = "ALTA_DEPENDENCIA (PADC) predominante (0.37)";
      } else {
        // Critério 3 (HORAS): else if (PCSI > S and PCSI > PADC and PCSI >= PCIt) then f = 0.42

        if (
          hSemiIntensivos > S &&
          hSemiIntensivos > hAltaDependencia &&
          hSemiIntensivos >= hIntensivos
        ) {
          percentualEnfermeiro = 0.42;
          criterioAplicado = "SEMI_INTENSIVOS (PCSI) predominante (0.42)";
        } else {
          // Critério 4: else f = 0.52 (padrão)

          percentualEnfermeiro = 0.52;
          criterioAplicado = "Padrão (0.52)";
        }
      }
    }

    const percentualTecnico = 1 - percentualEnfermeiro;

    // --- ETAPA 5: CALCULAR FATOR "KM" PARA CADA CARGO ---
    // Priorizar carga horária dos parâmetros, senão buscar dos cargos, senão usar 36h como padrão
    const cargaHorariaEnfermeiro =
      parametros?.cargaHorariaEnfermeiro ??
      parseFloat(
        unidade.cargosUnidade?.find((c) =>
          c.cargo.nome.toLowerCase().includes("enfermeiro")
        )?.cargo.carga_horaria || "36"
      );
    const cargaHorariaTecnico =
      parametros?.cargaHorariaTecnico ??
      parseFloat(
        unidade.cargosUnidade?.find((c) =>
          c.cargo.nome.toLowerCase().includes("técnico")
        )?.cargo.carga_horaria || "36"
      );
    const fatorRestricao = equipeComRestricoes ? 1.1 : 1.0;

    const kmEnfermeiro =
      cargaHorariaEnfermeiro > 0
        ? (diasTrabalhoSemana / cargaHorariaEnfermeiro) * (fatorRestricao + ist)
        : 0;

    const kmTecnico =
      cargaHorariaTecnico > 0
        ? (diasTrabalhoSemana / cargaHorariaTecnico) * (fatorRestricao + ist)
        : 0;

    // --- ETAPA 6: CALCULAR QUANTIDADE DE PESSOAL (QP) FINAL ---
    const horasEnfermeiroNecessarias =
      totalHorasEnfermagem * percentualEnfermeiro;
    const horasTecnicoNecessarias = totalHorasEnfermagem * percentualTecnico;

    const qpEnfermeirosExato = kmEnfermeiro * horasEnfermeiroNecessarias;
    const qpTecnicosExato = kmTecnico * horasTecnicoNecessarias;

    const qpEnfermeiros = Math.round(qpEnfermeirosExato);
    const qpTecnicos = Math.round(qpTecnicosExato);

    // --- Montar a resposta da API ---
    const agregados = {
      periodo: {
        inicio: inicioPeriodo.toISO()!,
        fim: fimPeriodo.toISO()!,
        dias: diasNoPeriodo,
        origem: (inicio || fim ? "intervalo_customizado" : "mes_corrente") as
          | "intervalo_customizado"
          | "mes_corrente",
        parametrosEntrada: { inicio: inicio || null, fim: fim || null },
      },
      totalLeitosDia: unidade.leitos.length * diasNoPeriodo,
      totalAvaliacoes: Math.round(totalPacientesMedio * diasNoPeriodo),
      // Taxa de ocupação: leitos ocupados / total de leitos (fração 0..1)
      taxaOcupacaoPeriodo,
      // Taxa de ocupação em porcentagem 0..100
      taxaOcupacaoPeriodoPercent: Number(
        (taxaOcupacaoPeriodo * 100).toFixed(2)
      ),
      // Percentual de leitos avaliados: leitos ocupados / leitos vagos
      percentualLeitosAvaliados,
      leitosOcupados,
      leitosVagos,
      leitosInativos,
      totalLeitos,
      distribuicaoTotalClassificacao: somaTotalClassificacao,
      // Constante de Marinho (KM)
      kmEnfermeiro,
      kmTecnico,
      // Porcentagens de distribuição
      percentualEnfermeiro,
      percentualTecnico,
      percentualEnfermeiroPercent: Number(
        (percentualEnfermeiro * 100).toFixed(1)
      ),
      percentualTecnicoPercent: Number((percentualTecnico * 100).toFixed(1)),
    };

    const valorHorasExtras = parseFloat(
      unidade.horas_extra_reais?.replace(",", ".") || "0"
    );

    const tabela = (unidade.cargosUnidade || []).map(
      (cu): LinhaAnaliseFinanceira => {
        const cargoNomeLower = cu.cargo.nome.toLowerCase();
        const isEnfermeiro = cargoNomeLower.includes("enfermeiro");
        const isTecnico =
          cargoNomeLower.includes("técnico em enfermagem") ||
          cargoNomeLower.includes("tecnico em enfermagem") ||
          cargoNomeLower.includes("técnico enfermagem") ||
          cargoNomeLower.includes("tec enfermagem") ||
          cargoNomeLower.includes("tec. enfermagem") ||
          cargoNomeLower.includes("tec. em enfermagem") ||
          cargoNomeLower.includes("técnico de enfermagem");
        const isScp = isEnfermeiro || isTecnico;

        let quantidadeProjetada = cu.quantidade_funcionarios;
        if (isEnfermeiro) {
          quantidadeProjetada = qpEnfermeiros;
        } else if (isTecnico) {
          quantidadeProjetada = qpTecnicos;
        }

        const salario = parseFloat(cu.cargo.salario?.replace(",", ".") || "0");
        const adicionais = parseFloat(
          cu.cargo.adicionais_tributos?.replace(",", ".") || "0"
        );
        const cargaHoraria = parseFloat(cu.cargo.carga_horaria || "0");

        return {
          cargoId: cu.cargo.id,
          cargoNome: cu.cargo.nome,
          isScpCargo: isScp,
          salario,
          adicionais,
          valorHorasExtras,
          cargaHoraria,
          custoPorFuncionario: salario + adicionais + valorHorasExtras,
          quantidadeAtual: cu.quantidade_funcionarios,
          quantidadeProjetada: quantidadeProjetada,
        };
      }
    );
    const response = { agregados, tabela };

    // Debug final: imprime amostras para validação
    try {
      const finalDump = {
        agregados,
        tabelaSummary: tabela.map((t) => ({
          cargoNome: t.cargoNome,
          quantidadeAtual: t.quantidadeAtual,
          quantidadeProjetada: t.quantidadeProjetada,
        })),
      };
    } catch (err) {
      console.warn("Falha ao gerar final debug dump:", err);
    }

    return response;
  }

  // Lógica para Unidades de NÃO INTERNAÇÃO
  async calcularParaNaoInternacao(
    unidadeId: string
  ): Promise<AnaliseNaoInternacaoResponse> {
    const unidadeRepo = this.ds.getRepository(UnidadeNaoInternacao);
    const unidade = await unidadeRepo.findOne({
      where: { id: unidadeId },
      relations: [
        "sitiosFuncionais",
        "sitiosFuncionais.cargosSitio",
        "sitiosFuncionais.cargosSitio.cargoUnidade",
        "sitiosFuncionais.cargosSitio.cargoUnidade.cargo",
        "sitiosFuncionais.distribuicoes",
      ],
    });

    if (!unidade) {
      throw new Error("Unidade de não internação não encontrada");
    }

    const valorHorasExtras = parseFloat(
      unidade.horas_extra_reais?.replace(",", ".") || "0"
    );

    // === ETAPA 1: PARÂMETROS DA UNIDADE ===
    const parametrosRepo = this.ds.getRepository(ParametrosNaoInternacao);
    const parametros = await parametrosRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

    const jornadaEnfermeiro = parametros?.jornadaSemanalEnfermeiro ?? 36;
    const jornadaTecnico = parametros?.jornadaSemanalTecnico ?? 36;
    const indiceSeguranca = Number(parametros?.indiceSegurancaTecnica ?? 0);
    const equipeComRestricao = parametros?.equipeComRestricao ?? false;
    const diasFuncionamentoMensal = parametros?.diasFuncionamentoMensal ?? 30;
    const diasSemana = parametros?.diasSemana ?? 5;
    const periodoTrabalho =
      diasSemana === 7 ? 6 : diasSemana === 6 ? 5 : diasSemana === 5 ? 4 : 0;

    const fatorBase = equipeComRestricao ? 1.1 : 1.0;

    const kmEnfermeiro =
      jornadaEnfermeiro > 0
        ? (periodoTrabalho / jornadaEnfermeiro) * (fatorBase + indiceSeguranca)
        : 0;

    const kmTecnico =
      jornadaTecnico > 0
        ? (periodoTrabalho / jornadaTecnico) * (fatorBase + indiceSeguranca)
        : 0;

    // === ETAPA 2: DISTRIBUIÇÕES E CÁLCULOS POR SÍTIO ===
    const distribDetalhada: {
      sitioId: string;
      sitioNome?: string;
      categoria: "ENF" | "TEC";
      totalSemana: number;
      totalFimSemana: number;
      total: number;
    }[] = [];

    let totalSitiosEnfermeiro = 0;
    let totalSitiosTecnico = 0;

    const tabela: GrupoCargosNaoInternacao[] = (
      unidade.sitiosFuncionais || []
    ).map((sitio, index) => {
      let totalEnf = 0;
      let totalTec = 0;

      for (const dist of sitio.distribuicoes || []) {
        const segSexManha = dist.segSexManha ?? 0;
        const segSexTarde = dist.segSexTarde ?? 0;
        const segSexNoite1 = dist.segSexNoite1 ?? 0;
        const segSexNoite2 = dist.segSexNoite2 ?? 0;
        const sabDomManha = dist.sabDomManha ?? 0;
        const sabDomTarde = dist.sabDomTarde ?? 0;
        const sabDomNoite1 = dist.sabDomNoite1 ?? 0;
        const sabDomNoite2 = dist.sabDomNoite2 ?? 0;

        const totalSemana =
          (segSexManha + segSexTarde + segSexNoite1 + segSexNoite2) * 5;
        const totalFimSemana =
          (sabDomManha + sabDomTarde + sabDomNoite1 + sabDomNoite2) * 2;
        const total = totalSemana + totalFimSemana;

        const categoria = (dist.categoria || "").toUpperCase();
        if (categoria.includes("ENF")) totalEnf += total;
        if (categoria.includes("TEC")) totalTec += total;

        distribDetalhada.push({
          sitioId: sitio.id,
          sitioNome: sitio.nome,
          categoria: categoria as "ENF" | "TEC",
          totalSemana,
          totalFimSemana,
          total,
        });
      }

      // 🔹 Cálculo projetado individual por sítio
      const pessoalEnfermeiroBruto = kmEnfermeiro * totalEnf;
      const pessoalTecnicoBruto = kmTecnico * totalTec;

      const pessoalEnfermeiroArredondado = Math.round(pessoalEnfermeiroBruto);
      const pessoalTecnicoArredondado = Math.round(pessoalTecnicoBruto);

      // Atualiza os cargos do sítio
      const cargosDoSitio: LinhaAnaliseFinanceira[] = (
        sitio.cargosSitio || []
      ).map((cs) => {
        const cargo = cs.cargoUnidade.cargo;
        const cargoNomeLower = cargo.nome.toLowerCase();

        const isEnfermeiro = cargoNomeLower.includes("enfermeiro");
        const isTecnico =
          cargoNomeLower.includes("técnico em enfermagem") ||
          cargoNomeLower.includes("tecnico em enfermagem") ||
          cargoNomeLower.includes("técnico enfermagem") ||
          cargoNomeLower.includes("tec enfermagem") ||
          cargoNomeLower.includes("tec. enfermagem") ||
          cargoNomeLower.includes("tec. em enfermagem") ||
          cargoNomeLower.includes("técnico de enfermagem");

        const salario = parseFloat(cargo.salario?.replace(",", ".") || "0");
        const adicionais = parseFloat(
          cargo.adicionais_tributos?.replace(",", ".") || "0"
        );
        const cargaHoraria = parseFloat(cargo.carga_horaria || "0");
        const custoPorFuncionario = salario + adicionais + valorHorasExtras;
        const quantidadeAtual = cs.quantidade_funcionarios ?? 0;

        const quantidadeProjetada = isEnfermeiro
          ? pessoalEnfermeiroArredondado
          : isTecnico
            ? pessoalTecnicoArredondado
            : quantidadeAtual;

        return {
          cargoId: cargo.id,
          cargoNome: cargo.nome,
          isScpCargo: isEnfermeiro || isTecnico,
          salario,
          adicionais,
          valorHorasExtras,
          custoPorFuncionario,
          cargaHoraria,
          quantidadeAtual,
          quantidadeProjetada,
        };
      });

      totalSitiosEnfermeiro += totalEnf;
      totalSitiosTecnico += totalTec;

      return {
        id: sitio.id,
        nome: sitio.nome || "Sítio Sem Nome",
        cargos: cargosDoSitio,
      };
    });

    // === ETAPA 3: RESUMO FINAL (mantendo formato original) ===
    const pessoalEnfermeiro = kmEnfermeiro * totalSitiosEnfermeiro;
    const pessoalTecnico = kmTecnico * totalSitiosTecnico;

    const resumoDimensionamento = {
      periodoTrabalho,
      kmEnfermeiro: Number(kmEnfermeiro.toFixed(4)),
      kmTecnico: Number(kmTecnico.toFixed(4)),
      totalSitiosEnfermeiro,
      totalSitiosTecnico,
      pessoalEnfermeiro: Number(pessoalEnfermeiro.toFixed(2)),
      pessoalTecnico: Number(pessoalTecnico.toFixed(2)),
      pessoalEnfermeiroArredondado: Math.round(pessoalEnfermeiro),
      pessoalTecnicoArredondado: Math.round(pessoalTecnico),
    };

    const resumoDistribuicao = {
      porSitio: distribDetalhada,
      totais: {
        enfermeiro: totalSitiosEnfermeiro,
        tecnico: totalSitiosTecnico,
      },
    };

    return {
      tabela,
      horasExtrasProjetadas: parseFloat(unidade.horas_extra_projetadas || "0"),
      parametros: {
        jornadaSemanalEnfermeiro: jornadaEnfermeiro,
        jornadaSemanalTecnico: jornadaTecnico,
        indiceSegurancaTecnica: indiceSeguranca,
        equipeComRestricao,
        diasFuncionamentoMensal,
        diasSemana,
        periodoTrabalho,
      },
      distribuicao: resumoDistribuicao,
      dimensionamento: resumoDimensionamento,
    };
  }
}
