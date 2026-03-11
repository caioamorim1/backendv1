import "reflect-metadata";
import dotenv from "dotenv";
import { AppDataSource } from "../ormconfig";

dotenv.config({ path: ".env" });

async function seedFresh() {
  console.log("Limpando banco de dados...");

  try {
    // Inicializar conexão
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Dropar todas as tabelas
    console.log("Dropando schema...");
    await AppDataSource.query(`DROP SCHEMA public CASCADE`);
    console.log("Schema dropado");

    // Recriar schema
    console.log("Recriando schema...");
    await AppDataSource.query(`CREATE SCHEMA public`);
    await AppDataSource.query(`GRANT ALL ON SCHEMA public TO postgres`);
    await AppDataSource.query(`GRANT ALL ON SCHEMA public TO public`);
    console.log("Schema recriado");

    // Fechar conexão para permitir que o synchronize funcione
    await AppDataSource.destroy();

    console.log("\nBanco de dados limpo com sucesso!");
    console.log("\nIniciando seed...\n");

    // Executar o seed normal importando diretamente
    const seedModule = require("./seedDatabase");
    const seedDatabase = seedModule.default || seedModule;
    await seedDatabase();
  } catch (error) {
    console.error("\nErro durante o seed fresh:", error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

if (require.main === module) {
  seedFresh();
}

export default seedFresh;
