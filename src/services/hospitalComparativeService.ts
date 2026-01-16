import { DataSource } from "typeorm";
import { HospitalSectorsAggregateRepository } from "../repositories/hospitalSectorsAggregateRepository";
import { HospitalSectorsRepository } from "../repositories/hospitalSectorsRepository";

export class HospitalComparativeService {
  private aggregateRepo: HospitalSectorsAggregateRepository;
  private sectorsRepo: HospitalSectorsRepository;

  constructor(private ds: DataSource) {
    this.aggregateRepo = new HospitalSectorsAggregateRepository(ds);
    this.sectorsRepo = new HospitalSectorsRepository(ds);
  }

  /**
   * Busca o comparativo (atual + projetado) para um único hospital
   */
  async getHospitalComparative(hospitalId: string) {
    // atual (live)
    const atual = await this.sectorsRepo.getAllSectorsByHospital(hospitalId);

    // projetado
    const projected =
      await this.aggregateRepo.getProjectedSectorsByHospital(hospitalId);

    const hospitalObj = {
      id: hospitalId,
      name: (projected as any)?.name || null,
      internation: (atual as any)?.internation || [],
      assistance: (atual as any)?.assistance || [],
    };

    // Log detalhado de até 3 unidades de assistência
    for (let i = 0; i < Math.min(3, hospitalObj.assistance.length); i++) {
      const atualUnit = (hospitalObj.assistance as any[])[i];
      const projetadoUnit = (projected as any)?.assistance?.[i];

      // Calcular variação manual para conferência
      if (projetadoUnit?.projectedStaff) {
        // Se projectedStaff é array de sítios
        if (
          Array.isArray(projetadoUnit.projectedStaff) &&
          projetadoUnit.projectedStaff[0]?.sitioId
        ) {
          let totalEnfProj = 0,
            totalTecProj = 0;
          for (const sitio of projetadoUnit.projectedStaff) {
            for (const cargo of sitio.cargos || []) {
              if (cargo.role.toLowerCase().includes("enfermeiro"))
                totalEnfProj += cargo.quantity;
              if (
                cargo.role.toLowerCase().includes("técnico em Enfermagem") ||
                cargo.role.toLowerCase().includes("tecnico")
              )
                totalTecProj += cargo.quantity;
            }
          }
        } else {
          // Formato simples
          const staffMap = new Map<
            string,
            { atual: number; projetado: number }
          >();

          for (const s of atualUnit.staff || []) {
            staffMap.set(s.role, { atual: s.quantity || 0, projetado: 0 });
          }

          for (const s of projetadoUnit.projectedStaff || []) {
            const existing = staffMap.get(s.role) || { atual: 0, projetado: 0 };
            existing.projetado = s.quantity || 0;
            staffMap.set(s.role, existing);
          }

          for (const [role, values] of staffMap) {
            const variacao = values.projetado - values.atual;
          }
        }
      }
    }

    return { hospitalId, atual: hospitalObj, projetado: projected };
  }
}
