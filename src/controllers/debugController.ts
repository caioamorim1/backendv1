import { Request, Response } from "express";
import path from "path";
import fs from "fs";

export class DebugController {
  getUploadInfo = async (req: Request, res: Response) => {
    try {
      const info: any = {
        timestamp: new Date().toISOString(),
        process: {
          cwd: process.cwd(),
          env_NODE_ENV: process.env.NODE_ENV,
          platform: process.platform,
        },
        paths: {
          __dirname_would_be: "varia dependendo de onde este arquivo está",
          uploads_path_usado: path.join(process.cwd(), "uploads"),
          hospital_path_usado: path.join(process.cwd(), "uploads", "hospital"),
        },
        directories: {},
        files: {},
      };

      // Verifica pasta uploads
      const uploadsPath = path.join(process.cwd(), "uploads");
      info.directories.uploads = {
        path: uploadsPath,
        exists: fs.existsSync(uploadsPath),
        content: [],
      };

      if (fs.existsSync(uploadsPath)) {
        try {
          const items = fs.readdirSync(uploadsPath);
          info.directories.uploads.content = items.map((item) => {
            const itemPath = path.join(uploadsPath, item);
            const stats = fs.statSync(itemPath);
            return {
              name: item,
              isDirectory: stats.isDirectory(),
              size: stats.size,
            };
          });
        } catch (err) {
          info.directories.uploads.error = String(err);
        }
      }

      // Verifica pasta hospital
      const hospitalPath = path.join(process.cwd(), "uploads", "hospital");
      info.directories.hospital = {
        path: hospitalPath,
        exists: fs.existsSync(hospitalPath),
        content: [],
      };

      if (fs.existsSync(hospitalPath)) {
        try {
          const items = fs.readdirSync(hospitalPath);
          info.directories.hospital.content = items.map((item) => {
            const itemPath = path.join(hospitalPath, item);
            const stats = fs.statSync(itemPath);
            return {
              name: item,
              isFile: stats.isFile(),
              size: stats.size,
              created: stats.birthtime,
            };
          });
          info.directories.hospital.totalFiles = items.length;
        } catch (err) {
          info.directories.hospital.error = String(err);
        }
      }

      // Testa um arquivo específico se fornecido
      const testFile = req.query.file as string;
      if (testFile) {
        const testPath = path.join(
          process.cwd(),
          "uploads",
          "hospital",
          testFile
        );
        info.files.test = {
          filename: testFile,
          fullPath: testPath,
          exists: fs.existsSync(testPath),
          urlPath: `/uploads/hospital/${testFile}`,
        };
      }

      res.json(info);
    } catch (error) {
      res.status(500).json({
        error: "Erro ao obter informações de debug",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
