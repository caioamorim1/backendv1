/**
 * Executado antes de cada arquivo de teste, antes de qualquer import.
 * Garante que as variáveis de ambiente sensíveis usem valores de teste,
 * independentemente do que estiver no arquivo .env local.
 *
 * dotenv não sobrescreve variáveis já definidas em process.env,
 * portanto setar aqui garante que os valores abaixo prevaleçam.
 */

// JWT precisa ser o mesmo secret usado para assinar os tokens de teste
process.env.JWT_SECRET = "secreto";

// Silencia erros do emailService em testes
process.env.EMAIL_USER = "test@test.com";
process.env.EMAIL_PASS = "test-pass";
process.env.SMTP_USER = "test@test.com";
process.env.SMTP_PASS = "test-pass";

// Banco de dados não é usado nos testes (DataSource é sempre mockado)
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "5432";
process.env.DB_USER = "test";
process.env.DB_PASSWORD = "test";
process.env.DB_NAME = "test";
