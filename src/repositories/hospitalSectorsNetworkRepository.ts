import { DataSource } from "typeorm";
import {
  InternationSectorDTO,
  AssistanceSectorDTO,
  HospitalSectorsDTO,
} from "../dto/hospitalSectors.dto";

export class HospitalSectorsNetworkRepository {
  constructor(private ds: DataSource) {}

  async getAggregatedSectorsByRede(
    redeId: string
  ): Promise<HospitalSectorsDTO> {
    const internation = await this.getAggregatedInternationByRede(redeId);
    const assistance = await this.getAggregatedAssistanceByRede(redeId);

    return {
      id: `hospital-sectors-rede-${redeId}`,
      internation,
      assistance,
    };
  }

  async getAggregatedSectorsByGrupo(
    grupoId: string
  ): Promise<HospitalSectorsDTO> {
    const internation = await this.getAggregatedInternationByGrupo(grupoId);
    const assistance = await this.getAggregatedAssistanceByGrupo(grupoId);

    return {
      id: `hospital-sectors-grupo-${grupoId}`,
      internation,
      assistance,
    };
  }

  async getAggregatedSectorsByRegiao(
    regiaoId: string
  ): Promise<HospitalSectorsDTO> {
    const internation = await this.getAggregatedInternationByRegiao(regiaoId);
    const assistance = await this.getAggregatedAssistanceByRegiao(regiaoId);

    return {
      id: `hospital-sectors-regiao-${regiaoId}`,
      internation,
      assistance,
    };
  }

  private async getAggregatedInternationByRede(
    redeId: string
  ): Promise<InternationSectorDTO[]> {
    const query = `
      SELECT 
        uni.nome AS "name",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        SUM(COALESCE(ls.bed_count, 0)) AS "bedCount",
        JSON_BUILD_OBJECT(
          'minimumCare',      SUM(COALESCE(ls.minimum_care, 0)),
          'intermediateCare', SUM(COALESCE(ls.intermediate_care, 0)),
          'highDependency',   SUM(COALESCE(ls.high_dependency, 0)),
          'semiIntensive',    SUM(COALESCE(ls.semi_intensive, 0)),
          'intensive',        SUM(COALESCE(ls.intensive, 0))
        ) AS "careLevel",
        JSON_BUILD_OBJECT(
          'evaluated', SUM(COALESCE(ls.evaluated, 0)),
          'vacant',    SUM(COALESCE(ls.vacant, 0)),
          'inactive',  SUM(COALESCE(ls.inactive, 0))
        ) AS "bedStatus",
        COALESCE(
          (
            SELECT JSON_AGG(cargo_info)
            FROM (
              SELECT DISTINCT ON (c2.id)
                c2.id,
                c2.nome as role,
                SUM(cuni2.quantidade_funcionarios) as quantity,
                (
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
                ) as "unitCost",
                (
                  (
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
                  ) * SUM(cuni2.quantidade_funcionarios)
                ) as "totalCost"
              FROM public.unidades_internacao uni2
              INNER JOIN public.hospitais h2 ON h2.id = uni2."hospitalId"
              LEFT JOIN public.cargos_unidade cuni2 ON cuni2.unidade_id = uni2.id
              LEFT JOIN public.cargo c2 ON c2.id = cuni2.cargo_id
              WHERE h2."redeId" = $1 AND uni2.nome = uni.nome AND c2.id IS NOT NULL
              GROUP BY c2.id, c2.nome, c2.salario, c2.adicionais_tributos
            ) cargo_info
          ),
          '[]'::json
        ) AS "staff"
      FROM public.unidades_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE h."redeId" = $1
      GROUP BY uni.nome, uni.descricao, uni.horas_extra_reais
      ORDER BY uni.nome
    `;

    return await this.ds.query(query, [redeId]);
  }

  private async getAggregatedInternationByGrupo(
    grupoId: string
  ): Promise<InternationSectorDTO[]> {
    const query = `
      SELECT 
        uni.nome AS "name",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        SUM(COALESCE(ls.bed_count, 0)) AS "bedCount",
        JSON_BUILD_OBJECT(
          'minimumCare',      SUM(COALESCE(ls.minimum_care, 0)),
          'intermediateCare', SUM(COALESCE(ls.intermediate_care, 0)),
          'highDependency',   SUM(COALESCE(ls.high_dependency, 0)),
          'semiIntensive',    SUM(COALESCE(ls.semi_intensive, 0)),
          'intensive',        SUM(COALESCE(ls.intensive, 0))
        ) AS "careLevel",
        JSON_BUILD_OBJECT(
          'evaluated', SUM(COALESCE(ls.evaluated, 0)),
          'vacant',    SUM(COALESCE(ls.vacant, 0)),
          'inactive',  SUM(COALESCE(ls.inactive, 0))
        ) AS "bedStatus",
        COALESCE(
          (
            SELECT JSON_AGG(cargo_info)
            FROM (
              SELECT DISTINCT ON (c2.id)
                c2.id,
                c2.nome as role,
                SUM(cuni2.quantidade_funcionarios) as quantity,
                (
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
                ) as "unitCost",
                (
                  (
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
                  ) * SUM(cuni2.quantidade_funcionarios)
                ) as "totalCost"
              FROM public.unidades_internacao uni2
              INNER JOIN public.hospitais h2 ON h2.id = uni2."hospitalId"
              LEFT JOIN public.cargos_unidade cuni2 ON cuni2.unidade_id = uni2.id
              LEFT JOIN public.cargo c2 ON c2.id = cuni2.cargo_id
              WHERE h2."grupoId" = $1 AND uni2.nome = uni.nome AND c2.id IS NOT NULL
              GROUP BY c2.id, c2.nome, c2.salario, c2.adicionais_tributos
            ) cargo_info
          ),
          '[]'::json
        ) AS "staff"
      FROM public.unidades_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE h."grupoId" = $1
      GROUP BY uni.nome, uni.descricao, uni.horas_extra_reais
      ORDER BY uni.nome
    `;

    return await this.ds.query(query, [grupoId]);
  }

  private async getAggregatedInternationByRegiao(
    regiaoId: string
  ): Promise<InternationSectorDTO[]> {
    const query = `
      SELECT 
        uni.nome AS "name",
        uni.descricao AS "descr",
        SUM(
          (
            (COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
             COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
             COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
            * COALESCE(cuni.quantidade_funcionarios, 0)
          )
        ) AS "costAmount",
        SUM(COALESCE(ls.bed_count, 0)) AS "bedCount",
        JSON_BUILD_OBJECT(
          'minimumCare',      SUM(COALESCE(ls.minimum_care, 0)),
          'intermediateCare', SUM(COALESCE(ls.intermediate_care, 0)),
          'highDependency',   SUM(COALESCE(ls.high_dependency, 0)),
          'semiIntensive',    SUM(COALESCE(ls.semi_intensive, 0)),
          'intensive',        SUM(COALESCE(ls.intensive, 0))
        ) AS "careLevel",
        JSON_BUILD_OBJECT(
          'evaluated', SUM(COALESCE(ls.evaluated, 0)),
          'vacant',    SUM(COALESCE(ls.vacant, 0)),
          'inactive',  SUM(COALESCE(ls.inactive, 0))
        ) AS "bedStatus",
        COALESCE(
          (
            SELECT JSON_AGG(cargo_info)
            FROM (
              SELECT DISTINCT ON (c2.id)
                c2.id,
                c2.nome as role,
                SUM(cuni2.quantidade_funcionarios) as quantity,
                (
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
                ) as "unitCost",
                (
                  (
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)
                  ) * SUM(cuni2.quantidade_funcionarios)
                ) as "totalCost"
              FROM public.unidades_internacao uni2
              INNER JOIN public.hospitais h2 ON h2.id = uni2."hospitalId"
              LEFT JOIN public.cargos_unidade cuni2 ON cuni2.unidade_id = uni2.id
              LEFT JOIN public.cargo c2 ON c2.id = cuni2.cargo_id
              WHERE h2."regiaoId" = $1 AND uni2.nome = uni.nome AND c2.id IS NOT NULL
              GROUP BY c2.id, c2.nome, c2.salario, c2.adicionais_tributos
            ) cargo_info
          ),
          '[]'::json
        ) AS "staff"
      FROM public.unidades_internacao uni
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE h."regiaoId" = $1
      GROUP BY uni.nome, uni.descricao, uni.horas_extra_reais
      ORDER BY uni.nome
    `;

    return await this.ds.query(query, [regiaoId]);
  }

  private async getAggregatedAssistanceByRede(
    redeId: string
  ): Promise<AssistanceSectorDTO[]> {
    // Buscar todos os hospitais da rede
    const hospitalsQuery = `
      SELECT id FROM public.hospitais WHERE "redeId" = $1
    `;
    const hospitals = await this.ds.query(hospitalsQuery, [redeId]);

    if (hospitals.length === 0) {
      return [];
    }

    // Buscar unidades de cada hospital
    const allSectors: any[] = [];
    for (const hospital of hospitals) {
      const query = `
        SELECT 
          uni.nome AS "name",
          uni.descricao AS "descr",
          COALESCE(
            (
              SELECT SUM(
                (COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
                 COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0))
                * COALESCE(cs.quantidade_funcionarios, 0)
              )
              FROM public.sitios_funcionais sf
              INNER JOIN public.cargos_sitio cs ON cs.sitio_id = sf.id
              INNER JOIN public.cargos_unidade cu_sitio ON cu_sitio.id = cs.cargo_unidade_id
              INNER JOIN public.cargo c_sitio ON c_sitio.id = cu_sitio.cargo_id
              WHERE sf."unidadeId" = uni.id
            ),
            (
              SELECT SUM(
                (COALESCE(NULLIF(REPLACE(REPLACE(c_cu.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
                 COALESCE(NULLIF(REPLACE(REPLACE(c_cu.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                 COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
                * COALESCE(cu.quantidade_funcionarios, 0)
              )
              FROM public.cargos_unidade cu
              INNER JOIN public.cargo c_cu ON c_cu.id = cu.cargo_id
              WHERE cu.unidade_nao_internacao_id = uni.id
            ),
            0
          ) AS "costAmount",
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', c2.id,
                  'role', c2.nome,
                  'quantity', cs2.quantidade_funcionarios,
                  'unitCost', (COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)),
                  'totalCost', (COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)) * 
                              cs2.quantidade_funcionarios
                )
              )
              FROM public.sitios_funcionais sf2
              INNER JOIN public.cargos_sitio cs2 ON cs2.sitio_id = sf2.id
              INNER JOIN public.cargos_unidade cu2 ON cu2.id = cs2.cargo_unidade_id
              INNER JOIN public.cargo c2 ON c2.id = cu2.cargo_id
              WHERE sf2."unidadeId" = uni.id
            ),
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', c_cu2.id,
                  'role', c_cu2.nome,
                  'quantity', cu2.quantidade_funcionarios,
                  'unitCost', (COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)),
                  'totalCost', (COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)) * 
                              cu2.quantidade_funcionarios
                )
              )
              FROM public.cargos_unidade cu2
              INNER JOIN public.cargo c_cu2 ON c_cu2.id = cu2.cargo_id
              WHERE cu2.unidade_nao_internacao_id = uni.id
            ),
            '[]'::json
          ) AS "staff",
          '[]'::json AS "sitiosFuncionais"
        FROM public.unidades_nao_internacao uni
        WHERE uni."hospitalId" = $1
      `;

      const sectors = await this.ds.query(query, [hospital.id]);
      allSectors.push(...sectors);
    }

    // Agregar setores com mesmo nome
    const aggregatedMap = new Map<string, any>();

    for (const sector of allSectors) {
      const key = sector.name;

      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          name: sector.name,
          descr: sector.descr,
          costAmount: 0,
          staff: [],
        });
      }

      const agg = aggregatedMap.get(key);
      agg.costAmount += sector.costAmount || 0;

      // Agregar staff
      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existingStaff = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existingStaff) {
            existingStaff.quantity += staffMember.quantity || 0;
            existingStaff.totalCost += staffMember.totalCost || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }
    }

    return Array.from(aggregatedMap.values());
  }

  private async getAggregatedAssistanceByGrupo(
    grupoId: string
  ): Promise<AssistanceSectorDTO[]> {
    // Buscar todos os hospitais do grupo
    const hospitalsQuery = `
      SELECT id FROM public.hospitais WHERE "grupoId" = $1
    `;
    const hospitals = await this.ds.query(hospitalsQuery, [grupoId]);

    if (hospitals.length === 0) {
      return [];
    }

    // Buscar unidades de cada hospital
    const allSectors: any[] = [];
    for (const hospital of hospitals) {
      const query = `
        SELECT 
          uni.nome AS "name",
          uni.descricao AS "descr",
          COALESCE(
            (
              SELECT SUM(
                (COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
                 COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0))
                * COALESCE(cs.quantidade_funcionarios, 0)
              )
              FROM public.sitios_funcionais sf
              INNER JOIN public.cargos_sitio cs ON cs.sitio_id = sf.id
              INNER JOIN public.cargos_unidade cu_sitio ON cu_sitio.id = cs.cargo_unidade_id
              INNER JOIN public.cargo c_sitio ON c_sitio.id = cu_sitio.cargo_id
              WHERE sf."unidadeId" = uni.id
            ),
            (
              SELECT SUM(
                (COALESCE(NULLIF(REPLACE(REPLACE(c_cu.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
                 COALESCE(NULLIF(REPLACE(REPLACE(c_cu.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                 COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
                * COALESCE(cu.quantidade_funcionarios, 0)
              )
              FROM public.cargos_unidade cu
              INNER JOIN public.cargo c_cu ON c_cu.id = cu.cargo_id
              WHERE cu.unidade_nao_internacao_id = uni.id
            ),
            0
          ) AS "costAmount",
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', c2.id,
                  'role', c2.nome,
                  'quantity', cs2.quantidade_funcionarios,
                  'unitCost', (COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)),
                  'totalCost', (COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)) * 
                              cs2.quantidade_funcionarios
                )
              )
              FROM public.sitios_funcionais sf2
              INNER JOIN public.cargos_sitio cs2 ON cs2.sitio_id = sf2.id
              INNER JOIN public.cargos_unidade cu2 ON cu2.id = cs2.cargo_unidade_id
              INNER JOIN public.cargo c2 ON c2.id = cu2.cargo_id
              WHERE sf2."unidadeId" = uni.id
            ),
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', c_cu2.id,
                  'role', c_cu2.nome,
                  'quantity', cu2.quantidade_funcionarios,
                  'unitCost', (COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)),
                  'totalCost', (COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)) * 
                              cu2.quantidade_funcionarios
                )
              )
              FROM public.cargos_unidade cu2
              INNER JOIN public.cargo c_cu2 ON c_cu2.id = cu2.cargo_id
              WHERE cu2.unidade_nao_internacao_id = uni.id
            ),
            '[]'::json
          ) AS "staff",
          '[]'::json AS "sitiosFuncionais"
        FROM public.unidades_nao_internacao uni
        WHERE uni."hospitalId" = $1
      `;

      const sectors = await this.ds.query(query, [hospital.id]);
      allSectors.push(...sectors);
    }

    // Agregar setores com mesmo nome
    const aggregatedMap = new Map<string, any>();

    for (const sector of allSectors) {
      const key = sector.name;

      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          name: sector.name,
          descr: sector.descr,
          costAmount: 0,
          staff: [],
        });
      }

      const agg = aggregatedMap.get(key);
      agg.costAmount += sector.costAmount || 0;

      // Agregar staff
      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existingStaff = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existingStaff) {
            existingStaff.quantity += staffMember.quantity || 0;
            existingStaff.totalCost += staffMember.totalCost || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }
    }

    return Array.from(aggregatedMap.values());
  }

  private async getAggregatedAssistanceByRegiao(
    regiaoId: string
  ): Promise<AssistanceSectorDTO[]> {
    // Buscar todos os hospitais da região
    const hospitalsQuery = `
      SELECT id FROM public.hospitais WHERE "regiaoId" = $1
    `;
    const hospitals = await this.ds.query(hospitalsQuery, [regiaoId]);

    if (hospitals.length === 0) {
      return [];
    }

    // Buscar unidades de cada hospital
    const allSectors: any[] = [];
    for (const hospital of hospitals) {
      const query = `
        SELECT 
          uni.nome AS "name",
          uni.descricao AS "descr",
          COALESCE(
            (
              SELECT SUM(
                (COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
                 COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0))
                * COALESCE(cs.quantidade_funcionarios, 0)
              )
              FROM public.sitios_funcionais sf
              INNER JOIN public.cargos_sitio cs ON cs.sitio_id = sf.id
              INNER JOIN public.cargos_unidade cu_sitio ON cu_sitio.id = cs.cargo_unidade_id
              INNER JOIN public.cargo c_sitio ON c_sitio.id = cu_sitio.cargo_id
              WHERE sf."unidadeId" = uni.id
            ),
            (
              SELECT SUM(
                (COALESCE(NULLIF(REPLACE(REPLACE(c_cu.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
                 COALESCE(NULLIF(REPLACE(REPLACE(c_cu.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                 COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
                * COALESCE(cu.quantidade_funcionarios, 0)
              )
              FROM public.cargos_unidade cu
              INNER JOIN public.cargo c_cu ON c_cu.id = cu.cargo_id
              WHERE cu.unidade_nao_internacao_id = uni.id
            ),
            0
          ) AS "costAmount",
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', c2.id,
                  'role', c2.nome,
                  'quantity', cs2.quantidade_funcionarios,
                  'unitCost', (COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)),
                  'totalCost', (COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0)) * 
                              cs2.quantidade_funcionarios
                )
              )
              FROM public.sitios_funcionais sf2
              INNER JOIN public.cargos_sitio cs2 ON cs2.sitio_id = sf2.id
              INNER JOIN public.cargos_unidade cu2 ON cu2.id = cs2.cargo_unidade_id
              INNER JOIN public.cargo c2 ON c2.id = cu2.cargo_id
              WHERE sf2."unidadeId" = uni.id
            ),
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', c_cu2.id,
                  'role', c_cu2.nome,
                  'quantity', cu2.quantidade_funcionarios,
                  'unitCost', (COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)),
                  'totalCost', (COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                              COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)) * 
                              cu2.quantidade_funcionarios
                )
              )
              FROM public.cargos_unidade cu2
              INNER JOIN public.cargo c_cu2 ON c_cu2.id = cu2.cargo_id
              WHERE cu2.unidade_nao_internacao_id = uni.id
            ),
            '[]'::json
          ) AS "staff",
          '[]'::json AS "sitiosFuncionais"
        FROM public.unidades_nao_internacao uni
        WHERE uni."hospitalId" = $1
      `;

      const sectors = await this.ds.query(query, [hospital.id]);
      allSectors.push(...sectors);
    }

    // Agregar setores com mesmo nome
    const aggregatedMap = new Map<string, any>();

    for (const sector of allSectors) {
      const key = sector.name;

      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          name: sector.name,
          descr: sector.descr,
          costAmount: 0,
          staff: [],
        });
      }

      const agg = aggregatedMap.get(key);
      agg.costAmount += sector.costAmount || 0;

      // Agregar staff
      if (sector.staff && Array.isArray(sector.staff)) {
        for (const staffMember of sector.staff) {
          const existingStaff = agg.staff.find(
            (s: any) => s.role === staffMember.role
          );
          if (existingStaff) {
            existingStaff.quantity += staffMember.quantity || 0;
            existingStaff.totalCost += staffMember.totalCost || 0;
          } else {
            agg.staff.push({ ...staffMember });
          }
        }
      }
    }

    return Array.from(aggregatedMap.values());
  }
}
