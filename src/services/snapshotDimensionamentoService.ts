import { DataSource } from "typeorm";
import { SnapshotDimensionamento } from "../entities/SnapshotDimensionamento";
import { SnapshotDimensionamentoRepository } from "../repositories/snapshotDimensionamentoRepository";
import { HospitalSectorsRepository } from "../repositories/hospitalSectorsRepository";
import { createHash } from "crypto";

export class SnapshotDimensionamentoService {
  private snapshotRepo: SnapshotDimensionamentoRepository;
  private hospitalSectorsRepo: HospitalSectorsRepository;

  constructor(private ds: DataSource) {
    this.snapshotRepo = new SnapshotDimensionamentoRepository(ds);
    this.hospitalSectorsRepo = new HospitalSectorsRepository(ds);
  }

  /**
   * Criar snapshot de hospital completo
   */
  async criarSnapshotHospital(
    hospitalId: string,
    usuarioId?: string,
    observacao?: string
  ): Promise<SnapshotDimensionamento> {
    // Buscar dados completos do hospital
    const dadosHospital =
      await this.hospitalSectorsRepo.getAllSectorsByHospital(hospitalId);

    console.log(
      "Dados Hospital (brutos)",
      JSON.stringify(dadosHospital, null, 2)
    );

    console.log("🧹 [SERVICE] Iniciando sanitização...");
    // ✅ SANITIZAR dados antes de salvar
    const dadosSanitizados = this.sanitizarDados(dadosHospital, "root");
    console.log("✅ [SERVICE] Sanitização completa!");

    console.log(
      "Dados Hospital (sanitizados)",
      JSON.stringify(dadosSanitizados, null, 2)
    );

    console.log("📊 [SERVICE] Calculando resumo...");
    // Calcular resumo
    const resumo = this.calcularResumoHospital(dadosSanitizados);
    console.log("Resumo", JSON.stringify(resumo, null, 2));

    console.log("🔐 [SERVICE] Calculando hash...");
    // Calcular hash para evitar duplicatas
    const hashDados = this.calcularHash(dadosSanitizados);
    console.log("Hash:", hashDados);

    console.log("💾 [SERVICE] Chamando repository.criar()...");
    // Criar snapshot
    const snapshot = await this.snapshotRepo.criar({
      escopo: "HOSPITAL",
      hospitalId,
      dados: dadosSanitizados, // ✅ Usar dados sanitizados
      resumo,
      hashDados,
      acao: "SNAPSHOT_MANUAL",
      usuarioId,
      observacao:
        observacao ||
        `Snapshot completo do hospital - ${new Date().toLocaleString("pt-BR")}`,
    });

    console.log("Snapshot criado", JSON.stringify(snapshot, null, 2));
    return snapshot;
  }

  /**
   * Criar snapshot de unidade de internação
   */
  async criarSnapshotUnidadeInternacao(
    hospitalId: string,
    unidadeId: string,
    usuarioId?: string,
    observacao?: string
  ): Promise<SnapshotDimensionamento> {
    // Buscar dados do hospital e extrair unidade específica
    const dadosHospital =
      await this.hospitalSectorsRepo.getAllSectorsByHospital(hospitalId);
    const unidade = dadosHospital.internation.find((u) => u.id === unidadeId);

    if (!unidade) {
      throw new Error(`Unidade de internação ${unidadeId} não encontrada`);
    }

    // ✅ Sanitizar dados da unidade
    const unidadeSanitizada = this.sanitizarDados(unidade);

    // Calcular resumo
    const resumo = {
      totalProfissionais:
        unidadeSanitizada.staff?.reduce(
          (sum: number, s: any) => sum + (s.quantity || 0),
          0
        ) || 0,
      custoTotal: unidadeSanitizada.costAmount || 0,
      taxaOcupacao: 0, // Pode calcular baseado nos leitos
    };

    const hashDados = this.calcularHash(unidadeSanitizada);

    const snapshot = await this.snapshotRepo.criar({
      escopo: "UNIDADE",
      tipoUnidade: "INTERNACAO",
      hospitalId,
      unidadeInternacaoId: unidadeId,
      dados: unidadeSanitizada, // ✅ Usar dados sanitizados
      resumo,
      hashDados,
      acao: "SNAPSHOT_MANUAL",
      usuarioId,
      observacao:
        observacao || `Snapshot de unidade - ${unidadeSanitizada.name}`,
    });

    return snapshot;
  }

  /**
   * Criar snapshot de unidade de não internação
   */
  async criarSnapshotUnidadeNaoInternacao(
    hospitalId: string,
    unidadeId: string,
    usuarioId?: string,
    observacao?: string
  ): Promise<SnapshotDimensionamento> {
    const dadosHospital =
      await this.hospitalSectorsRepo.getAllSectorsByHospital(hospitalId);
    const unidade = dadosHospital.assistance.find((u) => u.id === unidadeId);

    if (!unidade) {
      throw new Error(`Unidade de assistência ${unidadeId} não encontrada`);
    }

    // ✅ Sanitizar dados da unidade
    const unidadeSanitizada = this.sanitizarDados(unidade);

    const resumo = {
      totalProfissionais:
        unidadeSanitizada.staff?.reduce(
          (sum: number, s: any) => sum + (s.quantity || 0),
          0
        ) || 0,
      custoTotal: unidadeSanitizada.costAmount || 0,
    };

    const hashDados = this.calcularHash(unidadeSanitizada);

    const snapshot = await this.snapshotRepo.criar({
      escopo: "UNIDADE",
      tipoUnidade: "NAO_INTERNACAO",
      hospitalId,
      unidadeNaoInternacaoId: unidadeId,
      dados: unidadeSanitizada, // ✅ Usar dados sanitizados
      resumo,
      hashDados,
      acao: "SNAPSHOT_MANUAL",
      usuarioId,
      observacao:
        observacao || `Snapshot de unidade - ${unidadeSanitizada.name}`,
    });

    return snapshot;
  }

  /**
   * Buscar snapshots de um hospital
   */
  async buscarSnapshotsHospital(hospitalId: string, limite?: number) {
    return await this.snapshotRepo.buscarPorHospital(hospitalId, limite);
  }

  /**
   * Buscar último snapshot de hospital
   */
  async buscarUltimoSnapshotHospital(hospitalId: string) {
    return await this.snapshotRepo.buscarUltimoPorHospital(hospitalId);
  }

  /**
   * Buscar snapshot por ID
   */
  async buscarSnapshotPorId(id: string) {
    return await this.snapshotRepo.buscarPorId(id);
  }

  /**
   * Comparar dois snapshots
   */
  async compararSnapshots(id1: string, id2: string) {
    const { snapshot1, snapshot2 } = await this.snapshotRepo.compararSnapshots(
      id1,
      id2
    );

    if (!snapshot1 || !snapshot2) {
      throw new Error("Um ou ambos snapshots não encontrados");
    }

    // Calcular diferenças
    const diferencas = this.calcularDiferencas(snapshot1, snapshot2);

    return {
      snapshot1,
      snapshot2,
      diferencas,
    };
  }

  /**
   * Estatísticas de snapshots
   */
  async estatisticas(hospitalId: string) {
    return await this.snapshotRepo.estatisticas(hospitalId);
  }

  /**
   * Limpar snapshots antigos
   */
  async limparSnapshotsAntigos(meses: number) {
    const dataLimite = new Date();
    dataLimite.setMonth(dataLimite.getMonth() - meses);

    const removidos = await this.snapshotRepo.deletarAnterioresA(dataLimite);
    return { removidos, dataLimite };
  }

  // ===== MÉTODOS AUXILIARES =====

  /**
   * ✅ SANITIZAR DADOS - Remove símbolos de porcentagem e converte para número
   */
  private sanitizarDados(dados: any, caminho: string = "root"): any {
    if (!dados) return dados;

    // Se for array, sanitizar cada item
    if (Array.isArray(dados)) {
      return dados.map((item, index) =>
        this.sanitizarDados(item, `${caminho}[${index}]`)
      );
    }

    // Se for objeto, sanitizar cada propriedade
    if (typeof dados === "object") {
      const sanitizado: any = {};

      for (const [chave, valor] of Object.entries(dados)) {
        const caminhoCompleto = `${caminho}.${chave}`;

        // Se o valor for string com "%", remover e converter para número
        if (typeof valor === "string" && valor.includes("%")) {
          const numero = parseFloat(
            valor.replace("%", "").replace(",", ".").trim()
          );
          const resultado = isNaN(numero) ? 0 : numero;
          console.log(
            `🔧 [SANITIZAR] ${caminhoCompleto}: "${valor}" → ${resultado}`
          );
          sanitizado[chave] = resultado;
        }
        // Se for string numérica com vírgula (ex: "1.500,00"), converter
        else if (typeof valor === "string" && /^[\d.,]+$/.test(valor)) {
          const numero = parseFloat(
            valor.replace(/\./g, "").replace(",", ".").trim()
          );
          const resultado = isNaN(numero) ? valor : numero;
          if (typeof resultado === "number") {
            console.log(
              `🔧 [SANITIZAR] ${caminhoCompleto}: "${valor}" → ${resultado}`
            );
          }
          sanitizado[chave] = resultado;
        }
        // Se for objeto ou array, sanitizar recursivamente
        else if (typeof valor === "object" && valor !== null) {
          sanitizado[chave] = this.sanitizarDados(valor, caminhoCompleto);
        }
        // Outros casos, manter o valor original
        else {
          sanitizado[chave] = valor;
        }
      }

      return sanitizado;
    }

    // Se for primitivo, retornar direto
    return dados;
  }

  /**
   * Calcular resumo do hospital
   */
  private calcularResumoHospital(dados: any) {
    let totalProfissionais = 0;
    let custoTotal = 0;

    // Somar internação
    if (dados.internation) {
      dados.internation.forEach((unidade: any) => {
        if (unidade.staff) {
          unidade.staff.forEach((s: any) => {
            totalProfissionais += s.quantity || 0;
          });
        }
        custoTotal += unidade.costAmount || 0;
      });
    }

    // Somar assistência
    if (dados.assistance) {
      dados.assistance.forEach((unidade: any) => {
        if (unidade.staff) {
          unidade.staff.forEach((s: any) => {
            totalProfissionais += s.quantity || 0;
          });
        }
        custoTotal += unidade.costAmount || 0;
      });
    }

    return {
      totalProfissionais,
      custoTotal,
      totalUnidadesInternacao: dados.internation?.length || 0,
      totalUnidadesAssistencia: dados.assistance?.length || 0,
    };
  }

  /**
   * Calcular hash MD5 dos dados
   */
  private calcularHash(dados: any): string {
    const json = JSON.stringify(dados);
    return createHash("md5").update(json).digest("hex");
  }

  /**
   * Calcular diferenças entre dois snapshots
   */
  private calcularDiferencas(
    snapshot1: SnapshotDimensionamento,
    snapshot2: SnapshotDimensionamento
  ) {
    const diferencas: any = {
      periodo: {
        inicio: snapshot1.dataHora,
        fim: snapshot2.dataHora,
        dias: Math.floor(
          (snapshot2.dataHora.getTime() - snapshot1.dataHora.getTime()) /
            (1000 * 60 * 60 * 24)
        ),
      },
    };

    // Comparar resumos
    if (snapshot1.resumo && snapshot2.resumo) {
      diferencas.resumo = {
        totalProfissionais: {
          anterior: snapshot1.resumo.totalProfissionais,
          atual: snapshot2.resumo.totalProfissionais,
          diferenca:
            (snapshot2.resumo.totalProfissionais || 0) -
            (snapshot1.resumo.totalProfissionais || 0),
        },
        custoTotal: {
          anterior: snapshot1.resumo.custoTotal,
          atual: snapshot2.resumo.custoTotal,
          diferenca:
            (snapshot2.resumo.custoTotal || 0) -
            (snapshot1.resumo.custoTotal || 0),
        },
      };
    }

    return diferencas;
  }
}
