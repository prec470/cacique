// Cacique — persistência local (localStorage). Compartilhado entre capturador e dashboard.

const KEY_LEDGER = "cacique:ledger:v1";
const KEY_COMERCIOS = "cacique:apelidos:v1";
const KEY_PENDENTES = "cacique:pendentes:v1";

// Categorias fixas pra facilitar agrupar/filtrar comércios depois (texto livre fragmenta demais).
export const TIPOS_COMERCIO = [
	"Supermercado / Almacén",
	"Farmácia",
	"Restaurante / Bar",
	"Combustível / Posto",
	"Vestuário / Calçados",
	"Eletrônicos / Informática",
	"Casa / Ferragens",
	"Saúde",
	"Educação",
	"Transporte",
	"Lazer",
	"Serviços",
	"Outro",
];

function ler(chave, padrao) {
	try {
		const raw = localStorage.getItem(chave);
		return raw ? JSON.parse(raw) : padrao;
	} catch {
		return padrao;
	}
}

function gravar(chave, valor) {
	localStorage.setItem(chave, JSON.stringify(valor));
}

export function carregarLedger() {
	return ler(KEY_LEDGER, []);
}

export function salvarLedger(lista) {
	gravar(KEY_LEDGER, lista);
}

// Retorna um novo ledger com o registro de CDC informado atualizado (shallow merge).
export function atualizarRegistroLedger(ledger, cdc, patch) {
	return ledger.map((r) => (r.cdc === cdc ? { ...r, ...patch } : r));
}

// Funde novos registros no ledger existente, ignorando CDCs já presentes.
export function mesclarNoLedger(existentes, novos) {
	const vistos = new Set(existentes.map((r) => r.cdc));
	const adicionadas = [];
	let duplicadas = 0;
	for (const r of novos) {
		if (vistos.has(r.cdc)) {
			duplicadas++;
			continue;
		}
		vistos.add(r.cdc);
		adicionadas.push(r);
	}
	return { ledger: [...existentes, ...adicionadas], adicionadas: adicionadas.length, duplicadas };
}

// Mapa ruc -> { nome, tipo }. Chave de storage mantida como "apelidos" por
// compatibilidade com dados já salvos; o conteúdo cresceu pra incluir o tipo.
export function carregarComercios() {
	return ler(KEY_COMERCIOS, {});
}

export function salvarComercios(mapa) {
	gravar(KEY_COMERCIOS, mapa);
}

// Funde um mapa de comércios importado sobre o existente (importado tem prioridade
// campo a campo, mas não apaga comércios que só existem no lado local).
export function mesclarComercios(existentes, importados) {
	const resultado = { ...existentes };
	let atualizados = 0;
	for (const [ruc, dados] of Object.entries(importados || {})) {
		if (!ruc) continue;
		resultado[ruc] = { ...resultado[ruc], ...dados };
		atualizados++;
	}
	return { comercios: resultado, atualizados };
}

export function carregarPendentes() {
	return ler(KEY_PENDENTES, []);
}

export function salvarPendentes(lista) {
	gravar(KEY_PENDENTES, lista);
}
