import { connectToDatabase } from "../database/connection";
import { runSessionExpiryForDate } from "../jobs/sessionExpiry";
import { AppDataSource } from "../ormconfig";
import { DateTime } from "luxon";

async function main() {
  const ZONE = "America/Sao_Paulo";

  // Se não passar data, usa ontem (simula meia-noite acabando de virar)
  const dateArg =
    process.argv[2] ??
    DateTime.now().setZone(ZONE).minus({ days: 1 }).toISODate()!;

  console.log(`▶  Rodando session-expiry para: ${dateArg}`);

  await connectToDatabase();

  try {
    await runSessionExpiryForDate(AppDataSource as any, dateArg);
    console.log("Job executado para:", dateArg);
  } catch (e) {
    console.error("Erro ao executar job:", e);
    process.exit(2);
  } finally {
    // tenta desligar conexões
    try {
      await AppDataSource.destroy();
    } catch (e) {
      // ignore
    }
    process.exit(0);
  }
}

main();
