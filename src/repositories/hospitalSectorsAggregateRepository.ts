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
import { ProjetadoFinalInternacao } from "../entities/ProjetadoFinalInternacao";
import { ProjetadoFinalNaoInternacao } from "../entities/ProjetadoFinalNaoInternacao";
import { Cargo } from "../entities/Cargo";
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
            (COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) + 
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
             COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0))
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
          neutral: [],
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
          neutral: [],
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0) as "custoTotal",
        
        -- Custo Projetado (usa o atual se não houver projetado)
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0) as "custoTotal",
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0) as "custoTotal",
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0) as "custoTotal",
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        -- Custo projetado agregado
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        -- Custo projetado agregado
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as cost_amount,
        
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_projetadas, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
          )
        ), 0)::text as projected_cost_amount,
        COALESCE(SUM(
          cu.quantidade_funcionarios * 
          (
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0) +
            COALESCE(NULLIF(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), ''), 'null')::numeric, 0)
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

    // Query para Unidades Neutras
    const neutralQuery = `
      SELECT 
        h.id as entity_id,
        h.nome as entity_name,
        un.id as unit_id,
        'hospital-' || h.id || '|' || un.nome as sector_id,
        un.nome as sector_name,
        COALESCE(un."custoTotal", 0)::text as cost_amount,
        COALESCE(un."custoTotal", 0)::text as projected_cost_amount,
        un.status as status
      FROM public.hospitais h
      LEFT JOIN public.unidades_neutras un ON un."hospitalId" = h.id
      WHERE h.id = $1 AND un.id IS NOT NULL
      ORDER BY un.nome
    `;

    const neutralSectors = await this.ds.query(neutralQuery, [hospitalId]);

    // Instanciar serviço de dimensionamento para obter projetados por unidade
    const dimService = new DimensionamentoService(this.ds);

    // ===== Carregar PROJETADO FINAL salvo pelo usuário e montar mapas de override =====
    const projIntRepo = this.ds.getRepository(ProjetadoFinalInternacao);
    const projNaoRepo = this.ds.getRepository(ProjetadoFinalNaoInternacao);

    const [projIntRows, projNaoRows] = await Promise.all([
      projIntRepo.find({ where: { hospitalId } }),
      projNaoRepo.find({ where: { hospitalId } }),
    ]);

    console.log(
      `📋 [PROJETADO FINAL] Internação: ${projIntRows.length} registros encontrados`
    );
    console.log(
      `📋 [PROJETADO FINAL] Não-Internação: ${projNaoRows.length} registros encontrados`
    );

    if (projNaoRows.length > 0) {
      console.log(
        `🔍 [PROJETADO FINAL NAO INTERNACAO] Detalhes:`,
        projNaoRows.map((r) => ({
          unidadeId: r.unidadeId,
          sitioId: r.sitioId,
          cargoId: r.cargoId,
          projetadoFinal: r.projetadoFinal,
        }))
      );
    }

    // Buscar nomes de cargos para mapear cargoId -> role (nome)
    const cargoIds = Array.from(
      new Set([
        ...projIntRows.map((r) => r.cargoId),
        ...projNaoRows.map((r) => r.cargoId),
      ])
    );
    const cargoNomeMap = new Map<string, string>();
    if (cargoIds.length > 0) {
      const cargos = await this.ds
        .getRepository(Cargo)
        .createQueryBuilder("c")
        .where("c.id IN (:...ids)", { ids: cargoIds })
        .select(["c.id", "c.nome"])
        .getMany();
      for (const c of cargos) cargoNomeMap.set(c.id, c.nome);
      console.log(`🏷️  Carregados ${cargos.length} nomes de cargos no cache`);
    }

    // Buscar custos dos cargos (salário + adicionais_tributos)
    const cargoCustoMap = new Map<string, number>();
    if (cargoIds.length > 0) {
      const cargosComCusto = await this.ds
        .getRepository(Cargo)
        .createQueryBuilder("c")
        .where("c.id IN (:...ids)", { ids: cargoIds })
        .select([
          "c.id as id",
          `COALESCE(
            NULLIF(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), ''), 'null')::numeric, 0
          ) + COALESCE(
            NULLIF(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), ''), 'null')::numeric, 0
          ) as custoTotal`,
        ])
        .getRawMany();

      for (const cargo of cargosComCusto) {
        cargoCustoMap.set(cargo.id, parseFloat(cargo.custototal) || 0);
      }
      console.log(`💰 Carregados custos de ${cargoCustoMap.size} cargos`);
    }

    // Internação: unidadeId -> (roleLower -> qty)
    const overrideIntByUnitRole = new Map<string, Map<string, number>>();
    for (const r of projIntRows) {
      const role = (cargoNomeMap.get(r.cargoId) || "").toLowerCase();
      if (!role) continue;
      if (!overrideIntByUnitRole.has(r.unidadeId)) {
        overrideIntByUnitRole.set(r.unidadeId, new Map());
      }
      overrideIntByUnitRole.get(r.unidadeId)!.set(role, r.projetadoFinal);
    }

    // Não-Internação: unidadeId -> sitioId -> (roleLower -> {qty, cargoId})
    const overrideNaoByUnitSitioRole = new Map<
      string,
      Map<string, Map<string, { qty: number; cargoId: string }>>
    >();
    for (const r of projNaoRows) {
      const role = (cargoNomeMap.get(r.cargoId) || "").toLowerCase();
      if (!role) continue;
      if (!overrideNaoByUnitSitioRole.has(r.unidadeId)) {
        overrideNaoByUnitSitioRole.set(r.unidadeId, new Map());
      }
      const bySitio = overrideNaoByUnitSitioRole.get(r.unidadeId)!;
      if (!bySitio.has(r.sitioId)) bySitio.set(r.sitioId, new Map());
      bySitio
        .get(r.sitioId)!
        .set(role, { qty: r.projetadoFinal, cargoId: r.cargoId });
    }

    // Cache removido - dados vêm direto de projetado_final_* (queries rápidas)

    const hospital: any = {
      id: hospitalId,
      name:
        internationSectors[0]?.entity_name ||
        assistanceSectors[0]?.entity_name ||
        neutralSectors[0]?.entity_name ||
        null,
      internation: [],
      assistance: [],
      neutral: [],
    };

    for (const row of internationSectors) {
      // tentar obter projeção via dimensionamento para a unidade de internação
      let projectedStaff = row.projected_staff;
      let projectedCostAmountNum: number | null = null;
      try {
        if (row.unit_id) {
          // Buscar dimensionamento diretamente (sem cache)
          const dim: any = await dimService.calcularParaInternacao(row.unit_id);
          // dim.tabela contém linhas por cargo (LinhaAnaliseFinanceira)
          const enfermeiro = (dim.tabela || []).find((t: any) =>
            (t.cargoNome || "").toLowerCase().includes("enfermeiro")
          );
          const tecnico = (dim.tabela || []).find(
            (t: any) =>
              (t.cargoNome || "").toLowerCase().includes("técnico") ||
              (t.cargoNome || "").toLowerCase().includes("tecnico")
          );

          // Inicializar projectedStaff com todos os cargos atuais (vamos sobrescrever abaixo)
          projectedStaff = [];

          // Criar map dos cargos atuais
          const staffAtual: any[] = row.staff || [];
          const cargoAtualMap = new Map<string, number>();
          for (const s of staffAtual) {
            const roleLower = (s.role || "").toLowerCase();
            cargoAtualMap.set(roleLower, s.quantity || 0);
          }

          // Aplicar overrides de PROJETADO FINAL (se existirem para a unidade)
          const overridesRole = overrideIntByUnitRole.get(row.unit_id) || null;
          const overriddenRoles = new Set<string>();

          if (overridesRole && overridesRole.size > 0) {
            // 1) Adicionar todos os cargos com override
            for (const [roleLower, qty] of overridesRole.entries()) {
              const displayRole = roleLower.includes("enfermeiro")
                ? "Enfermeiro"
                : roleLower.includes("técnico") || roleLower.includes("tecnico")
                ? "Técnico"
                : // tentar encontrar o nome exato a partir do staff atual
                  staffAtual.find(
                    (s: any) => (s.role || "").toLowerCase() === roleLower
                  )?.role ||
                  // fallback para capitalização básica
                  roleLower.charAt(0).toUpperCase() + roleLower.slice(1);
              projectedStaff.push({ role: displayRole, quantity: qty });
              overriddenRoles.add(roleLower);
            }
            // 2) Para cargos SEM override: aplicar antiga lógica (dim para ENF/TEC, atual para demais)
            // ENFERMEIRO
            if (!overriddenRoles.has("enfermeiro")) {
              if (enfermeiro) {
                const q =
                  enfermeiro.quantidadeProjetada ??
                  enfermeiro.quantidadeAtual ??
                  0;
                projectedStaff.push({ role: "Enfermeiro", quantity: q });
              } else if (cargoAtualMap.has("enfermeiro")) {
                projectedStaff.push({
                  role: "Enfermeiro",
                  quantity: cargoAtualMap.get("enfermeiro") ?? 0,
                });
              }
            }
            // TÉCNICO
            if (
              !overriddenRoles.has("técnico") &&
              !overriddenRoles.has("tecnico")
            ) {
              if (tecnico) {
                const q =
                  tecnico.quantidadeProjetada ?? tecnico.quantidadeAtual ?? 0;
                projectedStaff.push({ role: "Técnico", quantity: q });
              } else if (
                cargoAtualMap.has("técnico") ||
                cargoAtualMap.has("tecnico")
              ) {
                const qtdTec =
                  cargoAtualMap.get("técnico") ??
                  cargoAtualMap.get("tecnico") ??
                  0;
                projectedStaff.push({ role: "Técnico", quantity: qtdTec });
              }
            }
            // Demais cargos
            for (const s of staffAtual) {
              const roleLower = (s.role || "").toLowerCase();
              if (
                !overriddenRoles.has(roleLower) &&
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
          } else {
            // Sem overrides: usar antiga lógica (dim + atual)
            if (enfermeiro) {
              const q =
                enfermeiro.quantidadeProjetada ??
                enfermeiro.quantidadeAtual ??
                0;
              projectedStaff.push({ role: "Enfermeiro", quantity: q });
            } else if (cargoAtualMap.has("enfermeiro")) {
              projectedStaff.push({
                role: "Enfermeiro",
                quantity: cargoAtualMap.get("enfermeiro") ?? 0,
              });
            }
            if (tecnico) {
              const q =
                tecnico.quantidadeProjetada ?? tecnico.quantidadeAtual ?? 0;
              projectedStaff.push({ role: "Técnico", quantity: q });
            } else if (
              cargoAtualMap.has("técnico") ||
              cargoAtualMap.has("tecnico")
            ) {
              const qtdTec =
                cargoAtualMap.get("técnico") ??
                cargoAtualMap.get("tecnico") ??
                0;
              projectedStaff.push({ role: "Técnico", quantity: qtdTec });
            }
            for (const s of staffAtual) {
              const roleLower = (s.role || "").toLowerCase();
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
          }
          // calcular custo projetado usando OVERRIDES quando presentes
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
              // Override de quantidade, se existir para este role
              const overrideQty = overridesRole?.get(nome);
              let qty: number;
              if (overrideQty !== undefined) {
                qty = overrideQty;
              } else {
                const isScp =
                  c.isScpCargo === true ||
                  nome.includes("enfermeiro") ||
                  nome.includes("técnico") ||
                  nome.includes("tecnico");
                qty = isScp
                  ? c.quantidadeProjetada ?? c.quantidadeAtual ?? 0
                  : c.quantidadeAtual ?? 0;
              }
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
          // Buscar dimensionamento diretamente (sem cache)
          const dim: any = await dimService.calcularParaNaoInternacao(
            row.unit_id
          );
          // Preferir os totais já calculados pelo dimensionamento no nível da UNIDADE
          // (quando presentes em dim.dimensionamento.pessoalEnfermeiroArredondado / pessoalTecnicoArredondado)
          const resumo = dim.dimensionamento;
          projectedStaff = [];
          // Novo comportamento: projetado por SÍTIO
          // Se dim.tabela existir, usar a lista de sítios e seus cargos (cada sítio possui cargos com quantidadeProjetada)
          const tabela: any[] = dim.tabela || [];
          console.log(
            `📊 [DIMENSIONAMENTO] Unidade ${row.unit_id?.slice(
              0,
              8
            )}: Recebeu ${tabela.length} sítios na tabela`
          );
          if (tabela.length > 0) {
            tabela.forEach((s: any, idx: number) => {
              console.log(
                `   Sítio ${idx + 1}: ${s.nome}, ${
                  (s.cargos || []).length
                } cargos`
              );
            });
          }

          if (Array.isArray(tabela) && tabela.length > 0) {
            // Construir projectedStaff como lista por sítio
            projectedStaff = tabela.map((sitio: any) => {
              const overridesRole =
                overrideNaoByUnitSitioRole.get(row.unit_id)?.get(sitio.id) ||
                null;

              console.log(
                `🔧 [OVERRIDE CHECK] Sítio: ${sitio.nome} (${sitio.id?.slice(
                  0,
                  8
                )}), Unidade: ${row.unit_id?.slice(0, 8)}`
              );
              if (overridesRole) {
                console.log(
                  `   📋 Overrides disponíveis: ${Array.from(
                    overridesRole.keys()
                  ).join(", ")}`
                );
              }

              // Mapear cargos do dimensionamento
              const cargosMap = new Map<string, any>();
              (sitio.cargos || []).forEach((c: any) => {
                const roleLower = (c.cargoNome || "").toLowerCase();
                cargosMap.set(roleLower, c);
              });

              // Aplicar overrides ou usar valores do dimensionamento
              const cargos: any[] = [];

              // Se há overrides, processar todos os cargos com override
              if (overridesRole && overridesRole.size > 0) {
                for (const [
                  roleLower,
                  overrideData,
                ] of overridesRole.entries()) {
                  const cargoFromDim = cargosMap.get(roleLower);

                  if (cargoFromDim) {
                    // Cargo existe no dimensionamento, aplicar override
                    console.log(
                      `   ✓ Override aplicado: ${cargoFromDim.cargoNome} = ${overrideData.qty} (original: ${cargoFromDim.quantidadeProjetada})`
                    );
                    cargos.push({
                      role: cargoFromDim.cargoNome,
                      quantity: overrideData.qty,
                      custoPorFuncionario: cargoFromDim.custoPorFuncionario,
                    });
                    cargosMap.delete(roleLower); // Remover para não processar de novo
                  } else {
                    // Override para cargo que não foi calculado pelo dimensionamento
                    // Buscar custo do Map pré-carregado
                    const custoCargo =
                      cargoCustoMap.get(overrideData.cargoId) || 0;
                    console.log(
                      `   ➕ Override para cargo não calculado: ${roleLower} = ${overrideData.qty} (custo: ${custoCargo})`
                    );
                    cargos.push({
                      role:
                        roleLower.charAt(0).toUpperCase() + roleLower.slice(1),
                      quantity: overrideData.qty,
                      custoPorFuncionario: custoCargo,
                    });
                  }
                }
              }

              // Adicionar cargos do dimensionamento que não tinham override
              for (const [roleLower, c] of cargosMap.entries()) {
                const qty = c.quantidadeProjetada ?? 0;
                if (qty > 0) {
                  console.log(`   → Usando projetado: ${c.cargoNome} = ${qty}`);
                } else {
                  console.log(`   ✗ Sem dados: ${c.cargoNome} = 0`);
                }
                cargos.push({
                  role: c.cargoNome,
                  quantity: qty,
                  custoPorFuncionario: c.custoPorFuncionario,
                });
              }

              return {
                sitioId: sitio.id,
                sitioNome: sitio.nome,
                cargos,
              };
            });

            // Calcular custo projetado somando todos os cargos de todos os sítios
            try {
              let totalProjectedCost = 0;
              for (const sitio of projectedStaff) {
                for (const cargo of sitio.cargos || []) {
                  const qty = cargo.quantity || 0;
                  const costPer = cargo.custoPorFuncionario || 0;
                  totalProjectedCost += Number(qty) * Number(costPer);
                }
              }
              projectedCostAmountAssistNum = Number(
                totalProjectedCost.toFixed(2)
              );
              console.log(
                `💵 Custo projetado total: ${projectedCostAmountAssistNum}`
              );
            } catch (err) {
              console.warn(`Erro ao calcular custo projetado: ${err}`);
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

    // Processar Unidades Neutras
    for (const row of neutralSectors) {
      hospital.neutral.push({
        id: row.sector_id,
        name: row.sector_name,
        entityName: row.entity_name,
        costAmount: row.cost_amount,
        projectedCostAmount: row.projected_cost_amount,
        status: row.status,
      });
    }

    console.log(`   Neutras: ${hospital.neutral.length} unidades`);

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

  // ===== MÉTODOS AGREGADOS PROJECTED POR REDE/GRUPO/REGIÃO =====

  async getProjectedSectorsByRede(redeId: string): Promise<any> {
    console.log(
      `🔎 Buscando setores projetados agregados para rede ${redeId}...`
    );

    // Buscar todos os hospitais da rede
    const hospitalsQuery = `SELECT id FROM public.hospitais WHERE "redeId" = $1`;
    const hospitals = await this.ds.query(hospitalsQuery, [redeId]);

    if (hospitals.length === 0) {
      return { internation: [], assistance: [], neutral: [] };
    }

    // Buscar dados de cada hospital e agregar
    const allInternation: any[] = [];
    const allAssistance: any[] = [];
    const allNeutral: any[] = [];

    for (const hospital of hospitals) {
      const hospitalData = await this.getProjectedSectorsByHospital(
        hospital.id
      );
      allInternation.push(...(hospitalData.internation || []));
      allAssistance.push(...(hospitalData.assistance || []));
      allNeutral.push(...(hospitalData.neutral || []));
    }

    // Agregar por nome de setor
    const internationMap = new Map<string, any>();
    const assistanceMap = new Map<string, any>();
    const neutralMap = new Map<string, any>();

    // Agregar internação
    for (const sector of allInternation) {
      const key = sector.name;
      if (!internationMap.has(key)) {
        internationMap.set(key, {
          name: sector.name,
          bedCount: 0,
          minimumCare: 0,
          intermediateCare: 0,
          highDependency: 0,
          semiIntensive: 0,
          intensive: 0,
          bedStatusEvaluated: 0,
          bedStatusVacant: 0,
          bedStatusInactive: 0,
          costAmount: 0,
          projectedCostAmount: 0,
          staff: [],
          projectedStaff: [],
        });
      }

      const agg = internationMap.get(key);
      agg.bedCount += sector.bedCount || 0;
      agg.minimumCare += sector.minimumCare || 0;
      agg.intermediateCare += sector.intermediateCare || 0;
      agg.highDependency += sector.highDependency || 0;
      agg.semiIntensive += sector.semiIntensive || 0;
      agg.intensive += sector.intensive || 0;
      agg.bedStatusEvaluated += sector.bedStatusEvaluated || 0;
      agg.bedStatusVacant += sector.bedStatusVacant || 0;
      agg.bedStatusInactive += sector.bedStatusInactive || 0;
      agg.costAmount += parseFloat(sector.costAmount || 0);
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount || 0);

      // Agregar staff
      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existing = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }

      // Agregar projectedStaff
      if (sector.projectedStaff && Array.isArray(sector.projectedStaff)) {
        for (const staffMember of sector.projectedStaff) {
          const existing = agg.projectedStaff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.projectedStaff.push({ ...staffMember });
          }
        }
      }
    }

    // Agregar assistência
    for (const sector of allAssistance) {
      const key = sector.name;
      if (!assistanceMap.has(key)) {
        assistanceMap.set(key, {
          name: sector.name,
          costAmount: 0,
          projectedCostAmount: 0,
          staff: [],
          projectedStaff: [],
        });
      }

      const agg = assistanceMap.get(key);
      agg.costAmount += parseFloat(sector.costAmount || 0);
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount || 0);

      // Agregar staff
      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existing = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }

      // Agregar projectedStaff
      if (sector.projectedStaff && Array.isArray(sector.projectedStaff)) {
        for (const staffMember of sector.projectedStaff) {
          const existing = agg.projectedStaff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.projectedStaff.push({ ...staffMember });
          }
        }
      }
    }

    // Agregar neutral por nome
    for (const sector of allNeutral) {
      const key = sector.name;
      if (!neutralMap.has(key)) {
        neutralMap.set(key, {
          name: sector.name,
          costAmount: 0,
          projectedCostAmount: 0,
          status: sector.status,
        });
      }
      const agg = neutralMap.get(key);
      agg.costAmount += parseFloat(sector.costAmount) || 0;
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount) || 0;
    }

    return {
      internation: Array.from(internationMap.values()),
      assistance: Array.from(assistanceMap.values()),
      neutral: Array.from(neutralMap.values()),
    };
  }

  async getProjectedSectorsByGrupo(grupoId: string): Promise<any> {
    console.log(
      `🔎 Buscando setores projetados agregados para grupo ${grupoId}...`
    );

    const hospitalsQuery = `SELECT id FROM public.hospitais WHERE "grupoId" = $1`;
    const hospitals = await this.ds.query(hospitalsQuery, [grupoId]);

    if (hospitals.length === 0) {
      return { internation: [], assistance: [], neutral: [] };
    }

    const allInternation: any[] = [];
    const allAssistance: any[] = [];
    const allNeutral: any[] = [];

    for (const hospital of hospitals) {
      const hospitalData = await this.getProjectedSectorsByHospital(
        hospital.id
      );
      allInternation.push(...(hospitalData.internation || []));
      allAssistance.push(...(hospitalData.assistance || []));
      allNeutral.push(...(hospitalData.neutral || []));
    }

    const internationMap = new Map<string, any>();
    const assistanceMap = new Map<string, any>();
    const neutralMap = new Map<string, any>();

    for (const sector of allInternation) {
      const key = sector.name;
      if (!internationMap.has(key)) {
        internationMap.set(key, {
          name: sector.name,
          bedCount: 0,
          minimumCare: 0,
          intermediateCare: 0,
          highDependency: 0,
          semiIntensive: 0,
          intensive: 0,
          bedStatusEvaluated: 0,
          bedStatusVacant: 0,
          bedStatusInactive: 0,
          costAmount: 0,
          projectedCostAmount: 0,
          staff: [],
          projectedStaff: [],
        });
      }

      const agg = internationMap.get(key);
      agg.bedCount += sector.bedCount || 0;
      agg.minimumCare += sector.minimumCare || 0;
      agg.intermediateCare += sector.intermediateCare || 0;
      agg.highDependency += sector.highDependency || 0;
      agg.semiIntensive += sector.semiIntensive || 0;
      agg.intensive += sector.intensive || 0;
      agg.bedStatusEvaluated += sector.bedStatusEvaluated || 0;
      agg.bedStatusVacant += sector.bedStatusVacant || 0;
      agg.bedStatusInactive += sector.bedStatusInactive || 0;
      agg.costAmount += parseFloat(sector.costAmount || 0);
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount || 0);

      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existing = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }

      if (sector.projectedStaff && Array.isArray(sector.projectedStaff)) {
        for (const staffMember of sector.projectedStaff) {
          const existing = agg.projectedStaff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.projectedStaff.push({ ...staffMember });
          }
        }
      }
    }

    for (const sector of allAssistance) {
      const key = sector.name;
      if (!assistanceMap.has(key)) {
        assistanceMap.set(key, {
          name: sector.name,
          costAmount: 0,
          projectedCostAmount: 0,
          staff: [],
          projectedStaff: [],
        });
      }

      const agg = assistanceMap.get(key);
      agg.costAmount += parseFloat(sector.costAmount || 0);
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount || 0);

      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existing = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }

      if (sector.projectedStaff && Array.isArray(sector.projectedStaff)) {
        for (const staffMember of sector.projectedStaff) {
          const existing = agg.projectedStaff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.projectedStaff.push({ ...staffMember });
          }
        }
      }
    }

    // Agregar neutral por nome
    for (const sector of allNeutral) {
      const key = sector.name;
      if (!neutralMap.has(key)) {
        neutralMap.set(key, {
          name: sector.name,
          costAmount: 0,
          projectedCostAmount: 0,
          status: sector.status,
        });
      }
      const agg = neutralMap.get(key);
      agg.costAmount += parseFloat(sector.costAmount) || 0;
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount) || 0;
    }

    return {
      internation: Array.from(internationMap.values()),
      assistance: Array.from(assistanceMap.values()),
      neutral: Array.from(neutralMap.values()),
    };
  }

  async getProjectedSectorsByRegiao(regiaoId: string): Promise<any> {
    console.log(
      `🔎 Buscando setores projetados agregados para região ${regiaoId}...`
    );

    const hospitalsQuery = `SELECT id FROM public.hospitais WHERE "regiaoId" = $1`;
    const hospitals = await this.ds.query(hospitalsQuery, [regiaoId]);

    if (hospitals.length === 0) {
      return { internation: [], assistance: [], neutral: [] };
    }

    const allInternation: any[] = [];
    const allAssistance: any[] = [];
    const allNeutral: any[] = [];

    for (const hospital of hospitals) {
      const hospitalData = await this.getProjectedSectorsByHospital(
        hospital.id
      );
      allInternation.push(...(hospitalData.internation || []));
      allAssistance.push(...(hospitalData.assistance || []));
      allNeutral.push(...(hospitalData.neutral || []));
    }

    const internationMap = new Map<string, any>();
    const assistanceMap = new Map<string, any>();
    const neutralMap = new Map<string, any>();

    for (const sector of allInternation) {
      const key = sector.name;
      if (!internationMap.has(key)) {
        internationMap.set(key, {
          name: sector.name,
          bedCount: 0,
          minimumCare: 0,
          intermediateCare: 0,
          highDependency: 0,
          semiIntensive: 0,
          intensive: 0,
          bedStatusEvaluated: 0,
          bedStatusVacant: 0,
          bedStatusInactive: 0,
          costAmount: 0,
          projectedCostAmount: 0,
          staff: [],
          projectedStaff: [],
        });
      }

      const agg = internationMap.get(key);
      agg.bedCount += sector.bedCount || 0;
      agg.minimumCare += sector.minimumCare || 0;
      agg.intermediateCare += sector.intermediateCare || 0;
      agg.highDependency += sector.highDependency || 0;
      agg.semiIntensive += sector.semiIntensive || 0;
      agg.intensive += sector.intensive || 0;
      agg.bedStatusEvaluated += sector.bedStatusEvaluated || 0;
      agg.bedStatusVacant += sector.bedStatusVacant || 0;
      agg.bedStatusInactive += sector.bedStatusInactive || 0;
      agg.costAmount += parseFloat(sector.costAmount || 0);
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount || 0);

      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existing = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }

      if (sector.projectedStaff && Array.isArray(sector.projectedStaff)) {
        for (const staffMember of sector.projectedStaff) {
          const existing = agg.projectedStaff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.projectedStaff.push({ ...staffMember });
          }
        }
      }
    }

    for (const sector of allAssistance) {
      const key = sector.name;
      if (!assistanceMap.has(key)) {
        assistanceMap.set(key, {
          name: sector.name,
          costAmount: 0,
          projectedCostAmount: 0,
          staff: [],
          projectedStaff: [],
        });
      }

      const agg = assistanceMap.get(key);
      agg.costAmount += parseFloat(sector.costAmount || 0);
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount || 0);

      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existing = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }

      if (sector.projectedStaff && Array.isArray(sector.projectedStaff)) {
        for (const staffMember of sector.projectedStaff) {
          const existing = agg.projectedStaff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existing) {
            existing.quantity += staffMember.quantity || 0;
          } else {
            agg.projectedStaff.push({ ...staffMember });
          }
        }
      }
    }

    // Agregar neutral por nome
    for (const sector of allNeutral) {
      const key = sector.name;
      if (!neutralMap.has(key)) {
        neutralMap.set(key, {
          name: sector.name,
          costAmount: 0,
          projectedCostAmount: 0,
          status: sector.status,
        });
      }
      const agg = neutralMap.get(key);
      agg.costAmount += parseFloat(sector.costAmount) || 0;
      agg.projectedCostAmount += parseFloat(sector.projectedCostAmount) || 0;
    }

    return {
      internation: Array.from(internationMap.values()),
      assistance: Array.from(assistanceMap.values()),
      neutral: Array.from(neutralMap.values()),
    };
  }
}
