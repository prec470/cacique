// Cacique — parsing best-effort de texto colado (copiado da consulta pública do
// e-Kuatia) pra pré-preencher itens de uma nota. Sempre um ponto de partida:
// o usuário confere/corrige antes de salvar, nunca é aceito sem revisão.

function extrairNumeros(linha) {
	return linha.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d+/g) || [];
}

function paraNumero(token) {
	if (token.includes(",") && token.includes(".")) {
		return parseFloat(token.replace(/\./g, "").replace(",", "."));
	}
	if (token.includes(",")) {
		return parseFloat(token.replace(",", "."));
	}
	if (token.includes(".")) {
		// no contexto de Gs, ponto em grupos de 3 dígitos é separador de milhar
		return parseFloat(token.replace(/\./g, ""));
	}
	return parseFloat(token);
}

const LINHA_IGNORAR = /^(sku|descrip|cant\.?|precio|total|iva|c[oó]digo)\b/i;

export function parseTextoItens(texto) {
	if (!texto || !texto.trim()) return [];
	const linhas = texto.split(/\r?\n/);
	const itens = [];
	for (const linhaBruta of linhas) {
		const linha = linhaBruta.trim();
		if (!linha || LINHA_IGNORAR.test(linha)) continue;
		const numeros = extrairNumeros(linha);
		if (!numeros.length) continue;

		const ultimo = numeros[numeros.length - 1];
		const idxUltimo = linha.lastIndexOf(ultimo);
		let descricao = linha
			.slice(0, idxUltimo)
			.replace(/^\(\d+\)\s*/, "") // remove código tipo "(51859502) "
			.replace(/[-.:x×]+\s*$/i, "")
			.trim();
		if (!descricao) continue;

		const precoUnitario = paraNumero(ultimo);
		if (!Number.isFinite(precoUnitario) || precoUnitario <= 0) continue;

		itens.push({ descricao, quantidade: 1, precoUnitario });
	}
	return itens;
}
