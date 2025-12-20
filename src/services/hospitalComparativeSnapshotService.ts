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

    // 7. Processar unidades neutras
    const neutral = await this.processarNeutras(
      dadosAtuaisReal.neutral || [],
      dadosSnapshot.neutral || []
    );

    console.log(`✅ ===== FIM COMPARATIVO SNAPSHOT =====\n`);

    const resultado = {
      hospitalId,
      snapshotId: snapshotSelecionado.id,
      snapshotData: snapshotSelecionado.dataHora,
      sectors: {
        internation,
        assistance,
        neutral,
      },
    };

    return resultado;
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
   * Processa unidades neutras (sem staff, apenas custo)
   */
  private async processarNeutras(atuaisReal: any[], atuaisSnapshot: any[]) {
    const resultado: any[] = [];

    // Criar mapa de unidades por ID
    const mapAtualReal = new Map(atuaisReal.map((u) => [u.id, u]));
    const mapAtualSnapshot = new Map(atuaisSnapshot.map((u) => [u.id, u]));

    // Iterar por todas as unidades únicas
    const allUnitIds = new Set([
      ...atuaisReal.map((u) => u.id),
      ...atuaisSnapshot.map((u) => u.id),
    ]);

    for (const unitId of allUnitIds) {
      const atualReal = mapAtualReal.get(unitId);
      const atualSnapshot = mapAtualSnapshot.get(unitId);

      // Extrair informações básicas
      const nome = atualReal?.name || atualSnapshot?.name || "Desconhecida";

      const custoAtualReal = parseFloat(atualReal?.costAmount || 0);
      const custoAtualSnapshot = parseFloat(atualSnapshot?.costAmount || 0);
      const statusAtualReal = atualReal?.status || "inativo";
      const statusAtualSnapshot = atualSnapshot?.status || "inativo";

      // Calcular diferença de custo (atual real - snapshot)
      const diferencaCusto = custoAtualReal - custoAtualSnapshot;

      resultado.push({
        id: unitId,
        name: nome,
        tipo: "NEUTRAL",
        custoAtualReal,
        custoAtualSnapshot,
        diferencaCusto,
        statusAtualReal,
        statusAtualSnapshot,
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

  /**
   * Busca comparativo agregado para uma rede
   */
  async getRedeComparative(redeId: string) {
    console.log(`\n🔍 ===== COMPARATIVO SNAPSHOT REDE ${redeId} =====`);

    // Buscar todos os hospitais da rede
    const hospitalsQuery = `SELECT id FROM public.hospitais WHERE "redeId" = $1`;
    const hospitals = await this.ds.query(hospitalsQuery, [redeId]);

    if (hospitals.length === 0) {
      throw new Error(`Nenhum hospital encontrado na rede ${redeId}`);
    }

    // Buscar comparativo de cada hospital e agregar
    const allInternation: any[] = [];
    const allAssistance: any[] = [];
    const allNeutral: any[] = [];

    for (const hospital of hospitals) {
      try {
        const hospitalData = await this.getHospitalComparative(hospital.id);
        console.log(
          `📊 Hospital ${hospital.id} - Internação: ${
            hospitalData.sectors.internation?.length || 0
          } setores`
        );
        console.log(
          `📊 Hospital ${hospital.id} - Assistência: ${
            hospitalData.sectors.assistance?.length || 0
          } setores`
        );

        // Debug: mostrar dados do primeiro setor
        if (hospitalData.sectors.internation?.[0]) {
          console.log(
            `🔍 Primeiro setor internação:`,
            JSON.stringify(hospitalData.sectors.internation[0], null, 2)
          );
        }

        allInternation.push(...(hospitalData.sectors.internation || []));
        allAssistance.push(...(hospitalData.sectors.assistance || []));
        allNeutral.push(...(hospitalData.sectors.neutral || []));
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar hospital ${hospital.id}:`, error);
        // Continua com os próximos hospitais
      }
    }

    console.log(`\n📦 Total agregado antes de processar:`);
    console.log(`   Internação: ${allInternation.length} setores`);
    console.log(`   Assistência: ${allAssistance.length} setores`);
    console.log(`   Neutras: ${allNeutral.length} unidades`);

    // Agregar por nome de setor
    const internation = this.agregarSetores(allInternation);
    const assistance = this.agregarSetores(allAssistance);
    const neutral = this.agregarNeutras(allNeutral);

    console.log(`✅ ===== FIM COMPARATIVO SNAPSHOT REDE =====\n`);

    return {
      redeId,
      hospitalsCount: hospitals.length,
      sectors: {
        internation,
        assistance,
        neutral,
      },
    };
  }

  /**
   * Busca comparativo agregado para um grupo
   */
  async getGrupoComparative(grupoId: string) {
    console.log(`\n🔍 ===== COMPARATIVO SNAPSHOT GRUPO ${grupoId} =====`);

    const hospitalsQuery = `SELECT id FROM public.hospitais WHERE "grupoId" = $1`;
    const hospitals = await this.ds.query(hospitalsQuery, [grupoId]);

    if (hospitals.length === 0) {
      throw new Error(`Nenhum hospital encontrado no grupo ${grupoId}`);
    }

    const allInternation: any[] = [];
    const allAssistance: any[] = [];
    const allNeutral: any[] = [];

    for (const hospital of hospitals) {
      try {
        const hospitalData = await this.getHospitalComparative(hospital.id);
        allInternation.push(...(hospitalData.sectors.internation || []));
        allAssistance.push(...(hospitalData.sectors.assistance || []));
        allNeutral.push(...(hospitalData.sectors.neutral || []));
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar hospital ${hospital.id}:`, error);
      }
    }

    const internation = this.agregarSetores(allInternation);
    const assistance = this.agregarSetores(allAssistance);
    const neutral = this.agregarNeutras(allNeutral);

    console.log(`✅ ===== FIM COMPARATIVO SNAPSHOT GRUPO =====\n`);

    return {
      grupoId,
      hospitalsCount: hospitals.length,
      sectors: {
        internation,
        assistance,
        neutral,
      },
    };
  }

  /**
   * Busca comparativo agregado para uma região
   */
  async getRegiaoComparative(regiaoId: string) {
    console.log(`\n🔍 ===== COMPARATIVO SNAPSHOT REGIÃO ${regiaoId} =====`);

    const hospitalsQuery = `SELECT id FROM public.hospitais WHERE "regiaoId" = $1`;
    const hospitals = await this.ds.query(hospitalsQuery, [regiaoId]);

    if (hospitals.length === 0) {
      throw new Error(`Nenhum hospital encontrado na região ${regiaoId}`);
    }

    const allInternation: any[] = [];
    const allAssistance: any[] = [];
    const allNeutral: any[] = [];

    for (const hospital of hospitals) {
      try {
        const hospitalData = await this.getHospitalComparative(hospital.id);
        allInternation.push(...(hospitalData.sectors.internation || []));
        allAssistance.push(...(hospitalData.sectors.assistance || []));
        allNeutral.push(...(hospitalData.sectors.neutral || []));
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar hospital ${hospital.id}:`, error);
      }
    }

    const internation = this.agregarSetores(allInternation);
    const assistance = this.agregarSetores(allAssistance);
    const neutral = this.agregarNeutras(allNeutral);

    console.log(`✅ ===== FIM COMPARATIVO SNAPSHOT REGIÃO =====\n`);

    return {
      regiaoId,
      hospitalsCount: hospitals.length,
      sectors: {
        internation,
        assistance,
        neutral,
      },
    };
  }

  /**
   * Agrega setores por nome
   */
  private agregarSetores(setores: any[]): any[] {
    const map = new Map<string, any>();

    for (const setor of setores) {
      const key = setor.name;

      if (!map.has(key)) {
        map.set(key, {
          name: setor.name,
          // Dados de leitos (apenas para internação)
          bedCount: 0,
          minimumCare: 0,
          intermediateCare: 0,
          highDependency: 0,
          semiIntensive: 0,
          intensive: 0,
          bedStatusEvaluated: 0,
          bedStatusVacant: 0,
          bedStatusInactive: 0,
          // Custos atuais
          actualRealCostAmount: 0,
          actualSnapshotCostAmount: 0,
          projectedSnapshotCostAmount: 0,
          // Staff agregado - usando os nomes corretos dos dados
          quadroAtualReal: {} as Record<string, number>,
          custosAtualReal: {} as Record<string, number>,
          quadroAtualSnapshot: {} as Record<string, number>,
          custosAtualSnapshot: {} as Record<string, number>,
          quadroProjetadoSnapshot: {} as Record<string, number>,
          diferencas: {} as Record<string, number>,
        });
      }

      const agg = map.get(key);

      // Somar dados de dimensionamento (leitos)
      if (setor.dimensionamento) {
        agg.bedCount += setor.dimensionamento.totalLeitos || 0;
        agg.bedStatusEvaluated += setor.dimensionamento.leitosOcupados || 0;
        agg.bedStatusVacant += setor.dimensionamento.leitosVagos || 0;
        agg.bedStatusInactive += setor.dimensionamento.leitosInativos || 0;

        // Distribuição por classificação
        if (setor.dimensionamento.distribuicaoClassificacao) {
          const dist = setor.dimensionamento.distribuicaoClassificacao;
          agg.minimumCare += dist.CUIDADOS_MINIMOS || 0;
          agg.intermediateCare += dist.INTERMEDIARIOS || 0;
          agg.highDependency += dist.ALTA_DEPENDENCIA || 0;
          agg.semiIntensive += dist.SEMI_INTENSIVOS || 0;
          agg.intensive += dist.INTENSIVOS || 0;
        }
      }

      // Somar custos
      if (setor.custosAtualReal) {
        const totalCustoReal = Object.values(setor.custosAtualReal).reduce(
          (sum: number, val: any) => sum + (parseFloat(val) || 0),
          0
        );
        agg.actualRealCostAmount += totalCustoReal;
      }

      if (setor.custosAtualSnapshot) {
        const totalCustoSnapshot = Object.values(
          setor.custosAtualSnapshot
        ).reduce((sum: number, val: any) => sum + (parseFloat(val) || 0), 0);
        agg.actualSnapshotCostAmount += totalCustoSnapshot;
      }

      // Agregar staff por cargo
      this.agregarStaffPorCargo(agg.quadroAtualReal, setor.quadroAtualReal);
      this.agregarStaffPorCargo(agg.custosAtualReal, setor.custosAtualReal);
      this.agregarStaffPorCargo(
        agg.quadroAtualSnapshot,
        setor.quadroAtualSnapshot
      );
      this.agregarStaffPorCargo(
        agg.custosAtualSnapshot,
        setor.custosAtualSnapshot
      );
      this.agregarStaffPorCargo(
        agg.quadroProjetadoSnapshot,
        setor.quadroProjetadoSnapshot
      );
      this.agregarStaffPorCargo(agg.diferencas, setor.diferencas);
    }

    return Array.from(map.values());
  }

  /**
   * Agrega staff por cargo
   */
  private agregarStaffPorCargo(
    target: Record<string, number>,
    source: Record<string, number>
  ) {
    for (const [cargo, quantidade] of Object.entries(source || {})) {
      target[cargo] = (target[cargo] || 0) + quantidade;
    }
  }

  /**
   * Agrega unidades neutras por nome
   */
  private agregarNeutras(neutras: any[]): any[] {
    const map = new Map<string, any>();

    for (const neutra of neutras) {
      const key = neutra.name;

      if (!map.has(key)) {
        map.set(key, {
          name: neutra.name,
          tipo: "NEUTRAL",
          custoAtualReal: 0,
          custoAtualSnapshot: 0,
          diferencaCusto: 0,
          statusAtualReal: neutra.statusAtualReal || "inativo",
          statusAtualSnapshot: neutra.statusAtualSnapshot || "inativo",
        });
      }

      const agg = map.get(key);

      // Somar custos
      agg.custoAtualReal += parseFloat(neutra.custoAtualReal || 0);
      agg.custoAtualSnapshot += parseFloat(neutra.custoAtualSnapshot || 0);
      agg.diferencaCusto += parseFloat(neutra.diferencaCusto || 0);
    }

    return Array.from(map.values());
  }
}
