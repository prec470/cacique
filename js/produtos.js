import { renderEvolucao } from "./charts.js";
import { carregarLedger, carregarComercios } from "./store.js";

const els = {
	busca: document.getElementById("busca"),
	emptyLista: document.getElementById("emptyLista"),
	tabelaLista: document.getElementById("tabelaLista"),
	tbodyLista: document.getElementById("tbodyLista"),
	cardDetalhe: document.getElementById("cardDetalhe"),
	detalheTitulo: document.getElementById("detalheTitulo"),
	detalhePeriodo: document.getElementById("detalhePeriodo"),
	detalheQtd: document.getElementById("detalheQtd"),
	detalheTotal: document.getElementById("detalheTotal"),
	detalheMedio: document.getElementById("detalheMedio"),
	detalheMinMax: document.getElementById("detalheMinMax"),
	detalheChart: document.getElementById("detalheChart"),
	tbodyComercios: document.getElementById("tbodyComercios"),
	tbodyHistorico: document.getElementById("tbodyHistorico"),
};

const ledger = carregarLedger();
const comercios = carregarComercios();

function fmtGs(valor) {
	if (valor == null || Number.isNaN(valor)) return "—";
	return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(valor) + " Gs";
}

function nomeComercio(ruc) {
	return comercios[ruc]?.nome || ruc;
}

function normalizarDescricao(s) {
	return s.trim().toUpperCase().replace(/\s+/g, " ");
}

function dataDe(iso) {
	return new Date(iso.length > 10 ? iso : iso + "T00:00:00");
}

// --- Monta a lista plana de compras a partir do ledger ---
function todasCompras() {
	const compras = [];
	for (const r of ledger) {
		if (!Array.isArray(r.itens) || !r.itens.length) continue;
		for (const item of r.itens) {
			if (!item.descricao || !item.quantidade) continue;
			compras.push({
				descricao: item.descricao,
				codigo: item.codigo || null,
				quantidade: item.quantidade,
				precoUnitario: item.precoUnitario,
				subtotal: item.quantidade * item.precoUnitario,
				data: dataDe(r.emissao),
				ruc: r.emissor.ruc,
				cdc: r.cdc,
			});
		}
	}
	return compras;
}

// --- Agrupa por descrição normalizada ---
function agruparProdutos(compras) {
	const grupos = new Map();
	for (const c of compras) {
		const chave = normalizarDescricao(c.descricao);
		if (!grupos.has(chave)) grupos.set(chave, { chave, descricaoExibicao: c.descricao, compras: [] });
		grupos.get(chave).compras.push(c);
	}
	return grupos;
}

const compras = todasCompras();
const produtos = agruparProdutos(compras);
let produtoSelecionado = null;

// --- Lista de produtos ---
function renderLista() {
	const termo = els.busca.value.trim().toUpperCase();
	const linhas = [...produtos.values()]
		.filter((p) => !termo || p.chave.includes(termo))
		.map((p) => ({
			p,
			totalGasto: p.compras.reduce((s, c) => s + c.subtotal, 0),
			rucs: new Set(p.compras.map((c) => c.ruc)),
		}))
		.sort((a, b) => b.totalGasto - a.totalGasto);

	els.emptyLista.style.display = linhas.length ? "none" : "block";
	els.tabelaLista.style.display = linhas.length ? "" : "none";
	els.tbodyLista.innerHTML = "";

	for (const { p, totalGasto, rucs } of linhas) {
		const tr = document.createElement("tr");
		tr.style.cursor = "pointer";
		tr.innerHTML = `
			<td>${p.descricaoExibicao}</td>
			<td>${p.compras.length}</td>
			<td>${rucs.size}</td>
			<td>${fmtGs(totalGasto)}</td>
		`;
		tr.addEventListener("click", () => selecionarProduto(p.chave));
		els.tbodyLista.appendChild(tr);
	}

	if (!produtos.size) {
		els.emptyLista.style.display = "block";
		els.emptyLista.textContent = "Nenhum item registrado ainda — importe XMLs na página Itens pra começar.";
	} else if (!linhas.length) {
		els.emptyLista.style.display = "block";
		els.emptyLista.textContent = "Nenhum produto encontrado com esse termo.";
	}
}

// --- Filtro de período (mesma lógica do dashboard) ---
function periodoParaIntervalo(valor) {
	const agora = new Date();
	const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
	let inicio;
	if (valor === "mes") inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
	else if (valor === "30d") inicio = new Date(fim.getTime() - 30 * 86400000);
	else if (valor === "90d") inicio = new Date(fim.getTime() - 90 * 86400000);
	else if (valor === "ano") inicio = new Date(agora.getFullYear(), 0, 1);
	else return null;
	return { inicio, fim };
}

function selecionarProduto(chave) {
	produtoSelecionado = chave;
	els.cardDetalhe.style.display = "";
	renderDetalhe();
	els.cardDetalhe.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDetalhe() {
	const produto = produtos.get(produtoSelecionado);
	if (!produto) return;

	const intervalo = periodoParaIntervalo(els.detalhePeriodo.value);
	const comprasFiltradas = intervalo
		? produto.compras.filter((c) => c.data >= intervalo.inicio && c.data <= intervalo.fim)
		: produto.compras;

	els.detalheTitulo.textContent = produto.descricaoExibicao;

	if (!comprasFiltradas.length) {
		els.detalheQtd.textContent = "0";
		els.detalheTotal.textContent = "—";
		els.detalheMedio.textContent = "—";
		els.detalheMinMax.textContent = "—";
		els.detalheChart.innerHTML = '<p class="empty">Sem compras desse produto no período.</p>';
		els.tbodyComercios.innerHTML = "";
		els.tbodyHistorico.innerHTML = "";
		return;
	}

	const qtdTotal = comprasFiltradas.reduce((s, c) => s + c.quantidade, 0);
	const gastoTotal = comprasFiltradas.reduce((s, c) => s + c.subtotal, 0);
	const precoMedio = gastoTotal / qtdTotal;
	const precos = comprasFiltradas.map((c) => c.precoUnitario);

	els.detalheQtd.textContent = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(qtdTotal);
	els.detalheTotal.textContent = fmtGs(gastoTotal);
	els.detalheMedio.textContent = fmtGs(precoMedio);
	els.detalheMinMax.textContent = `${fmtGs(Math.min(...precos))} / ${fmtGs(Math.max(...precos))}`;

	// Agrupa por comércio pra colorir o gráfico e montar a tabela de comparação,
	// ordenado por total gasto desc (comércios com mais peso primeiro nas cores).
	const porComercio = new Map();
	for (const c of comprasFiltradas) {
		if (!porComercio.has(c.ruc)) porComercio.set(c.ruc, []);
		porComercio.get(c.ruc).push(c);
	}
	const gruposComercio = [...porComercio.entries()]
		.map(([ruc, lista]) => ({ ruc, lista, gasto: lista.reduce((s, c) => s + c.subtotal, 0) }))
		.sort((a, b) => b.gasto - a.gasto);

	renderEvolucao(
		els.detalheChart,
		gruposComercio.map((g) => ({
			label: nomeComercio(g.ruc),
			pontos: g.lista.map((c) => ({ x: c.data, y: c.precoUnitario })),
		})),
		{ formatador: fmtGs },
	);

	els.tbodyComercios.innerHTML = "";
	for (const g of gruposComercio) {
		const precosG = g.lista.map((c) => c.precoUnitario);
		const ultima = g.lista.reduce((max, c) => (c.data > max ? c.data : max), g.lista[0].data);
		const mediaG = g.lista.reduce((s, c) => s + c.subtotal, 0) / g.lista.reduce((s, c) => s + c.quantidade, 0);
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${nomeComercio(g.ruc)}</td>
			<td>${g.lista.length}</td>
			<td>${fmtGs(mediaG)}</td>
			<td>${fmtGs(Math.min(...precosG))}</td>
			<td>${fmtGs(Math.max(...precosG))}</td>
			<td>${ultima.toLocaleDateString("pt-BR")}</td>
		`;
		els.tbodyComercios.appendChild(tr);
	}

	els.tbodyHistorico.innerHTML = "";
	const ordenadas = [...comprasFiltradas].sort((a, b) => b.data - a.data);
	for (const c of ordenadas) {
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${c.data.toLocaleDateString("pt-BR")}</td>
			<td>${nomeComercio(c.ruc)}</td>
			<td>${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(c.quantidade)}</td>
			<td>${fmtGs(c.precoUnitario)}</td>
			<td>${fmtGs(c.subtotal)}</td>
		`;
		els.tbodyHistorico.appendChild(tr);
	}
}

els.busca.addEventListener("input", renderLista);
els.detalhePeriodo.addEventListener("change", renderDetalhe);
window.addEventListener("resize", () => {
	clearTimeout(window.__caciqueResize);
	window.__caciqueResize = setTimeout(() => {
		if (produtoSelecionado) renderDetalhe();
	}, 200);
});

renderLista();
