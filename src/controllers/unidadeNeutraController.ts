import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { UnidadeNeutra } from "../entities/UnidadeNeutra";
import { Hospital } from "../entities/Hospital";
import {
  CreateUnidadeNeutraDTO,
  UpdateUnidadeNeutraDTO,
  UnidadeNeutraResponseDTO,
} from "../dto/unidadeNeutra.dto";

export class UnidadeNeutraController {
  constructor(private ds: DataSource) {}

  criar = async (req: Request, res: Response) => {
    try {
      const dados: CreateUnidadeNeutraDTO = req.body;

      // Validações básicas
      if (!dados.hospitalId || !dados.nome || dados.custoTotal === undefined) {
        return res.status(400).json({
          mensagem: "hospitalId, nome e custoTotal são obrigatórios",
        });
      }

      if (dados.custoTotal < 0) {
        return res.status(400).json({
          mensagem: "custoTotal não pode ser negativo",
        });
      }

      const unidadeRepo = this.ds.getRepository(UnidadeNeutra);
      const hospitalRepo = this.ds.getRepository(Hospital);

      // Verificar se o hospital existe
      const hospital = await hospitalRepo.findOne({
        where: { id: dados.hospitalId },
      });

      if (!hospital) {
        return res.status(404).json({ mensagem: "Hospital não encontrado" });
      }

      // Criar unidade neutra
      const novaUnidade = unidadeRepo.create({
        nome: dados.nome,
        custoTotal: dados.custoTotal,
        status: dados.status || "ativo",
        descricao: dados.descricao,
        hospital: hospital,
      });

      const unidadeSalva = await unidadeRepo.save(novaUnidade);

      const response: UnidadeNeutraResponseDTO = {
        id: unidadeSalva.id,
        nome: unidadeSalva.nome,
        custoTotal: Number(unidadeSalva.custoTotal),
        status: unidadeSalva.status,
        descricao: unidadeSalva.descricao,
        hospitalId: dados.hospitalId,
        created_at: unidadeSalva.created_at,
        updated_at: unidadeSalva.updated_at,
      };

      return res.status(201).json(response);
    } catch (error) {
      console.error("Erro ao criar unidade neutra:", error);
      return res.status(500).json({
        mensagem: "Erro interno do servidor",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  listar = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.query as { hospitalId?: string };
      const unidadeRepo = this.ds.getRepository(UnidadeNeutra);

      let query = unidadeRepo
        .createQueryBuilder("unidade")
        .leftJoinAndSelect("unidade.hospital", "hospital")
        .orderBy("unidade.nome", "ASC");

      if (hospitalId) {
        query = query.where("hospital.id = :hospitalId", { hospitalId });
      }

      const unidades = await query.getMany();

      const response: UnidadeNeutraResponseDTO[] = unidades.map((u) => ({
        id: u.id,
        nome: u.nome,
        custoTotal: Number(u.custoTotal),
        status: u.status,
        descricao: u.descricao,
        hospitalId: u.hospital.id,
        created_at: u.created_at,
        updated_at: u.updated_at,
      }));

      return res.json({ data: response });
    } catch (error) {
      console.error("Erro ao listar unidades neutras:", error);
      return res.status(500).json({
        mensagem: "Erro interno do servidor",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  listarPorHospital = async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;

      // Validação UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(hospitalId)) {
        return res.status(400).json({ mensagem: "ID do hospital inválido" });
      }

      const unidadeRepo = this.ds.getRepository(UnidadeNeutra);

      const unidades = await unidadeRepo
        .createQueryBuilder("unidade")
        .leftJoinAndSelect("unidade.hospital", "hospital")
        .where("hospital.id = :hospitalId", { hospitalId })
        .orderBy("unidade.nome", "ASC")
        .getMany();

      const response: UnidadeNeutraResponseDTO[] = unidades.map((u) => ({
        id: u.id,
        nome: u.nome,
        custoTotal: Number(u.custoTotal),
        status: u.status,
        descricao: u.descricao,
        hospitalId: hospitalId,
        created_at: u.created_at,
        updated_at: u.updated_at,
      }));

      return res.json({ data: response });
    } catch (error) {
      console.error("Erro ao listar unidades neutras por hospital:", error);
      return res.status(500).json({
        mensagem: "Erro interno do servidor",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  obter = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Validação UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ mensagem: "ID inválido" });
      }

      const unidadeRepo = this.ds.getRepository(UnidadeNeutra);

      const unidade = await unidadeRepo
        .createQueryBuilder("unidade")
        .leftJoinAndSelect("unidade.hospital", "hospital")
        .where("unidade.id = :id", { id })
        .getOne();

      if (!unidade) {
        return res.status(404).json({ mensagem: "Unidade não encontrada" });
      }

      const response: UnidadeNeutraResponseDTO = {
        id: unidade.id,
        nome: unidade.nome,
        custoTotal: Number(unidade.custoTotal),
        status: unidade.status,
        descricao: unidade.descricao,
        hospitalId: unidade.hospital.id,
        created_at: unidade.created_at,
        updated_at: unidade.updated_at,
      };

      return res.json(response);
    } catch (error) {
      console.error("Erro ao obter unidade neutra:", error);
      return res.status(500).json({
        mensagem: "Erro interno do servidor",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  atualizar = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const dados: UpdateUnidadeNeutraDTO = req.body;

      // Validação UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ mensagem: "ID inválido" });
      }

      if (dados.custoTotal !== undefined && dados.custoTotal < 0) {
        return res.status(400).json({
          mensagem: "custoTotal não pode ser negativo",
        });
      }

      const unidadeRepo = this.ds.getRepository(UnidadeNeutra);

      const unidade = await unidadeRepo.findOne({
        where: { id },
        relations: ["hospital"],
      });

      if (!unidade) {
        return res.status(404).json({ mensagem: "Unidade não encontrada" });
      }

      // Atualizar campos
      if (dados.nome !== undefined) unidade.nome = dados.nome;
      if (dados.custoTotal !== undefined) unidade.custoTotal = dados.custoTotal;
      if (dados.status !== undefined) unidade.status = dados.status;
      if (dados.descricao !== undefined) unidade.descricao = dados.descricao;

      const unidadeAtualizada = await unidadeRepo.save(unidade);

      const response: UnidadeNeutraResponseDTO = {
        id: unidadeAtualizada.id,
        nome: unidadeAtualizada.nome,
        custoTotal: Number(unidadeAtualizada.custoTotal),
        status: unidadeAtualizada.status,
        descricao: unidadeAtualizada.descricao,
        hospitalId: unidadeAtualizada.hospital.id,
        created_at: unidadeAtualizada.created_at,
        updated_at: unidadeAtualizada.updated_at,
      };

      return res.json(response);
    } catch (error) {
      console.error("Erro ao atualizar unidade neutra:", error);
      return res.status(500).json({
        mensagem: "Erro interno do servidor",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  remover = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Validação UUID
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ mensagem: "ID inválido" });
      }

      const unidadeRepo = this.ds.getRepository(UnidadeNeutra);

      const unidade = await unidadeRepo.findOne({ where: { id } });

      if (!unidade) {
        return res.status(404).json({ mensagem: "Unidade não encontrada" });
      }

      await unidadeRepo.remove(unidade);

      return res.json({ mensagem: "Unidade removida com sucesso" });
    } catch (error) {
      console.error("Erro ao remover unidade neutra:", error);
      return res.status(500).json({
        mensagem: "Erro interno do servidor",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
