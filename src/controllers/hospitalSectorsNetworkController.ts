import { Request, Response } from "express";
import { HospitalSectorsNetworkRepository } from "../repositories/hospitalSectorsNetworkRepository";

export class HospitalSectorsNetworkController {
  constructor(private repo: HospitalSectorsNetworkRepository) {}

  getByRede = async (req: Request, res: Response) => {
    try {
      const { redeId } = req.params;

      if (!redeId) {
        return res.status(400).json({ error: "redeId é obrigatório" });
      }

      const data = await this.repo.getAggregatedSectorsByRede(redeId);
      return res.json(data);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  getByGrupo = async (req: Request, res: Response) => {
    try {
      const { grupoId } = req.params;

      if (!grupoId) {
        return res.status(400).json({ error: "grupoId é obrigatório" });
      }

      const data = await this.repo.getAggregatedSectorsByGrupo(grupoId);
      return res.json(data);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  getByRegiao = async (req: Request, res: Response) => {
    try {
      const { regiaoId } = req.params;

      if (!regiaoId) {
        return res.status(400).json({ error: "regiaoId é obrigatório" });
      }

      const data = await this.repo.getAggregatedSectorsByRegiao(regiaoId);
      return res.json(data);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
