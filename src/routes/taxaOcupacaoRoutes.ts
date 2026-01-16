import { Router } from "express";
import { DataSource } from "typeorm";
import { TaxaOcupacaoCustomizadaService } from "../services/taxaOcupacaoCustomizadaService";
import { TaxaOcupacaoCustomizadaController } from "../controllers/taxaOcupacaoCustomizadaController";

export const TaxaOcupacaoRoutes = (ds: DataSource): Router => {
  const router = Router();
  const service = new TaxaOcupacaoCustomizadaService(ds);
  const controller = new TaxaOcupacaoCustomizadaController(service);

  // POST /taxa-ocupacao - Salvar ou atualizar
  router.post("/", controller.salvar);

  // GET /taxa-ocupacao/:unidadeId - Buscar
  router.get("/:unidadeId", controller.buscar);

  // DELETE /taxa-ocupacao/:unidadeId - Deletar
  router.delete("/:unidadeId", controller.deletar);

  return router;
};
