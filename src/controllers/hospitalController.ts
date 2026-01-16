import { Request, Response } from "express";
import { HospitalRepository } from "../repositories/hospitalRepository";
import { HospitalCargoUpdateService } from "../services/hospitalCargoUpdateService";
import { DataSource } from "typeorm";

export class HospitalController {
  private cargoUpdateService?: HospitalCargoUpdateService;

  constructor(
    private repo: HospitalRepository,
    ds?: DataSource
  ) {
    if (ds) {
      this.cargoUpdateService = new HospitalCargoUpdateService(ds);
    }
  }

  criar = async (req: Request, res: Response) => {
    try {
      console.log("\n═══════════════════════════════════════════════════");
      console.log("🏥 [CRIAR HOSPITAL] Iniciando");
      console.log("═══════════════════════════════════════════════════");
      console.log("Body recebido:", req.body);
      console.log("Arquivo recebido (req.file)?", !!req.file);

      if (req.file) {
        console.log("✅ Arquivo detectado:");
        console.log("   - Original name:", req.file.originalname);
        console.log("   - Filename:", req.file.filename);
        console.log("   - Mimetype:", req.file.mimetype);
        console.log("   - Size:", req.file.size);
        console.log("   - Path:", req.file.path);
        console.log("   - Destination:", req.file.destination);

        const fileExists = require("fs").existsSync(req.file.path);
        console.log("   - Arquivo existe no disco?", fileExists);

        if (fileExists) {
          console.log("   - ✅ Arquivo salvo com sucesso!");
        } else {
          console.log("   - ❌ ERRO: Arquivo NÃO foi salvo no disco!");
        }

        req.body.foto = `/uploads/hospital/${req.file.filename}`;
        console.log("   - URL da foto:", req.body.foto);
      } else {
        console.log("⚠️  Nenhum arquivo foi enviado");
      }
      console.log("═══════════════════════════════════════════════════\n");

      const novo = await this.repo.criar(req.body);
      res.status(201).json(novo);
    } catch (error) {
      console.error("[HospitalController] erro ao criar hospital:", error);
      const msg = error instanceof Error ? error.message : String(error);
      // Em dev, retornar mensagem completa para facilitar debug
      if (process.env.NODE_ENV !== "production") {
        return res
          .status(400)
          .json({ error: "Erro ao criar hospital", details: msg });
      }
      return res.status(400).json({ error: "Erro ao criar hospital" });
    }
  };

  listar = async (_: Request, res: Response) => {
    try {
      console.log("Listando hospitais...");
      const hospitais = await this.repo.buscarTodos();
      console.log("Hospitais encontrados:", hospitais);
      res.json(hospitais);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar hospitais" });
    }
  };

  buscarPorId = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      console.log("Buscando hospital com ID:", id);
      const hospital = await this.repo.buscarPorId(id);
      console.log("Hospital encontrado:", hospital);
      if (!hospital) {
        return res.status(404).json({ error: "Hospital não encontrado" });
      }

      res.json(hospital);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar hospital" });
    }
  };

  atualizar = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      console.log("═══════════════════════════════════════════════════");
      console.log("🔄 [ATUALIZAR HOSPITAL] Requisição recebida");
      console.log("═══════════════════════════════════════════════════");
      console.log("ID do Hospital:", id);
      console.log(
        "Dados recebidos (req.body):",
        JSON.stringify(req.body, null, 2)
      );
      console.log("Tipos dos campos:");
      Object.entries(req.body).forEach(([key, value]) => {
        console.log(`  - ${key}: ${typeof value} = ${JSON.stringify(value)}`);
      });

      // Se houver arquivo de foto no upload, adiciona ao body
      if (req.file) {
        req.body.foto = `/uploads/hospital/${req.file.filename}`;
        console.log("Nova foto do hospital salva:", req.body.foto);
      }

      console.log("═══════════════════════════════════════════════════\n");

      const sucesso = await this.repo.atualizar(id, req.body);

      if (!sucesso) {
        return res.status(404).json({ error: "Hospital não encontrado" });
      }

      // Busca o hospital atualizado para retornar
      const hospitalAtualizado = await this.repo.buscarPorId(id);
      res.json(hospitalAtualizado);
    } catch (error) {
      res.status(400).json({ error: "Erro ao atualizar hospital" });
    }
  };

  deletar = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const sucesso = await this.repo.deletar(id);

      if (!sucesso) {
        return res.status(404).json({ error: "Hospital não encontrado" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar hospital" });
    }
  };

  /**
   * GET /hospitais/:id/ultima-atualizacao-cargo
   * Retorna quando foi a última vez que um cargo foi atualizado no hospital
   */
  ultimaAtualizacaoCargo = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!this.cargoUpdateService) {
        return res.status(500).json({
          error: "Serviço de atualização de cargo não está disponível",
        });
      }

      const resultado =
        await this.cargoUpdateService.buscarUltimaAtualizacao(id);

      res.json(resultado);
    } catch (error) {
      console.error(
        "[HospitalController] Erro ao buscar última atualização de cargo:",
        error
      );
      res.status(500).json({
        error: "Erro ao buscar última atualização de cargo",
      });
    }
  };
}
