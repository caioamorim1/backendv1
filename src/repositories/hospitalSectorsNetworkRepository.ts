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
    console.log(`🌐 [NETWORK] Buscando setores agregados para rede: ${redeId}`);
    const internation = await this.getAggregatedInternationByRede(redeId);
    const assistance = await this.getAggregatedAssistanceByRede(redeId);

    console.log(
      `✅ [NETWORK] Rede ${redeId}: ${internation.length} internação, ${assistance.length} assistência`
    );

    return {
      id: `hospital-sectors-rede-${redeId}`,
      internation,
      assistance,
      neutral: [],
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
      neutral: [],
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
      neutral: [],
    };
  }

  private async getAggregatedInternationByRede(
    redeId: string
  ): Promise<InternationSectorDTO[]> {
    console.log(
      `📊 [INTERNACAO REDE] Buscando unidades de internação para rede ${redeId}...`
    );

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
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      WHERE h."redeId" = $1
      GROUP BY uni.id, uni.nome, uni.descricao
      ORDER BY uni.nome
    `;

    const rawResults = await this.ds.query(query, [redeId]);

    // Para cada unidade, calcular dados em tempo real (mesma lógica de hospitalSectorsRepository)
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
        const pending = 0;

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

    console.log(
      `📋 [INTERNACAO REDE] Encontradas ${results.length} unidades de internação`
    );
    if (results.length > 0) {
      console.log(`   Primeira unidade:`, {
        name: results[0].name,
        bedCount: results[0].bedCount,
        careLevel: results[0].careLevel,
        bedStatus: results[0].bedStatus,
      });
    }

    return results;
  }

  private async getAggregatedInternationByGrupo(
    grupoId: string
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
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      WHERE h."grupoId" = $1
      GROUP BY uni.id, uni.nome, uni.descricao
      ORDER BY uni.nome
    `;

    const rawResults = await this.ds.query(query, [grupoId]);

    // Para cada unidade, calcular dados em tempo real
    const results = await Promise.all(
      rawResults.map(async (unit: any) => this.computeRealTimeBedData(unit))
    );

    return results;
  }

  private async getAggregatedInternationByRegiao(
    regiaoId: string
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
      INNER JOIN public.hospitais h ON h.id = uni."hospitalId"
      LEFT JOIN public.cargos_unidade cuni ON cuni.unidade_id = uni.id
      LEFT JOIN public.cargo c ON c.id = cuni.cargo_id
      WHERE h."regiaoId" = $1
      GROUP BY uni.id, uni.nome, uni.descricao
      ORDER BY uni.nome
    `;

    const rawResults = await this.ds.query(query, [regiaoId]);

    // Para cada unidade, calcular dados em tempo real
    const results = await Promise.all(
      rawResults.map(async (unit: any) => this.computeRealTimeBedData(unit))
    );

    return results;
  }

  /**
   * Método auxiliar para computar dados de leitos em tempo real
   * Usa as mesmas fontes confiáveis que hospitalSectorsRepository:
   * - leitos (para bedCount e inativos)
   * - avaliacoes_scp (para avaliações ativas do dia)
   * - leito_eventos (para distribuição de classificação com rotatividade)
   */
  private async computeRealTimeBedData(unit: any) {
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
    const minimumCare = parseInt(avaliacoesAtivasResult[0]?.minimum_care || 0);
    const intermediateCare = parseInt(avaliacoesAtivasResult[0]?.intermediate_care || 0);
    const highDependency = parseInt(avaliacoesAtivasResult[0]?.high_dependency || 0);
    const semiIntensive = parseInt(avaliacoesAtivasResult[0]?.semi_intensive || 0);
    const intensive = parseInt(avaliacoesAtivasResult[0]?.intensive || 0);

    // 3. Buscar distribuição de classificação do dia via leito_eventos
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

    // 4. Calcular vagos
    const vacant = bedCount - evaluated - inactive;

    return {
      ...unit,
      bedCount,
      careLevel: useCareLevel,
      bedStatus: {
        evaluated,
        vacant: vacant > 0 ? vacant : 0,
        inactive,
        pending: 0,
      },
    };
  }

  private async getAggregatedAssistanceByRede(
    redeId: string
  ): Promise<AssistanceSectorDTO[]> {
    console.log(
      `🏥 [ASSISTENCIA REDE] Buscando unidades de assistência para rede ${redeId}...`
    );

    // Buscar todos os hospitais da rede
    const hospitalsQuery = `
      SELECT id FROM public.hospitais WHERE "redeId" = $1
    `;
    const hospitals = await this.ds.query(hospitalsQuery, [redeId]);

    console.log(
      `🏢 [ASSISTENCIA REDE] Encontrados ${hospitals.length} hospitais na rede`
    );

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

    const result = Array.from(aggregatedMap.values());
    console.log(
      `✅ [ASSISTENCIA REDE] ${result.length} unidades após agregação`
    );
    if (result.length > 0) {
      console.log(`   Primeira unidade:`, {
        name: result[0].name,
        costAmount: result[0].costAmount,
        staffCount: result[0].staff?.length || 0,
      });
    }

    return result;
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
