import {
  StaffDTO,
  CareLevelDTO,
  BedStatusDTO,
  HospitalSectorsDTO
} from './hospitalSectors.dto';

export interface InternationSectorWithHospitalDTO {
  id: string;
  name: string;
  hospitalName: string;
  descr: string | null;
  costAmount: number;
  bedCount: number;
  careLevel: CareLevelDTO;
  bedStatus: BedStatusDTO;
  staff: StaffDTO[];
}

export interface AssistanceSectorWithHospitalDTO {
  id: string;
  name: string;
  hospitalName: string;
  descr: string | null;
  costAmount: number;
  staff: StaffDTO[];
}

export interface AggregatedSectorsDTO extends HospitalSectorsDTO {
  hospitalName: string;
}

export interface SectorsAggregateDTO {
  id: string;
  hospitals: AggregatedSectorsDTO[];
}