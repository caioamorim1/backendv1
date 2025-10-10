import { DataSource } from "typeorm";
import {
  InternationSectorWithHospitalDTO,
  AssistanceSectorWithHospitalDTO,
  AggregatedSectorsDTO,
  SectorsAggregateDTO
} from "../dto/hospitalSectorsAggregate.dto";

export class HospitalSectorsAggregateRepository {
  constructor(private ds: DataSource) {}

  // Busca por Rede
  async getSectorsByNetwork(networkId: string): Promise<SectorsAggregateDTO> {
    const internation = await this.getInternationSectorsByNetwork(networkId);
    const assistance = await this.getAssistanceSectorsByNetwork(networkId);
    
    return {
      id: `network-sectors-${networkId}`,
      hospitals: await this.aggregateSectorsByHospital(internation, assistance)
    };
  }

  // Busca por Grupo
  async getSectorsByGroup(groupId: string): Promise<SectorsAggregateDTO> {
    const internation = await this.getInternationSectorsByGroup(groupId);
    const assistance = await this.getAssistanceSectorsByGroup(groupId);
    
    return {
      id: `group-sectors-${groupId}`,
      hospitals: await this.aggregateSectorsByHospital(internation, assistance)
    };
  }

  // Busca por Região
  async getSectorsByRegion(regionId: string): Promise<SectorsAggregateDTO> {
    const internation = await this.getInternationSectorsByRegion(regionId);
    const assistance = await this.getAssistanceSectorsByRegion(regionId);
    
    return {
      id: `region-sectors-${regionId}`,
      hospitals: await this.aggregateSectorsByHospital(internation, assistance)
    };
  }

  private async getInternationSectorsByNetwork(networkId: string): Promise<InternationSectorWithHospitalDTO[]> {
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

  private async getAssistanceSectorsByNetwork(networkId: string): Promise<AssistanceSectorWithHospitalDTO[]> {
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

  private async getInternationSectorsByGroup(groupId: string): Promise<InternationSectorWithHospitalDTO[]> {
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

  private async getAssistanceSectorsByGroup(groupId: string): Promise<AssistanceSectorWithHospitalDTO[]> {
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

  private async getInternationSectorsByRegion(regionId: string): Promise<InternationSectorWithHospitalDTO[]> {
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

  private async getAssistanceSectorsByRegion(regionId: string): Promise<AssistanceSectorWithHospitalDTO[]> {
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
          assistance: []
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
          assistance: []
        });
      }
      hospitalMap.get(hospitalName)!.assistance.push(sectorData);
    }

    // Converter o mapa em array e ordenar por nome do hospital
    return Array.from(hospitalMap.values()).sort((a, b) => 
      a.hospitalName.localeCompare(b.hospitalName)
    );
  }
}