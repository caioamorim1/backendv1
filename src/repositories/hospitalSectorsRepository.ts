import { DataSource } from "typeorm";
import {
  InternationSectorDTO,
  AssistanceSectorDTO,
  NeutralSectorDTO,
  HospitalSectorsDTO,
} from "../dto/hospitalSectors.dto";

export class HospitalSectorsRepository {
  constructor(private ds: DataSource) {}

  async getAllSectorsByHospital(
    hospitalId: string
  ): Promise<HospitalSectorsDTO> {
    const internation = await this.getInternationSectors(hospitalId);
    const assistance = await this.getAssistanceSectors(hospitalId);
    const neutral = await this.getNeutralSectors(hospitalId);

    return {
      id: `hospital-sectors-${hospitalId}`,
      internation,
      assistance,
      neutral,
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
        (SELECT COUNT(*) FROM public.leitos WHERE "unidadeId" = uni.id) AS "bedCount",
        JSON_BUILD_OBJECT(
          'evaluated', COALESCE(ls.evaluated, 0),
          'vacant',    COALESCE(ls.vacant, 0),
          'inactive',  COALESCE(ls.inactive, 0),
          'pending',   (SELECT COUNT(*) FROM public.leitos WHERE "unidadeId" = uni.id) - (
            COALESCE(ls.evaluated, 0) + 
            COALESCE(ls.vacant, 0) + 
            COALESCE(ls.inactive, 0)
          )
        ) AS "bedStatus",
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', c.id,
            'role', c.nome,
            'quantity', cuni.quantidade_funcionarios,
            'unitCost', (
              COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
              COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
              COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
            ),
            'totalCost', (
              (
                COALESCE(NULLIF(REPLACE(REPLACE(c.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                COALESCE(NULLIF(REPLACE(REPLACE(c.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
              ) * COALESCE(cuni.quantidade_funcionarios, 0)
            )
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS "staff"
      FROM public.unidades_internacao uni
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = uni.id
      WHERE uni."hospitalId" = $1
      GROUP BY 
        uni.id, uni.nome, uni.descricao,
        ls.evaluated, ls.vacant, ls.inactive
      ORDER BY uni.nome
    `;

    const rawResults = await this.ds.query(query, [hospitalId]);

    // Para cada unidade, calcular distribuição de classificação via eventos (tempo real)
    const results = await Promise.all(
      rawResults.map(async (unit: any) => {
        // Buscar classificações de todos os pacientes ativos hoje via eventos
        const careLevelQuery = `
          WITH eventos_hoje AS (
            SELECT DISTINCT ON (e."leitoId")
              e."leitoId",
              e.classificacao,
              e."timestamp"
            FROM public.eventos e
            INNER JOIN public.leitos l ON l.id = e."leitoId"
            WHERE l."unidadeId" = $1
              AND DATE(e."timestamp" AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
              AND e.tipo IN ('ENTRADA', 'ALTA')
            ORDER BY e."leitoId", e."timestamp" DESC
          ),
          historicos_ativos AS (
            SELECT DISTINCT
              h.classificacao
            FROM public.historicos_ocupacao h
            WHERE h."unidadeId" = $1
              AND h.inicio < NOW()
              AND (h.fim IS NULL OR h.fim >= CURRENT_DATE)
              AND NOT EXISTS (
                SELECT 1 FROM eventos_hoje ev WHERE ev."leitoId" = h."leitoId"
              )
          ),
          eventos_entrada_hoje AS (
            SELECT classificacao
            FROM eventos_hoje
            WHERE classificacao IS NOT NULL
          )
          SELECT 
            COALESCE(SUM(CASE WHEN classificacao = 'MINIMOS' THEN 1 ELSE 0 END), 0) as minimum_care,
            COALESCE(SUM(CASE WHEN classificacao = 'INTERMEDIARIOS' THEN 1 ELSE 0 END), 0) as intermediate_care,
            COALESCE(SUM(CASE WHEN classificacao = 'ALTA_DEPENDENCIA' THEN 1 ELSE 0 END), 0) as high_dependency,
            COALESCE(SUM(CASE WHEN classificacao = 'SEMI_INTENSIVOS' THEN 1 ELSE 0 END), 0) as semi_intensive,
            COALESCE(SUM(CASE WHEN classificacao = 'INTENSIVOS' THEN 1 ELSE 0 END), 0) as intensive
          FROM (
            SELECT classificacao FROM historicos_ativos
            UNION ALL
            SELECT classificacao FROM eventos_entrada_hoje
          ) todas_classificacoes
        `;

        const careLevelResult = await this.ds.query(careLevelQuery, [unit.id]);
        const careLevel = careLevelResult[0] || {
          minimum_care: 0,
          intermediate_care: 0,
          high_dependency: 0,
          semi_intensive: 0,
          intensive: 0,
        };

        unit.careLevel = {
          minimumCare: parseInt(careLevel.minimum_care) || 0,
          intermediateCare: parseInt(careLevel.intermediate_care) || 0,
          highDependency: parseInt(careLevel.high_dependency) || 0,
          semiIntensive: parseInt(careLevel.semi_intensive) || 0,
          intensive: parseInt(careLevel.intensive) || 0,
        };

        return unit;
      })
    );

    return results;
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
                COALESCE(SUM(cs2.quantidade_funcionarios), 0) as quantity,
                (
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                  COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                  COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
                ) as "unitCost",
                (
                  (
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                    COALESCE(NULLIF(REPLACE(REPLACE(c2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                    COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
                  ) * COALESCE(SUM(cs2.quantidade_funcionarios), 0)
                ) as "totalCost"
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
                'quantity', cu2.quantidade_funcionarios,
                'unitCost', (
                  COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                  COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                  COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
                ),
                'totalCost', (
                  (
                    COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.salario, '%', ''), ',', '.'), '')::numeric, 0) +
                    COALESCE(NULLIF(REPLACE(REPLACE(c_cu2.adicionais_tributos, '%', ''), ',', '.'), '')::numeric, 0) +
                    COALESCE(NULLIF(REPLACE(REPLACE(uni.horas_extra_reais, '%', ''), ',', '.'), '')::numeric, 0)
                  ) * COALESCE(cu2.quantidade_funcionarios, 0)
                )
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

  private async getNeutralSectors(
    hospitalId: string
  ): Promise<NeutralSectorDTO[]> {
    const query = `
      SELECT 
        un.id AS "id",
        un.nome AS "name",
        un.descricao AS "descr",
        COALESCE(un."custoTotal", 0) AS "costAmount",
        un.status AS "status"
      FROM public.unidades_neutras un
      WHERE un."hospitalId" = $1
      ORDER BY un.nome
    `;

    return await this.ds.query(query, [hospitalId]);
  }
}
