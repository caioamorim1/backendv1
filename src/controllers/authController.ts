import { Request, Response } from "express";
import { AuthService } from "../services/authService";

export class AuthController {
  constructor(private authService: AuthService) {}

  login = async (req: Request, res: Response) => {
    console.log("[LOGIN] body recebido:", { email: req.body?.email, senha: req.body?.senha ? "***" : undefined });
    try {
      const { email, senha } = (req.body ?? {}) as { email?: string; senha?: string };
      if (!email || !senha) {
        console.log("[LOGIN] email ou senha ausente");
        return res.status(400).json({ error: "email e senha são obrigatórios" });
      }

      const out = await this.authService.login(email, senha);
      if (!out) {
        console.log("[LOGIN] credenciais inválidas para:", email);
        return res.status(401).json({ error: "Credenciais inválidas" });
      }
      console.log("[LOGIN] sucesso para:", email, "| tipo:", out.tipo);
      return res.json(out);
    } catch (err) {
      console.error("[LOGIN] erro inesperado:", err);
      const details = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: "Erro no login", details });
    }
  };
}
