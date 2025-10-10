
export interface QualitativeCategory {
    id: number;
    name: string;
    meta: number;
}


export interface ListQualitativeCategoryDTO {
    nome?: string;
    page?: number;
    limit?: number;
}