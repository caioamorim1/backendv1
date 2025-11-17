import { DataSource } from "typeorm";
import { SnapshotDimensionamento } from "../entities/SnapshotDimensionamento";
import { HospitalSectorsRepository } from "../repositories/hospitalSectorsRepository";
import { Cargo } from "../entities/Cargo";

/**
 * Serviço para comparação de dados:
 * - Atual (tempo real)
 * - Atual do Snapshot selecionado
 * - Projetado do Snapshot selecionado
 */
export class HospitalComparativeSnapshotService {
  private hospitalSectorsRepo: HospitalSectorsRepository;
  private cargoCache: Map<string, string> = new Map(); // cargoId -> nome

  constructor(private ds: DataSource) {
    this.hospitalSectorsRepo = new HospitalSectorsRepository(ds);
  }

  /**
   * Busca o comparativo completo para um hospital
   */
  async getHospitalComparative(hospitalId: string) {
    console.log(`\n🔍 ===== COMPARATIVO SNAPSHOT HOSPITAL ${hospitalId} =====`);

    // 1. Buscar dados ATUAIS (tempo real)
    const dadosAtuaisReal =
      await this.hospitalSectorsRepo.getAllSectorsByHospital(hospitalId);

    // 2. Buscar snapshot selecionado
    const snapshotSelecionado = await this.ds
      .getRepository(SnapshotDimensionamento)
      .findOne({
        where: {
          hospitalId,
          escopo: "HOSPITAL",
          selecionado: true,
        },
        order: { dataHora: "DESC" },
      });

    if (!snapshotSelecionado) {
      throw new Error(
        `Nenhum snapshot selecionado encontrado para o hospital ${hospitalId}`
      );
    }

    console.log(
      `📸 Snapshot selecionado: ${snapshotSelecionado.id} (${snapshotSelecionado.dataHora})`
    );

    // 3. Extrair dados do snapshot
    const dadosSnapshot = snapshotSelecionado.dados;
    const projetadoFinal = dadosSnapshot.projetadoFinal || {};

    // 4. Carregar cache de nomes de cargos
    await this.carregarCargosCache(dadosSnapshot, projetadoFinal);

    // 5. Processar unidades de internação
    const internation = await this.processarInternacao(
      dadosAtuaisReal.internation || [],
      dadosSnapshot.internation || [],
      projetadoFinal.internacao || []
    );

    // 6. Processar unidades de assistência (não-internação)
    const assistance = await this.processarAssistencia(
      dadosAtuaisReal.assistance || [],
      dadosSnapshot.assistance || [],
      projetadoFinal.naoInternacao || []
    );

    console.log(`✅ ===== FIM COMPARATIVO SNAPSHOT =====\n`);

    return {
      hospitalId,
      snapshotId: snapshotSelecionado.id,
      snapshotData: snapshotSelecionado.dataHora,
      sectors: {
        internation,
        assistance,
      },
    };
  }

  /**
   * Carrega cache de nomes de cargos
   */
  private async carregarCargosCache(dadosSnapshot: any, projetadoFinal: any) {
    const cargoIds = new Set<string>();

    // Extrair IDs de cargos do snapshot atual
    for (const unidade of dadosSnapshot.internation || []) {
      for (const staff of unidade.staff || []) {
        if (staff.id) cargoIds.add(staff.id);
      }
    }
    for (const unidade of dadosSnapshot.assistance || []) {
      for (const staff of unidade.staff || []) {
        if (staff.id) cargoIds.add(staff.id);
      }
    }

    // Extrair IDs de cargos do projetado final
    for (const proj of projetadoFinal.internacao || []) {
      for (const cargo of proj.cargos || []) {
        if (cargo.cargoId) cargoIds.add(cargo.cargoId);
      }
    }
    for (const proj of projetadoFinal.naoInternacao || []) {
      for (const sitio of proj.sitios || []) {
        for (const cargo of sitio.cargos || []) {
          if (cargo.cargoId) cargoIds.add(cargo.cargoId);
        }
      }
    }

    // Buscar nomes dos cargos no banco
    if (cargoIds.size > 0) {
      const cargos = await this.ds
        .getRepository(Cargo)
        .createQueryBuilder("c")
        .where("c.id IN (:...ids)", { ids: Array.from(cargoIds) })
        .select(["c.id", "c.nome"])
        .getMany();

      for (const cargo of cargos) {
        this.cargoCache.set(cargo.id, cargo.nome);
      }
    }

    console.log(
      `🏷️  Carregados ${this.cargoCache.size} nomes de cargos no cache`
    );
  }

  /**
   * Processa unidades de internação
   */
  private async processarInternacao(
    atuaisReal: any[],
    atuaisSnapshot: any[],
    projetadosSnapshot: any[]
  ) {
    const resultado: any[] = [];

    // Criar mapa de unidades por ID
    const mapAtualReal = new Map(atuaisReal.map((u) => [u.id, u]));
    const mapAtualSnapshot = new Map(atuaisSnapshot.map((u) => [u.id, u]));
    const mapProjetadoSnapshot = new Map(
      projetadosSnapshot.map((u) => [u.unidadeId, u])
    );

    // Iterar por todas as unidades únicas
    const allUnitIds = new Set([
      ...atuaisReal.map((u) => u.id),
      ...atuaisSnapshot.map((u) => u.id),
      ...projetadosSnapshot.map((u) => u.unidadeId),
    ]);

    for (const unitId of allUnitIds) {
      const atualReal = mapAtualReal.get(unitId);
      const atualSnapshot = mapAtualSnapshot.get(unitId);
      const projetadoSnapshot = mapProjetadoSnapshot.get(unitId);

      // Extrair informações básicas
      const nome =
        atualReal?.name ||
        atualSnapshot?.name ||
        projetadoSnapshot?.unidadeNome ||
        "Desconhecida";

      // Processar quadro de pessoal atual (tempo real)
      const quadroAtualReal = this.extrairQuadroPorCargo(
        atualReal?.staff || []
      );
      const custosAtualReal = this.extrairCustosPorCargo(
        atualReal?.staff || []
      );

      // Processar quadro atual do snapshot
      const quadroAtualSnapshot = this.extrairQuadroPorCargo(
        atualSnapshot?.staff || []
      );
      const custosAtualSnapshot = this.extrairCustosPorCargo(
        atualSnapshot?.staff || []
      );

      // Processar quadro projetado do snapshot (internação)
      const quadroProjetadoSnapshot = this.extrairQuadroProjetadoInternacao(
        projetadoSnapshot?.cargos || []
      );

      // Calcular diferenças (atual snapshot - projetado snapshot)
      const diferencas = this.calcularDiferencas(
        quadroAtualSnapshot,
        quadroProjetadoSnapshot
      );

      // Processar dados dimensionamento (leitos, classificação, etc.)
      const dimensionamento = projetadoSnapshot?.dimensionamento || null;

      resultado.push({
        id: unitId,
        name: nome,
        tipo: "NAO_INTERNACAO",

        // Quadro atual real (tempo real)
        quadroAtualReal,
        custosAtualReal,

        // Quadro atual do snapshot
        quadroAtualSnapshot,
        custosAtualSnapshot,

        // Quadro projetado do snapshot
        quadroProjetadoSnapshot,

        // Diferenças (atual snapshot - projetado snapshot)
        diferencas,

        // Dados adicionais do dimensionamento
        dimensionamento: dimensionamento
          ? {
              leitosOcupados: dimensionamento.leitosOcupados || 0,
              leitosVagos: dimensionamento.leitosVagos || 0,
              leitosInativos: dimensionamento.leitosInativos || 0,
              totalLeitos: dimensionamento.totalLeitos || 0,
              distribuicaoClassificacao:
                dimensionamento.distribuicaoClassificacao || {},
            }
          : null,
      });
    }

    return resultado;
  }

  /**
   * Processa unidades de assistência (não-internação)
   */
  private async processarAssistencia(
    atuaisReal: any[],
    atuaisSnapshot: any[],
    projetadosSnapshot: any[]
  ) {
    const resultado: any[] = [];

    const mapAtualReal = new Map(atuaisReal.map((u) => [u.id, u]));
    const mapAtualSnapshot = new Map(atuaisSnapshot.map((u) => [u.id, u]));
    const mapProjetadoSnapshot = new Map(
      projetadosSnapshot.map((u) => [u.unidadeId, u])
    );

    const allUnitIds = new Set([
      ...atuaisReal.map((u) => u.id),
      ...atuaisSnapshot.map((u) => u.id),
      ...projetadosSnapshot.map((u) => u.unidadeId),
    ]);

    for (const unitId of allUnitIds) {
      const atualReal = mapAtualReal.get(unitId);
      const atualSnapshot = mapAtualSnapshot.get(unitId);
      const projetadoSnapshot = mapProjetadoSnapshot.get(unitId);

      const nome =
        atualReal?.name ||
        atualSnapshot?.name ||
        projetadoSnapshot?.unidadeNome ||
        "Desconhecida";

      // Quadro atual real
      const quadroAtualReal = this.extrairQuadroPorCargo(
        atualReal?.staff || []
      );

      // Quadro atual do snapshot
      const quadroAtualSnapshot = this.extrairQuadroPorCargo(
        atualSnapshot?.staff || []
      );
      const custosAtualSnapshot = this.extrairCustosPorCargo(
        atualSnapshot?.staff || []
      );

      // Quadro projetado do snapshot (pode vir por sítio)
      const quadroProjetadoSnapshot = this.extrairQuadroProjetadoNaoInternacao(
        projetadoSnapshot?.sitios || []
      );

      // Diferenças
      const diferencas = this.calcularDiferencas(
        quadroAtualSnapshot,
        quadroProjetadoSnapshot
      );

      resultado.push({
        id: unitId,
        name: nome,
        tipo: "NAO_INTERNACAO",

        quadroAtualReal,
        quadroAtualSnapshot,
        custosAtualSnapshot,
        quadroProjetadoSnapshot,
        diferencas,
      });
    }

    return resultado;
  }

  /**
   * Extrai quadro de pessoal por cargo (formato: [{role, quantity}])
   */
  private extrairQuadroPorCargo(staff: any[]): Record<string, number> {
    const resultado: Record<string, number> = {};

    for (const s of staff || []) {
      const cargo = s.role || "Desconhecido";
      resultado[cargo] = (resultado[cargo] || 0) + (s.quantity || 0);
    }

    return resultado;
  }

  /**
   * Extrai custos UNITÁRIOS por cargo (custo por funcionário)
   */
  private extrairCustosPorCargo(staff: any[]): Record<string, number> {
    const resultado: Record<string, number> = {};

    for (const s of staff || []) {
      const cargo = s.role || "Desconhecido";
      // Prioriza unitCost, se não existir calcula a partir de totalCost / quantity
      const custoUnitario =
        s.unitCost ||
        (s.totalCost && s.quantity ? s.totalCost / s.quantity : 0);
      resultado[cargo] = custoUnitario || 0;
    }

    return resultado;
  }

  /**
   * Extrai quadro projetado de internação
   * Formato: [{cargoId, projetadoFinal}]
   */
  private extrairQuadroProjetadoInternacao(
    cargos: any[]
  ): Record<string, number> {
    const resultado: Record<string, number> = {};

    for (const c of cargos || []) {
      const cargoNome = this.cargoCache.get(c.cargoId) || "Desconhecido";
      resultado[cargoNome] = c.projetadoFinal || 0;
    }

    return resultado;
  }

  /**
   * Extrai quadro projetado de não-internação (por sítio)
   * Formato: [{sitioId, cargos: [{cargoId, projetadoFinal}]}]
   */
  private extrairQuadroProjetadoNaoInternacao(
    sitios: any[]
  ): Record<string, number> {
    const resultado: Record<string, number> = {};

    for (const sitio of sitios || []) {
      for (const cargo of sitio.cargos || []) {
        const cargoNome = this.cargoCache.get(cargo.cargoId) || "Desconhecido";
        resultado[cargoNome] =
          (resultado[cargoNome] || 0) + (cargo.projetadoFinal || 0);
      }
    }

    return resultado;
  }

  /**
   * Calcula diferenças entre atual e projetado
   * Diferença = Projetado - Atual
   * Positivo = FALTA pessoal (precisa contratar)
   * Negativo = SOBRA pessoal (tem a mais)
   */
  private calcularDiferencas(
    atualSnapshot: Record<string, number>,
    projetadoSnapshot: Record<string, number>
  ): Record<string, number> {
    const resultado: Record<string, number> = {};

    // Todos os cargos presentes
    const allCargos = new Set([
      ...Object.keys(atualSnapshot),
      ...Object.keys(projetadoSnapshot),
    ]);

    for (const cargo of allCargos) {
      const atual = atualSnapshot[cargo] || 0;
      const projetado = projetadoSnapshot[cargo] || 0;
      resultado[cargo] = projetado - atual;
    }

    return resultado;
  }
}
