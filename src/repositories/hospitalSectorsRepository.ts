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
    // Query principal para dados básicos das unidades e staff
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
      WHERE uni."hospitalId" = $1
      GROUP BY uni.id, uni.nome, uni.descricao
      ORDER BY uni.nome
    `;

    const rawResults = await this.ds.query(query, [hospitalId]);

    // Para cada unidade, calcular dados em tempo real
    const results = await Promise.all(
      rawResults.map(async (unit: any) => {
        const unidadeId = unit.id;

        // 1. Contar total de leitos da unidade
        const leitosResult = await this.ds.query(
          `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'INATIVO') as inactive
          FROM public.leitos WHERE "unidadeId" = $1`,
          [unidadeId]
        );
        const bedCount = parseInt(leitosResult[0]?.total || 0);
        const inactive = parseInt(leitosResult[0]?.inactive || 0);

        // 2. Contar leitos com avaliação ATIVA do dia (ocupados/avaliados)
        const avaliacoesAtivasResult = await this.ds.query(
          `SELECT 
            COUNT(DISTINCT a."leitoId") as evaluated,
            COUNT(*) FILTER (WHERE a.classificacao = 'MINIMOS') as minimum_care,
            COUNT(*) FILTER (WHERE a.classificacao = 'INTERMEDIARIOS') as intermediate_care,
            COUNT(*) FILTER (WHERE a.classificacao = 'ALTA_DEPENDENCIA') as high_dependency,
            COUNT(*) FILTER (WHERE a.classificacao = 'SEMI_INTENSIVOS') as semi_intensive,
            COUNT(*) FILTER (WHERE a.classificacao = 'INTENSIVOS') as intensive
          FROM public.avaliacoes_scp a
          WHERE a."unidadeId" = $1
            AND a."dataAplicacao" = CURRENT_DATE
            AND a."statusSessao" = 'ATIVA'`,
          [unidadeId]
        );

        const evaluated = parseInt(avaliacoesAtivasResult[0]?.evaluated || 0);
        const minimumCare = parseInt(
          avaliacoesAtivasResult[0]?.minimum_care || 0
        );
        const intermediateCare = parseInt(
          avaliacoesAtivasResult[0]?.intermediate_care || 0
        );
        const highDependency = parseInt(
          avaliacoesAtivasResult[0]?.high_dependency || 0
        );
        const semiIntensive = parseInt(
          avaliacoesAtivasResult[0]?.semi_intensive || 0
        );
        const intensive = parseInt(avaliacoesAtivasResult[0]?.intensive || 0);

        // 3. Buscar distribuição de classificação do dia via leito_eventos
        // Para cada CICLO DE OCUPAÇÃO (historico_ocupacao_id), pega apenas a última classificação
        // Isso evita duplicar quando edita, mas conta alta + nova entrada separadamente
        const eventosResult = await this.ds.query(
          `WITH ultima_classificacao_por_ciclo AS (
            SELECT DISTINCT ON (COALESCE(historico_ocupacao_id, avaliacao_id, id))
              COALESCE(historico_ocupacao_id, avaliacao_id, id) as ciclo_id,
              payload->>'classificacao' as classificacao
            FROM public.leito_eventos
            WHERE unidade_id = $1
              AND tipo IN ('AVALIACAO_CRIADA', 'AVALIACAO_ATUALIZADA')
              AND DATE(data_hora AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
              AND payload->>'classificacao' IS NOT NULL
            ORDER BY COALESCE(historico_ocupacao_id, avaliacao_id, id), data_hora DESC
          )
          SELECT classificacao, COUNT(*) as quantidade
          FROM ultima_classificacao_por_ciclo
          GROUP BY classificacao`,
          [unidadeId]
        );

        // Se houver eventos do dia, usar esses dados (captura rotatividade)
        let careLevelFromEvents = {
          minimumCare: 0,
          intermediateCare: 0,
          highDependency: 0,
          semiIntensive: 0,
          intensive: 0,
        };

        if (eventosResult.length > 0) {
          eventosResult.forEach((ev: any) => {
            const qtd = parseInt(ev.quantidade || 0);
            switch (ev.classificacao) {
              case "MINIMOS":
                careLevelFromEvents.minimumCare = qtd;
                break;
              case "INTERMEDIARIOS":
                careLevelFromEvents.intermediateCare = qtd;
                break;
              case "ALTA_DEPENDENCIA":
                careLevelFromEvents.highDependency = qtd;
                break;
              case "SEMI_INTENSIVOS":
                careLevelFromEvents.semiIntensive = qtd;
                break;
              case "INTENSIVOS":
                careLevelFromEvents.intensive = qtd;
                break;
            }
          });
        }

        // Usar eventos se houver, senão usar avaliações ativas
        const useCareLevel =
          eventosResult.length > 0
            ? careLevelFromEvents
            : {
                minimumCare,
                intermediateCare,
                highDependency,
                semiIntensive,
                intensive,
              };

        // 4. Calcular vagos e pendentes
        const vacant = bedCount - evaluated - inactive;
        const pending = 0; // Todos os leitos estão classificados (avaliado, vago ou inativo)

        return {
          ...unit,
          bedCount,
          careLevel: useCareLevel,
          bedStatus: {
            evaluated,
            vacant: vacant > 0 ? vacant : 0,
            inactive,
            pending,
          },
        };
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
