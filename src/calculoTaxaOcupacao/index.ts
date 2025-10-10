// src/index.ts

import { calcularProjecao } from './calculation';
import { ProjecaoParams } from './interfaces';

// --- PARÂMETROS DE ENTRADA ---
// Estes valores são os inputs que você pode obter de um formulário, banco de dados ou API.
const parametros: ProjecaoParams = {
    // Quadro existente
    quadroAtualEnfermeiros: 4,
    quadroAtualTecnicos: 14,

    // Base de cálculo
    leitos: 30,
    ocupacaoBase: 0.6,
    theBase: 36, // Atenção: O CSV mostra 92 e 60, mas 36 é o resultado de 60 * 0.6. Use o valor BASE real.
    enfNecessariosBase: 6.78,
    tecNecessariosBase: 13.78,

    // Meta livre
    metaLivreOcupacao: 0.75, // Alterado para 75% para um exemplo diferente
};

// --- EXECUÇÃO DO CÁLCULO ---
const resultado = calcularProjecao(parametros);

// --- EXIBIÇÃO DOS RESULTADOS ---
console.log('--- PARÂMETROS UTILIZADOS ---');
console.table(parametros);

console.log('\n--- RESULTADOS CALCULADOS ---');

console.log('\n2) Derivações a partir do BASE (valores para 100% de ocupação):');
console.log(`   - THE a 100% (h/dia): ${resultado.the100pct.toFixed(2)}`);
console.log(`   - Enfermeiros a 100% (FTE): ${resultado.enf100pctFTE.toFixed(2)}`);
console.log(`   - Técnicos a 100% (FTE): ${resultado.tec100pctFTE.toFixed(2)}`);

console.log('\n3) Ocupação MÁXIMA atendível com o quadro atual:');
console.log(`   - Resultado: ${(resultado.ocupacaoMaximaAtendivel * 100).toFixed(2)}%`);

console.log('\n4) Tabela: GAP de profissionais para alcançar metas de ocupação:');
console.table(resultado.tabelaGapMetas.map(row => ({
    'Meta Ocupação': `${(row.metaOcupacao * 100).toFixed(0)}%`,
    'Enf. Necessários': row.enfNecessariosArredondado,
    'Tec. Necessários': row.tecNecessariosArredondado,
    'GAP Enfermeiros': row.gapEnf,
    'GAP Técnicos': row.gapTec,
})));

console.log('\n5) Análise para a META LIVRE de ocupação:');
console.log(`   - Meta Livre Definida: ${(resultado.analiseMetaLivre.metaOcupacao * 100).toFixed(0)}%`);
console.log('   - ---');
console.log(`   - Enfermeiros necessários (pessoas): ${resultado.analiseMetaLivre.enfNecessariosArredondado}`);
console.log(`   - Técnicos necessários (pessoas): ${resultado.analiseMetaLivre.tecNecessariosArredondado}`);
console.log(`   - GAP Enfermeiros (pessoas): ${resultado.analiseMetaLivre.gapEnf}`);
console.log(`   - GAP Técnicos (pessoas): ${resultado.analiseMetaLivre.gapTec}`);