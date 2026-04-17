import { DataSource } from "typeorm";
import { DateTime } from "luxon";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { UnidadeNaoInternacao } from "../entities/UnidadeNaoInternacao";
import { AvaliacaoRepository } from "../repositories/avaliacaoRepository";
import { ParametrosUnidade } from "../entities/ParametrosUnidade";
import { ParametrosNaoInternacao } from "../entities/ParametrosNaoInternacao";
import { TaxaOcupacaoCustomizada } from "../entities/TaxaOcupacaoCustomizada";
import { DimensionamentoNaoInternacao } from "../entities/DimensionamentoNaoInternacao";

import {
  AnaliseInternacaoResponse,
  AnaliseNaoInternacaoResponse,
  LinhaAnaliseFinanceira,
  GrupoCargosNaoInternacao,
} from "../dto/dimensionamento.dto";
import { StatusLeito } from "../entities/Leito";
import { LeitosStatus } from "../entities/LeitosStatus";
import { HistoricoLeitosStatus } from "../entities/HistoricoLeitosStatus";

export class DimensionamentoService {
  private avaliacaoRepo: AvaliacaoRepository;

  constructor(private ds: DataSource) {
    this.avaliacaoRepo = new AvaliacaoRepository(ds);
  }

  // Parse de campos string do banco que podem conter 'null', '', ou formato BR (vírgula decimal)
  // JSON.stringify(NaN) === 'null', por isso qualquer NaN precisa ser tratado como 0
  private sp(val: string | null | undefined, fallback = 0): number {
    if (!val || val === "null") return fallback;
    const n = parseFloat(val.replace(",", "."));
    return isNaN(n) ? fallback : n;
  }

  // Lógica para Unidades de INTERNAÇÃO
  async calcularParaInternacao(
    unidadeId: string,
    inicio?: string,
    fim?: string
  ): Promise<AnaliseInternacaoResponse> {
    const unidadeRepo = this.ds.getRepository(UnidadeInternacao);
    const parametrosRepo = this.ds.getRepository(ParametrosUnidade);

    const unidade = await unidadeRepo.findOne({
      where: { id: unidadeId },
      relations: [
        "leitos",
        "cargosUnidade",
        "cargosUnidade.cargo",
        "scpMetodo",
      ],
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

    // Buscar taxa de ocupação customizada (se existir)
    const taxaOcupacaoRepo = this.ds.getRepository(TaxaOcupacaoCustomizada);
    const taxaCustomizada = await taxaOcupacaoRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

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

    let totalPacientesMedio = 0;
    let mediaDiariaClassificacao: { [key: string]: number } = {};
    let somaTotalClassificacao: { [key: string]: number } = {
      MINIMOS: 0,
      INTERMEDIARIOS: 0,
      ALTA_DEPENDENCIA: 0,
      SEMI_INTENSIVOS: 0,
      INTENSIVOS: 0,
    };
    let taxaOcupacaoPeriodo = 0;

    // === FONTE DE DADOS: historicos_leitos_status ===
    // Cada registro representa o snapshot do final do dia para a unidade.
    // O job noturno reseta os leitos para PENDENTE toda noite, forçando reavaliação diária,
    // o que garante 1 registro por dia — sem gaps no período.

    const totalLeitos = unidade.leitos.length;
    let leitosOcupados = 0;
    let leitosVagos = 0;
    let leitosPendentes = 0;
    let leitosInativos = 0;

    const isApenasHoje =
      diasNoPeriodo === 1 && fimPeriodo.hasSame(dataAtual, "day");

    if (isApenasHoje) {
      // Hoje: usa leitos_status (snapshot ao vivo atualizado a cada evento)
      const leitosStatusRepo = this.ds.getRepository(LeitosStatus);
      const leitosStatus = await leitosStatusRepo.findOne({
        where: { unidade: { id: unidadeId } },
      });

      for (const leito of unidade.leitos) {
        if (leito.status === StatusLeito.PENDENTE) leitosPendentes++;
        if (leito.status === StatusLeito.INATIVO) leitosInativos++;
      }

      if (leitosStatus) {
        leitosOcupados = leitosStatus.evaluated;
        leitosInativos = leitosStatus.inactive;
        leitosVagos = leitosStatus.vacant;

        somaTotalClassificacao.MINIMOS = leitosStatus.minimumCare;
        somaTotalClassificacao.INTERMEDIARIOS = leitosStatus.intermediateCare;
        somaTotalClassificacao.ALTA_DEPENDENCIA = leitosStatus.highDependency;
        somaTotalClassificacao.SEMI_INTENSIVOS = leitosStatus.semiIntensive;
        somaTotalClassificacao.INTENSIVOS = leitosStatus.intensive;
      } else {
        // Fallback: sem registro ainda hoje, tudo zero
        leitosOcupados = 0;
        leitosVagos = totalLeitos - leitosPendentes - leitosInativos;
      }

      const totalPacientesHoje = leitosOcupados;
      totalPacientesMedio = totalPacientesHoje;
      for (const key in somaTotalClassificacao) {
        mediaDiariaClassificacao[key] = somaTotalClassificacao[key];
      }
      taxaOcupacaoPeriodo =
        totalLeitos > 0 ? totalPacientesMedio / totalLeitos : 0;
    } else {
      // Período passado: usa historicos_leitos_status como fonte única.
      // Cada campo (evaluated, vacant, inactive, minimumCare, etc.) representa
      // os valores reais do final daquele dia — sem necessidade de loop ou média manual.
      const historicoLeitosStatusRepo = this.ds.getRepository(
        HistoricoLeitosStatus
      );

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
        .orderBy("hls.data", "ASC")
        .getMany();

      if (historicosStatus.length > 0) {
        let somaEvaluated = 0;
        let somaVagos = 0;
        let somaInativos = 0;

        historicosStatus.forEach((h) => {
          somaEvaluated += h.evaluated;
          somaVagos += h.vacant;
          somaInativos += h.inactive;
          somaTotalClassificacao.MINIMOS += h.minimumCare;
          somaTotalClassificacao.INTERMEDIARIOS += h.intermediateCare;
          somaTotalClassificacao.ALTA_DEPENDENCIA += h.highDependency;
          somaTotalClassificacao.SEMI_INTENSIVOS += h.semiIntensive;
          somaTotalClassificacao.INTENSIVOS += h.intensive;
        });

        leitosOcupados = somaEvaluated;
        leitosVagos = somaVagos;
        leitosInativos = somaInativos;

        // Leito-dias sem nenhum snapshot (dias sem registro em historicos_leitos_status)
        // = dias em que o job não rodou, unidade não existia, ou nurses não avaliaram nada
        // A conta fecha: ocupados + vagos + inativos + pendentes = totalLeitosDia
        const totalLeitosDiaCalculado = totalLeitos * diasNoPeriodo;
        const contabilizados = leitosOcupados + leitosVagos + leitosInativos;
        leitosPendentes = Math.max(0, totalLeitosDiaCalculado - contabilizados);

        totalPacientesMedio = somaEvaluated / diasNoPeriodo;
        for (const key in somaTotalClassificacao) {
          mediaDiariaClassificacao[key] =
            somaTotalClassificacao[key] / diasNoPeriodo;
        }
      } else {
        // Nenhum snapshot para o período inteiro — todos os leito-dias ficam sem dados
        leitosPendentes = totalLeitos * diasNoPeriodo;
      }

      taxaOcupacaoPeriodo =
        totalLeitos > 0 ? totalPacientesMedio / totalLeitos : 0;
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

    // Guardar distribuições reais ANTES de qualquer ajuste customizado
    const mediaDiariaClassificacaoReal = { ...mediaDiariaClassificacao };
    const somaTotalClassificacaoReal = { ...somaTotalClassificacao };

    // --- AJUSTE PELA TAXA DE OCUPAÇÃO CUSTOMIZADA ---
    // Se o gestor salvou uma taxa customizada, re-escala mediaDiariaClassificacao e
    // somaTotalClassificacao para que o THE (e consequentemente o QP) reflita a ocupação
    // projetada pelo gestor e não apenas a taxa histórica do período.
    // taxaOcupacaoPeriodo, totalPacientesMedio e leitosOcupados NÃO são alterados —
    // continuam refletindo os dados reais do histórico.
    let leitosSimulados: any = undefined;
    if (
      taxaCustomizada &&
      taxaCustomizada.utilizarComoBaseCalculo &&
      taxaCustomizada.distribuicaoClassificacao
    ) {
      // MODO SIMULADO: taxa define o total de leitos ocupados projetados;
      // distribuicaoClassificacao distribui esse total pelos níveis de cuidado.
      // percentualLeitosAvaliados é armazenado mas não interfere no cálculo do THE.
      const totalLeitosSimulados = totalLeitos * (Number(taxaCustomizada.taxa) / 100);
      const distSim = taxaCustomizada.distribuicaoClassificacao;
      const somaPerc = Object.values(distSim).reduce((a, b) => a + b, 0);

      // Substitui a distribuição histórica pela simulada
      for (const key in mediaDiariaClassificacao) {
        mediaDiariaClassificacao[key] = 0;
      }
      for (const key in somaTotalClassificacao) {
        somaTotalClassificacao[key] = 0;
      }

      for (const key in distSim) {
        const frac = somaPerc > 0 ? distSim[key] / somaPerc : 0;
        mediaDiariaClassificacao[key] = totalLeitosSimulados * frac;
        somaTotalClassificacao[key] = Math.round(mediaDiariaClassificacao[key] * diasNoPeriodo);
      }

      // --- ESCALA DE LEITOS SIMULADOS ---
      // totalAvaliacoes = leito-dias efetivamente avaliados (ocupados + vagos + inativos reais)
      // leitosOcupadosSimulado = taxa% × totalAvaliacoes
      // vagosInativosSimulado  = totalAvaliacoes − leitosOcupadosSimulado (sem distinção)
      // leitosPendentesSimulado = totalLeitosDia − totalAvaliacoes (igual ao real)
      const totalAvaliacoesSimulado = leitosOcupados + leitosVagos + leitosInativos;
      const leitosOcupadosSimulado = Math.round((Number(taxaCustomizada.taxa) / 100) * totalAvaliacoesSimulado);
      const vagosInativosSimulado = totalAvaliacoesSimulado - leitosOcupadosSimulado;
      const leitosPendentesSimulado = totalLeitosDia - totalAvaliacoesSimulado;
      const leitosAvaliadosSimulados = totalAvaliacoesSimulado;

      leitosSimulados = {
        leitosOcupados: leitosOcupadosSimulado,
        vagosInativos: vagosInativosSimulado,
        leitosPendentes: leitosPendentesSimulado,
        leitosAvaliados: leitosAvaliadosSimulados
      };

    } 

    // --- ETAPA 3: CALCULAR TOTAL DE HORAS DE ENFERMAGEM (THE) ---
    // Mapeamento de classificações do banco para horas de enfermagem
    const horasPorClassificacao: { [key: string]: number } = {
      MINIMOS: 4, // PCM - Pacientes de Cuidados Mínimos
      INTERMEDIARIOS: 6, // PCI - Pacientes de Cuidados Intermediários
      ALTA_DEPENDENCIA: 10, // PADC - Pacientes de Alta Dependência de Cuidados
      SEMI_INTENSIVOS: 10, // PCSI - Pacientes de Cuidados Semi-Intensivos
      INTENSIVOS: 18, // PCIt - Pacientes de Cuidados Intensivos
    };

    const totalHorasEnfermagem = Object.keys(mediaDiariaClassificacao).reduce(
      (total, key) => {
        const horas = horasPorClassificacao[key] ?? 0;
        const quantidadeMediaDiaria = mediaDiariaClassificacao[key];
        const horasClassificacao = horas * quantidadeMediaDiaria;

        return total + horasClassificacao;
      },
      0
    );

    // --- ETAPA 4: CALCULAR PERCENTUAL DA EQUIPE (ENF / TEC) ---
    // Usar média diária de cada classificação para calcular as horas
    const hMinimos =
      (horasPorClassificacao["MINIMOS"] || 0) *
      (mediaDiariaClassificacao["MINIMOS"] || 0);
    const hIntermediarios =
      (horasPorClassificacao["INTERMEDIARIOS"] || 0) *
      (mediaDiariaClassificacao["INTERMEDIARIOS"] || 0);
    const hAltaDependencia =
      (horasPorClassificacao["ALTA_DEPENDENCIA"] || 0) *
      (mediaDiariaClassificacao["ALTA_DEPENDENCIA"] || 0);
    const hSemiIntensivos =
      (horasPorClassificacao["SEMI_INTENSIVOS"] || 0) *
      (mediaDiariaClassificacao["SEMI_INTENSIVOS"] || 0);
    const hIntensivos =
      (horasPorClassificacao["INTENSIVOS"] || 0) *
      (mediaDiariaClassificacao["INTENSIVOS"] || 0);

    // Equivalente do S (PCM + PCI), mas em HORAS totais
    const S = hMinimos + hIntermediarios;

    let percentualEnfermeiro = 0.52;
    let criterioAplicado = "Intensivos ";

    // Critério 1 (agora com HORAS): if (S >= PADC and S >= PCSI and S >= PCIt) then f = 0.33
    // Guarda especial: se não há pacientes (todas as horas = 0), não aplicar critério algum —
    // o resultado final do THE será 0 de qualquer forma, mas o criterioAplicado ficaria enganoso.
    // Resolução COFEN 543/2017, art. 5 §2:
    // "Em caso de igualdade de quantitativos entre categorias, deverá prevalecer
    //  aquela que exigir maior percentual de enfermeiros."
    // → avalia do MAIS para o MENOS especializado; >= garante que empate vai ao critério mais exigente.
    if (totalHorasEnfermagem === 0) {
      percentualEnfermeiro = 0.33;
      criterioAplicado = "Sem dados (padrão)";
    } else if (
      hIntensivos >= S &&
      hIntensivos >= hAltaDependencia &&
      hIntensivos >= hSemiIntensivos
    ) {
      // Critério 4: PCIt domina ou empata com todos
      percentualEnfermeiro = 0.52;
      criterioAplicado = "Intensivos";
    } else if (
      hSemiIntensivos >= S &&
      hSemiIntensivos >= hAltaDependencia &&
      hSemiIntensivos >= hIntensivos
    ) {
      // Critério 3: PCSI domina ou empata com todos exceto PCIt
      percentualEnfermeiro = 0.42;
      criterioAplicado = "Semi-Intensivos";
    } else if (
      hAltaDependencia >= S &&
      hAltaDependencia >= hSemiIntensivos &&
      hAltaDependencia >= hIntensivos
    ) {
      // Critério 2: PADC domina ou empata
      percentualEnfermeiro = 0.36;
      criterioAplicado = "Alta Dependência";
    } else {
      // Critério 1: PCM + PCI dominam estritamente
      percentualEnfermeiro = 0.33;
      criterioAplicado = "Mínimos + Intermediários";
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

    // --- CUIDADO e SEGURANÇA ---
    // cuidado = THE * (diasSemana / jornada) * percentual
    // seguranca = qp - cuidado
    const cuidadoEnfermeiro =
      cargaHorariaEnfermeiro > 0
        ? totalHorasEnfermagem *
          (diasTrabalhoSemana / cargaHorariaEnfermeiro) *
          percentualEnfermeiro
        : 0;
    const segurancaEnfermeiro = qpEnfermeirosExato - cuidadoEnfermeiro;

    const cuidadoTecnico =
      cargaHorariaTecnico > 0
        ? totalHorasEnfermagem *
          (diasTrabalhoSemana / cargaHorariaTecnico) *
          percentualTecnico
        : 0;
    const segurancaTecnico = qpTecnicosExato - cuidadoTecnico;

   

    // --- Montar a resposta da API ---
    const agregados = {
      // Informações da Unidade
      unidadeNome: unidade.nome,
      metodoAvaliacaoSCP: {
        title: unidade.scpMetodo?.title || null,
        key: unidade.scpMetodo?.key || null,
        description: unidade.scpMetodo?.description || null,
      },

      // Período
      periodo: {
        inicio: inicioPeriodo.toISODate()!,
        fim: fimPeriodo.toISODate()!,
        dias: diasNoPeriodo,
        origem: (inicio || fim ? "intervalo_customizado" : "mes_corrente") as
          | "intervalo_customizado"
          | "mes_corrente",
        parametrosEntrada: { inicio: inicio || null, fim: fim || null },
      },

      // Leitos
      totalLeitos,
      totalLeitosDia: unidade.leitos.length * diasNoPeriodo,
      leitosOcupados,
      leitosVagos,
      leitosInativos,
      leitosPendentes,
      percentualLeitosAvaliados,

      // Ocupação e Avaliações
      // totalAvaliacoes = leitos-dia efetivamente avaliados (exclui dias pendentes)
      totalAvaliacoes: Math.max(0, totalLeitosDia - leitosPendentes),
      totalPacientesMedio: Number(totalPacientesMedio.toFixed(2)),
      taxaOcupacaoPeriodo,
      taxaOcupacaoPeriodoPercent: Number(
        (taxaOcupacaoPeriodo * 100).toFixed(2)
      ),
      taxaOcupacaoCustomizada: taxaCustomizada
        ? {
            taxa: Number(taxaCustomizada.taxa),
            distribuicaoClassificacao: taxaCustomizada.distribuicaoClassificacao ?? null,
            utilizarComoBaseCalculo: taxaCustomizada.utilizarComoBaseCalculo ?? false,
            leitosOcupados: Math.round(
              totalLeitosDia * (Number(taxaCustomizada.taxa) / 100)
            ),
            totalPacientesMedio: Number(
              (totalLeitos * (Number(taxaCustomizada.taxa) / 100)).toFixed(2)
            ),
            // Se modo simulado, inclui todos os leitos simulados agrupados
            leitosSimulados, 
            // Distribuição histórica real (antes de qualquer ajuste simulado)
            distribuicaoTotalClassificacaoReal: { ...somaTotalClassificacaoReal },
            mediaDiariaClassificacaoReal: Object.keys(mediaDiariaClassificacaoReal).reduce(
              (acc, key) => {
                acc[key] = Number(mediaDiariaClassificacaoReal[key].toFixed(2));
                return acc;
              },
              {} as { [key: string]: number }
            ),
            createdAt: taxaCustomizada.createdAt,
            updatedAt: taxaCustomizada.updatedAt,
          }
        : null,

      // Classificação de Pacientes
      distribuicaoTotalClassificacao: somaTotalClassificacao,
      mediaDiariaClassificacao: Object.keys(mediaDiariaClassificacao).reduce(
        (acc, key) => {
          acc[key] = Number(mediaDiariaClassificacao[key].toFixed(2));
          return acc;
        },
        {} as { [key: string]: number }
      ),

      // Horas de Enfermagem
      totalHorasEnfermagem: Number(totalHorasEnfermagem.toFixed(2)),
      totalHorasEnfermagemDia: Number(
        (totalHorasEnfermagem / diasNoPeriodo).toFixed(2)
      ),

      // Distribuição da Equipe
      qpEnfermeiros,
      qpTecnicos,
      qpTotal: qpEnfermeiros + qpTecnicos,
      percentualEnfermeiro,
      percentualTecnico,
      percentualEnfermeiroPercent: Number(
        (percentualEnfermeiro * 100).toFixed(1)
      ),
      percentualTecnicoPercent: Number((percentualTecnico * 100).toFixed(1)),
      nivelCuidadoPredominante: criterioAplicado,

      // Cuidado e Segurança
      cuidadoEnfermeiro: Number(cuidadoEnfermeiro.toFixed(4)),
      segurancaEnfermeiro: Number(segurancaEnfermeiro.toFixed(4)),
      cuidadoTecnico: Number(cuidadoTecnico.toFixed(4)),
      segurancaTecnico: Number(segurancaTecnico.toFixed(4)),

      // Parâmetros
      parametros: {
        nomeEnfermeiro: parametros?.nome_enfermeiro ?? null,
        numeroCoren: parametros?.numero_coren ?? null,
        ist,
        istPercent: Number((ist * 100).toFixed(0)),
        diasTrabalhoSemana,
        cargaHorariaEnfermeiro,
        cargaHorariaTecnico,
        equipeComRestricoes,
        fatorRestricao,
        metodoCalculo: parametros?.metodoCalculo ?? null,
      },

      // Constantes de Cálculo
      kmEnfermeiro: Number(kmEnfermeiro.toFixed(4)),
      kmTecnico: Number(kmTecnico.toFixed(4)),
    };

    const valorHorasExtras = this.sp(unidade.horas_extra_reais);

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

        const salario = this.sp(cu.cargo.salario);
        const adicionais = this.sp(cu.cargo.adicionais_tributos);
        const cargaHoraria = this.sp(cu.cargo.carga_horaria);

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
        "hospital",
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

    const valorHorasExtras = this.sp(unidade.horas_extra_reais);

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

    // Captura horas ENF/TEC por sítio para persistência
    const sitioHorasMap: Record<string, { totalEnf: number; totalTec: number }> = {};

    // Soma dos arredondamentos por sítio (coerente com a tabela)
    let somaArredEnfermeiro = 0;
    let somaArredTecnico = 0;

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

        const salario = this.sp(cargo.salario);
        const adicionais = this.sp(cargo.adicionais_tributos);
        const cargaHoraria = this.sp(cargo.carga_horaria);
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
      somaArredEnfermeiro += pessoalEnfermeiroArredondado;
      somaArredTecnico += pessoalTecnicoArredondado;
      sitioHorasMap[sitio.id] = { totalEnf, totalTec };

      return {
        id: sitio.id,
        nome: sitio.nome || "Sítio Sem Nome",
        cargos: cargosDoSitio,
      };
    });

    // === ETAPA 2.5: PERSISTIR RESULTADO NAS TABELA dimensionamento_nao_internacao ===
    try {
      const dimNaoIntRepo = this.ds.getRepository(DimensionamentoNaoInternacao);
      const hospitalId = unidade.hospital?.id ?? "";
      const registros: Partial<DimensionamentoNaoInternacao>[] = [];
      for (const sitio of tabela) {
        const horas = sitioHorasMap[sitio.id] ?? { totalEnf: 0, totalTec: 0 };
        for (const cargo of sitio.cargos) {
          registros.push({
            hospitalId,
            unidadeId,
            sitioId: sitio.id,
            cargoId: cargo.cargoId,
            quantidadeCalculada: cargo.quantidadeProjetada ?? 0,
            kmEnfermeiro,
            kmTecnico,
            totalHorasEnfSitio: horas.totalEnf,
            totalHorasTecSitio: horas.totalTec,
          });
        }
      }
      if (registros.length > 0) {
        await dimNaoIntRepo.upsert(registros as DimensionamentoNaoInternacao[], {
          conflictPaths: ["unidadeId", "sitioId", "cargoId"],
          skipUpdateIfNoValuesChanged: true,
        });
      }
    } catch (err) {
      console.error("[DimensionamentoNaoInternacao] Erro ao persistir resultado:", err);
    }

    // === ETAPA 3: RESUMO FINAL (mantendo formato original) ===
    // pessoalEnfermeiro/Tecnico bruto para referência nos outros campos
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
      // Usa a SOMA dos arredondamentos por sítio — coerente com a tabela e com o relatório
      pessoalEnfermeiroArredondado: somaArredEnfermeiro,
      pessoalTecnicoArredondado: somaArredTecnico,
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
