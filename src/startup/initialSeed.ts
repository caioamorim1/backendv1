import { DataSource } from "typeorm";
import { ScpMetodoRepository } from "../repositories/scpMetodoRepository";
import { ColaboradorRepository } from "../repositories/colaboradorRepository";
import { runColetaSeed } from "./coletaSeed";

// Executa seed automático apenas se ainda não existem os 3 métodos builtin
export async function runInitialScpMetodoSeed(ds: DataSource) {
  try {
    const repo = new ScpMetodoRepository(ds);
    const requiredKeys = ["FUGULIN", "PERROCA", "DINI"];
    let existing = 0;
    for (const k of requiredKeys) {
      const found = await repo.getByKey(k);
      if (found) existing++;
    }
    if (existing < requiredKeys.length) {
      await repo.seedBuiltin();
    } else {
    }

    // Criação do admin padrão se não existir
    const adminRepo = new ColaboradorRepository(ds);
    const admins = await adminRepo.listarAdmins();
    const exists = admins.some((a) => a.email === "admin@admin.com");

    if (!exists) {
      await adminRepo.criarAdmin({
        email: "admin@admin.com",
        senha: "admin123",
        nome: "Administrador",
        cpf: "00000000000",
      });
    } else {
    }

    await runColetaSeed(ds);
  } catch (e) {
    console.warn("[SCP] Falha ao executar seed inicial opcional:", e);
  }
}
