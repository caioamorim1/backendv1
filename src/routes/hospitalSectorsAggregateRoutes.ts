import { Router } from "express";
import { DataSource } from "typeorm";
import { HospitalSectorsAggregateRepository } from "../repositories/hospitalSectorsAggregateRepository";
import { HospitalSectorsRepository } from "../repositories/hospitalSectorsRepository";
import { HospitalSectorsAggregateController } from "../controllers/hospitalSectorsAggregateController";

export const HospitalSectorsAggregateRoutes = (ds: DataSource): Router => {
  const router = Router();
  const repo = new HospitalSectorsAggregateRepository(ds);
  const controller = new HospitalSectorsAggregateController(repo);

  // ===== ROTAS ANTIGAS (por hospital) =====
  // Mantidas para compatibilidade retroativa

  // Rota para buscar setores de TODOS os hospitais (agrupados por hospital)
  router.get("/all", controller.getAllSectors);

  // Rota para buscar setores por rede (agrupados por hospital)
  router.get("/network/:networkId", controller.getSectorsByNetwork);

  // Rota para buscar setores por grupo (agrupados por hospital)
  router.get("/group/:groupId", controller.getSectorsByGroup);

  // Rota para buscar setores por região (agrupados por hospital)
  router.get("/region/:regionId", controller.getSectorsByRegion);

  // ===== ROTAS OTIMIZADAS (múltiplas entidades em 1 chamada) =====
  // Retornam TODAS as entidades agregadas em uma única query (performance crítica)

  // Rota para buscar TODAS as redes agregadas
  router.get("/networks/all-aggregated", controller.getAllNetworksAggregated);

  // Rota para buscar TODOS os grupos agregados
  router.get("/groups/all-aggregated", controller.getAllGroupsAggregated);

  // Rota para buscar TODAS as regiões agregadas
  router.get("/regions/all-aggregated", controller.getAllRegionsAggregated);

  // Rota para buscar TODOS os hospitais agregados
  router.get("/hospitals/all-aggregated", controller.getAllHospitalsAggregated);

  // ===== ROTAS PROJETADAS (setores agregados por nome com dados projetados) =====
  // Retornam setores agregados por NOME dentro de cada entidade, incluindo dados ATUAIS e PROJETADOS

  // Rota para buscar TODAS as redes com setores agregados PROJETADOS
  router.get(
    "/networks/all-projected-aggregated",
    controller.getAllNetworksProjectedAggregated
  );

  // Rota para buscar TODOS os grupos com setores agregados PROJETADOS
  router.get(
    "/groups/all-projected-aggregated",
    controller.getAllGroupsProjectedAggregated
  );

  // Rota para buscar TODAS as regiões com setores agregados PROJETADOS
  router.get(
    "/regions/all-projected-aggregated",
    controller.getAllRegionsProjectedAggregated
  );

  // Rota para buscar TODOS os hospitais com setores agregados PROJETADOS
  router.get(
    "/hospitals/all-projected-aggregated",
    controller.getAllHospitalsProjectedAggregated
  );

  // Rota para buscar PROJETADO para um único hospital
  router.get(
    "/hospitals/:hospitalId/projected",
    controller.getProjectedByHospital
  );

  // Rota para buscar COMPARATIVO (atual + projetado) para um único hospital
  router.get("/hospitals/:hospitalId/comparative", async (req, res) => {
    try {
      const { hospitalId } = req.params;
      if (!hospitalId)
        return res.status(400).json({ error: "hospitalId é obrigatório" });

      console.log(`\n🔍 ===== COMPARATIVO HOSPITAL ${hospitalId} =====`);

      // atual (live)
      const sectorsRepo = new HospitalSectorsRepository(ds);
      const atual = await sectorsRepo.getAllSectorsByHospital(hospitalId);

      // projetado
      const projected = await repo.getProjectedSectorsByHospital(hospitalId);

      const hospitalObj = {
        id: hospitalId,
        name: projected?.name || null,
        internation: atual?.internation || [],
        assistance: atual?.assistance || [],
      };

      // LOG DETALHADO - ASSISTÊNCIA (NÃO-INTERNAÇÃO)
      console.log(`\n📊 DADOS COMPARATIVO - ASSISTÊNCIA (NÃO-INTERNAÇÃO):`);
      console.log(`Total unidades atual: ${hospitalObj.assistance.length}`);
      console.log(
        `Total unidades projetado: ${projected?.assistance?.length || 0}`
      );

      // Log detalhado de cada unidade de assistência
      for (let i = 0; i < Math.min(3, hospitalObj.assistance.length); i++) {
        const atualUnit = hospitalObj.assistance[i];
        const projetadoUnit = projected?.assistance?.[i];

        console.log(`\n  📍 Unidade ${i + 1}: ${atualUnit.name}`);
        console.log(
          `     ATUAL staff:`,
          JSON.stringify(atualUnit.staff || [], null, 2)
        );
        console.log(
          `     PROJETADO staff:`,
          JSON.stringify(projetadoUnit?.projectedStaff || [], null, 2)
        );

        // Calcular variação manual para conferência
        if (projetadoUnit?.projectedStaff) {
          console.log(`\n     🧮 VARIAÇÃO CALCULADA (Backend debug):`);

          // Se projectedStaff é array de sítios
          if (
            Array.isArray(projetadoUnit.projectedStaff) &&
            projetadoUnit.projectedStaff[0]?.sitioId
          ) {
            console.log(
              `     ⚠️  FORMATO POR SÍTIO detectado - agregação necessária no frontend`
            );
            let totalEnfProj = 0,
              totalTecProj = 0;
            for (const sitio of projetadoUnit.projectedStaff) {
              for (const cargo of sitio.cargos || []) {
                if (cargo.role.toLowerCase().includes("enfermeiro"))
                  totalEnfProj += cargo.quantity;
                if (
                  cargo.role.toLowerCase().includes("técnico") ||
                  cargo.role.toLowerCase().includes("tecnico")
                )
                  totalTecProj += cargo.quantity;
              }
            }
            console.log(
              `     Total Enfermeiro projetado (agregado): ${totalEnfProj}`
            );
            console.log(
              `     Total Técnico projetado (agregado): ${totalTecProj}`
            );
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
              const existing = staffMap.get(s.role) || {
                atual: 0,
                projetado: 0,
              };
              existing.projetado = s.quantity || 0;
              staffMap.set(s.role, existing);
            }

            for (const [role, values] of staffMap) {
              const variacao = values.projetado - values.atual;
              console.log(
                `     ${role}: atual=${values.atual}, projetado=${
                  values.projetado
                }, variação=${variacao > 0 ? "+" : ""}${variacao}`
              );
            }
          }
        }
      }

      if (hospitalObj.assistance.length > 3) {
        console.log(
          `\n  ... e mais ${hospitalObj.assistance.length - 3} unidades`
        );
      }

      console.log(`\n✅ ===== FIM COMPARATIVO =====\n`);

      return res.json({ hospitalId, atual: hospitalObj, projetado: projected });
    } catch (error) {
      console.error(
        "[HospitalSectorsAggregateRoutes] erro comparativo hospital:",
        error
      );
      const msg = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        return res.status(500).json({
          error: "Erro ao buscar comparativo do hospital",
          details: msg,
        });
      }
      return res
        .status(500)
        .json({ error: "Erro ao buscar comparativo do hospital" });
    }
  });

  return router;
};
