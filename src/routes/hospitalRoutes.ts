import { Router } from "express";
import { HospitalRepository } from "../repositories/hospitalRepository";
import { HospitalController } from "../controllers/hospitalController";
import { DataSource } from "typeorm";
import { uploadHospitalFoto } from "../middlewares/multerHospital";

export const HospitalRoutes = (ds: DataSource): Router => {
  const r = Router();
  const repo = new HospitalRepository(ds);
  const ctrl = new HospitalController(repo, ds);
  const dashboardCtrl =
    new (require("../controllers/hospitalDashboardController").HospitalDashboardController)(
      ds
    );

  // Route: POST /hospitais - com upload de foto
  r.post(
    "/",
    (req, res, next) => {
      console.log("\n🔄 [ROTA HOSPITAL] POST / - Upload iniciado");
      uploadHospitalFoto.single("foto")(req, res, (err) => {
        if (err) {
          console.error("❌ [MULTER ERROR]:", err);
          return res.status(400).json({
            error: "Erro no upload",
            details: err.message,
          });
        }
        console.log("✅ [MULTER] Upload middleware concluído");
        next();
      });
    },
    ctrl.criar
  );

  // Route: GET /hospitais
  r.get("/", ctrl.listar);

  // Route: GET /hospitais/:id
  r.get("/:id", ctrl.buscarPorId);

  // Route: GET /hospitais/:id/comparative - retorna payload atual + projetado para o dashboard
  r.get("/:id/comparative", dashboardCtrl.comparative);

  // Route: GET /hospitais/:id/ultima-atualizacao-cargo
  r.get("/:id/ultima-atualizacao-cargo", ctrl.ultimaAtualizacaoCargo);

  // Route: PUT /hospitais/:id - com upload de foto
  r.put("/:id", uploadHospitalFoto.single("foto"), ctrl.atualizar);

  // Route: DELETE /hospitais/:id
  r.delete("/:id", ctrl.deletar);

  return r;
};
