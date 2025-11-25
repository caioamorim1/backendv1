import * as nodemailer from "nodemailer";

// Suporta tanto EMAIL_* quanto SMTP_* para compatibilidade
const SMTP_HOST =
  process.env.EMAIL_HOST || process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(
  process.env.EMAIL_PORT || process.env.SMTP_PORT || "587"
);
const SMTP_USER = process.env.EMAIL_USER || process.env.SMTP_USER || "";
const SMTP_PASS = process.env.EMAIL_PASS || process.env.SMTP_PASS || "";
const FROM_EMAIL =
  process.env.EMAIL_FROM || process.env.FROM_EMAIL || SMTP_USER;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Validação de credenciais
    if (!SMTP_USER || !SMTP_PASS) {
      console.error(
        "⚠️ [EmailService] AVISO: EMAIL_USER e EMAIL_PASS não configurados no .env"
      );
    }

    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    console.log(
      `📧 [EmailService] Configurado: ${SMTP_USER}@${SMTP_HOST}:${SMTP_PORT}`
    );
  }

  /**
   * Send password reset email with token
   */
  async sendPasswordResetEmail(
    email: string,
    token: string,
    userName: string
  ): Promise<void> {
    const resetLink = `${FRONTEND_URL}/#/reset-password?token=${token}`;

    const mailOptions = {
      from: `"Dimensiona" <${FROM_EMAIL}>`,
      to: email,
      subject: "Redefinição de Senha - Dimensiona",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              background: #ffffff;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              background: #007bff;
              color: #ffffff;
              padding: 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .content {
              padding: 30px;
            }
            .content p {
              margin-bottom: 15px;
            }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background: #007bff;
              color: #ffffff;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
              font-weight: bold;
            }
            .button:hover {
              background: #0056b3;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Redefinição de Senha</h1>
            </div>
            <div class="content">
              <p>Olá, <strong>${userName}</strong>!</p>
              
              <p>Recebemos uma solicitação para redefinir a senha da sua conta no sistema Dimensiona.</p>
              
              <p>Para criar uma nova senha, clique no botão abaixo:</p>
              
              <center>
                <a href="${resetLink}" class="button">Redefinir Minha Senha</a>
              </center>
              
              <p>Ou copie e cole este link no seu navegador:</p>
              <p style="word-break: break-all; color: #007bff;">${resetLink}</p>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul style="margin: 5px 0;">
                  <li>Este link expira em <strong>1 hora</strong></li>
                  <li>Se você não solicitou esta redefinição, ignore este email</li>
                  <li>Sua senha atual permanecerá inalterada</li>
                </ul>
              </div>
              
              <p>Se você tiver problemas com o link acima, entre em contato com o suporte.</p>
              
              <p>Atenciosamente,<br><strong>Equipe Dimensiona</strong></p>
            </div>
            <div class="footer">
              <p>Este é um email automático. Por favor, não responda.</p>
              <p>&copy; ${new Date().getFullYear()} Dimensiona. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Olá, ${userName}!

Recebemos uma solicitação para redefinir a senha da sua conta no sistema Dimensiona.

Para criar uma nova senha, acesse o link abaixo:
${resetLink}

IMPORTANTE:
- Este link expira em 1 hora
- Se você não solicitou esta redefinição, ignore este email
- Sua senha atual permanecerá inalterada

Se você tiver problemas, entre em contato com o suporte.

Atenciosamente,
Equipe Dimensiona
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  /**
   * Verify email service is configured and working
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("Email service verification failed:", error);
      return false;
    }
  }
}
