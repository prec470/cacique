// Cacique — parsing do XML "Documento Electrónico" (DE) baixado da consulta
// pública do e-Kuatia. Estrutura oficial SIFEN (siRecepDE_v150.xsd): a CDC vem
// no atributo Id de <DE>, e cada produto é um <gCamItem> dentro de <gDtipDE>.

const NS_SIFEN = "http://ekuatia.set.gov.py/sifen/xsd";

export class XmlInvalidoError extends Error {}

function primeiroTexto(el, tag) {
	const nos = el.getElementsByTagNameNS(NS_SIFEN, tag);
	return nos.length ? nos[0].textContent.trim() : null;
}

function primeiroNumero(el, tag) {
	const t = primeiroTexto(el, tag);
	return t == null || t === "" ? null : parseFloat(t);
}

// Retorna { cdc, itens: [{ descricao, quantidade, precoUnitario }] }.
export function parseXmlDE(textoXml) {
	let dom;
	try {
		dom = new DOMParser().parseFromString(textoXml, "application/xml");
	} catch {
		throw new XmlInvalidoError("Não consegui ler esse arquivo como XML.");
	}
	if (dom.getElementsByTagName("parsererror").length) {
		throw new XmlInvalidoError("XML inválido ou corrompido.");
	}

	const deList = dom.getElementsByTagNameNS(NS_SIFEN, "DE");
	if (!deList.length) {
		throw new XmlInvalidoError("Esse XML não parece ser um Documento Electrónico do e-Kuatia (tag <DE> não encontrada).");
	}
	const deEl = deList[0];
	const cdc = deEl.getAttribute("Id");
	if (!cdc || !/^\d{44}$/.test(cdc)) {
		throw new XmlInvalidoError("CDC não encontrada ou inválida no XML (esperado 44 dígitos no atributo Id de <DE>).");
	}

	const itens = [];
	for (const itemEl of deEl.getElementsByTagNameNS(NS_SIFEN, "gCamItem")) {
		const descricao = primeiroTexto(itemEl, "dDesProSer");
		if (!descricao) continue;
		const quantidade = primeiroNumero(itemEl, "dCantProSer") ?? 1;
		const precoLista = primeiroNumero(itemEl, "dPUniProSer");
		// dTotOpeItem (dentro de gValorRestaItem) é o total líquido do item, já
		// descontado — mais fiel ao que foi realmente pago do que o preço de lista.
		const totalLiquido = primeiroNumero(itemEl, "dTotOpeItem");
		const totalBruto = primeiroNumero(itemEl, "dTotBruOpeItem");
		const total = totalLiquido ?? totalBruto ?? (quantidade && precoLista ? quantidade * precoLista : null);
		const precoUnitario = total != null && quantidade ? total / quantidade : (precoLista ?? 0);
		itens.push({ descricao, quantidade, precoUnitario });
	}

	return { cdc, itens };
}
