import { DataSource } from "typeorm";
import {
  InternationSectorDTO,
  AssistanceSectorDTO,
  HospitalSectorsDTO,
} from "../dto/hospitalSectors.dto";

export class HospitalSectorsRepository {
  constructor(private ds: DataSource) {}

  async getAllSectorsByHospital(
    hospitalId: string
  ): Promise<HospitalSectorsDTO> {
    const internation = await this.getInternationSectors(hospitalId);
    const assistance = await this.getAssistanceSectors(hospitalId);

    return {
      id: `hospital-sectors-${hospitalId}`,
      internation,
      assistance,
    };
  }

  private async getInternationSectors(
    hospitalId: string
  ): Promise<InternationSectorDTO[]> {
    const query = `
      SELECT 
        uni.id AS "id",
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
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE uni."hospitalId" = $1
      GROUP BY 
        uni.id, uni.nome, uni.descricao,
        ls.bed_count, ls.minimum_care, ls.intermediate_care,
        ls.high_dependency, ls.semi_intensive, ls.intensive,
        ls.evaluated, ls.vacant, ls.inactive
      ORDER BY uni.nome
    `;

    return await this.ds.query(query, [hospitalId]);
  }

  private async getAssistanceSectors(
    hospitalId: string
  ): Promise<AssistanceSectorDTO[]> {
    // ✅ QUERY OTIMIZADA: Busca quantidades de sítios SE EXISTIREM, senão usa CargoUnidade como fallback
    const query = `
      SELECT 
        uni.id AS "id",
        uni.nome AS "name",
        uni.descricao AS "descr",
        -- Calcular custo: prioriza sítios, fallback para CargoUnidade
        COALESCE(
          (
            -- Custo calculado a partir dos sítios funcionais
            SELECT SUM(
              (COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.salario, '%', ''), ',', '.'), '')::numeric, 0) + 
               COALESCE(NULLIF(REPLACE(REPLACE(c_sitio.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
               COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0))
              * COALESCE(cs.quantidade_funcionarios, 0)
            )
            FROM public.sitios_funcionais sf
            INNER JOIN public.cargos_sitio cs ON cs.sitio_id = sf.id
            INNER JOIN public.cargos_unidade cu_sitio ON cu_sitio.id = cs.cargo_unidade_id
            INNER JOIN public.cargo c_sitio ON c_sitio.id = cu_sitio.cargo_id
            WHERE sf."unidadeId" = uni.id
          ),
          -- Fallback: Custo calculado a partir de CargoUnidade (dados antigos)
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
        -- Staff: prioriza sítios, fallback para CargoUnidade
        COALESCE(
          (
            -- Staff calculado a partir dos sítios funcionais
            SELECT JSON_AGG(cargo_agg)
            FROM (
              SELECT 
                c2.id as id,
                c2.nome as role,
                COALESCE(SUM(cs2.quantidade_funcionarios), 0) as quantity
              FROM public.sitios_funcionais sf2
              INNER JOIN public.cargos_sitio cs2 ON cs2.sitio_id = sf2.id
              INNER JOIN public.cargos_unidade cu2 ON cu2.id = cs2.cargo_unidade_id
              INNER JOIN public.cargo c2 ON c2.id = cu2.cargo_id
              WHERE sf2."unidadeId" = uni.id
              GROUP BY c2.id, c2.nome
            ) cargo_agg
          ),
          -- Fallback: Staff de CargoUnidade (dados antigos)
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', c_cu2.id,
                'role', c_cu2.nome,
                'quantity', cu2.quantidade_funcionarios
              )
            )
            FROM public.cargos_unidade cu2
            INNER JOIN public.cargo c_cu2 ON c_cu2.id = cu2.cargo_id
            WHERE cu2.unidade_nao_internacao_id = uni.id
          ),
          '[]'::json
        ) AS "staff",
        -- Sítios funcionais (vazio se não existirem)
        COALESCE(
          (
            SELECT JSON_AGG(sitio_agg ORDER BY sitio_agg.nome)
            FROM (
              SELECT 
                sf.id,
                sf.nome,
                (
                  SELECT JSON_AGG(cargo_sitio_agg)
                  FROM (
                    SELECT 
                      cs3.id as cargo_sitio_id,
                      cs3.quantidade_funcionarios,
                      JSON_BUILD_OBJECT(
                        'id', cu3.id,
                        'cargo', JSON_BUILD_OBJECT(
                          'id', c3.id,
                          'nome', c3.nome
                        )
                      ) as "cargoUnidade"
                    FROM public.cargos_sitio cs3
                    INNER JOIN public.cargos_unidade cu3 ON cu3.id = cs3.cargo_unidade_id
                    INNER JOIN public.cargo c3 ON c3.id = cu3.cargo_id
                    WHERE cs3.sitio_id = sf.id
                  ) cargo_sitio_agg
                ) as "cargosSitio"
              FROM public.sitios_funcionais sf
              WHERE sf."unidadeId" = uni.id
            ) sitio_agg
          ),
          '[]'::json
        ) AS "sitiosFuncionais"
      FROM public.unidades_nao_internacao uni
      WHERE uni."hospitalId" = $1
      GROUP BY uni.id, uni.nome, uni.descricao
      ORDER BY uni.nome
    `;

    return await this.ds.query(query, [hospitalId]);
  }
}
