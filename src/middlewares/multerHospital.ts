import multer from "multer";
import path from "path";
import fs from "fs";

// Use process.cwd() para garantir que funciona tanto em dev quanto em prod
const uploadDir = path.join(process.cwd(), "uploads", "hospital");

console.log("═══════════════════════════════════════════════════");
console.log("📁 [MULTER HOSPITAL] Configurando upload");
console.log("═══════════════════════════════════════════════════");
console.log("__dirname:", __dirname);
console.log("uploadDir resolvido:", uploadDir);
console.log("Diretório existe?", fs.existsSync(uploadDir));

// Tentar criar o diretório se não existir (com tratamento de erro)
try {
  if (!fs.existsSync(uploadDir)) {
    console.log("⚠️  Diretório não existe, tentando criar...");
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("✅ Diretório criado com sucesso!");
  } else {
    console.log("✅ Diretório já existe");
  }
} catch (err) {
  // Se der erro de permissão, assume que a pasta já existe (foi criada pelo Docker)
  console.error("❌ Erro ao criar diretório de uploads:", err);
}
console.log("═══════════════════════════════════════════════════\n");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("📤 [MULTER] Salvando arquivo:", file.originalname);
    console.log("   - Destination:", uploadDir);
    console.log("   - Mimetype:", file.mimetype);
    console.log("   - Pasta existe antes de salvar?", fs.existsSync(uploadDir));

    // Lista conteúdo da pasta uploads para debug
    const uploadsRoot = path.join(process.cwd(), "uploads");
    if (fs.existsSync(uploadsRoot)) {
      console.log("   - Conteúdo de uploads/:", fs.readdirSync(uploadsRoot));
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    const fullPath = path.join(uploadDir, filename);
    console.log("   - Filename gerado:", filename);
    console.log("   - Path completo onde será salvo:", fullPath);

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
