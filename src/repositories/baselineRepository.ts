import { DataSource, Repository } from "typeorm";
import { Baseline } from "../entities/Baseline";
import { AtualizarBaselineDTO, CriarBaselineDTO } from "../dto/baseline.dto";
import { Hospital } from "../entities/Hospital";
interface SetorBaseline {
  nome: string;
  custo: string;
  ativo: boolean;
}
export class BaselineRepository {
  private repo: Repository<Baseline>;
  constructor(private ds: DataSource) {
    this.repo = ds.getRepository(Baseline);
  }

  async criar(data: CriarBaselineDTO) {
    return this.ds.transaction(async (manager) => {
      const hospitalRepo = manager.getRepository(Hospital);
      const hospital = await hospitalRepo.findOne({
        where: { id: data.hospitalId },
      });
      if (!hospital) throw new Error("Hospital não encontrado");

      const baselineRepo = manager.getRepository(Baseline);

      console.log("🔧 [BASELINE] Sanitizando dados antes de salvar...");
      const dadosSanitizados = this.sanitizarDados(data);
      console.log("✅ [BASELINE] Dados sanitizados:", dadosSanitizados);

      const baseline = baselineRepo.create({
        hospitalId: hospital.id,
        nome: dadosSanitizados.nome,
        quantidade_funcionarios: dadosSanitizados.quantidade_funcionarios,
        custo_total: dadosSanitizados.custo_total,
        setores: dadosSanitizados.setores as SetorBaseline[],
      } as CriarBaselineDTO);

      await baselineRepo.save(baseline);

      return this.buscarPorId(baseline.id);
    });
  }

  async atualizar(data: AtualizarBaselineDTO, id: string) {
    console.log("🔧 [BASELINE] Sanitizando dados antes de atualizar...");
    const dadosSanitizados = this.sanitizarDados(data);
    console.log("✅ [BASELINE] Dados sanitizados:", dadosSanitizados);

    await this.repo.update(id, dadosSanitizados);
    return this.buscarPorId(id);
  }

  buscarTodos() {
    return this.repo.find({
      relations: ["hospital"],
    });
  }

  buscarPorId(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ["hospital"],
    });
  }

  async buscarPorHospitalId(hospitalId: string) {
    return this.repo.findOne({
      where: { hospital: { id: hospitalId } },
      relations: ["hospital"],
    });
  }
  async setStatus(id: string, setorNome: string, ativo: boolean) {
    // buscar registro atual
    const baseline = await this.buscarPorId(id);
    if (!baseline) return null;

    const setoresOrig = (baseline as any).setores ?? [];
    let encontrou = false;

    const setoresAtualizados = setoresOrig.map((s: any) => {
      // lidar com elementos que podem ser string (JSON) ou objeto
      let obj = s;
      let wasString = false;
      if (typeof s === "string") {
        try {
          obj = JSON.parse(s);
          wasString = true;
        } catch {
          // se não for JSON, tratar como nome simples
          obj = { nome: s, ativo: true };
        }
      }
      if (obj && obj.nome === setorNome) {
        obj.ativo = ativo;
        encontrou = true;
      }
      return wasString ? JSON.stringify(obj) : obj;
    });

    if (!encontrou) return null; // setor não encontrado

    const result = await this.repo.update(
      { id },
      { setores: setoresAtualizados as any }
    );
    if (result.affected && result.affected > 0) {
      return this.buscarPorId(id);
    }
    return null;
  }
  async deletar(id: string) {
    const r = await this.repo.delete(id);
    return (r.affected ?? 0) > 0;
  }

  /**
   * ✅ SANITIZAR DADOS - Remove símbolos de porcentagem/moeda e converte para número
   * Aplica a mesma lógica usada no SnapshotDimensionamentoService
   */
  private sanitizarDados(dados: any): any {
    if (!dados) return dados;

    // Se for array, sanitizar cada item
    if (Array.isArray(dados)) {
      return dados.map((item, index) => this.sanitizarDados(item));
    }

    // Se for objeto, sanitizar cada propriedade
    if (typeof dados === "object") {
      const sanitizado: any = {};

      for (const [chave, valor] of Object.entries(dados)) {
        // Se o valor for string com "%", remover e converter para número
        if (typeof valor === "string" && valor.includes("%")) {
          const numero = parseFloat(
            valor.replace("%", "").replace(",", ".").trim()
          );
          const resultado = isNaN(numero) ? 0 : numero;
          console.log(
            `🔧 [BASELINE SANITIZAR] ${chave}: "${valor}" → ${resultado}`
          );
          sanitizado[chave] = resultado;
        }
        // Se for string numérica ou monetária (ex: "1.500,00" ou "R$ 1.500,00"), converter
        else if (typeof valor === "string" && /[\d.,]/.test(valor)) {
          // Remover prefixos monetários
          let valorLimpo = valor.replace(/^[R$€£¥₹\s]+/i, "").trim();

          // Se tem pontos E vírgulas, assumir formato brasileiro (1.500,00)
          if (valorLimpo.includes(".") && valorLimpo.includes(",")) {
            valorLimpo = valorLimpo.replace(/\./g, "").replace(",", ".");
          }
          // Se só tem vírgula, substituir por ponto
          else if (valorLimpo.includes(",")) {
            valorLimpo = valorLimpo.replace(",", ".");
          }

          // Tentar converter
          if (/^[\d.]+$/.test(valorLimpo)) {
            const numero = parseFloat(valorLimpo);
            if (!isNaN(numero)) {
              console.log(
                `🔧 [BASELINE SANITIZAR] ${chave}: "${valor}" → ${numero}`
              );
              // Para campos de custo/valor, manter como número decimal
              sanitizado[chave] = numero;
            } else {
              sanitizado[chave] = valor; // Manter original se não conseguir converter
            }
          } else {
            sanitizado[chave] = valor; // Não é numérico, manter original
          }
        }
        // Se for objeto ou array, sanitizar recursivamente
        else if (typeof valor === "object" && valor !== null) {
          sanitizado[chave] = this.sanitizarDados(valor);
        }
        // Outros casos, manter o valor original
        else {
          sanitizado[chave] = valor;
        }
      }

      return sanitizado;
    }

    // Se for primitivo, retornar direto
    return dados;
  }
}
