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
import { StatusLeito } from "../entities/Leito";

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

    // === MÉTRICA DO CLIENTE: % LEITOS AVALIADOS HOJE (NÃO PENDENTES) ===
    // Independente do período analisado, esta métrica reflete o status ATUAL (hoje)
    const totalLeitosHoje = unidade.leitos.length;
    const leitosAvaliadosHoje = unidade.leitos.filter(
      (l) => l.status !== StatusLeito.PENDENTE
    ).length;
    const leitosPendentesHoje = totalLeitosHoje - leitosAvaliadosHoje;
    const percentualLeitosAvaliadosHojePercent =
      totalLeitosHoje > 0
        ? Number(((leitosAvaliadosHoje / totalLeitosHoje) * 100).toFixed(2))
        : 0;

    // --- ETAPA 1: BUSCAR INPUTS ---
    const parametros = await parametrosRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

    console.log("\n=== ⚙️ ETAPA 1: PARÂMETROS DA UNIDADE ===");
    const ist = Number(parametros?.ist ?? 15);
    const equipeComRestricoes = parametros?.aplicarIST ?? false;
    const diasTrabalhoSemana = parametros?.diasSemana ?? 7;

    console.log("Parâmetros encontrados:");
    console.log(`  IST: ${ist}%`);
    console.log(`  Aplicar IST: ${equipeComRestricoes ? "SIM" : "NÃO"}`);
    console.log(`  Dias de trabalho/semana: ${diasTrabalhoSemana}`);
    console.log("=== FIM ETAPA 1 ===\n");

    // --- ETAPA 2: DEFINIÇÃO DO PERÍODO (MÊS ATUAL OU INTERVALO PERSONALIZADO) ---
    // Se inicio/fim forem fornecidos (YYYY-MM-DD), usamos intervalo customizado; senão mês corrente até hoje.
    const agora = new Date();
    let inicioPeriodoDate: Date;
    let fimPeriodoDate: Date;

    const isISODate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

    if (isISODate(inicio) && isISODate(fim)) {
      // Intervalo customizado completo
      const [y1, m1, d1] = (inicio as string).split("-").map(Number);
      const [y2, m2, d2] = (fim as string).split("-").map(Number);
      inicioPeriodoDate = new Date(y1, m1 - 1, d1, 0, 0, 0, 0);
      fimPeriodoDate = new Date(y2, m2 - 1, d2, 23, 59, 59, 999);
    } else if (isISODate(inicio) && !fim) {
      // Apenas inicio fornecido: considerar somente aquele dia
      const [y1, m1, d1] = (inicio as string).split("-").map(Number);
      inicioPeriodoDate = new Date(y1, m1 - 1, d1, 0, 0, 0, 0);
      fimPeriodoDate = new Date(y1, m1 - 1, d1, 23, 59, 59, 999);
    } else if (!inicio && isISODate(fim)) {
      // Apenas fim fornecido: considerar somente aquele dia
      const [y2, m2, d2] = (fim as string).split("-").map(Number);
      inicioPeriodoDate = new Date(y2, m2 - 1, d2, 0, 0, 0, 0);
      fimPeriodoDate = new Date(y2, m2 - 1, d2, 23, 59, 59, 999);
    } else {
      // Fallback: mês atual até hoje
      fimPeriodoDate = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate(),
        23,
        59,
        59,
        999
      );
      inicioPeriodoDate = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        1,
        0,
        0,
        0,
        0
      );
    }

    // Normaliza caso inicio > fim
    if (inicioPeriodoDate.getTime() > fimPeriodoDate.getTime()) {
      console.warn(
        "[calcularParaInternacao] Intervalo invertido recebido. Trocando inicio/fim.",
        { inicio, fim }
      );
      const tmp = inicioPeriodoDate;
      inicioPeriodoDate = fimPeriodoDate;
      fimPeriodoDate = tmp;
    }

    // Dias no período (inclusive) calculado pela diferença +1
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const diasNoPeriodo =
      Math.floor(
        (fimPeriodoDate.setHours(0, 0, 0, 0) -
          inicioPeriodoDate.setHours(0, 0, 0, 0)) /
          MS_PER_DAY
      ) + 1;

    const hoje = fimPeriodoDate; // Mantém compatibilidade com nomenclatura existente
    const inicioDoMes = inicioPeriodoDate; // usar variável já referenciada depois

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
    if (inicio || fim) {
      console.log("Intervalo customizado aplicado", { inicio, fim });
    } else {
      console.log("Usando mês corrente até hoje (fallback)");
    }

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
    // Carrega históricos do mês e a relação com leito para permitir deduplicação
    const historicosDoMes = await historicoRepo
      .createQueryBuilder("h")
      .leftJoinAndSelect("h.leito", "leito")
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
    // Considera o último dia do período como "hoje" para agregar avaliações ativas não historizadas
    const dataHoje = hoje.toISOString().split("T")[0]; // formato YYYY-MM-DD
    const avaliacoesHoje = await this.avaliacaoRepo.listarPorDia({
      data: dataHoje,
      unidadeId: unidadeId,
    });

    console.log(
      "Avaliações ativas hoje (ainda não no histórico):",
      avaliacoesHoje.length
    );

    // Construir conjunto de leitos que já possuem histórico no período para evitar double-count
    const leitosComHistorico = new Set(
      historicosDoMes.map((h) => h.leito?.id).filter(Boolean) as string[]
    );
    console.log(
      `Deduplicação: leitos com histórico no período: ${[
        ...leitosComHistorico,
      ].join(", ")}`
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

    // --- DEBUG ADICIONAL: DUMP CONTROLADO ---
    try {
      const dump = {
        historicosDoMesCount: historicosDoMes.length,
        avaliacoesHojeCount: avaliacoesHoje.length,
        historicosSample: historicosDoMes.slice(0, 20).map((h) => ({
          id: h.id,
          leitoId: h.leito?.id ?? null,
          inicio: h.inicio,
          fim: h.fim,
          classificacao: h.classificacao,
          totalPontos: h.totalPontos,
        })),
        avaliacoesHojeSample: avaliacoesHoje.slice(0, 50).map((a) => ({
          id: a.id,
          leitoId: a.leito?.id ?? null,
          classificacao: a.classificacao,
          totalPontos: a.totalPontos,
        })),
      };
      console.log(
        "--- DEBUG DUMP INICIAL (historicos+avaliacoes) ---\n",
        JSON.stringify(dump, null, 2)
      );
    } catch (err) {
      console.warn("Falha ao gerar debug dump inicial:", err);
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
            // Pular avaliações para leitos que já possuem um histórico ativo no período
            const leitoIdAval = aval.leito?.id ?? null;
            if (leitoIdAval && leitosComHistorico.has(leitoIdAval)) {
              console.log(
                `Pulando avaliação id=${aval.id} para leito=${leitoIdAval} pois já existe historico no período`
              );
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
      console.log(
        "Taxa de ocupação mensal (fração):",
        taxaOcupacaoMensal.toFixed(4)
      );
      console.log(
        "Taxa de ocupação mensal (%):",
        `${(taxaOcupacaoMensal * 100).toFixed(2)}%`
      );
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

    console.log("\n=== 📊 ETAPA 3: CÁLCULO DE HORAS DE ENFERMAGEM (THE) ===");
    console.log("Horas por classificação configuradas:", horasPorClassificacao);
    console.log("⚠️ IMPORTANTE: Usando SOMA TOTAL MENSAL (não média diária)");

    const totalHorasEnfermagem = Object.keys(somaTotalClassificacao).reduce(
      (total, key) => {
        const horas = horasPorClassificacao[key] ?? 0;
        const quantidadeTotal = somaTotalClassificacao[key];
        const horasClassificacao = horas * quantidadeTotal;
        console.log(
          `  ${key}: ${quantidadeTotal} pacientes (total mensal) × ${horas}h = ${horasClassificacao.toFixed(
            2
          )}h`
        );
        return total + horasClassificacao;
      },
      0
    );
    console.log(
      "✅ Total de Horas de Enfermagem (THE) do mês:",
      totalHorasEnfermagem.toFixed(2),
      "horas (total mensal)"
    );
    console.log("=== FIM ETAPA 3 ===\n");

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

    console.log("\n=== 👥 ETAPA 4: CÁLCULO DE PERCENTUAL ENF/TEC ===");
    console.log(
      "⚠️ IMPORTANTE: Usando TOTAL DE HORAS por classificação para determinar predominância"
    );
    console.log("Horas por classificação no mês (totais):");
    console.log(`  MINIMOS (PCM): ${hMinimos.toFixed(2)}h`);
    console.log(`  INTERMEDIARIOS (PCI): ${hIntermediarios.toFixed(2)}h`);
    console.log(`  ALTA_DEPENDENCIA (PADC): ${hAltaDependencia.toFixed(2)}h`);
    console.log(`  SEMI_INTENSIVOS (PCSI): ${hSemiIntensivos.toFixed(2)}h`);
    console.log(`  INTENSIVOS (PCIt): ${hIntensivos.toFixed(2)}h`);
    console.log(`  S (PCM + PCI): ${S.toFixed(2)}h`);

    let percentualEnfermeiro = 0.52;
    let criterioAplicado = "Padrão (0.52)";

    console.log("\n🔍 Avaliando critérios:");

    // Critério 1 (agora com HORAS): if (S >= PADC and S >= PCSI and S >= PCIt) then f = 0.33
    console.log(
      `  Critério 1: S(${S.toFixed(2)}h) >= PADC(${hAltaDependencia.toFixed(
        2
      )}h) AND S >= PCSI(${hSemiIntensivos.toFixed(
        2
      )}h) AND S >= PCIt(${hIntensivos.toFixed(2)}h)`
    );
    if (S >= hAltaDependencia && S >= hSemiIntensivos && S >= hIntensivos) {
      percentualEnfermeiro = 0.33;
      criterioAplicado = "S (PCM+PCI) predominante (0.33)";
      console.log(`    ✅ VERDADEIRO → 33%`);
    } else {
      console.log(`    ❌ FALSO`);

      // Critério 2 (HORAS): else if (PADC > S and PADC >= PCSI and PADC >= PCIt) then f = 0.37
      console.log(
        `  Critério 2: PADC(${hAltaDependencia.toFixed(2)}h) > S(${S.toFixed(
          2
        )}h) AND PADC >= PCSI(${hSemiIntensivos.toFixed(
          2
        )}h) AND PADC >= PCIt(${hIntensivos.toFixed(2)}h)`
      );
      if (
        hAltaDependencia > S &&
        hAltaDependencia >= hSemiIntensivos &&
        hAltaDependencia >= hIntensivos
      ) {
        percentualEnfermeiro = 0.37;
        criterioAplicado = "ALTA_DEPENDENCIA (PADC) predominante (0.37)";
        console.log(`    ✅ VERDADEIRO → 37%`);
      } else {
        console.log(`    ❌ FALSO`);

        // Critério 3 (HORAS): else if (PCSI > S and PCSI > PADC and PCSI >= PCIt) then f = 0.42
        console.log(
          `  Critério 3: PCSI(${hSemiIntensivos.toFixed(2)}h) > S(${S.toFixed(
            2
          )}h) AND PCSI > PADC(${hAltaDependencia.toFixed(
            2
          )}h) AND PCSI >= PCIt(${hIntensivos.toFixed(2)}h)`
        );
        if (
          hSemiIntensivos > S &&
          hSemiIntensivos > hAltaDependencia &&
          hSemiIntensivos >= hIntensivos
        ) {
          percentualEnfermeiro = 0.42;
          criterioAplicado = "SEMI_INTENSIVOS (PCSI) predominante (0.42)";
          console.log(`    ✅ VERDADEIRO → 42%`);
        } else {
          console.log(`    ❌ FALSO`);

          // Critério 4: else f = 0.52 (padrão)
          console.log(`  Critério 4: Nenhum dos anteriores → Padrão`);
          percentualEnfermeiro = 0.52;
          criterioAplicado = "Padrão (0.52)";
          console.log(`    ✅ VERDADEIRO → 52%`);
        }
      }
    }

    const percentualTecnico = 1 - percentualEnfermeiro;

    console.log("\n✅ Resultado:");
    console.log(`  Critério aplicado: ${criterioAplicado}`);
    console.log(
      `  Percentual Enfermeiro: ${(percentualEnfermeiro * 100).toFixed(1)}%`
    );
    console.log(
      `  Percentual Técnico: ${(percentualTecnico * 100).toFixed(1)}%`
    );
    console.log("=== FIM ETAPA 4 ===\n");

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

    console.log("\n=== ⚙️ ETAPA 5: CÁLCULO DO FATOR KM ===");
    console.log("Parâmetros:");
    console.log(`  IST: ${(ist * 100).toFixed(1)}%`);
    console.log(
      `  Equipe com restrições: ${equipeComRestricoes ? "SIM" : "NÃO"}`
    );
    console.log(`  Fator de restrição: ${fatorRestricao}`);
    console.log(`  Dias de trabalho/semana: ${diasTrabalhoSemana}`);
    console.log(
      `  Carga horária Enfermeiro: ${cargaHorariaEnfermeiro}h ${
        parametros?.cargaHorariaEnfermeiro
          ? "(customizada)"
          : "(do cargo/padrão)"
      }`
    );
    console.log(
      `  Carga horária Técnico: ${cargaHorariaTecnico}h ${
        parametros?.cargaHorariaTecnico ? "(customizada)" : "(do cargo/padrão)"
      }`
    );

    console.log("\n🔹 CÁLCULO KM ENFERMEIRO:");
    console.log(
      `  Fórmula: (diasTrabalhoSemana / cargaHoraria) × (fatorRestricao + IST)`
    );
    console.log(
      `  Substituindo: (${diasTrabalhoSemana} / ${cargaHorariaEnfermeiro}) × (${fatorRestricao} + ${ist})`
    );
    const kmEnfermeiro =
      cargaHorariaEnfermeiro > 0
        ? (diasTrabalhoSemana / cargaHorariaEnfermeiro) * (fatorRestricao + ist)
        : 0;
    console.log(
      `  Passo 1: ${diasTrabalhoSemana} / ${cargaHorariaEnfermeiro} = ${(
        diasTrabalhoSemana / cargaHorariaEnfermeiro
      ).toFixed(4)}`
    );
    console.log(
      `  Passo 2: ${fatorRestricao} + ${ist} = ${(fatorRestricao + ist).toFixed(
        4
      )}`
    );
    console.log(
      `  Resultado: ${(diasTrabalhoSemana / cargaHorariaEnfermeiro).toFixed(
        4
      )} × ${(fatorRestricao + ist).toFixed(4)} = ${kmEnfermeiro.toFixed(4)}`
    );
    console.log(`  ✅ KM Enfermeiro = ${kmEnfermeiro.toFixed(4)}`);

    console.log("\n🔹 CÁLCULO KM TÉCNICO:");
    console.log(
      `  Fórmula: (diasTrabalhoSemana / cargaHoraria) × (fatorRestricao + IST)`
    );
    console.log(
      `  Substituindo: (${diasTrabalhoSemana} / ${cargaHorariaTecnico}) × (${fatorRestricao} + ${ist})`
    );
    const kmTecnico =
      cargaHorariaTecnico > 0
        ? (diasTrabalhoSemana / cargaHorariaTecnico) * (fatorRestricao + ist)
        : 0;
    console.log(
      `  Passo 1: ${diasTrabalhoSemana} / ${cargaHorariaTecnico} = ${(
        diasTrabalhoSemana / cargaHorariaTecnico
      ).toFixed(4)}`
    );
    console.log(
      `  Passo 2: ${fatorRestricao} + ${ist} = ${(fatorRestricao + ist).toFixed(
        4
      )}`
    );
    console.log(
      `  Resultado: ${(diasTrabalhoSemana / cargaHorariaTecnico).toFixed(
        4
      )} × ${(fatorRestricao + ist).toFixed(4)} = ${kmTecnico.toFixed(4)}`
    );
    console.log(`  ✅ KM Técnico = ${kmTecnico.toFixed(4)}`);
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

    const qpEnfermeiros = Math.round(qpEnfermeirosExato);
    const qpTecnicos = Math.round(qpTecnicosExato);

    console.log("\n✅ ARREDONDAMENTO MATEMÁTICO (≥0.5 → cima, <0.5 → baixo):");
    console.log(
      `  Enfermeiros: ${qpEnfermeirosExato.toFixed(
        2
      )} → ${qpEnfermeiros} profissionais`
    );
    console.log(
      `  Técnicos: ${qpTecnicosExato.toFixed(2)} → ${qpTecnicos} profissionais`
    );
    console.log("=== FIM ETAPA 6 ===\n");

    // --- Montar a resposta da API ---
    const agregados = {
      periodo: {
        inicio: inicioDoMes.toISOString(),
        fim: hoje.toISOString(),
        dias: diasNoPeriodo,
        origem: (inicio || fim ? "intervalo_customizado" : "mes_corrente") as
          | "intervalo_customizado"
          | "mes_corrente",
        parametrosEntrada: { inicio: inicio || null, fim: fim || null },
      },
      totalLeitosDia: unidade.leitos.length * diasNoPeriodo,
      totalAvaliacoes: Math.round(totalPacientesMedio * diasNoPeriodo),
      // Mantido: fração 0..1 para compatibilidade
      taxaOcupacaoMensal,
      // Novo: porcentagem 0..100 para consumo direto no frontend/logs
      taxaOcupacaoMensalPercent: Number((taxaOcupacaoMensal * 100).toFixed(2)),
      // Métrica: % de leitos avaliados HOJE (não PENDENTES)
      percentualLeitosAvaliadosHojePercent,
      leitosAvaliadosHoje,
      leitosPendentesHoje,
      totalLeitosHoje,
      distribuicaoTotalClassificacao: somaTotalClassificacao, // Adicionado para o frontend
    };

    const valorHorasExtras = parseFloat(
      unidade.horas_extra_reais?.replace(",", ".") || "0"
    );

    console.log("\n=== ========================================== ===");
    console.log("UNIDADE (resumo):", {
      id: unidade.id,
      nome: unidade.nome,
      numeroLeitos: unidade.leitos.length,
      horas_extra_reais: unidade.horas_extra_reais,
    });

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
      console.log(
        "\n=== 🚀 RESPOSTA FINAL ENVIADA AO FRONTEND (resumo) ===\n",
        JSON.stringify(finalDump, null, 2)
      );
    } catch (err) {
      console.warn("Falha ao gerar final debug dump:", err);
    }
    console.log("=== FIM RESPOSTA ===\n");

    return response;
  }

  // Lógica para Unidades de NÃO INTERNAÇÃO
  async calcularParaNaoInternacao(
    unidadeId: string
  ): Promise<AnaliseNaoInternacaoResponse> {
    console.log(
      "\n╔════════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║  🏥 INÍCIO DO DIMENSIONAMENTO - UNIDADE DE NÃO INTERNAÇÃO     ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════════╝\n"
    );
    console.log("📝 Unidade ID:", unidadeId);

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

    console.log("✅ Unidade encontrada:", unidade.nome);
    console.log(
      "   Número de sítios funcionais:",
      unidade.sitiosFuncionais?.length || 0
    );

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

    // DEBUG: Parâmetros de entrada usados (Não-Internação)
    console.log("=== ⚙️ PARÂMETROS (Não-Internação) ===");
    console.log({
      jornadaEnfermeiro,
      jornadaTecnico,
      indiceSeguranca,
      equipeComRestricao,
      diasFuncionamentoMensal,
      diasSemana,
      periodoTrabalho,
      fatorBase,
    });

    console.log(`🔹 KM Enfermeiro = ${kmEnfermeiro.toFixed(4)}`);
    console.log(`🔹 KM Técnico = ${kmTecnico.toFixed(4)}`);

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
      console.log(`\n🔹 Sítio ${index + 1}: ${sitio.nome}`);

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

      console.log(`   Totais do sítio → ENF=${totalEnf}, TEC=${totalTec}`);

      // 🔹 Cálculo projetado individual por sítio
      const pessoalEnfermeiroBruto = kmEnfermeiro * totalEnf;
      const pessoalTecnicoBruto = kmTecnico * totalTec;

      const pessoalEnfermeiroArredondado = Math.round(pessoalEnfermeiroBruto);
      const pessoalTecnicoArredondado = Math.round(pessoalTecnicoBruto);

      console.log(
        `   📈 Projetado: ENF=${pessoalEnfermeiroArredondado}, TEC=${pessoalTecnicoArredondado}`
      );

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

    console.log("\n=== 📋 RESUMO FINAL DO DIMENSIONAMENTO ===");
    console.log(
      "Dimensionamento:",
      JSON.stringify(resumoDimensionamento, null, 2)
    );
    console.log("\nDistribuição:", JSON.stringify(resumoDistribuicao, null, 2));

    console.log(
      "\n╔════════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║  ✅ FIM DO DIMENSIONAMENTO - UNIDADE DE NÃO INTERNAÇÃO       ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════════╝\n"
    );

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
