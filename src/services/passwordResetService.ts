import { DataSource } from "typeorm";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { PasswordResetToken } from "../entities/PasswordResetToken";
import { Colaborador } from "../entities/Colaborador";
import { EmailService } from "./emailService";

const TOKEN_EXPIRATION_HOURS = 1;

export class PasswordResetService {
  private resetTokenRepo = this.ds.getRepository(PasswordResetToken);
  private colaboradorRepo = this.ds.getRepository(Colaborador);
  private emailService = new EmailService();

  constructor(private ds: DataSource) {}

  /**
   * Request password reset - generates token and sends email
   */
  async requestPasswordReset(email: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // Find user by email
    const user = await this.colaboradorRepo.findOne({
      where: { email },
    });

    // For security, always return success even if email doesn't exist
    // This prevents email enumeration attacks
    if (!user) {
      return {
        success: true,
        message:
          "Se o email existir em nosso sistema, você receberá um link de redefinição.",
      };
    }

    // Invalidate any existing tokens for this email
    await this.resetTokenRepo.update({ email, used: false }, { used: true });

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRATION_HOURS);

    // Save token to database
    const resetToken = this.resetTokenRepo.create({
      email,
      token,
      expiresAt,
      used: false,
    });
    await this.resetTokenRepo.save(resetToken);

    // Send email with reset link
    try {
      await this.emailService.sendPasswordResetEmail(email, token, user.nome);
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      throw new Error("Erro ao enviar email de redefinição de senha");
    }

    return {
      success: true,
      message:
        "Email de redefinição enviado com sucesso. Verifique sua caixa de entrada.",
    };
  }

  /**
   * Reset password using token
   */
  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    // Find valid token
    const resetToken = await this.resetTokenRepo.findOne({
      where: { token, used: false },
    });

    if (!resetToken) {
      return {
        success: false,
        message: "Token inválido ou já utilizado",
      };
    }

    // Check if token is expired
    if (new Date() > resetToken.expiresAt) {
      // Mark as used to prevent reuse
      resetToken.used = true;
      await this.resetTokenRepo.save(resetToken);

      return {
        success: false,
        message: "Token expirado. Solicite um novo link de redefinição.",
      };
    }

    // Find user by email
    const user = await this.colaboradorRepo.findOne({
      where: { email: resetToken.email },
    });

    if (!user) {
      return {
        success: false,
        message: "Usuário não encontrado",
      };
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      return {
        success: false,
        message: "A senha deve ter no mínimo 6 caracteres",
      };
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    user.senha = hashedPassword;
    user.mustChangePassword = false; // User has set their own password
    await this.colaboradorRepo.save(user);

    // Mark token as used
    resetToken.used = true;
    await this.resetTokenRepo.save(resetToken);

    return {
      success: true,
      message: "Senha redefinida com sucesso",
    };
  }

  /**
   * Verify if token is valid (for frontend validation)
   */
  async verifyToken(token: string): Promise<{
    valid: boolean;
    email?: string;
  }> {
    const resetToken = await this.resetTokenRepo.findOne({
      where: { token, used: false },
    });

    if (!resetToken) {
      return { valid: false };
    }

    if (new Date() > resetToken.expiresAt) {
      return { valid: false };
    }

    return {
      valid: true,
      email: resetToken.email,
    };
  }

  /**
   * Clean up expired tokens (can be called by a cron job)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.resetTokenRepo
      .createQueryBuilder()
      .delete()
      .where("expiresAt < :now", { now: new Date() })
      .execute();

    return result.affected || 0;
  }
}
