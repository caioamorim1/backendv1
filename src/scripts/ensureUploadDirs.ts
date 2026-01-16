import fs from "fs";
import path from "path";

/**
 * Script para garantir que os diretórios de upload existam
 * Deve ser executado antes de iniciar o servidor em produção
 */
const ensureUploadDirectories = () => {
  // Diretórios necessários
  const uploadDirs = [
    path.resolve(__dirname, "../../uploads/hospital"),
    path.resolve(__dirname, "../../uploads/coleta"),
  ];

  console.log("🔍 Verificando diretórios de upload...");

  uploadDirs.forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Diretório criado: ${dir}`);
      } else {
        console.log(`✓ Diretório já existe: ${dir}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao criar diretório ${dir}:`, error);
      process.exit(1);
    }
  });

  console.log("✅ Todos os diretórios de upload estão prontos\n");
};

// Executar quando chamado diretamente
if (require.main === module) {
  ensureUploadDirectories();
}

export { ensureUploadDirectories };
