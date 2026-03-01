import { Request, Response } from "express";
import { AvaliacaoRepository } from "../repositories/avaliacaoRepository";
import scpSchemas from "../utils/scpSchemas";
import { ScpMetodoRepository } from "../repositories/scpMetodoRepository";

export class AvaliacaoController {
  constructor(
    private repo: AvaliacaoRepository,
    private scpRepo: ScpMetodoRepository
  ) {}

  // Criar avaliação direta não é mais suportado (usar /sessao)
  criar = async (_req: Request, res: Response) => {
    return res.status(410).json({
      error: "Endpoint legado removido",
      uso: "Use POST /avaliacoes/sessao com { leitoId, unidadeId, scp, itens, colaboradorId, prontuario? }",
    });
  };

  // NOVO FLUXO: cria sessão por leito (24h default)
  criarSessao = async (req: Request, res: Response) => {
    try {
      const av = await this.repo.criarSessaoPorLeito(req.body);
      return res.status(201).json(av);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: "Erro ao criar sessão", details });
    }
  };

  liberarSessao = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const av = await this.repo.liberarSessao(id);
      return res.json(av);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: "Erro ao liberar sessão", details });
    }
  };

  // Atualiza sessão/avaliação existente
  atualizarSessao = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const params = req.body as {
        itens?: Record<string, number>;
        colaboradorId?: string;
        prontuario?: string | null;
        justificativa?: string | null;
        scp?: string;
      };

      if (!id)
        return res.status(400).json({ error: "ID da avaliação é obrigatório" });

      const updated = await this.repo.atualizarSessao(id, params);
      return res.json(updated);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res
        .status(400)
        .json({ error: "Erro ao atualizar sessão", details });
    }
  };

  listarSessoesAtivas = async (req: Request, res: Response) => {
    const { unidadeId } = req.query as { unidadeId: string };
    const lista = await this.repo.listarSessoesAtivasPorUnidade(unidadeId);
    return res.json(lista);
  };

  leitosDisponiveis = async (req: Request, res: Response) => {
    const { unidadeId } = req.query as { unidadeId: string };
    const lista = await this.repo.listarLeitosDisponiveisPorUnidade(unidadeId);
    return res.json(lista);
  };

  // Buscar último prontuário de um leito
  buscarUltimoProntuarioPorLeito = async (req: Request, res: Response) => {
    try {
      const leitoId = req.params.leitoId as string;

      console.log("\n🔍 ===== [CONTROLLER] BUSCAR ÚLTIMO PRONTUÁRIO =====");
      console.log("📋 Leito ID:", leitoId);

      if (!leitoId) {
        console.log("❌ Erro: leitoId não fornecido");
        return res.status(400).json({ error: "leitoId é obrigatório" });
      }

      console.log("🔄 Chamando repository...");
      const resultado = await this.repo.buscarUltimoProntuarioPorLeito(leitoId);

      console.log("✅ Resultado encontrado:");
      console.log("   - Prontuário:", resultado.prontuario);
      console.log("   - Data Aplicação:", resultado.dataAplicacao);
      console.log("   - Avaliação ID:", resultado.avaliacaoId);
      console.log("================================================\n");

      return res.json(resultado);
    } catch (err) {
      console.log("\n❌ [CONTROLLER] ERRO ao buscar último prontuário:");
      console.error(err);
      console.log("================================================\n");

      const details = err instanceof Error ? err.message : String(err);
      return res
        .status(500)
        .json({ error: "Erro ao buscar último prontuário", details });
    }
  };

  // Taxa de ocupação do dia baseada nas avaliações ativas
  taxaOcupacaoDia = async (req: Request, res: Response) => {
    try {
      const { unidadeId, hospitalId } = req.query as {
        unidadeId?: string;
        hospitalId?: string;
      };
      const taxa = await this.repo.calcularTaxaOcupacaoDia({
        unidadeId,
        hospitalId,
      });
      return res.json(taxa);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      return res
        .status(500)
        .json({ error: "Erro ao calcular taxa de ocupação", details });
    }
  };

  // Lista todas as avaliações
  listarTodas = async (_req: Request, res: Response) => {
    const lista = await this.repo.listarTodas();
    return res.json(lista);
  };

  // Lista avaliações por dia e unidade
  listarPorDia = async (req: Request, res: Response) => {
    const { data, unidadeId } = req.query as {
      data: string;
      unidadeId: string;
    };
    const lista = await this.repo.listarPorDia({ data, unidadeId });
    return res.json(lista);
  };

  // Resumo diário de avaliações
  resumoDiario = async (req: Request, res: Response) => {
    const { data, unidadeId } = req.query as {
      data: string;
      unidadeId: string;
    };
    const resumo = await this.repo.resumoDiario({ data, unidadeId });
    return res.json(resumo);
  };

  // Consolidado mensal de avaliações
  consolidadoMensal = async (req: Request, res: Response) => {
    const { unidadeId, ano, mes } = req.query as {
      unidadeId: string;
      ano: string;
      mes: string;
    };

    const consolidado = await this.repo.consolidadoMensal(
      unidadeId,
      Number(ano),
      Number(mes)
    );
    return res.json(consolidado);
  };

  // Busca avaliações por unidade
  listarPorUnidade = async (req: Request, res: Response) => {
    try {
      const unidadeId = req.params.unidadeId as string;

      if (!unidadeId) {
        return res.status(400).json({ error: "ID da unidade é obrigatório" });
      }

      const avaliacoes = await this.repo.listarPorUnidade(unidadeId);
      return res.json(avaliacoes);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Erro ao buscar avaliações por unidade", details: err });
    }
  };

  buscarPorAutor = async (req: Request, res: Response) => {
    try {
      const autorId = req.params.autorId as string;

      if (!autorId) {
        return res.status(400).json({ erro: "O ID do autor é obrigatório" });
      }

      const avaliacoes = await this.repo.buscarPorAutor(autorId);

      if (!avaliacoes || avaliacoes.length === 0) {
        return res
          .status(404)
          .json({ erro: "Nenhuma avaliação encontrada para este autor" });
      }

      return res.json(avaliacoes);
    } catch (error) {
      return res.status(500).json({ erro: "Erro interno no servidor" });
    }
  };

  // Retorna o schema de SCP (dinâmico do banco ou fallback estático)
  schema = async (req: Request, res: Response) => {
    const { scp } = req.query as {
      scp?: string;
    };

    if (scp) {
      const key = scp.toUpperCase();

      // Primeiro tenta encontrar um método dinâmico no banco (ScpMetodo)
      try {
        const metodoDb = await this.scpRepo.getByKey(key);
        if (metodoDb) {
          return res.json({
            scp: metodoDb.key,
            title: metodoDb.title,
            description: metodoDb.description,
            questions: metodoDb.questions,
            faixas: metodoDb.faixas,
          });
        }
      } catch (err) {
        // se houver erro no DB, continuar para fallback estático
        console.warn("Erro ao buscar ScpMetodo no DB:", err);
      }

      // 🔹 Se não achar, busca no fallback estático
      const s = (scpSchemas as any)[key];
      if (!s) return res.status(404).json({ error: "SCP não encontrado" });
      return res.json(s);
    }

    // fallback: retorna todos os schemas estáticos
    return res.json(scpSchemas);
  };
}
