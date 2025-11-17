import { CriarBaselineDTO } from "./baseline.dto";
import {
  TipoHospital,
  GestaoHospital,
  PerfilHospital,
  ComplexidadeHospital,
} from "../entities/Hospital";

export interface CreateHospitalDTO {
  nome: string;
  cnpj: string;
  telefone?: string;
  endereco?: string;
  regiaoId?: string;
  redeId?: string;
  grupoId?: string;
  baseline?: CriarBaselineDTO;
  tipo?: TipoHospital;
  gestao?: GestaoHospital;
  perfil?: PerfilHospital;
  complexidade?: ComplexidadeHospital;
  numeroTotalLeitos?: number;
  numeroLeitosUTI?: number;
  numeroSalasCirurgicas?: number;
}

export interface AtualizarHospitalDTO {
  nome?: string;
  cnpj?: string;
  telefone?: string;
  endereco?: string;
  regiaoId?: string;
  redeId?: string;
  grupoId?: string;
  tipo?: TipoHospital;
  gestao?: GestaoHospital;
  perfil?: PerfilHospital;
  complexidade?: ComplexidadeHospital;
  numeroTotalLeitos?: number;
  numeroLeitosUTI?: number;
  numeroSalasCirurgicas?: number;
}

export { TipoHospital, GestaoHospital, PerfilHospital, ComplexidadeHospital };
