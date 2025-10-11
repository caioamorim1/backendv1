
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


export interface Questionnaire {
    id: number;
    name: string;
    questions: Question[];
    createdAt: string;
    updatedAt: string;
}

export interface Question {
    id: number;
    text: string;
    type: 'sim-nao-na' | 'texto' | 'numero' | 'data' | 'multipla-escolha';
    weight: number;
    categoryId: number;
    options?: string[]; // Para múltipla escolha
}