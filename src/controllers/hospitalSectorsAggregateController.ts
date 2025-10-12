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

  // ===== MÉTODOS OTIMIZADOS (múltiplas entidades em 1 chamada) =====

  getAllNetworksAggregated = async (req: Request, res: Response) => {
    try {
      console.log("🚀 Buscando TODAS as redes agregadas em uma única query...");
      const startTime = Date.now();

      const result = await this.repo.getAllNetworksAggregated();

      const duration = Date.now() - startTime;
      console.log(
        `✅ Agregação concluída: ${result.items.length} redes em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar todas as redes agregadas:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar todas as redes agregadas",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar todas as redes agregadas" });
    }
  };

  getAllGroupsAggregated = async (req: Request, res: Response) => {
    try {
      console.log(
        "🚀 Buscando TODOS os grupos agregados em uma única query..."
      );
      const startTime = Date.now();

      const result = await this.repo.getAllGroupsAggregated();

      const duration = Date.now() - startTime;
      console.log(
        `✅ Agregação concluída: ${result.items.length} grupos em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar todos os grupos agregados:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar todos os grupos agregados",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar todos os grupos agregados" });
    }
  };

  getAllRegionsAggregated = async (req: Request, res: Response) => {
    try {
      console.log(
        "🚀 Buscando TODAS as regiões agregadas em uma única query..."
      );
      const startTime = Date.now();

      const result = await this.repo.getAllRegionsAggregated();

      const duration = Date.now() - startTime;
      console.log(
        `✅ Agregação concluída: ${result.items.length} regiões em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar todas as regiões agregadas:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar todas as regiões agregadas",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar todas as regiões agregadas" });
    }
  };

  getAllHospitalsAggregated = async (req: Request, res: Response) => {
    try {
      console.log(
        "🚀 Buscando TODOS os hospitais agregados em uma única query..."
      );
      const startTime = Date.now();

      const result = await this.repo.getAllHospitalsAggregated();

      const duration = Date.now() - startTime;
      console.log(
        `✅ Agregação concluída: ${result.items.length} hospitais em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar todos os hospitais agregados:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar todos os hospitais agregados",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar todos os hospitais agregados" });
    }
  };

  // ===== MÉTODOS PARA DADOS PROJETADOS (setores agregados por nome) =====

  getAllNetworksProjectedAggregated = async (req: Request, res: Response) => {
    try {
      console.log(
        "🚀 Buscando TODAS as redes com setores agregados PROJETADOS..."
      );
      const startTime = Date.now();

      const result = await this.repo.getAllNetworksProjectedAggregated();

      const duration = Date.now() - startTime;
      const totalSectors =
        result.items.reduce(
          (acc, network) =>
            acc + network.internation.length + network.assistance.length,
          0
        ) || 0;
      console.log(
        `✅ Agregação PROJETADA concluída: ${result.items.length} redes com ${totalSectors} setores em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar redes com setores projetados:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar redes com setores projetados",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar redes com setores projetados" });
    }
  };

  getAllGroupsProjectedAggregated = async (req: Request, res: Response) => {
    try {
      console.log(
        "🚀 Buscando TODOS os grupos com setores agregados PROJETADOS..."
      );
      const startTime = Date.now();

      const result = await this.repo.getAllGroupsProjectedAggregated();

      const duration = Date.now() - startTime;
      const totalSectors =
        result.items.reduce(
          (acc, group) =>
            acc + group.internation.length + group.assistance.length,
          0
        ) || 0;
      console.log(
        `✅ Agregação PROJETADA concluída: ${result.items.length} grupos com ${totalSectors} setores em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar grupos com setores projetados:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar grupos com setores projetados",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar grupos com setores projetados" });
    }
  };

  getAllRegionsProjectedAggregated = async (req: Request, res: Response) => {
    try {
      console.log(
        "🚀 Buscando TODAS as regiões com setores agregados PROJETADOS..."
      );
      const startTime = Date.now();

      const result = await this.repo.getAllRegionsProjectedAggregated();

      const duration = Date.now() - startTime;
      const totalSectors =
        result.items.reduce(
          (acc, region) =>
            acc + region.internation.length + region.assistance.length,
          0
        ) || 0;
      console.log(
        `✅ Agregação PROJETADA concluída: ${result.items.length} regiões com ${totalSectors} setores em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar regiões com setores projetados:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar regiões com setores projetados",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar regiões com setores projetados" });
    }
  };

  getAllHospitalsProjectedAggregated = async (req: Request, res: Response) => {
    try {
      console.log(
        "🚀 Buscando TODOS os hospitais com setores agregados PROJETADOS..."
      );
      const startTime = Date.now();

      const result = await this.repo.getAllHospitalsProjectedAggregated();

      const duration = Date.now() - startTime;
      const totalSectors =
        result.items.reduce(
          (acc, hospital) =>
            acc + hospital.internation.length + hospital.assistance.length,
          0
        ) || 0;
      console.log(
        `✅ Agregação PROJETADA concluída: ${result.items.length} hospitais com ${totalSectors} setores em ${duration}ms`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateController] erro ao buscar hospitais com setores projetados:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar hospitais com setores projetados",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar hospitais com setores projetados" });
    }
  };
}
