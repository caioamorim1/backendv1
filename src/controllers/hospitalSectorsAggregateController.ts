import { Request, Response } from "express";
import { HospitalSectorsAggregateRepository } from "../repositories/hospitalSectorsAggregateRepository";

export class HospitalSectorsAggregateController {
  constructor(private repo: HospitalSectorsAggregateRepository) {}

  getAllSectors = async (req: Request, res: Response) => {
    try {
      console.log("Buscando setores para TODOS os hospitais...");
      const result = await this.repo.getAllSectors();
      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar todos os setores:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: "Erro ao buscar todos os setores", details: msg });
      }
      return res.status(500).json({ error: "Erro ao buscar todos os setores" });
    }
  };

  getSectorsByNetwork = async (req: Request, res: Response) => {
    try {
      const { networkId } = req.params;
      if (!networkId) {
        return res.status(400).json({ error: "ID da rede é obrigatório" });
      }

      console.log(`Buscando setores para rede ${networkId}...`);
      const result = await this.repo.getSectorsByNetwork(networkId);
      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar setores por rede:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: "Erro ao buscar setores por rede", details: msg });
      }
      return res.status(500).json({ error: "Erro ao buscar setores por rede" });
    }
  };

  getSectorsByGroup = async (req: Request, res: Response) => {
    try {
      const { groupId } = req.params;
      if (!groupId) {
        return res.status(400).json({ error: "ID do grupo é obrigatório" });
      }

      console.log(`Buscando setores para grupo ${groupId}...`);
      const result = await this.repo.getSectorsByGroup(groupId);
      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar setores por grupo:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: "Erro ao buscar setores por grupo", details: msg });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar setores por grupo" });
    }
  };

  getSectorsByRegion = async (req: Request, res: Response) => {
    try {
      const { regionId } = req.params;
      if (!regionId) {
        return res.status(400).json({ error: "ID da região é obrigatório" });
      }

      console.log(`Buscando setores para região ${regionId}...`);
      const result = await this.repo.getSectorsByRegion(regionId);
      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar setores por região:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: "Erro ao buscar setores por região", details: msg });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar setores por região" });
    }
  };
}
