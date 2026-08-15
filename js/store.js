// Cacique — persistência local (localStorage). Compartilhado entre capturador e dashboard.

const KEY_LEDGER = "cacique:ledger:v1";
const KEY_APELIDOS = "cacique:apelidos:v1";
const KEY_PENDENTES = "cacique:pendentes:v1";

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

export function carregarApelidos() {
	return ler(KEY_APELIDOS, {});
}

export function salvarApelidos(mapa) {
	gravar(KEY_APELIDOS, mapa);
}

export function carregarPendentes() {
	return ler(KEY_PENDENTES, []);
}

export function salvarPendentes(lista) {
	gravar(KEY_PENDENTES, lista);
}
