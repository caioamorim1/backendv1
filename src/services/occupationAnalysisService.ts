import { DataSource } from "typeorm";
import {
  SectorOccupationDTO,
  OccupationSummaryDTO,
  OccupationAnalysisResponse,
} from "../dto/occupationAnalysis.dto";
import { calcularProjecao } from "../calculoTaxaOcupacao/calculation";
import { ProjecaoParams } from "../calculoTaxaOcupacao/interfaces";

/**
 * Service para cálculo de análise de taxa de ocupação
 *
 * Regras de negócio:
 * - Taxa de Ocupação Atual = (leitos ocupados / total leitos) × 100
 * - Ocupação Máxima Atendível = calculada com base no quadro de profissionais (função calcularProjecao)
 * - Ociosidade = max(0, ocupacaoMaximaAtendivel - taxaOcupacao)
 * - Superlotação = max(0, taxaOcupacao - ocupacaoMaximaAtendivel)
 */
export class OccupationAnalysisService {
  constructor(private ds: DataSource) {}

  /**
   * Calcula análise de ocupação para um hospital
   */
  async calcularAnaliseOcupacao(
    hospitalId: string,
    dataReferencia?: Date
  ): Promise<OccupationAnalysisResponse> {
    const dataCalculo = dataReferencia || new Date();
    const dataInicioStr = new Date(
      dataCalculo.setHours(0, 0, 0, 0)
    ).toISOString();
    const dataFimStr = new Date(
      dataCalculo.setHours(23, 59, 59, 999)
    ).toISOString();

    console.log(
      `\n🏥 Calculando análise de ocupação - Hospital: ${hospitalId} - Data: ${
        dataInicioStr.split("T")[0]
      }`
    );

    // Buscar dados do hospital, unidades, leitos e quadro de profissionais
    const query = `
      SELECT 
        h.id as hospital_id,
        h.nome as hospital_name,
        u.id as sector_id,
        u.nome as sector_name,
        'internacao' as sector_type,
        COALESCE(ls.bed_count, 0) as total_leitos,
        COALESCE(ls.evaluated, 0) as leitos_avaliados,
        COALESCE(ls.vacant, 0) as leitos_vagos,
        COALESCE(ls.inactive, 0) as leitos_inativos,
        -- Quadro atual de profissionais
        COALESCE(SUM(CASE WHEN c.nome ILIKE '%enfermeiro%' THEN cu.quantidade_funcionarios ELSE 0 END), 0) as quadro_enfermeiros,
        COALESCE(SUM(CASE WHEN c.nome ILIKE '%técnico%' OR c.nome ILIKE '%tecnico%' THEN cu.quantidade_funcionarios ELSE 0 END), 0) as quadro_tecnicos,
        -- Parâmetros da unidade (para cálculo BASE)
        p.ocupacao_base,
        p.enf_base,
        p.tec_base,
        p.the_base
      FROM public.hospitais h
      INNER JOIN public.unidades_internacao u ON u."hospitalId" = h.id
      LEFT JOIN public.leitos_status ls ON ls.unidade_id = u.id
      LEFT JOIN public.cargos_unidade cu ON cu.unidade_id = u.id
      LEFT JOIN public.cargo c ON c.id = cu.cargo_id
      LEFT JOIN public.parametros_unidade p ON p."unidadeId" = u.id
      WHERE h.id = $1
      GROUP BY h.id, h.nome, u.id, u.nome, ls.bed_count, ls.evaluated, ls.vacant, ls.inactive, p.ocupacao_base, p.enf_base, p.tec_base, p.the_base
      ORDER BY u.nome
    `;

    const rows = await this.ds.query(query, [hospitalId]);

    if (rows.length === 0) {
      throw new Error(
        `Hospital ${hospitalId} não encontrado ou sem unidades de internação`
      );
    }

    const hospitalName = rows[0].hospital_name;

    // Buscar taxa de ocupação do dia (média das últimas 24h usando histórico)
    const ocupacaoDiaQuery = `
      WITH leitos_unidade AS (
        SELECT 
          l.id as leito_id,
          l."unidadeId" as unidade_id
        FROM public.leitos l
        WHERE l."unidadeId" IN (
          SELECT u.id 
          FROM public.unidades_internacao u 
          WHERE u."hospitalId" = $1
        )
      ),
      ocupacao_por_hora AS (
        SELECT 
          lu.unidade_id,
          DATE_TRUNC('hour', ho.inicio) as hora,
          COUNT(DISTINCT ho."leitoId") as leitos_ocupados
        FROM public.historicos_ocupacao ho
        INNER JOIN leitos_unidade lu ON lu.leito_id = ho."leitoId"
        WHERE ho.inicio >= $2::timestamp
          AND ho.inicio <= $3::timestamp
          AND ho.fim IS NULL OR ho.fim >= ho.inicio
        GROUP BY lu.unidade_id, DATE_TRUNC('hour', ho.inicio)
      )
      SELECT 
        unidade_id,
        AVG(leitos_ocupados) as media_ocupados
      FROM ocupacao_por_hora
      GROUP BY unidade_id
    `;

    const ocupacaoDiaRows = await this.ds.query(ocupacaoDiaQuery, [
      hospitalId,
      dataInicioStr,
      dataFimStr,
    ]);

    // Criar mapa de ocupação do dia por unidade
    const ocupacaoDiaMap = new Map<string, number>();
    ocupacaoDiaRows.forEach((row: any) => {
      ocupacaoDiaMap.set(row.unidade_id, parseFloat(row.media_ocupados) || 0);
    });

    // Calcular dados por setor
    const sectors: SectorOccupationDTO[] = rows.map((row: any) => {
      const totalLeitos = parseInt(row.total_leitos) || 0;
      const leitosAvaliados = parseInt(row.leitos_avaliados) || 0;
      const leitosVagos = parseInt(row.leitos_vagos) || 0;
      const leitosInativos = parseInt(row.leitos_inativos) || 0;
      const quadroEnfermeiros = parseInt(row.quadro_enfermeiros) || 0;
      const quadroTecnicos = parseInt(row.quadro_tecnicos) || 0;

      // Leitos ocupados = avaliados - vagos
      const leitosOcupados = Math.max(0, leitosAvaliados - leitosVagos);

      // Taxa de ocupação ATUAL = (ocupados / total) × 100
      const taxaOcupacao =
        totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

      // Taxa de ocupação do DIA (média do dia inteiro)
      const mediaOcupadosDia =
        ocupacaoDiaMap.get(row.sector_id) || leitosOcupados;
      const taxaOcupacaoDia =
        totalLeitos > 0 ? (mediaOcupadosDia / totalLeitos) * 100 : 0;

      // Calcular OCUPAÇÃO MÁXIMA ATENDÍVEL usando a função calcularProjecao
      let ocupacaoMaximaAtendivel = 100; // Default 100% se não conseguir calcular

      try {
        // Validar se temos os parâmetros BASE necessários
        const ocupacaoBase = parseFloat(row.ocupacao_base) || 0.6; // Default 60%
        const enfBase = parseFloat(row.enf_base) || 0;
        const tecBase = parseFloat(row.tec_base) || 0;
        const theBase = parseFloat(row.the_base) || 0;

        if (enfBase > 0 && tecBase > 0 && theBase > 0) {
          const parametros: ProjecaoParams = {
            quadroAtualEnfermeiros: quadroEnfermeiros,
            quadroAtualTecnicos: quadroTecnicos,
            leitos: totalLeitos,
            ocupacaoBase: ocupacaoBase,
            theBase: theBase,
            enfNecessariosBase: enfBase,
            tecNecessariosBase: tecBase,
            metaLivreOcupacao: 0.85, // Meta padrão de 85%
          };

          const resultado = calcularProjecao(parametros);
          // Converter de decimal (0-1) para porcentagem (0-100)
          ocupacaoMaximaAtendivel = resultado.ocupacaoMaximaAtendivel * 100;
        }
      } catch (error) {
        console.warn(
          `⚠️  Não foi possível calcular ocupação máxima para ${row.sector_name}:`,
          error instanceof Error ? error.message : error
        );
      }

      // Ociosidade = diferença entre ocupação máxima e taxa atual (se positiva)
      const ociosidade = Math.max(0, ocupacaoMaximaAtendivel - taxaOcupacao);

      // Superlotação = se taxa atual excede a ocupação máxima atendível
      const superlotacao = Math.max(0, taxaOcupacao - ocupacaoMaximaAtendivel);

      return {
        sectorId: row.sector_id,
        sectorName: row.sector_name,
        sectorType: row.sector_type,
        taxaOcupacao: parseFloat(taxaOcupacao.toFixed(2)),
        taxaOcupacaoDia: parseFloat(taxaOcupacaoDia.toFixed(2)),
        ocupacaoMaximaAtendivel: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
        ociosidade: parseFloat(ociosidade.toFixed(2)),
        superlotacao: parseFloat(superlotacao.toFixed(2)),
        capacidadeProdutiva: 100,
        totalLeitos,
        leitosOcupados,
        leitosVagos,
        leitosInativos,
        leitosAvaliados,
        quadroAtualEnfermeiros: quadroEnfermeiros,
        quadroAtualTecnicos: quadroTecnicos,
      };
    });

    // Calcular resumo global (agregado)
    const summary = this.calcularResumoGlobal(sectors);

    console.log(`✅ Análise calculada: ${sectors.length} setores`);
    console.log(`   Taxa global: ${summary.taxaOcupacao}%`);
    console.log(`   Ociosidade: ${summary.ociosidade}%`);
    console.log(`   Superlotação: ${summary.superlotacao}%\n`);

    return {
      hospitalId,
      hospitalName,
      sectors,
      summary,
    };
  }

  /**
   * Calcula resumo global agregando todos os setores
   */
  private calcularResumoGlobal(
    sectors: SectorOccupationDTO[]
  ): OccupationSummaryDTO {
    // Somar todos os leitos
    const totalLeitos = sectors.reduce((sum, s) => sum + s.totalLeitos, 0);
    const leitosOcupados = sectors.reduce(
      (sum, s) => sum + s.leitosOcupados,
      0
    );
    const leitosVagos = sectors.reduce((sum, s) => sum + s.leitosVagos, 0);
    const leitosInativos = sectors.reduce(
      (sum, s) => sum + s.leitosInativos,
      0
    );
    const leitosAvaliados = sectors.reduce(
      (sum, s) => sum + s.leitosAvaliados,
      0
    );

    // Taxa global (média ponderada)
    const taxaOcupacao =
      totalLeitos > 0 ? (leitosOcupados / totalLeitos) * 100 : 0;

    // Taxa de ocupação do dia (média ponderada)
    let taxaOcupacaoDia = 0;
    if (totalLeitos > 0) {
      taxaOcupacaoDia = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.taxaOcupacaoDia * peso;
      }, 0);
    }

    // Ocupação máxima atendível ponderada pela capacidade de cada setor
    let ocupacaoMaximaAtendivel = 0;
    if (totalLeitos > 0) {
      ocupacaoMaximaAtendivel = sectors.reduce((sum, s) => {
        const peso = s.totalLeitos / totalLeitos;
        return sum + s.ocupacaoMaximaAtendivel * peso;
      }, 0);
    }

    // Ociosidade e superlotação baseadas na ocupação máxima atendível
    const ociosidade = Math.max(0, ocupacaoMaximaAtendivel - taxaOcupacao);
    const superlotacao = Math.max(0, taxaOcupacao - ocupacaoMaximaAtendivel);

    return {
      sectorName: "Global",
      taxaOcupacao: parseFloat(taxaOcupacao.toFixed(2)),
      taxaOcupacaoDia: parseFloat(taxaOcupacaoDia.toFixed(2)),
      ocupacaoMaximaAtendivel: parseFloat(ocupacaoMaximaAtendivel.toFixed(2)),
      ociosidade: parseFloat(ociosidade.toFixed(2)),
      superlotacao: parseFloat(superlotacao.toFixed(2)),
      capacidadeProdutiva: 100,
      totalLeitos,
      leitosOcupados,
      leitosVagos,
      leitosInativos,
      leitosAvaliados,
    };
  }
}
