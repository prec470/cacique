// Cacique — parsing do QR code das notas fiscais eletrônicas do Paraguai (SIFEN / e-Kuatia).
// Funções puras, sem dependência de DOM — testáveis via Node.

export const TIPOS_DOCUMENTO = {
	"01": "Factura Electrónica",
	"04": "Autofactura Electrónica",
	"05": "Nota de Crédito Electrónica",
	"06": "Nota de Débito Electrónica",
	"07": "Nota de Remisión Electrónica",
	"08": "Comprobante de Retención Electrónico",
};

// Notas de crédito abatem do total gasto; os demais tipos somam.
export function sinalFinanceiro(tipoDocumento) {
	return tipoDocumento === "05" ? -1 : 1;
}

// A SET formata os números do QR de formas inconsistentes entre comércios:
// "239000.0000" (decimal padrão), "488.779,0000" (milhar com ponto, decimal com vírgula),
// "28,0000" (vírgula como decimal), "0E-8" (notação científica). Esta função cobre os 3 padrões.
export function parseNumeroSifen(valor) {
	if (valor == null) return null;
	const s = String(valor).trim();
	if (s === "") return null;
	if (/^-?\d+(\.\d+)?[eE][-+]?\d+$/.test(s)) return parseFloat(s);
	if (s.includes(",") && s.includes(".")) {
		return parseFloat(s.replace(/\./g, "").replace(",", "."));
	}
	if (s.includes(",")) {
		return parseFloat(s.replace(",", "."));
	}
	return parseFloat(s);
}

export function hexParaTexto(hex) {
	if (!hex) return "";
	let out = "";
	for (let i = 0; i + 1 < hex.length; i += 2) {
		out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
	}
	return out;
}

// Estrutura da CDC (Código de Control, 44 dígitos) conforme Manual Técnico SIFEN,
// validada cruzando a data embutida (posições 26-33) com dFeEmiDE decodificado do QR
// em 8 notas reais de comércios diferentes.
export function parseCDC(cdc) {
	if (!cdc || cdc.length !== 44 || !/^\d{44}$/.test(cdc)) return null;
	const tipoDocumento = cdc.slice(0, 2);
	const rucBase = cdc.slice(2, 10);
	const rucDV = cdc.slice(10, 11);
	const estabelecimento = cdc.slice(11, 14);
	const pontoExpedicao = cdc.slice(14, 17);
	const numeroDocumento = cdc.slice(17, 24);
	const tipoContribuinte = cdc.slice(24, 25);
	const fecha = cdc.slice(25, 33); // AAAAMMDD
	const tipoEmissao = cdc.slice(33, 34);
	const codigoSeguranca = cdc.slice(34, 43);
	const dvCdc = cdc.slice(43, 44);
	return {
		tipoDocumento,
		ruc: `${rucBase}-${rucDV}`,
		rucBase,
		rucDV,
		estabelecimento,
		pontoExpedicao,
		numeroDocumento,
		numeroCompleto: `${estabelecimento}-${pontoExpedicao}-${numeroDocumento}`,
		tipoContribuinte,
		dataEmissaoCDC: `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`,
		tipoEmissao,
		codigoSeguranca,
		dvCdc,
	};
}

export class QrInvalidoError extends Error {}

// Recebe o texto bruto lido do QR (uma URL) e devolve o registro padronizado da nota.
export function parseTextoQr(texto, meta = {}) {
	let url;
	try {
		url = new URL(texto);
	} catch {
		throw new QrInvalidoError("O código lido não é uma URL.");
	}
	if (!url.hostname.endsWith("ekuatia.set.gov.py")) {
		throw new QrInvalidoError("O código lido não é do e-Kuatia (SET Paraguai).");
	}
	// Nem todo emissor/PDV segue a grafia exata dos nomes de parâmetro (ex.: "id" em vez de "Id"),
	// então a busca ignora maiúsculas/minúsculas em vez de depender só de searchParams.get().
	const chaves = new Map();
	for (const chave of url.searchParams.keys()) {
		const k = chave.toLowerCase();
		if (!chaves.has(k)) chaves.set(k, chave);
	}
	const getCI = (nome) => {
		const original = chaves.get(nome.toLowerCase());
		return original != null ? url.searchParams.get(original) : null;
	};

	const id = getCI("Id") || "";
	const nVersion = getCI("nVersion") || "";
	const dFeEmiDE = getCI("dFeEmiDE") || "";
	const dTotGralOpe = getCI("dTotGralOpe");
	const dTotIVA = getCI("dTotIVA");
	const cItems = getCI("cItems");
	const dRucRec = getCI("dRucRec");
	const dNumIDRec = getCI("dNumIDRec");
	const digestValue = getCI("DigestValue") || "";
	const idCSC = getCI("IdCSC") || "";
	const cHashQR = getCI("cHashQR") || "";

	if (!id || !nVersion) {
		throw new QrInvalidoError("QR do e-Kuatia sem os parâmetros esperados (Id/nVersion).");
	}

	const cdcInfo = parseCDC(id);
	if (!cdcInfo) {
		throw new QrInvalidoError("CDC inválida (esperado 44 dígitos).");
	}

	const emissaoHex = hexParaTexto(dFeEmiDE);
	const emissaoIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(emissaoHex)
		? emissaoHex
		: null;

	const receptor = dNumIDRec
		? { tipo: "documento", valor: dNumIDRec }
		: dRucRec
			? { tipo: "ruc", valor: dRucRec }
			: null;

	const tipoDocumento = cdcInfo.tipoDocumento;

	return {
		versaoRegistro: 1,
		cdc: id,
		tipoDocumento: {
			codigo: tipoDocumento,
			descricao: TIPOS_DOCUMENTO[tipoDocumento] || `Documento tipo ${tipoDocumento}`,
		},
		sinalFinanceiro: sinalFinanceiro(tipoDocumento),
		emissor: {
			ruc: cdcInfo.ruc,
			rucBase: cdcInfo.rucBase,
			rucDV: cdcInfo.rucDV,
			estabelecimento: cdcInfo.estabelecimento,
			pontoExpedicao: cdcInfo.pontoExpedicao,
			numeroDocumento: cdcInfo.numeroDocumento,
			numeroCompleto: cdcInfo.numeroCompleto,
		},
		receptor,
		emissao: emissaoIso || cdcInfo.dataEmissaoCDC,
		totalOperacao: parseNumeroSifen(dTotGralOpe),
		totalIVA: parseNumeroSifen(dTotIVA),
		quantidadeItens: cItems != null ? Math.round(parseNumeroSifen(cItems)) : null,
		moeda: "PYG",
		categoria: null,
		// null = itens ainda não conferidos (a lista de itens exige abrir o link e resolver
		// o captcha da SET); [] = usuário conferiu e marcou como sem itens relevantes;
		// [...] = itens registrados manualmente a partir da consulta.
		itens: null,
		sifen: {
			nVersion,
			digestValue,
			idCSC,
			cHashQR,
			urlConsulta: url.toString(),
		},
		captura: {
			em: meta.em || new Date().toISOString(),
			origem: meta.origem || "desconhecida",
			arquivo: meta.arquivo || null,
		},
	};
}
