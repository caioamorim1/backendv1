import { DataSource } from "typeorm";
import {
  InternationSectorWithHospitalDTO,
  AssistanceSectorWithHospitalDTO,
  AggregatedSectorsDTO,
  SectorsAggregateDTO,
  GlobalAggregatedListDTO,
  ProjectedSectorsAggregateDTO,
  ProjectedInternationSectorDTO,
  ProjectedAssistanceSectorDTO,
} from "../dto/hospitalSectorsAggregate.dto";
import { DimensionamentoService } from "../services/dimensionamentoService";
import { DimensionamentoCacheRepository } from "./dimensionamentoCacheRepository";

export class HospitalSectorsAggregateRepository {
  private cacheRepo: DimensionamentoCacheRepository;
  private readonly CACHE_VALIDITY_MINUTES = 30; // Cache válido por 30 minutos

  constructor(private ds: DataSource) {
    this.cacheRepo = new DimensionamentoCacheRepository(ds);
  }

  // Busca TODOS os hospitais
  async getAllSectors(): Promise<SectorsAggregateDTO> {
    const internation = await this.getAllInternationSectors();
    const assistance = await this.getAllAssistanceSectors();

    return {
      id: `all-hospitals-sectors`,
      hospitals: await this.aggregateSectorsByHospital(internation, assistance),
    };
  }

  // Busca por Rede
  async getSectorsByNetwork(networkId: string): Promise<SectorsAggregateDTO> {
    const internation = await this.getInternationSectorsByNetwork(networkId);
    const assistance = await this.getAssistanceSectorsByNetwork(networkId);

    return {
      id: `network-sectors-${networkId}`,
      hospitals: await this.aggregateSectorsByHospital(internation, assistance),
    };
  }

  // Busca por Grupo
  async getSectorsByGroup(groupId: string): Promise<SectorsAggregateDTO> {
    const internation = await this.getInternationSectorsByGroup(groupId);
    const assistance = await this.getAssistanceSectorsByGroup(groupId);

    return {
      id: `group-sectors-${groupId}`,
      hospitals: await this.aggregateSectorsByHospital(internation, assistance),
    };
  }

  // Busca por Região
  async getSectorsByRegion(regionId: string): Promise<SectorsAggregateDTO> {
    const internation = await this.getInternationSectorsByRegion(regionId);
    const assistance = await this.getAssistanceSectorsByRegion(regionId);

    return {
      id: `region-sectors-${regionId}`,
      hospitals: await this.aggregateSectorsByHospital(internation, assistance),
    };
  }

  private async getInternationSectorsByNetwork(
    networkId: string
  ): Promise<InternationSectorWithHospitalDTO[]> {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        COALESCE(ls.bed_count, 0) AS "bedCount",
        JSON_BUILD_OBJECT(
          'minimumCare',      COALESCE(ls.minimum_care, 0),
          'intermediateCare', COALESCE(ls.intermediate_care, 0),
          'highDependency',   COALESCE(ls.high_dependency, 0),
          'semiIntensive',    COALESCE(ls.semi_intensive, 0),
          'intensive',        COALESCE(ls.intensive, 0)
        ) AS "careLevel",
        JSON_BUILD_OBJECT(
          'evaluated', COALESCE(ls.evaluated, 0),
          'vacant',    COALESCE(ls.vacant, 0),
          'inactive',  COALESCE(ls.inactive, 0)
        ) AS "bedStatus",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      INNER JOIN public.regiao r ON r.id = h."regiaoId"
      INNER JOIN public.grupo g ON g.id = r."grupoId" 
      INNER JOIN public.rede n ON n.id = g."redeId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE n.id = $1
      GROUP BY 
        uni.id, uni.nome, h.nome, uni.descricao,
        ls.bed_count, ls.minimum_care, ls.intermediate_care,
        ls.high_dependency, ls.semi_intensive, ls.intensive,
        ls.evaluated, ls.vacant, ls.inactive
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query, [networkId]);
  }

  private async getAllInternationSectors(): Promise<
    InternationSectorWithHospitalDTO[]
  > {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        COALESCE(ls.bed_count, 0) AS "bedCount",
        JSON_BUILD_OBJECT(
          'minimumCare',      COALESCE(ls.minimum_care, 0),
          'intermediateCare', COALESCE(ls.intermediate_care, 0),
          'highDependency',   COALESCE(ls.high_dependency, 0),
          'semiIntensive',    COALESCE(ls.semi_intensive, 0),
          'intensive',        COALESCE(ls.intensive, 0)
        ) AS "careLevel",
        JSON_BUILD_OBJECT(
          'evaluated', COALESCE(ls.evaluated, 0),
          'vacant',    COALESCE(ls.vacant, 0),
          'inactive',  COALESCE(ls.inactive, 0)
        ) AS "bedStatus",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      GROUP BY 
        uni.id, uni.nome, h.nome, uni.descricao,
        ls.bed_count, ls.minimum_care, ls.intermediate_care,
        ls.high_dependency, ls.semi_intensive, ls.intensive,
        ls.evaluated, ls.vacant, ls.inactive
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query);
  }

  private async getAllAssistanceSectors(): Promise<
    AssistanceSectorWithHospitalDTO[]
  > {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_nao_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      GROUP BY uni.id, uni.nome, h.nome, uni.descricao
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query);
  }

  private async getAssistanceSectorsByNetwork(
    networkId: string
  ): Promise<AssistanceSectorWithHospitalDTO[]> {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_nao_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      INNER JOIN public.regiao r ON r.id = h."regiaoId"
      INNER JOIN public.grupo g ON g.id = r."grupoId"
      INNER JOIN public.rede n ON n.id = g."redeId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      WHERE n.id = $1
      GROUP BY uni.id, uni.nome, h.nome, uni.descricao
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query, [networkId]);
  }

  private async getInternationSectorsByGroup(
    groupId: string
  ): Promise<InternationSectorWithHospitalDTO[]> {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            // Incluir outros cargos NÃO dimensionados usando a quantidade ATUAL (row.staff)
            try {
              const current: any[] = row.staff || [];
              // construir mapa role -> soma quantidade atual (pode haver duplicatas)
              const map: Record<string, number> = {};
              for (const s of current) {
                const roleName = (s.role || "").trim();
                if (!roleName) continue;
                const qty = Number(s.quantity) || 0;
                map[roleName] = (map[roleName] || 0) + qty;
              }
              for (const [roleName, quantity] of Object.entries(map)) {
                const rn = roleName.toLowerCase();
                if (!rn.includes("enfermeiro") && !rn.includes("técnico")) {
                  projectedStaff.push({ role: roleName, quantity });
                }
              }
            } catch (err) {
              // noop
            }
          'evaluated', COALESCE(ls.evaluated, 0),
          'vacant',    COALESCE(ls.vacant, 0),
          'inactive',  COALESCE(ls.inactive, 0)
        ) AS "bedStatus",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      INNER JOIN public.regiao r ON r.id = h."regiaoId"
      INNER JOIN public.grupo g ON g.id = r."grupoId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE g.id = $1
      GROUP BY 
        uni.id, uni.nome, h.nome, uni.descricao,
        ls.bed_count, ls.minimum_care, ls.intermediate_care,
        ls.high_dependency, ls.semi_intensive, ls.intensive,
        ls.evaluated, ls.vacant, ls.inactive
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query, [groupId]);
  }

  private async getAssistanceSectorsByGroup(
    groupId: string
  ): Promise<AssistanceSectorWithHospitalDTO[]> {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_nao_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      INNER JOIN public.regiao r ON r.id = h."regiaoId"
      INNER JOIN public.grupo g ON g.id = r."grupoId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      WHERE g.id = $1
      GROUP BY uni.id, uni.nome, h.nome, uni.descricao
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query, [groupId]);
  }

  private async getInternationSectorsByRegion(
    regionId: string
  ): Promise<InternationSectorWithHospitalDTO[]> {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        COALESCE(ls.bed_count, 0) AS "bedCount",
        JSON_BUILD_OBJECT(
          'minimumCare',      COALESCE(ls.minimum_care, 0),
          'intermediateCare', COALESCE(ls.intermediate_care, 0),
          'highDependency',   COALESCE(ls.high_dependency, 0),
          'semiIntensive',    COALESCE(ls.semi_intensive, 0),
          'intensive',        COALESCE(ls.intensive, 0)
        ) AS "careLevel",
        JSON_BUILD_OBJECT(
          'evaluated', COALESCE(ls.evaluated, 0),
          'vacant',    COALESCE(ls.vacant, 0),
          'inactive',  COALESCE(ls.inactive, 0)
        ) AS "bedStatus",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      INNER JOIN public.regiao r ON r.id = h."regiaoId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE r.id = $1
      GROUP BY 
        uni.id, uni.nome, h.nome, uni.descricao,
        ls.bed_count, ls.minimum_care, ls.intermediate_care,
        ls.high_dependency, ls.semi_intensive, ls.intensive,
        ls.evaluated, ls.vacant, ls.inactive
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query, [regionId]);
  }

  private async getAssistanceSectorsByRegion(
    regionId: string
  ): Promise<AssistanceSectorWithHospitalDTO[]> {
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        h.nome AS "hospitalName",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_nao_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      INNER JOIN public.regiao r ON r.id = h."regiaoId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      WHERE r.id = $1
      GROUP BY uni.id, uni.nome, h.nome, uni.descricao
      ORDER BY h.nome, uni.nome
    `;

    return await this.ds.query(query, [regionId]);
  }

  private async aggregateSectorsByHospital(
    internationSectors: InternationSectorWithHospitalDTO[],
    assistanceSectors: AssistanceSectorWithHospitalDTO[]
  ): Promise<AggregatedSectorsDTO[]> {
    // Criar um mapa de hospitais para agregar os setores
    const hospitalMap = new Map<string, AggregatedSectorsDTO>();

    // Agregar setores de internação por hospital
    for (const sector of internationSectors) {
      const { hospitalName, ...sectorData } = sector;
      if (!hospitalMap.has(hospitalName)) {
        hospitalMap.set(hospitalName, {
          id: `hospital-sectors-${hospitalName}`,
          hospitalName,
          internation: [],
          assistance: [],
        });
      }
      hospitalMap.get(hospitalName)!.internation.push(sectorData);
    }

    // Agregar setores de assistência por hospital
    for (const sector of assistanceSectors) {
      const { hospitalName, ...sectorData } = sector;
      if (!hospitalMap.has(hospitalName)) {
        hospitalMap.set(hospitalName, {
          id: `hospital-sectors-${hospitalName}`,
          hospitalName,
          internation: [],
          assistance: [],
        });
      }
      hospitalMap.get(hospitalName)!.assistance.push(sectorData);
    }

    // Converter o mapa em array e ordenar por nome do hospital
    return Array.from(hospitalMap.values()).sort((a, b) =>
      a.hospitalName.localeCompare(b.hospitalName)
    );
  }

  // ======= MÉTODOS OTIMIZADOS PARA AGREGAÇÃO EM LOTE =======

  /**
   * 🚀 OTIMIZADO: Busca TODAS as redes já agregadas em uma única query
   * Performance: ~100ms para 5+ redes
   */
  async getAllNetworksAggregated(): Promise<GlobalAggregatedListDTO> {
    console.log("🔄 Buscando todas as redes agregadas...");

    const query = `
      SELECT 
        n.id,
        n.nome as name,
        'global' as tipo,
        
        -- Métricas
        COUNT(DISTINCT h.id) as "hospitaisCount",
        COUNT(DISTINCT ui.id) as "unidadesInternacao",
        COUNT(DISTINCT uni.id) as "unidadesNaoInternacao",
        
        -- Funcionários Atual
        COALESCE(SUM(cu.quantidade_funcionarios), 0) as "totalFuncionarios",
        
        -- Funcionários Projetado (usa o atual se não houver projetado)
        COALESCE(SUM(COALESCE(cu.quantidade_funcionarios, 0)), 0) as "totalFuncionariosProjetado",
        
        -- Custo Atual
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotal",
        
        -- Custo Projetado (usa o atual se não houver projetado)
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotalProjetado"
        
      FROM public.rede n
      LEFT JOIN public.grupo g ON g."redeId" = n.id
      LEFT JOIN public.regiao r ON r."grupoId" = g.id
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_internacao ui ON ui."hospitalId" = h.id
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON (cu.unidade_id = ui.id OR cu.unidade_nao_internacao_id = uni.id)
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      GROUP BY n.id, n.nome
      ORDER BY n.nome
    `;

    const result = await this.ds.query(query);

    console.log(`✅ ${result.length} redes agregadas encontradas`);

    return {
      aggregatedBy: "network",
      items: result.map((row: any) => ({
        id: `network-${row.id}`,
        name: row.name,
        tipo: "global" as const,
        metrics: {
          totalFuncionarios: parseInt(row.totalFuncionarios) || 0,
          totalFuncionariosProjetado:
            parseInt(row.totalFuncionariosProjetado) || 0,
          custoTotal: parseFloat(row.custoTotal) || 0,
          custoTotalProjetado: parseFloat(row.custoTotalProjetado) || 0,
          hospitaisCount: parseInt(row.hospitaisCount) || 0,
          unidadesInternacao: parseInt(row.unidadesInternacao) || 0,
          unidadesNaoInternacao: parseInt(row.unidadesNaoInternacao) || 0,
        },
      })),
    };
  }

  /**
   * 🚀 OTIMIZADO: Busca TODOS os grupos já agregados em uma única query
   * Performance: ~100ms para 10+ grupos
   */
  async getAllGroupsAggregated(): Promise<GlobalAggregatedListDTO> {
    console.log("🔄 Buscando todos os grupos agregados...");

    const query = `
      SELECT 
        g.id,
        g.nome as name,
        'global' as tipo,
        
        -- Métricas
        COUNT(DISTINCT h.id) as "hospitaisCount",
        COUNT(DISTINCT ui.id) as "unidadesInternacao",
        COUNT(DISTINCT uni.id) as "unidadesNaoInternacao",
        
        -- Funcionários
        COALESCE(SUM(cu.quantidade_funcionarios), 0) as "totalFuncionarios",
        COALESCE(SUM(COALESCE(cu.quantidade_funcionarios, 0)), 0) as "totalFuncionariosProjetado",
        
        -- Custos
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotal",
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotalProjetado"
        
      FROM public.grupo g
      LEFT JOIN public.regiao r ON r."grupoId" = g.id
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_internacao ui ON ui."hospitalId" = h.id
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON (cu.unidade_id = ui.id OR cu.unidade_nao_internacao_id = uni.id)
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      GROUP BY g.id, g.nome
      ORDER BY g.nome
    `;

    const result = await this.ds.query(query);

    console.log(`✅ ${result.length} grupos agregados encontrados`);

    return {
      aggregatedBy: "group",
      items: result.map((row: any) => ({
        id: `group-${row.id}`,
        name: row.name,
        tipo: "global" as const,
        metrics: {
          totalFuncionarios: parseInt(row.totalFuncionarios) || 0,
          totalFuncionariosProjetado:
            parseInt(row.totalFuncionariosProjetado) || 0,
          custoTotal: parseFloat(row.custoTotal) || 0,
          custoTotalProjetado: parseFloat(row.custoTotalProjetado) || 0,
          hospitaisCount: parseInt(row.hospitaisCount) || 0,
          unidadesInternacao: parseInt(row.unidadesInternacao) || 0,
          unidadesNaoInternacao: parseInt(row.unidadesNaoInternacao) || 0,
        },
      })),
    };
  }

  /**
   * 🚀 OTIMIZADO: Busca TODAS as regiões já agregadas em uma única query
   * Performance: ~150ms para 15+ regiões
   */
  async getAllRegionsAggregated(): Promise<GlobalAggregatedListDTO> {
    console.log("🔄 Buscando todas as regiões agregadas...");

    const query = `
      SELECT 
        r.id,
        r.nome as name,
        'global' as tipo,
        
        -- Métricas
        COUNT(DISTINCT h.id) as "hospitaisCount",
        COUNT(DISTINCT ui.id) as "unidadesInternacao",
        COUNT(DISTINCT uni.id) as "unidadesNaoInternacao",
        
        -- Funcionários
        COALESCE(SUM(cu.quantidade_funcionarios), 0) as "totalFuncionarios",
        COALESCE(SUM(COALESCE(cu.quantidade_funcionarios, 0)), 0) as "totalFuncionariosProjetado",
        
        -- Custos
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotal",
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotalProjetado"
        
      FROM public.regiao r
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_internacao ui ON ui."hospitalId" = h.id
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON (cu.unidade_id = ui.id OR cu.unidade_nao_internacao_id = uni.id)
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      GROUP BY r.id, r.nome
      ORDER BY r.nome
    `;

    const result = await this.ds.query(query);

    console.log(`✅ ${result.length} regiões agregadas encontradas`);

    return {
      aggregatedBy: "region",
      items: result.map((row: any) => ({
        id: `region-${row.id}`,
        name: row.name,
        tipo: "global" as const,
        metrics: {
          totalFuncionarios: parseInt(row.totalFuncionarios) || 0,
          totalFuncionariosProjetado:
            parseInt(row.totalFuncionariosProjetado) || 0,
          custoTotal: parseFloat(row.custoTotal) || 0,
          custoTotalProjetado: parseFloat(row.custoTotalProjetado) || 0,
          hospitaisCount: parseInt(row.hospitaisCount) || 0,
          unidadesInternacao: parseInt(row.unidadesInternacao) || 0,
          unidadesNaoInternacao: parseInt(row.unidadesNaoInternacao) || 0,
        },
      })),
    };
  }

  /**
   * 🚀 OTIMIZADO: Busca TODOS os hospitais já agregados em uma única query
   * Performance: ~500ms para 50+ hospitais
   */
  async getAllHospitalsAggregated(): Promise<GlobalAggregatedListDTO> {
    console.log("🔄 Buscando todos os hospitais agregados...");

    const query = `
      SELECT 
        h.id,
        h.nome as name,
        'global' as tipo,
        
        -- Métricas (hospitaisCount = 1 para cada hospital)
        1 as "hospitaisCount",
        COUNT(DISTINCT ui.id) as "unidadesInternacao",
        COUNT(DISTINCT uni.id) as "unidadesNaoInternacao",
        
        -- Funcionários
        COALESCE(SUM(cu.quantidade_funcionarios), 0) as "totalFuncionarios",
        COALESCE(SUM(COALESCE(cu.quantidade_funcionarios, 0)), 0) as "totalFuncionariosProjetado",
        
        -- Custos
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotal",
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0) as "custoTotalProjetado"
        
      FROM public.hospitais h
      LEFT JOIN public.unidades_internacao ui ON ui."hospitalId" = h.id
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON (cu.unidade_id = ui.id OR cu.unidade_nao_internacao_id = uni.id)
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      GROUP BY h.id, h.nome
      ORDER BY h.nome
    `;

    const result = await this.ds.query(query);

    console.log(`✅ ${result.length} hospitais agregados encontrados`);

    return {
      aggregatedBy: "hospital",
      items: result.map((row: any) => ({
        id: `hospital-${row.id}`,
        name: row.name,
        tipo: "global" as const,
        metrics: {
          totalFuncionarios: parseInt(row.totalFuncionarios) || 0,
          totalFuncionariosProjetado:
            parseInt(row.totalFuncionariosProjetado) || 0,
          custoTotal: parseFloat(row.custoTotal) || 0,
          custoTotalProjetado: parseFloat(row.custoTotalProjetado) || 0,
          hospitaisCount: parseInt(row.hospitaisCount) || 0,
          unidadesInternacao: parseInt(row.unidadesInternacao) || 0,
          unidadesNaoInternacao: parseInt(row.unidadesNaoInternacao) || 0,
        },
      })),
    };
  }

  // ======= MÉTODOS PARA AGREGAÇÃO PROJETADA POR SETOR =======

  /**
   * 🚀 OTIMIZADO: Busca TODAS as redes com setores agregados por NOME incluindo dados PROJETADOS
   * Agrega setores com mesmo nome dentro de cada rede
   * Performance: ~200ms para 5+ redes
   */
  async getAllNetworksProjectedAggregated(): Promise<ProjectedSectorsAggregateDTO> {
    console.log(
      "🔄 Buscando todas as redes com setores agregados PROJETADOS..."
    );
    const startTime = Date.now();

    // Buscar setores de internação agregados por rede e nome do setor
    const internationQuery = `
      SELECT 
        n.id as entity_id,
        n.nome as entity_name,
        'network-' || n.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        -- Custo atual agregado
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        -- Custo projetado agregado
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        -- Total de leitos
        COALESCE(SUM(ls.bed_count), 0) as bed_count,
        
        -- CareLevel agregado
        COALESCE(SUM(ls.minimum_care), 0) as minimum_care,
        COALESCE(SUM(ls.intermediate_care), 0) as intermediate_care,
        COALESCE(SUM(ls.high_dependency), 0) as high_dependency,
        COALESCE(SUM(ls.semi_intensive), 0) as semi_intensive,
        COALESCE(SUM(ls.intensive), 0) as intensive,
        
        -- BedStatus agregado
        COALESCE(SUM(ls.evaluated), 0) as bed_status_evaluated,
        COALESCE(SUM(ls.vacant), 0) as bed_status_vacant,
        COALESCE(SUM(ls.inactive), 0) as bed_status_inactive,
        
        -- Staff atual (JSON array)
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'role', c.nome,
              'quantity', cu.quantidade_funcionarios
            )
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        -- Staff projetado (mesmo que atual por enquanto)
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'role', c.nome,
              'quantity', cu.quantidade_funcionarios
            )
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.rede n
      LEFT JOIN public.grupo g ON g."redeId" = n.id
      LEFT JOIN public.regiao r ON r."grupoId" = g.id
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      
      WHERE uni.id IS NOT NULL
      GROUP BY n.id, n.nome, uni.nome
      ORDER BY n.nome, uni.nome
    `;

    // Buscar setores de assistência agregados por rede e nome do setor
    const assistanceQuery = `
      SELECT 
        n.id as entity_id,
        n.nome as entity_name,
        'network-' || n.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        -- Custo atual agregado
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        -- Custo projetado agregado
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        -- Staff atual (JSON array)
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'role', c.nome,
              'quantity', cu.quantidade_funcionarios
            )
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        -- Staff projetado (mesmo que atual por enquanto)
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'role', c.nome,
              'quantity', cu.quantidade_funcionarios
            )
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.rede n
      LEFT JOIN public.grupo g ON g."redeId" = n.id
      LEFT JOIN public.regiao r ON r."grupoId" = g.id
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      WHERE uni.id IS NOT NULL
      GROUP BY n.id, n.nome, uni.nome
      ORDER BY n.nome, uni.nome
    `;

    const [internationSectors, assistanceSectors] = await Promise.all([
      this.ds.query(internationQuery),
      this.ds.query(assistanceQuery),
    ]);

    // Agrupar setores por rede
    const networksMap = new Map<string, any>();

    // Processar setores de internação
    for (const row of internationSectors) {
      if (!networksMap.has(row.entity_id)) {
        networksMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const network = networksMap.get(row.entity_id)!;
      network.internation.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
        bedCount: parseInt(row.bed_count) || 0,
        careLevel: {
          minimumCare: parseInt(row.minimum_care) || 0,
          intermediateCare: parseInt(row.intermediate_care) || 0,
          highDependency: parseInt(row.high_dependency) || 0,
          semiIntensive: parseInt(row.semi_intensive) || 0,
          intensive: parseInt(row.intensive) || 0,
        },
        bedStatus: {
          evaluated: parseInt(row.bed_status_evaluated) || 0,
          vacant: parseInt(row.bed_status_vacant) || 0,
          inactive: parseInt(row.bed_status_inactive) || 0,
        },
      });
    }

    // Processar setores de assistência
    for (const row of assistanceSectors) {
      if (!networksMap.has(row.entity_id)) {
        networksMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const network = networksMap.get(row.entity_id)!;
      network.assistance.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
      });
    }

    const items = Array.from(networksMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const duration = Date.now() - startTime;
    console.log(
      `✅ ${items.length} redes com setores agregados PROJETADOS em ${duration}ms`
    );

    return {
      aggregatedBy: "network",
      items,
    };
  }

  /**
   * 🚀 OTIMIZADO: Busca TODOS os grupos com setores agregados por NOME incluindo dados PROJETADOS
   */
  async getAllGroupsProjectedAggregated(): Promise<ProjectedSectorsAggregateDTO> {
    console.log(
      "🔄 Buscando todos os grupos com setores agregados PROJETADOS..."
    );
    const startTime = Date.now();

    // Buscar setores de internação agregados por grupo e nome do setor
    const internationQuery = `
      SELECT 
        g.id as entity_id,
        g.nome as entity_name,
        'group-' || g.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        COALESCE(SUM(ls.bed_count), 0) as bed_count,
        COALESCE(SUM(ls.minimum_care), 0) as minimum_care,
        COALESCE(SUM(ls.intermediate_care), 0) as intermediate_care,
        COALESCE(SUM(ls.high_dependency), 0) as high_dependency,
        COALESCE(SUM(ls.semi_intensive), 0) as semi_intensive,
        COALESCE(SUM(ls.intensive), 0) as intensive,
        COALESCE(SUM(ls.evaluated), 0) as bed_status_evaluated,
        COALESCE(SUM(ls.vacant), 0) as bed_status_vacant,
        COALESCE(SUM(ls.inactive), 0) as bed_status_inactive,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.grupo g
      LEFT JOIN public.regiao r ON r."grupoId" = g.id
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      
      WHERE uni.id IS NOT NULL
      GROUP BY g.id, g.nome, uni.nome
      ORDER BY g.nome, uni.nome
    `;

    const assistanceQuery = `
      SELECT 
        g.id as entity_id,
        g.nome as entity_name,
        'group-' || g.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.grupo g
      LEFT JOIN public.regiao r ON r."grupoId" = g.id
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      WHERE uni.id IS NOT NULL
      GROUP BY g.id, g.nome, uni.nome
      ORDER BY g.nome, uni.nome
    `;

    const [internationSectors, assistanceSectors] = await Promise.all([
      this.ds.query(internationQuery),
      this.ds.query(assistanceQuery),
    ]);

    const groupsMap = new Map<string, any>();

    for (const row of internationSectors) {
      if (!groupsMap.has(row.entity_id)) {
        groupsMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const group = groupsMap.get(row.entity_id)!;
      group.internation.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
        bedCount: parseInt(row.bed_count) || 0,
        careLevel: {
          minimumCare: parseInt(row.minimum_care) || 0,
          intermediateCare: parseInt(row.intermediate_care) || 0,
          highDependency: parseInt(row.high_dependency) || 0,
          semiIntensive: parseInt(row.semi_intensive) || 0,
          intensive: parseInt(row.intensive) || 0,
        },
        bedStatus: {
          evaluated: parseInt(row.bed_status_evaluated) || 0,
          vacant: parseInt(row.bed_status_vacant) || 0,
          inactive: parseInt(row.bed_status_inactive) || 0,
        },
      });
    }

    for (const row of assistanceSectors) {
      if (!groupsMap.has(row.entity_id)) {
        groupsMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const group = groupsMap.get(row.entity_id)!;
      group.assistance.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
      });
    }

    const items = Array.from(groupsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const duration = Date.now() - startTime;
    console.log(
      `✅ ${items.length} grupos com setores agregados PROJETADOS em ${duration}ms`
    );

    return {
      aggregatedBy: "group",
      items,
    };
  }

  /**
   * 🚀 OTIMIZADO: Busca TODAS as regiões com setores agregados por NOME incluindo dados PROJETADOS
   */
  async getAllRegionsProjectedAggregated(): Promise<ProjectedSectorsAggregateDTO> {
    console.log(
      "🔄 Buscando todas as regiões com setores agregados PROJETADOS..."
    );
    const startTime = Date.now();

    const internationQuery = `
      SELECT 
        r.id as entity_id,
        r.nome as entity_name,
        'region-' || r.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        COALESCE(SUM(ls.bed_count), 0) as bed_count,
        COALESCE(SUM(ls.minimum_care), 0) as minimum_care,
        COALESCE(SUM(ls.intermediate_care), 0) as intermediate_care,
        COALESCE(SUM(ls.high_dependency), 0) as high_dependency,
        COALESCE(SUM(ls.semi_intensive), 0) as semi_intensive,
        COALESCE(SUM(ls.intensive), 0) as intensive,
        COALESCE(SUM(ls.evaluated), 0) as bed_status_evaluated,
        COALESCE(SUM(ls.vacant), 0) as bed_status_vacant,
        COALESCE(SUM(ls.inactive), 0) as bed_status_inactive,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.regiao r
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      
      WHERE uni.id IS NOT NULL
      GROUP BY r.id, r.nome, uni.nome
      ORDER BY r.nome, uni.nome
    `;

    const assistanceQuery = `
      SELECT 
        r.id as entity_id,
        r.nome as entity_name,
        'region-' || r.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.regiao r
      LEFT JOIN public.hospitais h ON h."regiaoId" = r.id
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      WHERE uni.id IS NOT NULL
      GROUP BY r.id, r.nome, uni.nome
      ORDER BY r.nome, uni.nome
    `;

    const [internationSectors, assistanceSectors] = await Promise.all([
      this.ds.query(internationQuery),
      this.ds.query(assistanceQuery),
    ]);

    const regionsMap = new Map<string, any>();

    for (const row of internationSectors) {
      if (!regionsMap.has(row.entity_id)) {
        regionsMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const region = regionsMap.get(row.entity_id)!;
      region.internation.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
        bedCount: parseInt(row.bed_count) || 0,
        careLevel: {
          minimumCare: parseInt(row.minimum_care) || 0,
          intermediateCare: parseInt(row.intermediate_care) || 0,
          highDependency: parseInt(row.high_dependency) || 0,
          semiIntensive: parseInt(row.semi_intensive) || 0,
          intensive: parseInt(row.intensive) || 0,
        },
        bedStatus: {
          evaluated: parseInt(row.bed_status_evaluated) || 0,
          vacant: parseInt(row.bed_status_vacant) || 0,
          inactive: parseInt(row.bed_status_inactive) || 0,
        },
      });
    }

    for (const row of assistanceSectors) {
      if (!regionsMap.has(row.entity_id)) {
        regionsMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const region = regionsMap.get(row.entity_id)!;
      region.assistance.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
      });
    }

    const items = Array.from(regionsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const duration = Date.now() - startTime;
    console.log(
      `✅ ${items.length} regiões com setores agregados PROJETADOS em ${duration}ms`
    );

    return {
      aggregatedBy: "region",
      items,
    };
  }

  /**
   * 🚀 OTIMIZADO: Busca TODOS os hospitais com setores agregados por NOME incluindo dados PROJETADOS
   */
  async getAllHospitalsProjectedAggregated(): Promise<ProjectedSectorsAggregateDTO> {
    console.log(
      "🔄 Buscando todos os hospitais com setores agregados PROJETADOS..."
    );
    const startTime = Date.now();

    const internationQuery = `
      SELECT 
        h.id as entity_id,
        h.nome as entity_name,
        'hospital-' || h.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        COALESCE(SUM(ls.bed_count), 0) as bed_count,
        COALESCE(SUM(ls.minimum_care), 0) as minimum_care,
        COALESCE(SUM(ls.intermediate_care), 0) as intermediate_care,
        COALESCE(SUM(ls.high_dependency), 0) as high_dependency,
        COALESCE(SUM(ls.semi_intensive), 0) as semi_intensive,
        COALESCE(SUM(ls.intensive), 0) as intensive,
        COALESCE(SUM(ls.evaluated), 0) as bed_status_evaluated,
        COALESCE(SUM(ls.vacant), 0) as bed_status_vacant,
        COALESCE(SUM(ls.inactive), 0) as bed_status_inactive,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.hospitais h
      LEFT JOIN public.unidades_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      
      WHERE uni.id IS NOT NULL
      GROUP BY h.id, h.nome, uni.nome
      ORDER BY h.nome, uni.nome
    `;

    const assistanceQuery = `
      SELECT 
        h.id as entity_id,
        h.nome as entity_name,
        'hospital-' || h.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
        
      FROM public.hospitais h
      LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      
      WHERE uni.id IS NOT NULL
      GROUP BY h.id, h.nome, uni.nome
      ORDER BY h.nome, uni.nome
    `;

    const [internationSectors, assistanceSectors] = await Promise.all([
      this.ds.query(internationQuery),
      this.ds.query(assistanceQuery),
    ]);

    const hospitalsMap = new Map<string, any>();

    for (const row of internationSectors) {
      if (!hospitalsMap.has(row.entity_id)) {
        hospitalsMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const hospital = hospitalsMap.get(row.entity_id)!;
      hospital.internation.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
        bedCount: parseInt(row.bed_count) || 0,
        careLevel: {
          minimumCare: parseInt(row.minimum_care) || 0,
          intermediateCare: parseInt(row.intermediate_care) || 0,
          highDependency: parseInt(row.high_dependency) || 0,
          semiIntensive: parseInt(row.semi_intensive) || 0,
          intensive: parseInt(row.intensive) || 0,
        },
        bedStatus: {
          evaluated: parseInt(row.bed_status_evaluated) || 0,
          vacant: parseInt(row.bed_status_vacant) || 0,
          inactive: parseInt(row.bed_status_inactive) || 0,
        },
      });
    }

    for (const row of assistanceSectors) {
      if (!hospitalsMap.has(row.entity_id)) {
        hospitalsMap.set(row.entity_id, {
          id: row.entity_id,
          name: row.entity_name,
          internation: [],
          assistance: [],
        });
      }

      const hospital = hospitalsMap.get(row.entity_id)!;
      hospital.assistance.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: row.projected_staff,
      });
    }

    const items = Array.from(hospitalsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const duration = Date.now() - startTime;
    console.log(
      `✅ ${items.length} hospitais com setores agregados PROJETADOS em ${duration}ms`
    );

    return {
      aggregatedBy: "hospital",
      items,
    };
  }

  /**
   * Método auxiliar: Calcular dimensionamento com cache
   * Verifica se existe cache válido, senão calcula e salva
   */
  private async calcularDimensionamentoComCache(
    hospitalId: string,
    unidadeId: string,
    tipoUnidade: "INTERNACAO" | "NAO_INTERNACAO",
    dimService: DimensionamentoService
  ): Promise<any> {
    const startCalc = Date.now();

    // Tentar buscar do cache
    const cache = await this.cacheRepo.buscarCacheValido(
      unidadeId,
      tipoUnidade,
      this.CACHE_VALIDITY_MINUTES
    );

    if (cache) {
      // Cache hit - retornar dados do cache
      return cache.dados;
    }

    // Cache miss - calcular dimensionamento
    console.log(`🧮 [CALCULANDO] ${tipoUnidade} - Unidade ${unidadeId}`);

    let resultado: any;
    if (tipoUnidade === "INTERNACAO") {
      resultado = await dimService.calcularParaInternacao(unidadeId);
    } else {
      resultado = await dimService.calcularParaNaoInternacao(unidadeId);
    }

    const tempoCalculo = Date.now() - startCalc;

    // Salvar no cache para próximas requisições
    await this.cacheRepo.salvarCache(
      hospitalId,
      unidadeId,
      tipoUnidade,
      resultado,
      undefined,
      tempoCalculo
    );

    return resultado;
  }

  /**
   * Busca setores projetados para um único hospital (otimizado com cache)
   */
  async getProjectedSectorsByHospital(hospitalId: string): Promise<any> {
    console.log(
      `🔎 Buscando setores projetados para hospital ${hospitalId}...`
    );

    const internationQuery = `
      SELECT 
        h.id as entity_id,
        h.nome as entity_name,
        uni.id as unit_id,
        'hospital-' || h.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        COALESCE(SUM(ls.bed_count), 0) as bed_count,
        COALESCE(SUM(ls.minimum_care), 0) as minimum_care,
        COALESCE(SUM(ls.intermediate_care), 0) as intermediate_care,
        COALESCE(SUM(ls.high_dependency), 0) as high_dependency,
        COALESCE(SUM(ls.semi_intensive), 0) as semi_intensive,
        COALESCE(SUM(ls.intensive), 0) as intensive,
        COALESCE(SUM(ls.evaluated), 0) as bed_status_evaluated,
        COALESCE(SUM(ls.vacant), 0) as bed_status_vacant,
        COALESCE(SUM(ls.inactive), 0) as bed_status_inactive,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
  FROM public.hospitais h
  LEFT JOIN public.unidades_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE h.id = $1 AND uni.id IS NOT NULL
  GROUP BY h.id, h.nome, uni.id, uni.nome
      ORDER BY uni.nome
    `;

    const assistanceQuery = `
      SELECT 
        h.id as entity_id,
        h.nome as entity_name,
        uni.id as unit_id,
        'hospital-' || h.id || '|' || uni.nome as sector_id,
        uni.nome as sector_name,
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
            COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as staff,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('role', c.nome, 'quantity', cu.quantidade_funcionarios)
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as projected_staff
  FROM public.hospitais h
  LEFT JOIN public.unidades_nao_internacao uni ON uni."hospitalId" = h.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_nao_internacao_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      WHERE h.id = $1 AND uni.id IS NOT NULL
  GROUP BY h.id, h.nome, uni.id, uni.nome
      ORDER BY uni.nome
    `;

    const [internationSectors, assistanceSectors] = await Promise.all([
      this.ds.query(internationQuery, [hospitalId]),
      this.ds.query(assistanceQuery, [hospitalId]),
    ]);

    // Instanciar serviço de dimensionamento para obter projetados por unidade
    const dimService = new DimensionamentoService(this.ds);

    // --- NOVO: Pré-buscar caches válidos em batch ---
    const intlUnitIds = Array.from(
      new Set(internationSectors.map((r: any) => r.unit_id).filter(Boolean))
    ) as string[];
    const assistUnitIds = Array.from(
      new Set(assistanceSectors.map((r: any) => r.unit_id).filter(Boolean))
    ) as string[];

    // Buscar caches válidos para todas as unidades de uma vez
    const [cachesInternacao, cachesAssistencia] = await Promise.all([
      this.cacheRepo.buscarCachesValidosBatch(
        intlUnitIds.map((id) => ({
          unidadeId: id,
          tipoUnidade: "INTERNACAO" as const,
        })),
        this.CACHE_VALIDITY_MINUTES
      ),
      this.cacheRepo.buscarCachesValidosBatch(
        assistUnitIds.map((id) => ({
          unidadeId: id,
          tipoUnidade: "NAO_INTERNACAO" as const,
        })),
        this.CACHE_VALIDITY_MINUTES
      ),
    ]);

    // Identificar quais unidades precisam calcular (não estão no cache)
    const intlUnitsToCalculate = intlUnitIds.filter(
      (id) => !cachesInternacao.has(id)
    );
    const assistUnitsToCalculate = assistUnitIds.filter(
      (id) => !cachesAssistencia.has(id)
    );

    console.log(
      `📊 [CACHE STATS] Internação: ${cachesInternacao.size}/${intlUnitIds.length} cache hits | ` +
        `Assistência: ${cachesAssistencia.size}/${assistUnitIds.length} cache hits`
    );

    // Calcular dimensionamentos faltantes em paralelo (batches de 6)
    const batchCalculate = async (
      ids: string[],
      tipoUnidade: "INTERNACAO" | "NAO_INTERNACAO",
      batchSize = 6
    ) => {
      const map = new Map<string, any>();
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const promises = batch.map(async (id) => {
          try {
            const resultado = await this.calcularDimensionamentoComCache(
              hospitalId,
              id,
              tipoUnidade,
              dimService
            );
            return { id, res: resultado };
          } catch (err) {
            console.error(`❌ Erro ao calcular ${tipoUnidade} ${id}:`, err);
            return { id, res: null, err };
          }
        });
        const results = await Promise.all(promises);
        for (const r of results) {
          map.set(r.id, r.res ?? null);
        }
      }
      return map;
    };

    const [dimCalculadasInternacao, dimCalculadasAssistencia] =
      await Promise.all([
        batchCalculate(intlUnitsToCalculate, "INTERNACAO"),
        batchCalculate(assistUnitsToCalculate, "NAO_INTERNACAO"),
      ]);

    // Combinar caches com cálculos novos
    const internationDimMap = new Map<string, any>();
    for (const [id, cache] of cachesInternacao) {
      internationDimMap.set(id, cache.dados);
    }
    for (const [id, dim] of dimCalculadasInternacao) {
      internationDimMap.set(id, dim);
    }

    const assistanceDimMap = new Map<string, any>();
    for (const [id, cache] of cachesAssistencia) {
      assistanceDimMap.set(id, cache.dados);
    }
    for (const [id, dim] of dimCalculadasAssistencia) {
      assistanceDimMap.set(id, dim);
    }

    const hospital: any = {
      id: hospitalId,
      name:
        internationSectors[0]?.entity_name ||
        assistanceSectors[0]?.entity_name ||
        null,
      internation: [],
      assistance: [],
    };

    for (const row of internationSectors) {
      // tentar obter projeção via dimensionamento para a unidade de internação
      let projectedStaff = row.projected_staff;
      let projectedCostAmountNum: number | null = null;
      try {
        if (row.unit_id) {
          // tentar usar map pré-carregado para evitar chamadas redundantes
          const dimFromMap = internationDimMap?.get?.(row.unit_id) ?? null;
          const dim: any =
            dimFromMap ??
            (await dimService.calcularParaInternacao(row.unit_id));
          // dim.tabela contém linhas por cargo (LinhaAnaliseFinanceira)
          const enfermeiro = (dim.tabela || []).find((t: any) =>
            (t.cargoNome || "").toLowerCase().includes("enfermeiro")
          );
          const tecnico = (dim.tabela || []).find(
            (t: any) =>
              (t.cargoNome || "").toLowerCase().includes("técnico") ||
              (t.cargoNome || "").toLowerCase().includes("tecnico")
          );

          // Inicializar projectedStaff com todos os cargos atuais (projetado = atual para não-dimensionados)
          projectedStaff = [];

          // Criar map dos cargos atuais
          const staffAtual: any[] = row.staff || [];
          const cargoAtualMap = new Map<string, number>();
          for (const s of staffAtual) {
            const roleLower = (s.role || "").toLowerCase();
            cargoAtualMap.set(roleLower, s.quantity || 0);
          }

          // Adicionar enfermeiro com quantidade PROJETADA (dimensionamento)
          if (enfermeiro) {
            // Se quantidadeProjetada está definida (mesmo que 0), usar ela
            // Caso contrário, significa que não foi calculada, então usar quantidadeAtual
            const q =
              enfermeiro.quantidadeProjetada !== undefined &&
              enfermeiro.quantidadeProjetada !== null
                ? enfermeiro.quantidadeProjetada // Usar projetada (pode ser 0)
                : enfermeiro.quantidadeAtual ?? 0; // Fallback se não foi calculada
            projectedStaff.push({ role: "Enfermeiro", quantity: q });
          } else if (cargoAtualMap.has("enfermeiro")) {
            // Se não tem no dimensionamento, usar quantidade atual
            projectedStaff.push({
              role: "Enfermeiro",
              quantity: cargoAtualMap.get("enfermeiro") ?? 0,
            });
          }

          // Adicionar técnico com quantidade PROJETADA (dimensionamento)
          if (tecnico) {
            // Se quantidadeProjetada está definida (mesmo que 0), usar ela
            const q =
              tecnico.quantidadeProjetada !== undefined &&
              tecnico.quantidadeProjetada !== null
                ? tecnico.quantidadeProjetada // Usar projetada (pode ser 0)
                : tecnico.quantidadeAtual ?? 0; // Fallback se não foi calculada
            projectedStaff.push({ role: "Técnico", quantity: q });
          } else if (
            cargoAtualMap.has("técnico") ||
            cargoAtualMap.has("tecnico")
          ) {
            // Se não tem no dimensionamento, usar quantidade atual
            const qtdTec =
              cargoAtualMap.get("técnico") ?? cargoAtualMap.get("tecnico") ?? 0;
            projectedStaff.push({ role: "Técnico", quantity: qtdTec });
          }

          // Adicionar TODOS os outros cargos (não-dimensionados) com quantidade ATUAL
          for (const s of staffAtual) {
            const roleLower = (s.role || "").toLowerCase();
            if (
              !roleLower.includes("enfermeiro") &&
              !roleLower.includes("técnico") &&
              !roleLower.includes("tecnico")
            ) {
              projectedStaff.push({ role: s.role, quantity: s.quantity || 0 });
            }
          }
          // calcular custo projetado usando quantidadeProjetada para cargos dimensionados
          try {
            const tabela: any[] = dim.tabela || [];
            let totalProjectedCost = 0;
            for (const c of tabela) {
              const nome = (c.cargoNome || "").toLowerCase();
              const costPer =
                c.custoPorFuncionario ??
                (c.salario || 0) +
                  (c.adicionais || 0) +
                  (c.valorHorasExtras || 0);
              const isScp =
                c.isScpCargo === true ||
                nome.includes("enfermeiro") ||
                nome.includes("técnico") ||
                nome.includes("tecnico");
              // Para cargos dimensionados (SCP), usar quantidadeProjetada se definida (mesmo que 0).
              // Caso contrário, usar quantidadeAtual.
              const qty = isScp
                ? c.quantidadeProjetada !== undefined &&
                  c.quantidadeProjetada !== null
                  ? c.quantidadeProjetada
                  : c.quantidadeAtual ?? 0
                : c.quantidadeAtual ?? 0;
              totalProjectedCost += Number(qty) * Number(costPer);
            }
            projectedCostAmountNum = Number(totalProjectedCost.toFixed(2));
          } catch (err) {
            // noop - manter null
          }
        }
      } catch (e: any) {
        console.warn(
          `Dimensionamento interno falhou para unidade ${row.unit_id}:`,
          e?.message || e
        );
        // FALLBACK: se falhar, usar staff atual como projetado
        projectedStaff = (row.staff || []).map((s: any) => ({
          role: s.role,
          quantity: s.quantity || 0,
        }));
      }

      hospital.internation.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount:
          projectedCostAmountNum ?? row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: projectedStaff,
        bedCount: parseInt(row.bed_count) || 0,
        careLevel: {
          minimumCare: parseInt(row.minimum_care) || 0,
          intermediateCare: parseInt(row.intermediate_care) || 0,
          highDependency: parseInt(row.high_dependency) || 0,
          semiIntensive: parseInt(row.semi_intensive) || 0,
          intensive: parseInt(row.intensive) || 0,
        },
        bedStatus: {
          evaluated: parseInt(row.bed_status_evaluated) || 0,
          vacant: parseInt(row.bed_status_vacant) || 0,
          inactive: parseInt(row.bed_status_inactive) || 0,
        },
      });
    }

    for (const row of assistanceSectors) {
      // para unidades de não-internação o projetado é por UNIDADE (não por sítios)
      let projectedStaff = row.projected_staff;
      let projectedCostAmountAssistNum: number | null = null;
      try {
        if (row.unit_id) {
          // tentar usar map pré-carregado para evitar chamadas redundantes
          const dimFromMap = assistanceDimMap?.get?.(row.unit_id) ?? null;
          const dim: any =
            dimFromMap ??
            (await dimService.calcularParaNaoInternacao(row.unit_id));
          // Preferir os totais já calculados pelo dimensionamento no nível da UNIDADE
          // (quando presentes em dim.dimensionamento.pessoalEnfermeiroArredondado / pessoalTecnicoArredondado)
          const resumo = dim.dimensionamento;
          projectedStaff = [];
          // Novo comportamento: projetado por SÍTIO
          // Se dim.tabela existir, usar a lista de sítios e seus cargos (cada sítio possui cargos com quantidadeProjetada)
          const tabela: any[] = dim.tabela || [];
          if (Array.isArray(tabela) && tabela.length > 0) {
            // Construir projectedStaff como lista por sítio
            projectedStaff = tabela.map((sitio: any) => {
              const cargos = (sitio.cargos || []).map((c: any) => {
                const qty =
                  c.quantidadeProjetada !== undefined &&
                  c.quantidadeProjetada !== null
                    ? c.quantidadeProjetada
                    : c.quantidadeAtual ?? 0;
                return {
                  role: c.cargoNome,
                  quantity: qty,
                  custoPorFuncionario: c.custoPorFuncionario,
                };
              });

              return {
                sitioId: sitio.id,
                sitioNome: sitio.nome,
                cargos,
              };
            });

            // Calcular custo projetado para a unidade usando as quantidades por sítio quando possível
            try {
              let totalProjectedCost = 0;
              for (const sitio of tabela) {
                for (const c of sitio.cargos || []) {
                  const nome = (c.cargoNome || "").toLowerCase();
                  const costPer =
                    c.custoPorFuncionario ??
                    (c.salario || 0) +
                      (c.adicionais || 0) +
                      (c.valorHorasExtras || 0);
                  const qty =
                    c.quantidadeProjetada !== undefined &&
                    c.quantidadeProjetada !== null
                      ? c.quantidadeProjetada
                      : c.quantidadeAtual ?? 0;
                  totalProjectedCost += Number(qty) * Number(costPer);
                }
              }
              projectedCostAmountAssistNum = Number(
                totalProjectedCost.toFixed(2)
              );
            } catch (err) {
              // noop
            }
          } else {
            // Fallback antigo: quando não há tabela por sítio, tentar usar resumo totals ou agregar não-dimensionados
            const hasResumoEnf =
              resumo &&
              resumo.pessoalEnfermeiroArredondado !== undefined &&
              resumo.pessoalEnfermeiroArredondado !== null;
            const hasResumoTec =
              resumo &&
              resumo.pessoalTecnicoArredondado !== undefined &&
              resumo.pessoalTecnicoArredondado !== null;

            if (hasResumoEnf || hasResumoTec) {
              const totalEnfermeiro = resumo.pessoalEnfermeiroArredondado ?? 0;
              const totalTecnico = resumo.pessoalTecnicoArredondado ?? 0;

              // Adicionar enfermeiro e técnico com quantidades PROJETADAS (dimensionamento)
              projectedStaff.push({
                role: "Enfermeiro",
                quantity: totalEnfermeiro,
              });
              projectedStaff.push({ role: "Técnico", quantity: totalTecnico });

              // Adicionar TODOS os outros cargos com quantidade ATUAL (row.staff)
              try {
                const staffAtual: any[] = row.staff || [];
                for (const s of staffAtual) {
                  const roleLower = (s.role || "").toLowerCase();
                  // Pular enfermeiro e técnico (já adicionados acima com valores projetados)
                  if (
                    !roleLower.includes("enfermeiro") &&
                    !roleLower.includes("técnico") &&
                    !roleLower.includes("tecnico")
                  ) {
                    projectedStaff.push({
                      role: s.role,
                      quantity: s.quantity || 0,
                    });
                  }
                }
              } catch (err) {
                // noop
              }
            } else {
              // Fallback final: sem dimensionamento válido
              // Usar row.staff (atual) para todos os cargos (projetado = atual)
              const staffAtual: any[] = row.staff || [];
              for (const s of staffAtual) {
                projectedStaff.push({
                  role: s.role,
                  quantity: s.quantity || 0,
                });
              }
            }
          }
        }
      } catch (e: any) {
        console.warn(
          `Dimensionamento nao-internacao falhou para unidade ${row.unit_id}:`,
          e?.message || e
        );
        // FALLBACK: se falhar, usar staff atual como projetado
        projectedStaff = (row.staff || []).map((s: any) => ({
          role: s.role,
          quantity: s.quantity || 0,
        }));
      }

      hospital.assistance.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount:
          projectedCostAmountAssistNum ?? row.projected_cost_amount,
        staff: row.staff,
        projectedStaff: projectedStaff,
      });
    }

    console.log(`\n🎯 PROJETADO FINAL - Hospital ${hospitalId}:`);
    console.log(`   Internação: ${hospital.internation.length} unidades`);
    console.log(`   Assistência: ${hospital.assistance.length} unidades`);

    // Log detalhado das primeiras unidades de assistência
    for (let i = 0; i < Math.min(2, hospital.assistance.length); i++) {
      const unit = hospital.assistance[i];
      console.log(`\n   📍 Assistência ${i + 1}: ${unit.name}`);
      console.log(
        `      projectedStaff tipo:`,
        Array.isArray(unit.projectedStaff)
          ? unit.projectedStaff[0]?.sitioId
            ? "ARRAY DE SÍTIOS"
            : "ARRAY SIMPLES"
          : typeof unit.projectedStaff
      );
      console.log(
        `      projectedStaff:`,
        JSON.stringify(unit.projectedStaff, null, 2).substring(0, 500)
      );
    }

    return hospital;
  }
}
