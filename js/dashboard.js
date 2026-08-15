import { renderColunas, renderRanking } from "./charts.js";
import {
	carregarLedger,
	salvarLedger,
	mesclarNoLedger,
	carregarApelidos,
	salvarApelidos,
	carregarPendentes,
	salvarPendentes,
} from "./store.js";

const els = {
	banner: document.getElementById("bannerPendentes"),
	bannerTexto: document.getElementById("bannerTexto"),
	btnImportarPendentes: document.getElementById("btnImportarPendentes"),
	btnDescartarPendentes: document.getElementById("btnDescartarPendentes"),
	fileImport: document.getElementById("fileImport"),
	dropzone: document.getElementById("dropzone"),
	periodo: document.getElementById("periodo"),
	busca: document.getElementById("busca"),
	statTotal: document.getElementById("statTotal"),
	statNotas: document.getElementById("statNotas"),
	statTicket: document.getElementById("statTicket"),
	statIva: document.getElementById("statIva"),
	chartEvolucao: document.getElementById("chartEvolucao"),
	chartRanking: document.getElementById("chartRanking"),
	tipos: document.getElementById("tipos"),
	comercios: document.getElementById("comercios"),
	tbody: document.getElementById("tbody"),
	empty: document.getElementById("empty"),
	tabelaWrap: document.getElementById("tabelaWrap"),
	btnBackup: document.getElementById("btnBackup"),
	btnApagarTudo: document.getElementById("btnApagarTudo"),
	toast: document.getElementById("toast"),
};

let ledger = carregarLedger();
let apelidos = carregarApelidos();

function mostrarToast(msg, ms = 2600) {
	els.toast.textContent = msg;
	els.toast.classList.add("show");
	clearTimeout(mostrarToast._t);
	mostrarToast._t = setTimeout(() => els.toast.classList.remove("show"), ms);
}

function fmtGs(valor) {
	if (valor == null || Number.isNaN(valor)) return "—";
	const sinal = valor < 0 ? "-" : "";
	return sinal + new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.abs(valor)) + " Gs";
}

function nomeComercio(ruc) {
	return apelidos[ruc]?.nome || ruc;
}

function dataDe(registro) {
	const s = registro.emissao;
	return new Date(s.length > 10 ? s : s + "T00:00:00");
}

// --- Banner de pendentes capturados neste navegador ---
function atualizarBanner() {
	const pendentes = carregarPendentes();
	if (pendentes.length) {
		els.banner.style.display = "";
		els.bannerTexto.textContent = `Você tem ${pendentes.length} nota(s) capturada(s) neste navegador, ainda não importadas no dashboard.`;
	} else {
		els.banner.style.display = "none";
	}
}

els.btnImportarPendentes.addEventListener("click", () => {
	const pendentes = carregarPendentes();
	const { ledger: novo, adicionadas, duplicadas } = mesclarNoLedger(ledger, pendentes);
	ledger = novo;
	salvarLedger(ledger);
	salvarPendentes([]);
	atualizarBanner();
	mostrarToast(`${adicionadas} nota(s) importada(s)${duplicadas ? `, ${duplicadas} já existiam` : ""}.`);
	renderTudo();
});

els.btnDescartarPendentes.addEventListener("click", () => {
	if (!confirm("Descartar as notas pendentes deste navegador (sem importar)?")) return;
	salvarPendentes([]);
	atualizarBanner();
});

// --- Importar arquivos JSON exportados pelo capturador ---
async function importarArquivos(fileList) {
	let totalAdd = 0;
	let totalDup = 0;
	let erros = 0;
	for (const arquivo of fileList) {
		try {
			const texto = await arquivo.text();
			const dados = JSON.parse(texto);
			const lista = Array.isArray(dados) ? dados : [dados];
			const validos = lista.filter((r) => r && r.cdc && r.emissor);
			const { ledger: novo, adicionadas, duplicadas } = mesclarNoLedger(ledger, validos);
			ledger = novo;
			totalAdd += adicionadas;
			totalDup += duplicadas;
		} catch {
			erros++;
		}
	}
	salvarLedger(ledger);
	mostrarToast(
		`${totalAdd} nota(s) importada(s)${totalDup ? `, ${totalDup} já existiam` : ""}${erros ? `, ${erros} arquivo(s) inválido(s)` : ""}.`,
		3400,
	);
	renderTudo();
}

els.fileImport.addEventListener("change", (e) => {
	if (e.target.files.length) importarArquivos(e.target.files);
});
["dragenter", "dragover"].forEach((ev) =>
	els.dropzone.addEventListener(ev, (e) => {
		e.preventDefault();
		els.dropzone.classList.add("over");
	}),
);
["dragleave", "drop"].forEach((ev) =>
	els.dropzone.addEventListener(ev, (e) => {
		e.preventDefault();
		els.dropzone.classList.remove("over");
	}),
);
els.dropzone.addEventListener("drop", (e) => {
	if (e.dataTransfer?.files?.length) importarArquivos(e.dataTransfer.files);
});
els.dropzone.addEventListener("click", () => els.fileImport.click());

// --- Backup / limpar ---
els.btnBackup.addEventListener("click", () => {
	const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	a.href = url;
	a.download = `cacique-backup-${carimbo}.json`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
});

els.btnApagarTudo.addEventListener("click", () => {
	if (!ledger.length) return;
	if (!confirm(`Apagar as ${ledger.length} nota(s) guardadas neste navegador? Baixe o backup antes, se ainda não baixou.`)) return;
	ledger = [];
	salvarLedger(ledger);
	renderTudo();
});

// --- Filtro de período ---
function periodoParaIntervalo(valor) {
	const agora = new Date();
	const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
	let inicio;
	if (valor === "mes") {
		inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
	} else if (valor === "30d") {
		inicio = new Date(fim.getTime() - 30 * 86400000);
	} else if (valor === "90d") {
		inicio = new Date(fim.getTime() - 90 * 86400000);
	} else if (valor === "ano") {
		inicio = new Date(agora.getFullYear(), 0, 1);
	} else {
		return null;
	}
	return { inicio, fim };
}

function filtrarLedger() {
	const intervalo = periodoParaIntervalo(els.periodo.value);
	const termo = els.busca.value.trim().toLowerCase();
	return ledger.filter((r) => {
		if (intervalo) {
			const d = dataDe(r);
			if (d < intervalo.inicio || d > intervalo.fim) return false;
		}
		if (termo) {
			const alvo = `${nomeComercio(r.emissor.ruc)} ${r.emissor.ruc} ${r.tipoDocumento.descricao}`.toLowerCase();
			if (!alvo.includes(termo)) return false;
		}
		return true;
	});
}

// --- Agregações ---
function granularidade(filtrado) {
	if (!filtrado.length) return "dia";
	const datas = filtrado.map(dataDe);
	const spanDias = (Math.max(...datas) - Math.min(...datas)) / 86400000;
	if (spanDias <= 31) return "dia";
	if (spanDias <= 210) return "semana";
	return "mes";
}

function chaveBucket(d, gran) {
	if (gran === "dia") return d.toISOString().slice(0, 10);
	if (gran === "mes") return d.toISOString().slice(0, 7);
	const inicioSemana = new Date(d);
	inicioSemana.setDate(d.getDate() - d.getDay());
	return inicioSemana.toISOString().slice(0, 10);
}

function rotuloBucket(chave, gran) {
	const [ano, mes, dia] = chave.split("-");
	if (gran === "mes") {
		const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
		return `${nomes[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
	}
	return `${dia}/${mes}`;
}

function montarSerieTemporal(filtrado) {
	const gran = granularidade(filtrado);
	const buckets = new Map();
	for (const r of filtrado) {
		const chave = chaveBucket(dataDe(r), gran);
		buckets.set(chave, (buckets.get(chave) || 0) + r.sinalFinanceiro * (r.totalOperacao || 0));
	}
	return [...buckets.entries()]
		.sort((a, b) => (a[0] < b[0] ? -1 : 1))
		.map(([chave, valor]) => ({ label: rotuloBucket(chave, gran), value: valor }));
}

function montarRankingComercios(filtrado, topN = 8) {
	const porRuc = new Map();
	for (const r of filtrado) {
		const ruc = r.emissor.ruc;
		porRuc.set(ruc, (porRuc.get(ruc) || 0) + r.sinalFinanceiro * (r.totalOperacao || 0));
	}
	const lista = [...porRuc.entries()]
		.map(([ruc, valor]) => ({ label: nomeComercio(ruc), value: valor }))
		.sort((a, b) => b.value - a.value);
	if (lista.length <= topN) return lista;
	const top = lista.slice(0, topN);
	const outros = lista.slice(topN).reduce((s, d) => s + d.value, 0);
	top.push({ label: "Outros", value: outros });
	return top;
}

function montarTipos(filtrado) {
	const porTipo = new Map();
	for (const r of filtrado) {
		const k = r.tipoDocumento.descricao;
		porTipo.set(k, (porTipo.get(k) || 0) + 1);
	}
	return [...porTipo.entries()].sort((a, b) => b[1] - a[1]);
}

// --- Comércios (apelidos + categoria) ---
function renderComercios() {
	const rucs = [...new Set(ledger.map((r) => r.emissor.ruc))].sort();
	els.comercios.innerHTML = "";
	if (!rucs.length) {
		els.comercios.innerHTML = '<p class="empty">Nenhum comércio ainda — importe notas para começar.</p>';
		return;
	}
	for (const ruc of rucs) {
		const n = ledger.filter((r) => r.emissor.ruc === ruc).length;
		const row = document.createElement("div");
		row.className = "row field-inline";
		row.style.marginBottom = "8px";
		row.innerHTML = `
			<code class="small muted" style="min-width:110px">${ruc}</code>
			<input type="text" placeholder="Apelido (ex.: Supermercado X)" value="${apelidos[ruc]?.nome || ""}" data-ruc="${ruc}" style="flex:1; min-width:160px" />
			<span class="small muted">${n} nota(s)</span>
		`;
		const input = row.querySelector("input");
		input.addEventListener("change", () => {
			apelidos[ruc] = { ...(apelidos[ruc] || {}), nome: input.value.trim() };
			salvarApelidos(apelidos);
			renderTudo();
		});
		els.comercios.appendChild(row);
	}
}

// --- Tabela detalhada ---
function renderTabela(filtrado) {
	const ordenado = [...filtrado].sort((a, b) => (a.emissao < b.emissao ? 1 : -1));
	els.tbody.innerHTML = "";
	els.empty.style.display = ordenado.length ? "none" : "block";
	els.tabelaWrap.style.display = ordenado.length ? "" : "none";
	for (const r of ordenado) {
		const tr = document.createElement("tr");
		const credito = r.tipoDocumento.codigo === "05";
		const data = r.emissao ? r.emissao.replace("T", " ").slice(0, 16) : "—";
		tr.innerHTML = `
			<td>${data}</td>
			<td>${nomeComercio(r.emissor.ruc)}</td>
			<td><span class="chip ${credito ? "credito" : ""}"><span class="dot"></span>${r.tipoDocumento.descricao}</span></td>
			<td>${fmtGs(r.sinalFinanceiro * r.totalOperacao)}</td>
			<td>${r.quantidadeItens ?? "—"}</td>
			<td><a class="link small" href="${r.sifen.urlConsulta}" target="_blank" rel="noopener">Ver no e-Kuatia</a></td>
			<td><button class="btn" data-cdc="${r.cdc}" title="Remover">✕</button></td>
		`;
		tr.querySelector("button").addEventListener("click", () => {
			if (!confirm("Remover esta nota do dashboard?")) return;
			ledger = ledger.filter((x) => x.cdc !== r.cdc);
			salvarLedger(ledger);
			renderTudo();
		});
		els.tbody.appendChild(tr);
	}
}

// --- Render geral ---
function renderTudo() {
	const filtrado = filtrarLedger();

	const totalLiquido = filtrado.reduce((s, r) => s + r.sinalFinanceiro * (r.totalOperacao || 0), 0);
	const ivaTotal = filtrado.reduce((s, r) => s + r.sinalFinanceiro * (r.totalIVA || 0), 0);
	const nNotas = filtrado.length;
	const ticket = nNotas ? totalLiquido / nNotas : 0;

	els.statTotal.textContent = fmtGs(totalLiquido);
	els.statNotas.textContent = nNotas;
	els.statTicket.textContent = fmtGs(ticket);
	els.statIva.textContent = fmtGs(ivaTotal);

	renderColunas(els.chartEvolucao, montarSerieTemporal(filtrado), { formatador: fmtGs });
	renderRanking(els.chartRanking, montarRankingComercios(filtrado), { formatador: fmtGs });

	els.tipos.innerHTML = "";
	for (const [nome, count] of montarTipos(filtrado)) {
		const credito = nome.includes("Crédito");
		const chip = document.createElement("span");
		chip.className = `chip ${credito ? "credito" : ""}`;
		chip.innerHTML = `<span class="dot"></span>${nome}: ${count}`;
		els.tipos.appendChild(chip);
	}

	renderComercios();
	renderTabela(filtrado);
}

els.periodo.addEventListener("change", renderTudo);
els.busca.addEventListener("input", renderTudo);
window.addEventListener("resize", () => {
	clearTimeout(window.__caciqueResize);
	window.__caciqueResize = setTimeout(renderTudo, 200);
});

atualizarBanner();
renderTudo();
