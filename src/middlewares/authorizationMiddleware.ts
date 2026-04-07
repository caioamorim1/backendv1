import { NextFunction, Request, Response } from "express";
import { DataSource } from "typeorm";
import { Hospital } from "../entities/Hospital";

type CanonicalRole = "ADM" | "AV" | "GTT" | "GTC" | "GTA" | "GEH" | "GER";
type ScopeType = "none" | "hospital" | "rede";

type Rule = {
  methods: string[];
  pattern: RegExp;
  roles: CanonicalRole[];
  scope?: ScopeType;
};

type JwtUser = {
  id?: string;
  tipo?: string;
  hospital?: { id?: string; nome?: string };
  redeId?: string;
};

const ALL_AUTH_ROLES: CanonicalRole[] = ["ADM", "AV", "GTT", "GTC", "GTA", "GEH", "GER"];

// Rotas completamente públicas: mesma lista que o bypass em app.ts.
// Para essas rotas, req.user é undefined e a autorização é ignorada.
const BYPASS_PATTERNS: RegExp[] = [
  /^\/?$/,                                    // GET / (health check)
  /^\/login(?:\/.*)?$/,                       // POST /login
  /^\/scp-metodos\/seed\/builtin\/?$/,        // seed de setup
  /^\/uploads(?:\/.*)?$/,                     // arquivos estáticos
  /^\/password-reset(?:\/.*)?$/,             // reset de senha
  /^\/debug(?:\/.*)?$/,                       // debug (já bypass em app.ts)
];

function shouldBypass(req: Request): boolean {
  return (
    BYPASS_PATTERNS.some((p) => p.test(req.path)) ||
    (req.method === "PATCH" && req.path.endsWith("/senha")) ||
    req.method === "OPTIONS"
  );
}

function normalizeRole(tipo: string | undefined): CanonicalRole | null {
  switch (tipo) {
    case "ADMIN":
      return "ADM";
    case "AVALIADOR":
      return "AV";
    case "GESTOR_TATICO_TEC_ADM":
      return "GTT";
    case "GESTOR_TATICO_TECNICO":
      return "GTC";
    case "GESTOR_TATICO_ADM":
      return "GTA";
    case "GESTOR_ESTRATEGICO_HOSPITAL":
      return "GEH";
    case "GESTOR_ESTRATEGICO_REDE":
      return "GER";
    default:
      return null;
  }
}

const RULES: Rule[] = [
  // ============================================================
  // INFRAESTRUTURA — apenas ADM
  // ============================================================
  { methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], pattern: /^\/cache(?:\/.*)?$/, roles: ["ADM"], scope: "none" },
  { methods: ["GET", "POST"], pattern: /^\/jobs(?:\/.*)?$/, roles: ["ADM"], scope: "none" },
  { methods: ["PUT"], pattern: /^\/leitos-status(?:\/.*)?$/, roles: ["ADM"], scope: "none" },
  { methods: ["DELETE"], pattern: /^\/password-reset\/cleanup\/?$/, roles: ["ADM"], scope: "none" },
  { methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], pattern: /^\/colaboradores\/admin(?:\/.*)?$/, roles: ["ADM"], scope: "none" },
  { methods: ["DELETE"], pattern: /^\/colaboradores\/[^/]+\/?$/, roles: ["ADM"], scope: "none" },
  { methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], pattern: /^\/hospitais\/?$/, roles: ["ADM"], scope: "none" },
  { methods: ["PUT", "DELETE"], pattern: /^\/hospitais\/[^/]+\/?$/, roles: ["ADM"], scope: "none" },
  { methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], pattern: /^\/(grupos|regioes|questionarios|cargos)(?:\/.*)?$/, roles: ["ADM"], scope: "none" },
  { methods: ["POST", "PUT", "PATCH", "DELETE"], pattern: /^\/redes(?:\/.*)?$/, roles: ["ADM"], scope: "none" },
  // Redes — leitura para GER (só a sua própria rede)
  { methods: ["GET"], pattern: /^\/redes\/?$/, roles: ["ADM", "GER"], scope: "none" },
  { methods: ["GET"], pattern: /^\/redes\/[^/]+(?:\/.*)?$/, roles: ["ADM", "GER"], scope: "rede" },
  { methods: ["POST", "PUT", "PATCH", "DELETE"], pattern: /^\/scp-metodos(?:\/.*)?$/, roles: ["ADM"], scope: "none" },

  // ============================================================
  // ROTAS LIBERADAS PARA AVALIADOR
  // ============================================================

  // Hospital — apenas nome e foto (filtrado no controller)
  { methods: ["GET"], pattern: /^\/hospitais\/[^/]+\/?$/, roles: ["ADM", "AV", "GTT", "GTC","GTA","GEH","GER"], scope: "hospital" },  
  { methods: ["GET"], pattern: /^\/hospitais\/[^/]+\/ultima-atualizacao-cargo\/?$/, roles: ["ADM", "GTT","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["GET"], pattern: /^\/hospitais\/[^/]+\/cargos(?:\/.*)?$/, roles: ["ADM", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },

  // Termômetro
  { methods: ["GET"], pattern: /^\/termometro\/[^/]+\/(?:global|detalhamento|serie-historica)\/?$/, roles: ["ADM", "GTT","GTC","GEH","GER"], scope: "hospital" },

  // Dimensionamento
  { methods: ["GET"], pattern: /^\/dimensionamento\/(?:internacao|nao-internacao)\/[^/]+(?:\/.*)?$/, roles: ["ADM", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/dimensionamento\/(?:internacao|nao-internacao)\/[^/]+\/projetado-final\/?$/, roles: ["ADM", "GTT","GTC","GTA"], scope: "hospital" },

  // Parâmetros de unidade
  { methods: ["GET"], pattern: /^\/parametros\/(?:unidade|nao-internacao)\/[^/]+\/?$/, roles: ["ADM", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST", "PUT"], pattern: /^\/parametros\/(?:unidade|nao-internacao)\/[^/]+\/?$/, roles: ["ADM", "GTT","GTC","GTA"], scope: "hospital" },

  // Taxa de ocupação
  { methods: ["GET"], pattern: /^\/taxa-ocupacao\/[^/]+\/?$/, roles: ["ADM", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/taxa-ocupacao\/?$/, roles: ["ADM", "GTT","GTC","GTA"], scope: "hospital" },

  // Qualitative
  { methods: ["GET"], pattern: /^\/qualitative(?:\/.*)?$/, roles: ["ADM", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST", "PUT", "DELETE"], pattern: /^\/qualitative\/evaluations(?:\/.*)?$/, roles: ["ADM", "GTT","GTC","GTA"], scope: "hospital" },

  // Controle de período
  { methods: ["GET"], pattern: /^\/controle-periodo(?:\/.*)?$/, roles: ["ADM", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/controle-periodo\/?$/, roles: ["ADM", "GTT","GTC","GTA"], scope: "hospital" },

  // Baselines
  { methods: ["GET"], pattern: /^\/baselines(?:\/.*)?$/, roles: ["ADM", "GTT","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST", "PUT", "DELETE"], pattern: /^\/baselines(?:\/.*)?$/, roles: ["ADM", "GTT","GTA"], scope: "hospital" },
  { methods: ["PATCH"], pattern: /^\/baselines\/[^/]+\/setores\/[^/]+\/status\/?$/, roles: ["ADM", "GTT","GTA"], scope: "hospital" },
 
  // Colaboradores — AV recebe apenas os próprios dados (filtrado no controller)
  { methods: ["GET"], pattern: /^\/colaboradores(?:\/?|\?.*)$/, roles: ["ADM", "AV", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },

  // SCP Metodos
  { methods: ["GET"], pattern: /^\/scp-metodos(?:\/.*)?$/, roles: ["ADM", "AV", "GTT","GTC","GTA","GEH","GER"], scope: "none" },

  // Leitos
  { methods: ["GET"], pattern: /^\/leitos(?:\/.*)?$/, roles: ["ADM", "AV", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/leitos\/[^/]+\/alta\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/leitos\/?$/, roles: ["ADM", "GTT", "GTC", "GTA"], scope: "hospital" },
  { methods: ["PATCH"], pattern: /^\/leitos\/[^/]+(?:\/status)?\/?$/, roles: ["ADM", "AV", "GTT", "GTC", "GTA"], scope: "hospital" },
  { methods: ["DELETE"], pattern: /^\/leitos\/[^/]+\/?$/, roles: ["ADM", "GTT", "GTC", "GTA"], scope: "hospital" },

  // Avaliações SCP
  { methods: ["GET"], pattern: /^\/avaliacoes\/sessoes-ativas\/?$/, roles: ["ADM", "AV", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["GET"], pattern: /^\/avaliacoes\/leito\/[^/]+\/ultimo-prontuario\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "none" },
  { methods: ["GET"], pattern: /^\/avaliacoes\/schema\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "none" },
  { methods: ["POST"], pattern: /^\/avaliacoes\/sessao\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/avaliacoes\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "hospital" },
  { methods: ["PUT", "PATCH"], pattern: /^\/avaliacoes\/sessao\/[^/]+\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "hospital" },

  // Unidades (inclui sub-rotas como /comentarios)
  { methods: ["GET"], pattern: /^\/unidades(?:\/.*)?$/, roles: ["ADM", "AV", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },
  { methods: ["PUT"], pattern: /^\/unidades\/[^/]+\/?$/, roles: ["ADM", "GTT","GTC","GTA"], scope: "hospital" },

  // Unidades não internação
  { methods: ["GET"], pattern: /^\/unidades-nao-internacao(?:\/.*)?$/, roles: ["ADM", "GTT", "GTC", "GTA","GEH","GER"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/unidades-nao-internacao\/[^/]+\/sitios\/?$/, roles: ["ADM", "GTT", "GTC", "GTA"], scope: "hospital" },

  // Unidades neutras
  { methods: ["GET"], pattern: /^\/unidades-neutras(?:\/.*)?$/, roles: ["ADM", "GTT","GTC","GTA","GEH","GER"], scope: "hospital" },

  // Sítios funcionais
  { methods: ["GET"], pattern: /^\/sitios(?:\/.*)?$/, roles: ["ADM", "GTT", "GTC", "GTA","GEH","GER"], scope: "hospital" },
  { methods: ["PUT", "DELETE"], pattern: /^\/sitios(?:\/.*)?$/, roles: ["ADM", "GTT", "GTC", "GTA"], scope: "hospital" },
  { methods: ["POST"], pattern: /^\/unidades\/[^/]+\/comentarios\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "hospital" },
  { methods: ["DELETE"], pattern: /^\/unidades\/[^/]+\/comentarios\/[^/]+\/?$/, roles: ["ADM", "AV", "GTT","GTC"], scope: "hospital" },

  // ============================================================
  // EXPORT
  // ============================================================
  { methods: ["GET"], pattern: /^\/export\/grau-complexidade\/[^/]+\/pdf\/?$/, roles: ["ADM", "AV", "GTT","GTC","GTA","GEH"], scope: "hospital" },
  { methods: ["GET"], pattern: /^\/export\/diario-avaliacoes\/[^/]+\/pdf\/?$/, roles: ["ADM", "AV", "GTT","GTC","GTA","GEH"], scope: "hospital" },
  { methods: ["GET"], pattern: /^\/export\/snapshot\/[^/]+\/variacao\/pdf\/?$/, roles: ["ADM", "GTT","GTC","GTA","GEH"], scope: "hospital" },
  { methods: ["GET"], pattern: /^\/export\/dimensionamento\/[^/]+\/pdf\/?$/, roles: ["ADM", "GTT","GTC","GTA","GEH"], scope: "hospital" },

  // ============================================================
  // SNAPSHOT
  // ============================================================
  { methods: ["GET"], pattern: /^\/snapshot\/dashboard\/?$/, roles: ["ADM", "GER"], scope: "none" },
  { methods: ["GET"], pattern: /^\/snapshot\/hospital\/[^/]+(?:\/.*)?$/, roles: ["ADM", "AV", "GTT", "GTC", "GTA", "GEH","GER"], scope: "hospital" },

  // Hospital Sectors Network
  { methods: ["GET"], pattern: /^\/hospital-sectors-network\/rede\/[^/]+\/?$/, roles: ["ADM", "GER"], scope: "rede" },

  // Hospital Sectors Aggregate
  { methods: ["GET"], pattern: /^\/hospital-sectors-aggregate\/rede\/[^/]+(?:\/.*)?$/, roles: ["ADM", "GER"], scope: "rede" },

  // Hospital Sectors (por rede)
  { methods: ["GET"], pattern: /^\/hospital-sectors\/rede\/[^/]+(?:\/.*)?$/, roles: ["ADM", "GER"], scope: "rede" },
];

function firstPathMatch(path: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = path.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

function extractCandidateIds(req: Request) {
  const path = req.path;
  const q = req.query as Record<string, unknown>;
  const b = (req.body ?? {}) as Record<string, unknown>;

  const hospitalId =
    (typeof q.hospitalId === "string" ? q.hospitalId : null) ??
    (typeof b.hospitalId === "string" ? b.hospitalId : null) ??
    firstPathMatch(path, [
      /^\/hospitais\/([^/]+)(?:\/|$)/,
      /^\/hospital-sectors\/([^/]+)(?:\/|$)/,
      /^\/snapshot\/hospital\/([^/]+)(?:\/|$)/,
      /^\/hospitais\/([^/]+)\/cargos(?:\/|$)/,
      /^\/coletas\/hospital\/([^/]+)(?:\/|$)/,
      /^\/cache\/hospital\/([^/]+)(?:\/|$)/,
      /^\/estatisticas\/hospital\/([^/]+)(?:\/|$)/,
      /^\/termometro\/([^/]+)(?:\/|$)/,
      /^\/export\/snapshot\/([^/]+)\/variacao\/pdf(?:\/|$)/,
      /^\/baselines\/hospital\/([^/]+)(?:\/|$)/,
      /^\/hospital-sectors-aggregate\/hospitals\/([^/]+)(?:\/|$)/,
      /^\/hospitals\/([^/]+)\/snapshots(?:\/|$)/,
      /^\/unidades-nao-internacao\/hospital\/([^/]+)(?:\/|$)/,
      /^\/unidades-neutras\/hospital\/([^/]+)(?:\/|$)/,
    ]);

  const redeId =
    (typeof q.redeId === "string" ? q.redeId : null) ??
    (typeof b.redeId === "string" ? b.redeId : null) ??
    firstPathMatch(path, [
      /^\/redes\/([^/]+)(?:\/|$)/,
      /^\/hospital-sectors\/rede\/([^/]+)(?:\/|$)/,
      /^\/hospital-sectors-aggregate\/rede\/([^/]+)(?:\/|$)/,
      /^\/hospital-sectors-network\/rede\/([^/]+)(?:\/|$)/,
      /^\/occupation-analysis-network\/rede\/([^/]+)(?:\/|$)/,
    ]);

  const unidadeId =
    (typeof q.unidadeId === "string" ? q.unidadeId : null) ??
    (typeof b.unidadeId === "string" ? b.unidadeId : null) ??
    firstPathMatch(path, [
      /^\/unidades\/([^/]+)(?:\/|$)/,
      /^\/unidades-nao-internacao\/(?!hospital(?:\/|$))([^/]+)(?:\/|$)/,
      /^\/sitios\/unidades-nao-internacao\/([^/]+)(?:\/|$)/,
      /^\/controle-periodo\/([^/]+)(?:\/|$)/,
      /^\/dimensionamento\/(?:internacao|nao-internacao)\/([^/]+)(?:\/|$)/,
      /^\/taxa-ocupacao\/([^/]+)(?:\/|$)/,
      /^\/estatisticas\/unidade\/([^/]+)(?:\/|$)/,
      /^\/snapshot\/unidade-(?:internacao|nao-internacao)\/([^/]+)(?:\/|$)/,
      /^\/export\/dimensionamento\/([^/]+)\/pdf(?:\/|$)/,
      /^\/export\/diario-avaliacoes\/([^/]+)\/pdf(?:\/|$)/,
      /^\/export\/grau-complexidade\/([^/]+)\/pdf(?:\/|$)/,
      /^\/parametros\/(?:unidade|nao-internacao)\/([^/]+)(?:\/|$)/,
    ]);

  return { hospitalId, redeId, unidadeId };
}

async function resolveHospitalIdFromUnidade(ds: DataSource, unidadeId: string): Promise<string | null> {
  const hitInternacao = await ds.query(
    'SELECT "hospitalId" as id FROM unidades_internacao WHERE id = $1 LIMIT 1',
    [unidadeId]
  );
  if (hitInternacao?.[0]?.id) return String(hitInternacao[0].id);

  const hitNaoInternacao = await ds.query(
    'SELECT "hospitalId" as id FROM unidades_nao_internacao WHERE id = $1 LIMIT 1',
    [unidadeId]
  );
  if (hitNaoInternacao?.[0]?.id) return String(hitNaoInternacao[0].id);

  const hitNeutra = await ds.query(
    'SELECT "hospitalId" as id FROM unidades_neutras WHERE id = $1 LIMIT 1',
    [unidadeId]
  );
  if (hitNeutra?.[0]?.id) return String(hitNeutra[0].id);

  return null;
}

async function hospitalBelongsToRede(ds: DataSource, hospitalId: string, redeId: string): Promise<boolean> {
  const hospital = await ds.getRepository(Hospital).findOne({
    where: { id: hospitalId },
    relations: ["rede", "regiao", "regiao.grupo", "regiao.grupo.rede"],
  });

  if (!hospital) return false;

  const ownRedeId =
    (hospital.rede as any)?.id ??
    (hospital.regiao as any)?.grupo?.rede?.id ??
    null;

  return ownRedeId != null && ownRedeId === redeId;
}

function inferRule(req: Request): Rule | null {
  const method = req.method.toUpperCase();
  const path = req.path;
  return (
    RULES.find((r) => r.methods.includes(method) && r.pattern.test(path)) ?? null
  );
}

export function buildAuthorizationMiddleware(ds: DataSource) {
  return async function authorizationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // Rotas públicas passam sem verificação de role/escopo
    if (shouldBypass(req)) return next();

    const user = (req as any).user as JwtUser | undefined;
    if (!user) return res.status(401).json({ message: "Não autenticado" });

    const role = normalizeRole(user.tipo);
    if (!role) {
      return res.status(403).json({ message: "Perfil sem permissão" });
    }

    const rule = inferRule(req);
    if (!rule) {
      // MODO ESTRITO: nenhuma rota passa sem regra explícita
      return res.status(403).json({ message: "Rota não mapeada — acesso negado" });
    }

    if (!rule.roles.includes(role)) {
      return res.status(403).json({ message: "Sem permissão para esta rota" });
    }

    const scopeType = rule.scope ?? "none";
    if (scopeType === "none" || role === "ADM") {
      return next();
    }

    const { hospitalId: hospitalIdRaw, redeId: redeIdRaw, unidadeId } = extractCandidateIds(req);
    let hospitalId = hospitalIdRaw;

    if (!hospitalId && unidadeId) {
      hospitalId = await resolveHospitalIdFromUnidade(ds, unidadeId);
    }

    if (scopeType === "rede") {
      if (role !== "GER") {
        return res.status(403).json({ message: "Escopo de rede não permitido" });
      }

      const userRedeId = user.redeId ?? null;
      if (!userRedeId) {
        return res.status(403).json({ message: "Utilizador sem rede associada" });
      }

      if (redeIdRaw && redeIdRaw !== userRedeId) {
        return res.status(403).json({ message: "Fora do escopo da sua rede" });
      }

      if (hospitalId) {
        const ok = await hospitalBelongsToRede(ds, hospitalId, userRedeId);
        if (!ok) {
          return res.status(403).json({ message: "Hospital fora do escopo da sua rede" });
        }
      }

      return next();
    }

    // escopo hospital
    const userHospitalId = user.hospital?.id ?? null;

    if (role === "GER") {
      const userRedeId = user.redeId ?? null;
      if (!userRedeId) {
        return res.status(403).json({ message: "Utilizador sem rede associada" });
      }
      if (hospitalId) {
        const ok = await hospitalBelongsToRede(ds, hospitalId, userRedeId);
        if (!ok) {
          return res.status(403).json({ message: "Hospital fora do escopo da sua rede" });
        }
      }
      return next();
    }

    if (hospitalId && userHospitalId && hospitalId !== userHospitalId) {
      return res.status(403).json({ message: "Hospital fora do seu escopo" });
    }

    if (redeIdRaw) {
      return res.status(403).json({ message: "Acesso por rede não permitido para este perfil" });
    }

    return next();
  };
}
