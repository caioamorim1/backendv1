import { Request, Response } from "express";
import { HospitalSectorsRepository } from "../repositories/hospitalSectorsRepository";
import { HospitalSectorsAggregateRepository } from "../repositories/hospitalSectorsAggregateRepository";
import { HospitalRepository } from "../repositories/hospitalRepository";
import { DataSource } from "typeorm";

export class HospitalDashboardController {
  private sectorsRepo: HospitalSectorsRepository;
  private aggregateRepo: HospitalSectorsAggregateRepository;
  private hospitalRepo: HospitalRepository;

  constructor(ds: DataSource) {
    this.sectorsRepo = new HospitalSectorsRepository(ds);
    this.aggregateRepo = new HospitalSectorsAggregateRepository(ds);
    this.hospitalRepo = new HospitalRepository(ds);
  }

  comparative = async (req: Request, res: Response) => {
    try {
      const hospitalId = req.params.id;
      if (!hospitalId) {
        return res.status(400).json({ error: "hospitalId é obrigatório" });
      }

      const entityId = req.query.entityId as string | undefined;
      const includeProjected = req.query.includeProjected !== "false";
      const scope = (req.query.scope as string) || "global";
      const snapshotId = req.query.cacheKey || req.query.snapshotId;

      // Fetch atual (live) data
      const atual = await this.sectorsRepo.getAllSectorsByHospital(hospitalId);
      const hospitalRecord = await this.hospitalRepo.buscarPorId(hospitalId);
      const hospitalName = hospitalRecord?.nome || null;

      // Ensure arrays exist
      atual.internation = atual.internation || [];
      atual.assistance = atual.assistance || [];

      // Fetch projetado if requested
      let projetado: any = {
        id: hospitalId,
        name: hospitalName,
        internation: [],
        assistance: [],
      };
      if (includeProjected) {
        const projected =
          await this.aggregateRepo.getProjectedSectorsByHospital(hospitalId);
        projetado = projected || projetado;
      }

      // If entityId specified and equals 'all', return arrays of entities? frontend expects either array or single object
      // Here we return single hospital object for specified hospitalId. If entityId provided and matches a sector id,
      // we filter the internations/assistance arrays to return only that sector in both atual/projetado.
      if (entityId && entityId !== "all") {
        const filterFn = (arr: any[]) =>
          arr.filter((item) => item.id === entityId);
        const atualInternation = filterFn(atual.internation || []);
        const atualAssistance = filterFn(atual.assistance || []);
        const projInternation = filterFn(projetado.internation || []);
        const projAssistance = filterFn(projetado.assistance || []);

        const atualEntity = {
          id: hospitalId,
          name: hospitalName || projetado.name || null,
          internation: atualInternation,
          assistance: atualAssistance,
        };

        const projectedEntity = {
          id: hospitalId,
          name: projetado.name || hospitalName || null,
          internation: projInternation,
          assistance: projAssistance,
        };

        return res.json({
          hospitalId,
          atual: atualEntity,
          projetado: projectedEntity,
        });
      }

      // Default: return single hospital object with arrays
      const atualObj = {
        id: hospitalId,
        name: hospitalName,
        internation: atual.internation || [],
        assistance: atual.assistance || [],
      };

      const projetadoObj = {
        id: hospitalId,
        name: projetado.name || hospitalName || null,
        internation: projetado.internation || [],
        assistance: projetado.assistance || [],
      };

      // Set Cache-Control header if snapshot/cacheKey provided
      if (snapshotId) {
        res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
      }

      return res.json({ hospitalId, atual: atualObj, projetado: projetadoObj });
    } catch (error) {
      console.error("[HospitalDashboardController] comparative error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(500)
          .json({ error: "Erro ao gerar comparativo", details: msg });
      }
      return res.status(500).json({ error: "Erro ao gerar comparativo" });
    }
  };
}
