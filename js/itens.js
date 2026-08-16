import { carregarLedger, salvarLedger, atualizarRegistroLedger, carregarComercios, salvarComercios } from "./store.js";
import { parseTextoItens } from "./itens-parse.js";
import { parseXmlDE, XmlInvalidoError } from "./xml-parse.js";

const els = {
	statPendentes: document.getElementById("statPendentes"),
	statCompletas: document.getElementById("statCompletas"),
	statSemItens: document.getElementById("statSemItens"),
	listaPendentes: document.getElementById("listaPendentes"),
	emptyPendentes: document.getElementById("emptyPendentes"),
	listaCompletas: document.getElementById("listaCompletas"),
	toggleCompletas: document.getElementById("toggleCompletas"),
	toggleCompletasLabel: document.getElementById("toggleCompletasLabel"),
	toast: document.getElementById("toast"),
	tplNota: document.getElementById("tplNota"),
	tplItemLinha: document.getElementById("tplItemLinha"),
	dropzoneXml: document.getElementById("dropzoneXml"),
	fileImportXml: document.getElementById("fileImportXml"),
};

let ledger = carregarLedger();
const comercios = carregarComercios();

function mostrarToast(msg, ms = 2400) {
	els.toast.textContent = msg;
	els.toast.classList.add("show");
	clearTimeout(mostrarToast._t);
	mostrarToast._t = setTimeout(() => els.toast.classList.remove("show"), ms);
}

function fmtGs(valor) {
	if (valor == null || Number.isNaN(valor)) return "—";
	return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(valor) + " Gs";
}

function nomeComercio(ruc) {
	return comercios[ruc]?.nome || ruc;
}

function salvarPatch(cdc, patch) {
	ledger = atualizarRegistroLedger(ledger, cdc, patch);
	salvarLedger(ledger);
}

function adicionarLinhaItem(container, item) {
	const frag = els.tplItemLinha.content.cloneNode(true);
	const linha = frag.querySelector(".item-linha");
	linha.querySelector(".campo-descricao").value = item?.descricao || "";
	linha.querySelector(".campo-qtd").value = item?.quantidade ?? 1;
	linha.querySelector(".campo-preco").value = item?.precoUnitario ?? "";
	if (item?.codigo) linha.dataset.codigo = item.codigo;
	container.appendChild(frag);
}

function lerLinhasItens(container) {
	const itens = [];
	for (const linha of container.querySelectorAll(".item-linha")) {
		const descricao = linha.querySelector(".campo-descricao").value.trim();
		const quantidade = parseFloat(linha.querySelector(".campo-qtd").value) || 0;
		const precoUnitario = parseFloat(linha.querySelector(".campo-preco").value) || 0;
		if (!descricao) continue;
		const item = { descricao, quantidade, precoUnitario };
		if (linha.dataset.codigo) item.codigo = linha.dataset.codigo;
		itens.push(item);
	}
	return itens;
}

function atualizarSubtotais(container, comparacaoEl, totalNota) {
	let soma = 0;
	for (const linha of container.querySelectorAll(".item-linha")) {
		const q = parseFloat(linha.querySelector(".campo-qtd").value) || 0;
		const p = parseFloat(linha.querySelector(".campo-preco").value) || 0;
		const sub = q * p;
		soma += sub;
		linha.querySelector(".campo-subtotal").textContent = sub ? fmtGs(sub) : "";
	}
	if (!comparacaoEl) return;
	if (totalNota == null) {
		comparacaoEl.textContent = `Soma dos itens: ${fmtGs(soma)}`;
		return;
	}
	const diff = soma - totalNota;
	if (Math.abs(diff) < 1) {
		comparacaoEl.innerHTML = `Soma dos itens: ${fmtGs(soma)} · bate com o total ✓`;
	} else {
		comparacaoEl.innerHTML = `Soma dos itens: ${fmtGs(soma)} · total da nota: ${fmtGs(totalNota)} (diferença de ${fmtGs(Math.abs(diff))})`;
	}
}

function montarCard(registro) {
	const frag = els.tplNota.content.cloneNode(true);
	const card = frag.querySelector(".nota-item");
	const data = registro.emissao ? registro.emissao.replace("T", " ").slice(0, 16) : "—";
	const credito = registro.tipoDocumento.codigo === "05";

	card.querySelector(".nota-cabecalho").textContent = `${nomeComercio(registro.emissor.ruc)} — ${fmtGs(registro.totalOperacao)}`;
	card.querySelector(".nota-sub").innerHTML =
		`${data} · ${registro.quantidadeItens ?? "?"} item(ns) esperado(s)` +
		(credito ? ' · <span class="chip credito"><span class="dot"></span>Nota de Crédito</span>' : "");
	card.querySelector(".nota-link").href = registro.sifen.urlConsulta;

	const linhasContainer = card.querySelector(".itens-linhas");
	const comparacaoEl = card.querySelector(".comparacao");
	const colarEl = card.querySelector(".campo-colar");

	for (const item of Array.isArray(registro.itens) && registro.itens.length ? registro.itens : []) {
		adicionarLinhaItem(linhasContainer, item);
	}
	if (!linhasContainer.children.length) adicionarLinhaItem(linhasContainer, null);
	atualizarSubtotais(linhasContainer, comparacaoEl, registro.totalOperacao);

	linhasContainer.addEventListener("input", () => atualizarSubtotais(linhasContainer, comparacaoEl, registro.totalOperacao));

	card.addEventListener("click", (ev) => {
		const acao = ev.target.closest("[data-acao]")?.dataset.acao;
		if (!acao) return;
		if (acao === "add-item") {
			adicionarLinhaItem(linhasContainer, null);
		} else if (acao === "remover-item") {
			ev.target.closest(".item-linha").remove();
			atualizarSubtotais(linhasContainer, comparacaoEl, registro.totalOperacao);
		} else if (acao === "tentar-preencher") {
			const itens = parseTextoItens(colarEl.value);
			if (!itens.length) {
				mostrarToast("Não encontrei linhas com valor nesse texto — preencha manualmente.");
				return;
			}
			for (const it of itens) adicionarLinhaItem(linhasContainer, it);
			atualizarSubtotais(linhasContainer, comparacaoEl, registro.totalOperacao);
			mostrarToast(`${itens.length} linha(s) pré-preenchida(s) — confira antes de salvar.`);
		} else if (acao === "sem-itens") {
			salvarPatch(registro.cdc, { itens: [] });
			mostrarToast("Marcada como sem itens.");
			renderTudo();
		} else if (acao === "salvar-itens") {
			const itens = lerLinhasItens(linhasContainer);
			if (!itens.length) {
				mostrarToast("Adicione ao menos um item, ou use 'Marcar sem itens'.");
				return;
			}
			salvarPatch(registro.cdc, { itens });
			mostrarToast(`${itens.length} item(ns) salvo(s).`);
			renderTudo();
		}
	});

	return card;
}

function renderTudo() {
	const pendentes = ledger.filter((r) => r.itens == null);
	const completas = ledger.filter((r) => Array.isArray(r.itens) && r.itens.length > 0);
	const semItens = ledger.filter((r) => Array.isArray(r.itens) && r.itens.length === 0);

	els.statPendentes.textContent = pendentes.length;
	els.statCompletas.textContent = completas.length;
	els.statSemItens.textContent = semItens.length;

	els.listaPendentes.innerHTML = "";
	els.emptyPendentes.style.display = pendentes.length ? "none" : "block";
	const ordenadas = [...pendentes].sort((a, b) => (a.emissao < b.emissao ? 1 : -1));
	for (const r of ordenadas) els.listaPendentes.appendChild(montarCard(r));

	els.listaCompletas.innerHTML = "";
	const ordenadasCompletas = [...completas].sort((a, b) => (a.emissao < b.emissao ? 1 : -1));
	for (const r of ordenadasCompletas) els.listaCompletas.appendChild(montarCard(r));
}

els.toggleCompletas.addEventListener("click", () => {
	const aberto = els.listaCompletas.style.display !== "none";
	els.listaCompletas.style.display = aberto ? "none" : "";
	els.toggleCompletasLabel.textContent = aberto ? "mostrar" : "esconder";
});

// --- Importar XML da consulta oficial ---
async function importarXmls(fileList) {
	const arquivos = Array.from(fileList).filter((f) => /\.xml$/i.test(f.name) || f.type.includes("xml"));
	if (!arquivos.length) return;
	let atualizadas = 0;
	let naoEncontradas = 0;
	let erros = 0;
	let comerciosNomeados = 0;
	for (const arquivo of arquivos) {
		try {
			const texto = await arquivo.text();
			const { cdc, emissor, itens } = parseXmlDE(texto);
			if (!ledger.some((r) => r.cdc === cdc)) {
				naoEncontradas++;
				continue;
			}
			ledger = atualizarRegistroLedger(ledger, cdc, { itens });
			atualizadas++;
			// O XML traz o nome oficial do emissor — preenche o cadastro se ainda
			// não tiver nome (não sobrescreve um apelido que o usuário já deu).
			if (emissor && !comercios[emissor.ruc]?.nome) {
				comercios[emissor.ruc] = { ...comercios[emissor.ruc], nome: emissor.nome };
				comerciosNomeados++;
			}
		} catch (e) {
			erros++;
			console.error(arquivo.name, e);
		}
	}
	salvarLedger(ledger);
	if (comerciosNomeados) salvarComercios(comercios);
	const partes = [`${atualizadas} nota(s) atualizada(s)`];
	if (comerciosNomeados) partes.push(`${comerciosNomeados} comércio(s) nomeado(s) automaticamente`);
	if (naoEncontradas) partes.push(`${naoEncontradas} sem nota correspondente (importe a nota antes, pelo Capturador)`);
	if (erros) partes.push(`${erros} arquivo(s) inválido(s)`);
	mostrarToast(partes.join(" · "), 4600);
	renderTudo();
}

els.fileImportXml.addEventListener("change", (e) => {
	if (e.target.files.length) importarXmls(e.target.files);
	e.target.value = "";
});
["dragenter", "dragover"].forEach((ev) =>
	els.dropzoneXml.addEventListener(ev, (e) => {
		e.preventDefault();
		els.dropzoneXml.classList.add("over");
	}),
);
["dragleave", "drop"].forEach((ev) =>
	els.dropzoneXml.addEventListener(ev, (e) => {
		e.preventDefault();
		els.dropzoneXml.classList.remove("over");
	}),
);
els.dropzoneXml.addEventListener("drop", (e) => {
	if (e.dataTransfer?.files?.length) importarXmls(e.dataTransfer.files);
});
els.dropzoneXml.addEventListener("click", () => els.fileImportXml.click());

renderTudo();
