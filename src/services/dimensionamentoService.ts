import { DataSource } from "typeorm";
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

export class DimensionamentoService {
  private avaliacaoRepo: AvaliacaoRepository;

  constructor(private ds: DataSource) {
    this.avaliacaoRepo = new AvaliacaoRepository(ds);
  }

  // Lógica para Unidades de INTERNAÇÃO
  async calcularParaInternacao(
    unidadeId: string
  ): Promise<AnaliseInternacaoResponse> {
    console.log(
      "\n╔════════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║  🏥 INÍCIO DO DIMENSIONAMENTO - UNIDADE DE INTERNAÇÃO         ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════════╝\n"
    );
    console.log("📝 Unidade ID:", unidadeId);

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

    console.log("✅ Unidade encontrada:", unidade.nome);
    console.log("   Número de leitos:", unidade.leitos.length);
    console.log(
      "   Número de cargos cadastrados:",
      unidade.cargosUnidade?.length || 0
    );

    // --- ETAPA 1: BUSCAR INPUTS ---
    const parametros = await parametrosRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

    console.log("\n=== ⚙️ ETAPA 1: PARÂMETROS DA UNIDADE ===");
    const ist = (parametros?.ist ?? 15) / 100;
    const equipeComRestricoes = parametros?.aplicarIST ?? false;
    const diasTrabalhoSemana = parametros?.diasSemana ?? 7;

    console.log("Parâmetros carregados:");
    console.log(
      `  IST: ${(ist * 100).toFixed(1)}% (${
        parametros?.ist ? "customizado" : "padrão"
      })`
    );
    console.log(
      `  Aplicar IST (Equipe com restrições): ${
        equipeComRestricoes ? "SIM" : "NÃO"
      }`
    );
    console.log(
      `  Dias de trabalho/semana: ${diasTrabalhoSemana} (${
        parametros?.diasSemana ? "customizado" : "padrão"
      })`
    );
    console.log("=== FIM ETAPA 1 ===\n");

    // --- ETAPA 2: CALCULAR A MÉDIA DE PACIENTES DO MÊS ATUAL (LÓGICA CORRIGIDA) ---
    // Usar horário do Brasil (UTC-3) para garantir cálculos corretos
    const agora = new Date();
    const hoje = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate(),
      23,
      59,
      59,
      999
    );
    const inicioDoMes = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const diasNoPeriodo = agora.getDate(); // Dias decorridos no mês atual

    console.log("=== DEBUG OCUPAÇÃO MENSAL ===");
    console.log("Unidade ID:", unidadeId);
    console.log(
      "Data/hora atual:",
      agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    );
    console.log(
      "Período:",
      inicioDoMes.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      "até",
      hoje.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    );
    console.log("Dias no período:", diasNoPeriodo);

    let totalPacientesMedio = 0;
    let mediaDiariaClassificacao: { [key: string]: number } = {};
    let somaTotalClassificacao: { [key: string]: number } = {};
    let taxaOcupacaoMensal = 0;

    // PRIMEIRO: verificar se existem históricos para essa unidade (em qualquer período)
    const totalHistoricos = await historicoRepo
      .createQueryBuilder("h")
      .where("h.unidadeId = :unidadeId", { unidadeId })
      .getCount();

    console.log("Total de históricos (todos os períodos):", totalHistoricos);

    // Busca todos os registros de histórico que se sobrepõem ao período do mês atual
    const historicosDoMes = await historicoRepo
      .createQueryBuilder("h")
      .where("h.unidadeId = :unidadeId", { unidadeId })
      .andWhere(
        "(h.inicio <= :fimPeriodo AND (h.fim IS NULL OR h.fim >= :inicioPeriodo))",
        {
          inicioPeriodo: inicioDoMes,
          fimPeriodo: hoje,
        }
      )
      .getMany();

    console.log("Históricos encontrados no período:", historicosDoMes.length);

    // BUSCAR AVALIAÇÕES ATIVAS DO DIA ATUAL (que ainda não viraram histórico)
    const dataHoje = agora.toISOString().split("T")[0]; // formato YYYY-MM-DD
    const avaliacoesHoje = await this.avaliacaoRepo.listarPorDia({
      data: dataHoje,
      unidadeId: unidadeId,
    });

    console.log(
      "Avaliações ativas hoje (ainda não no histórico):",
      avaliacoesHoje.length
    );

    if (historicosDoMes.length > 0) {
      console.log("Exemplo de histórico:", {
        id: historicosDoMes[0].id,
        inicio: new Date(historicosDoMes[0].inicio).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }),
        fim: historicosDoMes[0].fim
          ? new Date(historicosDoMes[0].fim).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })
          : "ainda ativo",
        classificacao: historicosDoMes[0].classificacao,
      });
    }

    if (avaliacoesHoje.length > 0) {
      console.log("Exemplo de avaliação ativa hoje:", {
        leitoId: avaliacoesHoje[0].leito?.id,
        classificacao: avaliacoesHoje[0].classificacao,
        dataAplicacao: avaliacoesHoje[0].dataAplicacao,
      });
    }

    if (diasNoPeriodo > 0) {
      if (historicosDoMes.length === 0 && avaliacoesHoje.length === 0) {
        console.warn(
          "⚠️ Nenhum histórico ou avaliação ativa encontrada para o período"
        );
      }

      let totalSomaDiariaPacientes = 0;
      let diasComDados = 0;

      // Itera por cada dia do mês até a data atual
      for (let i = 0; i < diasNoPeriodo; i++) {
        const diaCorrente = new Date(inicioDoMes);
        diaCorrente.setDate(inicioDoMes.getDate() + i);
        const inicioDia = new Date(diaCorrente).setHours(0, 0, 0, 0);
        const fimDia = new Date(diaCorrente).setHours(23, 59, 59, 999);
        const isHoje = i === diasNoPeriodo - 1; // último dia do período é hoje

        let pacientesNesteDia = 0;

        // Para cada dia, conta quantos registros de histórico estavam ativos
        for (const hist of historicosDoMes) {
          const inicioHist = new Date(hist.inicio).getTime();
          const fimHist = hist.fim ? new Date(hist.fim).getTime() : Infinity;

          if (inicioHist <= fimDia && fimHist >= inicioDia) {
            // Este paciente estava presente neste dia
            pacientesNesteDia += 1;
            totalSomaDiariaPacientes += 1;
            if (hist.classificacao) {
              somaTotalClassificacao[hist.classificacao] =
                (somaTotalClassificacao[hist.classificacao] || 0) + 1;
            }
          }
        }

        // Se for hoje, adicionar as avaliações ativas (que ainda não viraram histórico)
        if (isHoje && avaliacoesHoje.length > 0) {
          for (const aval of avaliacoesHoje) {
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

        console.log(
          `Dia ${
            i + 1
          }/${diasNoPeriodo}: ${pacientesNesteDia} pacientes ativos ${
            isHoje ? "(incluindo avaliações de hoje)" : ""
          }`
        );
      }

      console.log("Total soma diária pacientes:", totalSomaDiariaPacientes);
      console.log("Dias com dados:", diasComDados);

      // Calcula a média dividindo a soma total pelo número de dias
      totalPacientesMedio = totalSomaDiariaPacientes / diasNoPeriodo;

      // IMPORTANTE: mediaDiariaClassificacao é a MÉDIA diária de cada tipo
      // mas distribuicaoTotalClassificacao é o TOTAL do mês (soma)
      for (const key in somaTotalClassificacao) {
        mediaDiariaClassificacao[key] =
          somaTotalClassificacao[key] / diasNoPeriodo;
      }

      const numeroLeitos = unidade.leitos.length;
      taxaOcupacaoMensal =
        numeroLeitos > 0 ? totalPacientesMedio / numeroLeitos : 0;

      console.log("Média de pacientes/dia:", totalPacientesMedio);
      console.log("Número de leitos:", numeroLeitos);
      console.log("Taxa de ocupação mensal:", taxaOcupacaoMensal);
      console.log(
        "Distribuição TOTAL por classificação (soma mensal):",
        somaTotalClassificacao
      );
      console.log(
        "Distribuição MÉDIA diária por classificação:",
        mediaDiariaClassificacao
      );
      console.log("=== FIM DEBUG ===\n");
    } else {
      console.error("❌ Erro: diasNoPeriodo inválido:", diasNoPeriodo);
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

    console.log("\n=== 📊 ETAPA 3: CÁLCULO DE HORAS DE ENFERMAGEM ===");
    console.log("Horas por classificação configuradas:", horasPorClassificacao);

    const totalHorasEnfermagem = Object.keys(mediaDiariaClassificacao).reduce(
      (total, key) => {
        const horas = horasPorClassificacao[key] ?? 0;
        const quantidadeMedia = mediaDiariaClassificacao[key];
        const horasClassificacao = horas * quantidadeMedia;
        console.log(
          `  ${key}: ${quantidadeMedia.toFixed(
            2
          )} pacientes × ${horas}h = ${horasClassificacao.toFixed(2)}h`
        );
        return total + horasClassificacao;
      },
      0
    );
    console.log(
      "✅ Total de Horas de Enfermagem (THE):",
      totalHorasEnfermagem.toFixed(2),
      "horas/dia"
    );
    console.log("=== FIM ETAPA 3 ===\n");

    // --- ETAPA 4: CALCULAR PERCENTUAL DA EQUIPE (ENF / TEC) ---
    const minimos = mediaDiariaClassificacao["MINIMOS"] || 0;
    const intermediarios = mediaDiariaClassificacao["INTERMEDIARIOS"] || 0;
    const altaDependencia = mediaDiariaClassificacao["ALTA_DEPENDENCIA"] || 0;
    const semiIntensivos = mediaDiariaClassificacao["SEMI_INTENSIVOS"] || 0;
    const intensivos = mediaDiariaClassificacao["INTENSIVOS"] || 0;
    const intermediarioAlta = intermediarios + altaDependencia;

    console.log("\n=== 👥 ETAPA 4: CÁLCULO DE PERCENTUAL ENF/TEC ===");
    console.log("Classificações médias diárias:");
    console.log(`  MINIMOS (PCM): ${minimos.toFixed(2)}`);
    console.log(`  INTERMEDIARIOS (PCI): ${intermediarios.toFixed(2)}`);
    console.log(`  ALTA_DEPENDENCIA (PADC): ${altaDependencia.toFixed(2)}`);
    console.log(`  SEMI_INTENSIVOS (PCSI): ${semiIntensivos.toFixed(2)}`);
    console.log(`  INTENSIVOS (PCIt): ${intensivos.toFixed(2)}`);
    console.log(`  Intermediário + Alta: ${intermediarioAlta.toFixed(2)}`);

    let percentualEnfermeiro = 0.52;
    let criterioAplicado = "Padrão (0.52)";

    if (
      minimos > intermediarioAlta &&
      minimos >= semiIntensivos &&
      minimos >= intensivos
    ) {
      percentualEnfermeiro = 0.33;
      criterioAplicado = "MINIMOS predominante (0.33)";
    } else if (
      intermediarioAlta >= minimos &&
      intermediarioAlta >= semiIntensivos &&
      intermediarioAlta >= intensivos
    ) {
      percentualEnfermeiro = 0.33;
      criterioAplicado = "Intermediário+Alta predominante (0.33)";
    } else if (
      semiIntensivos > minimos &&
      semiIntensivos > intermediarioAlta &&
      semiIntensivos >= intensivos
    ) {
      percentualEnfermeiro = 0.37;
      criterioAplicado = "SEMI_INTENSIVOS predominante (0.37)";
    } else if (
      intensivos > minimos &&
      intensivos > intermediarioAlta &&
      intensivos > semiIntensivos
    ) {
      percentualEnfermeiro = 0.42;
      criterioAplicado = "INTENSIVOS predominante (0.42)";
    }
    const percentualTecnico = 1 - percentualEnfermeiro;

    console.log("Critério aplicado:", criterioAplicado);
    console.log(
      `✅ Percentual Enfermeiro: ${(percentualEnfermeiro * 100).toFixed(1)}%`
    );
    console.log(
      `✅ Percentual Técnico: ${(percentualTecnico * 100).toFixed(1)}%`
    );
    console.log("=== FIM ETAPA 4 ===\n");

    // --- ETAPA 5: CALCULAR FATOR "KM" PARA CADA CARGO ---
    const cargaHorariaEnfermeiro = parseFloat(
      unidade.cargosUnidade?.find((c) =>
        c.cargo.nome.toLowerCase().includes("enfermeiro")
      )?.cargo.carga_horaria || "36"
    );
    const cargaHorariaTecnico = parseFloat(
      unidade.cargosUnidade?.find((c) =>
        c.cargo.nome.toLowerCase().includes("técnico")
      )?.cargo.carga_horaria || "36"
    );
    const fatorRestricao = equipeComRestricoes ? 1.1 : 1.0;

    console.log("\n=== ⚙️ ETAPA 5: CÁLCULO DO FATOR KM ===");
    console.log("Parâmetros:");
    console.log(`  IST: ${(ist * 100).toFixed(1)}%`);
    console.log(
      `  Equipe com restrições: ${equipeComRestricoes ? "SIM" : "NÃO"}`
    );
    console.log(`  Fator de restrição: ${fatorRestricao}`);
    console.log(`  Dias de trabalho/semana: ${diasTrabalhoSemana}`);
    console.log(`  Carga horária Enfermeiro: ${cargaHorariaEnfermeiro}h`);
    console.log(`  Carga horária Técnico: ${cargaHorariaTecnico}h`);

    const kmEnfermeiro =
      cargaHorariaEnfermeiro > 0
        ? (diasTrabalhoSemana / cargaHorariaEnfermeiro) * (fatorRestricao + ist)
        : 0;
    const kmTecnico =
      cargaHorariaTecnico > 0
        ? (diasTrabalhoSemana / cargaHorariaTecnico) * (fatorRestricao + ist)
        : 0;

    console.log("Cálculos:");
    console.log(
      `  KM Enfermeiro = (${diasTrabalhoSemana} / ${cargaHorariaEnfermeiro}) × (${fatorRestricao} + ${ist.toFixed(
        2
      )}) = ${kmEnfermeiro.toFixed(4)}`
    );
    console.log(
      `  KM Técnico = (${diasTrabalhoSemana} / ${cargaHorariaTecnico}) × (${fatorRestricao} + ${ist.toFixed(
        2
      )}) = ${kmTecnico.toFixed(4)}`
    );
    console.log("=== FIM ETAPA 5 ===\n");

    // --- ETAPA 6: CALCULAR QUANTIDADE DE PESSOAL (QP) FINAL ---
    const horasEnfermeiroNecessarias =
      totalHorasEnfermagem * percentualEnfermeiro;
    const horasTecnicoNecessarias = totalHorasEnfermagem * percentualTecnico;

    console.log("\n=== 🎯 ETAPA 6: CÁLCULO QUANTIDADE DE PESSOAL (QP) ===");
    console.log("Horas necessárias:");
    console.log(
      `  Enfermeiro: ${totalHorasEnfermagem.toFixed(2)}h × ${(
        percentualEnfermeiro * 100
      ).toFixed(1)}% = ${horasEnfermeiroNecessarias.toFixed(2)}h`
    );
    console.log(
      `  Técnico: ${totalHorasEnfermagem.toFixed(2)}h × ${(
        percentualTecnico * 100
      ).toFixed(1)}% = ${horasTecnicoNecessarias.toFixed(2)}h`
    );

    const qpEnfermeirosExato = kmEnfermeiro * horasEnfermeiroNecessarias;
    const qpTecnicosExato = kmTecnico * horasTecnicoNecessarias;

    console.log("\nQuantidade de pessoal (QP):");
    console.log(
      `  QP Enfermeiro (exato) = ${kmEnfermeiro.toFixed(
        4
      )} × ${horasEnfermeiroNecessarias.toFixed(
        2
      )} = ${qpEnfermeirosExato.toFixed(2)}`
    );
    console.log(
      `  QP Técnico (exato) = ${kmTecnico.toFixed(
        4
      )} × ${horasTecnicoNecessarias.toFixed(2)} = ${qpTecnicosExato.toFixed(
        2
      )}`
    );

    const qpEnfermeiros = Math.ceil(qpEnfermeirosExato);
    const qpTecnicos = Math.ceil(qpTecnicosExato);

    console.log("\n✅ Quantidade projetada (arredondado):");
    console.log(`  Enfermeiros: ${qpEnfermeiros} profissionais`);
    console.log(`  Técnicos: ${qpTecnicos} profissionais`);
    console.log("=== FIM ETAPA 6 ===\n");

    // --- Montar a resposta da API ---
    const agregados = {
      periodo: {
        inicio: inicioDoMes.toISOString(),
        fim: hoje.toISOString(),
        dias: diasNoPeriodo,
      },
      totalLeitosDia: unidade.leitos.length * diasNoPeriodo,
      totalAvaliacoes: Math.round(totalPacientesMedio * diasNoPeriodo),
      taxaOcupacaoMensal,
      distribuicaoTotalClassificacao: somaTotalClassificacao, // Adicionado para o frontend
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
          cargoNomeLower.includes("técnico  enfermagem") ||
          cargoNomeLower.includes("tec enfermagem") ||
          cargoNomeLower.includes("técnico de enfermagem");
          cargoNomeLower.includes("tec. enfermagem") 
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

    console.log("\n=== 📋 TABELA DE CARGOS GERADA ===");
    tabela.forEach((cargo, index) => {
      console.log(`\n${index + 1}. ${cargo.cargoNome}:`);
      console.log(`   - É SCP: ${cargo.isScpCargo ? "SIM" : "NÃO"}`);
      console.log(`   - Quantidade Atual: ${cargo.quantidadeAtual}`);
      console.log(`   - Quantidade Projetada: ${cargo.quantidadeProjetada}`);
      console.log(
        `   - Diferença: ${
          cargo.quantidadeProjetada - cargo.quantidadeAtual > 0 ? "+" : ""
        }${cargo.quantidadeProjetada - cargo.quantidadeAtual}`
      );
      console.log(`   - Salário: R$ ${cargo.salario.toFixed(2)}`);
      console.log(`   - Adicionais: R$ ${cargo.adicionais.toFixed(2)}`);
      console.log(
        `   - Custo por funcionário: R$ ${cargo.custoPorFuncionario.toFixed(2)}`
      );
    });
    console.log("\n=== FIM TABELA ===\n");

    const response = { agregados, tabela };

    console.log("\n=== 🚀 RESPOSTA FINAL ENVIADA AO FRONTEND ===");
    console.log(JSON.stringify(response, null, 2));
    console.log("=== FIM RESPOSTA ===\n");

    return response;
  }

  // Lógica para Unidades de NÃO INTERNAÇÃO
  async calcularParaNaoInternacao(
    unidadeId: string
  ): Promise<AnaliseNaoInternacaoResponse> {
    console.log("Calculando dimensionamento para unidade de não internação");

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
    console.log("Unidade encontrada:", unidade);

    if (!unidade) {
      throw new Error("Unidade de não internação não encontrada");
    }

    const valorHorasExtras = parseFloat(
      unidade.horas_extra_reais?.replace(",", ".") || "0"
    );

    const parametrosRepo = this.ds.getRepository(ParametrosNaoInternacao);
    const parametros = await parametrosRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

    const jornadaEnfermeiro = parametros?.jornadaSemanalEnfermeiro ?? 36;
    const jornadaTecnico = parametros?.jornadaSemanalTecnico ?? 36;
    const indiceSeguranca = Number(parametros?.indiceSegurancaTecnica ?? 0);
    const equipeComRestricao = parametros?.equipeComRestricao ?? false;
    const diasFuncionamentoMensal = parametros?.diasFuncionamentoMensal ?? 30;
    const diasSemana = parametros?.diasSemana ?? 7;
    const periodoTrabalho =
      diasSemana === 7 ? 6 : diasSemana === 6 ? 5 : diasSemana === 5 ? 4 : 0;

    const fatorBase = equipeComRestricao ? 1.1 : 1;
    const kmEnfermeiro =
      jornadaEnfermeiro > 0
        ? (diasFuncionamentoMensal / jornadaEnfermeiro) *
          (fatorBase + indiceSeguranca)
        : 0;
    const kmTecnico =
      jornadaTecnico > 0
        ? (diasFuncionamentoMensal / jornadaTecnico) *
          (fatorBase + indiceSeguranca)
        : 0;

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
    ).map((sitio) => {
      const cargosDoSitio = (sitio.cargosSitio || []).map((cs) => {
        const cargo = cs.cargoUnidade.cargo;
        const cargoNomeLower = cargo.nome.toLowerCase();

        // Identificar se é Enfermeiro ou Técnico de Enfermagem
        const isEnfermeiro = cargoNomeLower.includes("enfermeiro");
        const isTecnico =
          cargoNomeLower.includes("técnico de enfermagem") ||
           cargoNomeLower.includes("tec. enfermagem") ||
          cargoNomeLower.includes("tecnico de enfermagem");
        const isScpCargo = isEnfermeiro || isTecnico;

        const salario = parseFloat(cargo.salario?.replace(",", ".") || "0");
        const adicionais = parseFloat(
          cargo.adicionais_tributos?.replace(",", ".") || "0"
        );
        const cargaHoraria = parseFloat(cargo.carga_horaria || "0");

        return {
          cargoId: cargo.id,
          cargoNome: cargo.nome,
          isScpCargo: isScpCargo, // ✅ Marca ENF/TEC como true
          salario,
          adicionais,
          valorHorasExtras,
          cargaHoraria,
          custoPorFuncionario: salario + adicionais + valorHorasExtras,
          quantidadeAtual: cs.quantidade_funcionarios,
          quantidadeProjetada: cs.quantidade_funcionarios, // Será calculado depois
        };
      });

      const distribs = sitio.distribuicoes || [];
      for (const dist of distribs) {
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

        distribDetalhada.push({
          sitioId: sitio.id,
          sitioNome: sitio.nome,
          categoria: dist.categoria,
          totalSemana,
          totalFimSemana,
          total,
        });

        if (dist.categoria === "ENF") {
          totalSitiosEnfermeiro += total;
        }
        if (dist.categoria === "TEC") {
          totalSitiosTecnico += total;
        }
      }

      return {
        id: sitio.id,
        nome: sitio.nome || "Sítio Sem Nome",
        cargos: cargosDoSitio,
      };
    });

    const pessoalEnfermeiroBruto = kmEnfermeiro * totalSitiosEnfermeiro;
    const pessoalTecnicoBruto = kmTecnico * totalSitiosTecnico;

    // ✅ Atualizar quantidade projetada dos cargos ENF/TEC em todos os sítios
    const pessoalEnfermeiroArredondado = Math.ceil(pessoalEnfermeiroBruto);
    const pessoalTecnicoArredondado = Math.ceil(pessoalTecnicoBruto);

    tabela.forEach((sitio) => {
      sitio.cargos.forEach((cargo) => {
        const cargoNomeLower = cargo.cargoNome.toLowerCase();
        const isEnfermeiro = cargoNomeLower.includes("enfermeiro");
        const isTecnico =
          cargoNomeLower.includes("técnico de enfermagem") ||
          cargoNomeLower.includes("tecnico de enfermagem");

        if (isEnfermeiro) {
          cargo.quantidadeProjetada = pessoalEnfermeiroArredondado;
        } else if (isTecnico) {
          cargo.quantidadeProjetada = pessoalTecnicoArredondado;
        }
      });
    });

    const resumoDimensionamento = {
      periodoTrabalho,
      kmEnfermeiro: Number(kmEnfermeiro.toFixed(4)),
      kmTecnico: Number(kmTecnico.toFixed(4)),
      totalSitiosEnfermeiro,
      totalSitiosTecnico,
      pessoalEnfermeiro: Number(pessoalEnfermeiroBruto.toFixed(2)),
      pessoalTecnico: Number(pessoalTecnicoBruto.toFixed(2)),
      pessoalEnfermeiroArredondado: pessoalEnfermeiroArredondado,
      pessoalTecnicoArredondado: pessoalTecnicoArredondado,
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
