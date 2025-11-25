import { Request, Response } from "express";
import { PasswordResetService } from "../services/passwordResetService";
import { AppDataSource } from "../ormconfig";

export class PasswordResetController {
  private service = new PasswordResetService(AppDataSource);

  /**
   * POST /password-reset/request
   * Request password reset - sends email with token
   */
  requestReset = async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      console.log(`📧 [PASSWORD RESET] Solicitação de redefinição de senha para email: ${email}`);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email é obrigatório",
        });
      }

      const result = await this.service.requestPasswordReset(email);

      console.log(`✅ [PASSWORD RESET] Email enviado com sucesso para: ${email}`);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error in requestReset:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao processar solicitação de redefinição de senha",
      });
    }
  };

  /**
   * POST /password-reset/reset
   * Reset password using token
   */
  resetPassword = async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Token e nova senha são obrigatórios",
        });
      }

      const result = await this.service.resetPassword(token, newPassword);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error in resetPassword:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao redefinir senha",
      });
    }
  };

  /**
   * GET /password-reset/verify/:token
   * Verify if token is valid
   */
  verifyToken = async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          valid: false,
          message: "Token é obrigatório",
        });
      }

      const result = await this.service.verifyToken(token);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Error in verifyToken:", error);
      return res.status(500).json({
        valid: false,
        message: "Erro ao verificar token",
      });
    }
  };

  /**
   * DELETE /password-reset/cleanup
   * Clean up expired tokens (admin only)
   */
  cleanupExpired = async (req: Request, res: Response) => {
    try {
      const deleted = await this.service.cleanupExpiredTokens();

      return res.status(200).json({
        success: true,
        message: `${deleted} tokens expirados removidos`,
        deleted,
      });
    } catch (error) {
      console.error("Error in cleanupExpired:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao limpar tokens expirados",
      });
    }
  };
}
