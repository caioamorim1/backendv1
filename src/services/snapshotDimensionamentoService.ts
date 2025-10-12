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

  /**
   * Agregar um snapshot por escopo (rede|grupo|regiao|hospital)
   * Se o snapshot for de hospital individual, retorna items agregados conforme groupBy
   */
  async agregarSnapshot(snapshotId: string | undefined, groupBy: string) {
    let snapshotsToAggregate: any[] = [];

    if (snapshotId) {
      // Buscar snapshot específico
      const snapshot = await this.snapshotRepo.buscarPorId(snapshotId);
      if (!snapshot) throw new Error("Snapshot não encontrado");

      const dados = snapshot.dados;

      if (Array.isArray(dados.hospitais)) {
        snapshotsToAggregate = dados.hospitais;
      } else if (snapshot.escopo === "HOSPITAL") {
        snapshotsToAggregate = [
          {
            hospitalId: snapshot.hospitalId,
            nome: dados.hospital?.nome || dados.hospital?.name || "Hospital",
            internation:
              dados.internation || dados.unidades || dados.internacao || [],
            assistance: dados.assistance || dados.unidadesNaoInternacao || [],
          },
        ];
      }
    } else {
      // Agregar últimos snapshots de todos hospitais
      const latestSnapshots =
        await this.snapshotRepo.buscarUltimosSnapshotsTodosHospitais();
      snapshotsToAggregate = latestSnapshots.map((s) => {
        const dados = s.dados || {};
        if (Array.isArray(dados.hospitais)) {
          return dados.hospitais[0];
        }
        return {
          hospitalId: s.hospitalId,
          nome: dados.hospital?.nome || dados.hospital?.name || "Hospital",
          internation:
            dados.internation || dados.unidades || dados.internacao || [],
          assistance: dados.assistance || dados.unidadesNaoInternacao || [],
        };
      });
    }

    // Coletar hospitalIds e buscar hierarquia
    const hospitalIds = snapshotsToAggregate
      .map((h) => h.hospitalId)
      .filter(Boolean);
    const hierarchy = await this.snapshotRepo.getHospitalHierarchy(hospitalIds);

    // Map de agregação: chave depende do groupBy
    const itemsMap: Map<string, any> = new Map();

    function getKeyAndName(hospital: any) {
      const hInfo = hierarchy[hospital.hospitalId] || {};
      switch (groupBy) {
        case "rede":
          return {
            key: `rede-${hInfo.redeId || "unknown"}`,
            name: hInfo.redeName || "Rede",
          };
        case "grupo":
          return {
            key: `grupo-${hInfo.grupoId || "unknown"}`,
            name: hInfo.grupoName || "Grupo",
          };
        case "regiao":
          return {
            key: `regiao-${hInfo.regiaoId || "unknown"}`,
            name: hInfo.regiaoName || "Região",
          };
        default:
          return {
            key: `hospital-${hospital.hospitalId}`,
            name: hospital.nome || hInfo.hospitalName || "Hospital",
          };
      }
    }

    // Função para agregar setores por nome dentro de um item
    function aggregateSectors(
      target: any,
      sectors: any[],
      isInternation: boolean
    ) {
      if (!Array.isArray(sectors)) return;
      for (const s of sectors) {
        const sectorName = s.name || s.nome || s.id;
        const sectorId = `${target.id}|${sectorName}`;
        let existing = (
          isInternation ? target.internation : target.assistance
        ).find((x: any) => x.name === sectorName);
        if (!existing) {
          existing = {
            id: sectorId,
            name: sectorName,
            entityName: target.name,
            costAmount: s.costAmount || 0,
            projectedCostAmount: s.projectedCostAmount || s.costAmount || 0,
            staff: s.staff || [],
            projectedStaff: s.projectedStaff || s.staff || [],
          };
          if (isInternation) {
            existing.bedCount = s.bedCount || 0;
            existing.careLevel = s.careLevel || {};
            existing.bedStatus = s.bedStatus || {};
          }
          (isInternation ? target.internation : target.assistance).push(
            existing
          );
        } else {
          // Somar campos numéricos
          existing.costAmount =
            (existing.costAmount || 0) + (s.costAmount || 0);
          existing.projectedCostAmount =
            (existing.projectedCostAmount || 0) +
            (s.projectedCostAmount || s.costAmount || 0);
          existing.bedCount = (existing.bedCount || 0) + (s.bedCount || 0);
          // Agregar careLevel
          if (s.careLevel) {
            existing.careLevel = existing.careLevel || {};
            for (const [k, v] of Object.entries(s.careLevel)) {
              existing.careLevel[k] =
                (existing.careLevel[k] || 0) + ((v as number) || 0);
            }
          }
          // Agregar bedStatus
          if (s.bedStatus) {
            existing.bedStatus = existing.bedStatus || {};
            for (const [k, v] of Object.entries(s.bedStatus)) {
              existing.bedStatus[k] =
                (existing.bedStatus[k] || 0) + ((v as number) || 0);
            }
          }
          // Agregar staff arrays (por role)
          function mergeStaff(dest: any[], src: any[]) {
            const map = new Map(dest.map((it: any) => [it.role, it.quantity]));
            for (const r of src || []) {
              const prev = map.get(r.role) || 0;
              map.set(r.role, prev + (r.quantity || 0));
            }
            return Array.from(map.entries()).map(([role, quantity]) => ({
              role,
              quantity,
            }));
          }
          existing.staff = mergeStaff(existing.staff || [], s.staff || []);
          existing.projectedStaff = mergeStaff(
            existing.projectedStaff || [],
            s.projectedStaff || s.staff || []
          );
        }
      }
    }

    // Iterar hospitais e agregar
    for (const hosp of snapshotsToAggregate) {
      const { key, name } = getKeyAndName(hosp);
      if (!itemsMap.has(key)) {
        itemsMap.set(key, { id: key, name, internation: [], assistance: [] });
      }
      const target = itemsMap.get(key);
      aggregateSectors(target, hosp.internation || [], true);
      aggregateSectors(target, hosp.assistance || [], false);
    }

    const items = Array.from(itemsMap.values());

    // Determinar snapshotId/data retornada:
    // - se o usuário pediu um snapshotId específico, retornamos ele e a sua data
    // - se agregamos todos os hospitais, retornamos snapshotId = null e snapshotDate = última data entre os snapshots agregados
    let aggregatedSnapshotId: string | null = null;
    let aggregatedSnapshotDate: Date = new Date();

    if (snapshotId) {
      aggregatedSnapshotId = snapshotId;
      // tentar pegar data de um dos snapshotsToAggregate (quando veio via snapshotId, tinha somente um snapshot original)
      // quando snapshotId foi passado originalmente, a variável `snapshot` existia no escopo anterior; tentamos recuperar uma data coerente:
      const first = snapshotsToAggregate[0];
      if (first && first.dataHora) {
        aggregatedSnapshotDate = new Date(first.dataHora);
      }
    } else {
      // snapshotsToAggregate foram construídos a partir de latestSnapshots; tentar pegar a máxima dataHora
      const dates = snapshotsToAggregate
        .map((s) => s.dataHora)
        .filter(Boolean)
        .map((d: any) => new Date(d));
      if (dates.length > 0) {
        aggregatedSnapshotDate = new Date(
          Math.max(...dates.map((d) => d.getTime()))
        );
      }
    }

    return {
      aggregatedBy: groupBy,
      snapshotId: aggregatedSnapshotId,
      snapshotDate: aggregatedSnapshotDate,
      items,
    };
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
          // Normalizar campos monetários para centavos (inteiro)
          if (
            typeof resultado === "number" &&
            /cost|custo|valor|price|preco/i.test(chave)
          ) {
            // Se tem casas decimais, assumir BRL float e converter para centavos
            if (!Number.isInteger(resultado)) {
              sanitizado[chave] = Math.round(resultado * 100);
            } else {
              // Se já é inteiro, deixar como está (assume centavos)
              sanitizado[chave] = resultado;
            }
          } else {
            sanitizado[chave] = resultado;
          }
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
