import multer from "multer";
import path from "path";
import fs from "fs";

// Use process.cwd() para garantir que funciona tanto em dev quanto em prod
const uploadDir = path.join(process.cwd(), "uploads", "hospital");

// Garantir que o diretório existe
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.error("Erro ao criar diretório de uploads:", err);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  },
});

// Filtro para aceitar apenas imagens
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Apenas arquivos de imagem são permitidos (JPEG, PNG, GIF, WEBP)"
      )
    );
  }
};

export const uploadHospitalFoto = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
