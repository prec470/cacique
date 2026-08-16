// Cacique — mini biblioteca de gráficos SVG, sem dependências externas.
// Segue as specs do skill de dataviz: barras finas, ponta arredondada, gridlines
// recessivas, tooltip no hover, paleta validada (azul série única).

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
	const e = document.createElementNS(NS, tag);
	for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
	return e;
}

function arredondarTeto(valor) {
	if (valor <= 0) return 1;
	const grandeza = 10 ** Math.floor(Math.log10(valor));
	const passos = [1, 2, 2.5, 5, 10];
	for (const p of passos) {
		if (grandeza * p >= valor) return grandeza * p;
	}
	return grandeza * 10;
}

function attachTooltip(container) {
	let tip = container.querySelector(".chart-tooltip");
	if (!tip) {
		tip = document.createElement("div");
		tip.className = "chart-tooltip";
		container.appendChild(tip);
	}
	return tip;
}

function ligarHover(container, marca, texto, x, y) {
	const tip = attachTooltip(container);
	marca.addEventListener("mouseenter", () => {
		tip.textContent = texto;
		tip.style.left = x + "px";
		tip.style.top = y + "px";
		tip.classList.add("show");
	});
	marca.addEventListener("mousemove", (ev) => {
		const rect = container.getBoundingClientRect();
		tip.style.left = ev.clientX - rect.left + "px";
		tip.style.top = ev.clientY - rect.top + "px";
	});
	marca.addEventListener("mouseleave", () => tip.classList.remove("show"));
}

// Gráfico de colunas (série temporal). data: [{label, value}]
export function renderColunas(container, data, { formatador = (v) => v, alturaMax = 220 } = {}) {
	container.innerHTML = "";
	if (!data.length) {
		container.innerHTML = '<p class="empty">Sem dados no período.</p>';
		return;
	}
	const larguraTotal = Math.max(container.clientWidth || 320, 280);
	const margem = { top: 20, right: 8, bottom: 26, left: 8 };
	const largura = larguraTotal;
	const altura = alturaMax;
	const teto = arredondarTeto(Math.max(...data.map((d) => d.value), 1));
	const areaW = largura - margem.left - margem.right;
	const areaH = altura - margem.top - margem.bottom;
	const passo = areaW / data.length;
	const larguraBarra = Math.min(24, passo * 0.6);

	const svg = el("svg", {
		viewBox: `0 0 ${largura} ${altura}`,
		class: "chart",
		width: "100%",
		height: altura,
		preserveAspectRatio: "none",
	});

	// gridlines (0, meio, teto)
	[0, 0.5, 1].forEach((frac) => {
		const y = margem.top + areaH * (1 - frac);
		svg.appendChild(el("line", { x1: margem.left, x2: largura - margem.right, y1: y, y2: y, class: frac === 0 ? "axis-line" : "gridline" }));
	});

	const wrap = document.createElement("div");
	wrap.className = "chart-wrap";
	container.appendChild(wrap);

	data.forEach((d, i) => {
		const x = margem.left + i * passo + (passo - larguraBarra) / 2;
		const h = teto > 0 ? (d.value / teto) * areaH : 0;
		const y = margem.top + areaH - h;
		const barra = el("rect", {
			x,
			y,
			width: larguraBarra,
			height: Math.max(h, 1),
			rx: Math.min(4, larguraBarra / 2),
			class: "bar",
		});
		svg.appendChild(barra);
		ligarHover(wrap, barra, `${d.label}: ${formatador(d.value)}`, x + larguraBarra / 2, y);

		if (data.length <= 14 || i % Math.ceil(data.length / 10) === 0) {
			const label = el("text", { x: x + larguraBarra / 2, y: altura - 8, "text-anchor": "middle" });
			label.textContent = d.label;
			svg.appendChild(label);
		}
	});

	wrap.appendChild(svg);
}

// Gráfico de barras horizontais (ranking). data: [{label, value}], já ordenada desc.
export function renderRanking(container, data, { formatador = (v) => v, alturaLinha = 30 } = {}) {
	container.innerHTML = "";
	if (!data.length) {
		container.innerHTML = '<p class="empty">Sem dados no período.</p>';
		return;
	}
	const larguraTotal = Math.max(container.clientWidth || 320, 280);
	const margem = { top: 4, right: 8, bottom: 4, left: 8 };
	const rotuloW = Math.min(160, larguraTotal * 0.38);
	const altura = data.length * alturaLinha + margem.top + margem.bottom;
	const areaW = larguraTotal - margem.left - margem.right - rotuloW - 60;
	const teto = arredondarTeto(Math.max(...data.map((d) => d.value), 1));

	const svg = el("svg", {
		viewBox: `0 0 ${larguraTotal} ${altura}`,
		class: "chart",
		width: "100%",
		height: altura,
		preserveAspectRatio: "none",
	});

	const wrap = document.createElement("div");
	wrap.className = "chart-wrap";
	container.appendChild(wrap);

	data.forEach((d, i) => {
		const y = margem.top + i * alturaLinha;
		const barraAltura = Math.min(22, alturaLinha * 0.6);
		const barraY = y + (alturaLinha - barraAltura) / 2;
		const w = teto > 0 ? (d.value / teto) * areaW : 0;

		const rotulo = el("text", { x: margem.left, y: y + alturaLinha / 2 + 4, "text-anchor": "start" });
		rotulo.textContent = d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label;
		svg.appendChild(rotulo);

		const barra = el("rect", {
			x: margem.left + rotuloW,
			y: barraY,
			width: Math.max(w, 2),
			height: barraAltura,
			rx: Math.min(4, barraAltura / 2),
			class: "bar",
		});
		svg.appendChild(barra);
		ligarHover(wrap, barra, `${d.label}: ${formatador(d.value)}`, margem.left + rotuloW + w, barraY);

		const valorTxt = el("text", {
			x: margem.left + rotuloW + Math.max(w, 2) + 8,
			y: y + alturaLinha / 2 + 4,
			"text-anchor": "start",
			class: "bar-label",
		});
		valorTxt.textContent = formatador(d.value);
		svg.appendChild(valorTxt);
	});

	wrap.appendChild(svg);
}

// As 3 primeiras séries usam cor própria (slots 1-3 são os que a paleta valida
// all-pairs pra formas tipo scatter); a partir da 4ª, cai em "Outros" (cinza) —
// regra do skill de dataviz pra não estourar a paleta categórica num scatter.
const CORES_SERIE = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
const COR_OUTROS = "var(--text-muted)";

function corDaSerie(indice) {
	return indice < CORES_SERIE.length ? CORES_SERIE[indice] : COR_OUTROS;
}

// Gráfico de dispersão (evolução de preço no tempo, por grupo/comércio).
// grupos: [{ label, pontos: [{ x: Date, y: number }] }]
export function renderEvolucao(container, grupos, { formatador = (v) => v, alturaMax = 240 } = {}) {
	container.innerHTML = "";
	const todosPontos = grupos.flatMap((g) => g.pontos);
	if (!todosPontos.length) {
		container.innerHTML = '<p class="empty">Sem dados no período.</p>';
		return;
	}

	const larguraTotal = Math.max(container.clientWidth || 320, 280);
	const margem = { top: 20, right: 16, bottom: 26, left: 8 };
	const altura = alturaMax;
	const areaW = larguraTotal - margem.left - margem.right;
	const areaH = altura - margem.top - margem.bottom;

	const tempos = todosPontos.map((p) => p.x.getTime());
	const minX = Math.min(...tempos);
	const maxX = Math.max(...tempos);
	const spanX = Math.max(maxX - minX, 86400000);
	const teto = arredondarTeto(Math.max(...todosPontos.map((p) => p.y)) * 1.08);

	const px = (data) => margem.left + ((data.getTime() - minX) / spanX) * areaW;
	const py = (valor) => margem.top + areaH - (valor / teto) * areaH;

	const svg = el("svg", {
		viewBox: `0 0 ${larguraTotal} ${altura}`,
		class: "chart",
		width: "100%",
		height: altura,
		preserveAspectRatio: "none",
	});

	[0, 0.5, 1].forEach((frac) => {
		const y = margem.top + areaH * (1 - frac);
		svg.appendChild(el("line", { x1: margem.left, x2: larguraTotal - margem.right, y1: y, y2: y, class: frac === 0 ? "axis-line" : "gridline" }));
	});

	const wrap = document.createElement("div");
	wrap.className = "chart-wrap";
	container.appendChild(wrap);

	grupos.forEach((g, gi) => {
		const cor = corDaSerie(gi);
		const ordenados = [...g.pontos].sort((a, b) => a.x - b.x);
		if (ordenados.length > 1) {
			const d = ordenados.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");
			svg.appendChild(el("path", { d, fill: "none", stroke: cor, "stroke-width": 2, opacity: 0.45 }));
		}
		for (const p of ordenados) {
			const dot = el("circle", { cx: px(p.x), cy: py(p.y), r: 5, fill: cor, stroke: "var(--surface-1)", "stroke-width": 2 });
			svg.appendChild(dot);
			ligarHover(wrap, dot, `${g.label}: ${formatador(p.y)} — ${p.x.toLocaleDateString("pt-BR")}`, px(p.x), py(p.y));
		}
	});

	[minX, maxX].forEach((t, i) => {
		const label = el("text", { x: px(new Date(t)), y: altura - 8, "text-anchor": i === 0 ? "start" : "end" });
		label.textContent = new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
		svg.appendChild(label);
	});

	wrap.appendChild(svg);

	if (grupos.length > 1) {
		const legenda = document.createElement("div");
		legenda.className = "legend";
		grupos.forEach((g, gi) => {
			const item = document.createElement("div");
			item.className = "item";
			item.innerHTML = `<span class="swatch" style="background:${corDaSerie(gi)}"></span>${g.label}`;
			legenda.appendChild(item);
		});
		container.appendChild(legenda);
	}
}
