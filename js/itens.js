import { carregarLedger, salvarLedger, atualizarRegistroLedger, carregarComercios } from "./store.js";
import { parseTextoItens } from "./itens-parse.js";

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
	container.appendChild(frag);
}

function lerLinhasItens(container) {
	const itens = [];
	for (const linha of container.querySelectorAll(".item-linha")) {
		const descricao = linha.querySelector(".campo-descricao").value.trim();
		const quantidade = parseFloat(linha.querySelector(".campo-qtd").value) || 0;
		const precoUnitario = parseFloat(linha.querySelector(".campo-preco").value) || 0;
		if (!descricao) continue;
		itens.push({ descricao, quantidade, precoUnitario });
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

renderTudo();
