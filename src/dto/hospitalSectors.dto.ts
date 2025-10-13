export interface StaffDTO {
  id: string;
  role: string;
  quantity: number;
}

export interface CargoSitioDTO {
  cargo_sitio_id?: string;
  quantidade_funcionarios: number;
  cargoUnidade: {
    id: string;
    cargo: {
      id: string;
      nome: string;
    };
  };
}

export interface SitioFuncionalDTO {
  id: string;
  nome: string;
  cargosSitio: CargoSitioDTO[];
}

export interface CareLevelDTO {
  minimumCare: number;
  intermediateCare: number;
  highDependency: number;
  semiIntensive: number;
  intensive: number;
}

export interface BedStatusDTO {
  evaluated: number;
  vacant: number;
  inactive: number;
}

export interface InternationSectorDTO {
  id: string;
  name: string;
  descr: string | null;
  costAmount: number;
  bedCount: number;
  careLevel: CareLevelDTO;
  bedStatus: BedStatusDTO;
  staff: StaffDTO[];
}

export interface AssistanceSectorDTO {
  id: string;
  name: string;
  descr: string | null;
  costAmount: number;
  staff: StaffDTO[];
  sitiosFuncionais?: SitioFuncionalDTO[]; // ✨ NOVO CAMPO
}

export interface HospitalSectorsDTO {
  id: string;
  internation: InternationSectorDTO[];
  assistance: AssistanceSectorDTO[];
}
