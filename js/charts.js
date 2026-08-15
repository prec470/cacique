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
