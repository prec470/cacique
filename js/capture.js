import { prepareZXingModule, readBarcodes } from "../vendor/zxing-wasm/reader.js";
import { parseTextoQr, QrInvalidoError } from "./qr-parse.js";
import { carregarPendentes, salvarPendentes, carregarComercios, salvarComercios, TIPOS_COMERCIO } from "./store.js";

const vendorBase = new URL("../vendor/zxing-wasm/", import.meta.url);
prepareZXingModule({
	overrides: { locateFile: (path) => new URL(path, vendorBase).href },
});

const els = {
	video: document.getElementById("video"),
	canvas: document.getElementById("canvas"),
	frame: document.getElementById("frame"),
	hint: document.getElementById("hint"),
	btnStart: document.getElementById("btnStart"),
	btnStop: document.getElementById("btnStop"),
	fileInput: document.getElementById("fileInput"),
	dropzone: document.getElementById("dropzone"),
	lista: document.getElementById("lista"),
	tbody: document.getElementById("tbody"),
	empty: document.getElementById("empty"),
	statCount: document.getElementById("statCount"),
	statTotal: document.getElementById("statTotal"),
	statIva: document.getElementById("statIva"),
	btnBaixar: document.getElementById("btnBaixar"),
	btnLimpar: document.getElementById("btnLimpar"),
	toast: document.getElementById("toast"),
	falhas: document.getElementById("falhas"),
	novosComercios: document.getElementById("novosComercios"),
	cardNovosComercios: document.getElementById("cardNovosComercios"),
};

let pendentes = carregarPendentes();
let comercios = carregarComercios();
let stream = null;
let scanLoopHandle = null;
let cooldownAte = 0;
const ctx = els.canvas.getContext("2d", { willReadFrequently: true });

// Dicas mostradas quando a câmera passa um tempo sem conseguir ler nenhum QR —
// cobrem as causas reais observadas (reflexo de luz, dobra no papel, distância/foco).
const DICAS_LEITURA = [
	"Sem sinal ainda — aproxime mais a câmera do QR",
	"Alise a nota: dobras sobre o QR atrapalham a leitura",
	"Incline a nota pra evitar reflexo de luz sobre o QR",
	"Segure firme por um instante, sem tremer",
	"Procure mais luz, sem brilho direto no papel",
];
let inicioTentativa = 0;
let indiceDica = 0;
let dicaTimer = null;

function iniciarDicasRotativas() {
	inicioTentativa = Date.now();
	indiceDica = 0;
	clearInterval(dicaTimer);
	dicaTimer = setInterval(() => {
		if (Date.now() - inicioTentativa < 6000) return;
		els.hint.textContent = DICAS_LEITURA[indiceDica % DICAS_LEITURA.length];
		indiceDica++;
	}, 2600);
}

function pararDicasRotativas() {
	clearInterval(dicaTimer);
	dicaTimer = null;
}

function resetarTentativa() {
	inicioTentativa = Date.now();
	indiceDica = 0;
	els.hint.textContent = "Aponte para o QR code da nota";
}

function mostrarToast(msg, ms = 2200) {
	els.toast.textContent = msg;
	els.toast.classList.add("show");
	clearTimeout(mostrarToast._t);
	mostrarToast._t = setTimeout(() => els.toast.classList.remove("show"), ms);
}

function fmtGs(valor) {
	if (valor == null || Number.isNaN(valor)) return "—";
	return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(valor) + " Gs";
}

function persistir() {
	salvarPendentes(pendentes);
}

function jaTem(cdc) {
	return pendentes.some((r) => r.cdc === cdc);
}

function nomeComercio(ruc) {
	return comercios[ruc]?.nome || ruc;
}

function adicionarRegistro(registro) {
	if (jaTem(registro.cdc)) {
		mostrarToast("Essa nota já está na lista.");
		return false;
	}
	pendentes = [registro, ...pendentes];
	persistir();
	renderLista();
	renderNovosComercios();
	return true;
}

// --- Cadastro de comércios: oferece cadastrar RUCs novos assim que aparecem ---
function opcoesTipo(selecionado) {
	return TIPOS_COMERCIO.map(
		(t) => `<option value="${t}" ${t === selecionado ? "selected" : ""}>${t}</option>`,
	).join("");
}

function renderNovosComercios() {
	const rucsNovos = [...new Set(pendentes.map((r) => r.emissor.ruc))].filter((ruc) => !comercios[ruc]);
	els.novosComercios.innerHTML = "";
	if (!rucsNovos.length) {
		els.cardNovosComercios.style.display = "none";
		return;
	}
	els.cardNovosComercios.style.display = "";
	for (const ruc of rucsNovos) {
		const row = document.createElement("div");
		row.className = "row field-inline";
		row.style.marginBottom = "8px";
		row.dataset.ruc = ruc;
		row.innerHTML = `
			<code class="small muted" style="min-width:110px">${ruc}</code>
			<input type="text" placeholder="Nome do estabelecimento" data-campo="nome" style="flex:1; min-width:160px" />
			<select data-campo="tipo" style="min-width:170px">
				<option value="">Tipo...</option>
				${opcoesTipo()}
			</select>
			<button class="btn primary" data-campo="salvar">Salvar</button>
			<button class="btn" data-campo="agora-nao">Agora não</button>
		`;
		const nomeInput = row.querySelector('[data-campo="nome"]');
		const tipoSelect = row.querySelector('[data-campo="tipo"]');
		row.querySelector('[data-campo="salvar"]').addEventListener("click", () => {
			if (!nomeInput.value.trim()) {
				mostrarToast("Digite um nome pra esse comércio.");
				return;
			}
			comercios[ruc] = { nome: nomeInput.value.trim(), tipo: tipoSelect.value || null };
			salvarComercios(comercios);
			renderLista();
			renderNovosComercios();
		});
		row.querySelector('[data-campo="agora-nao"]').addEventListener("click", () => {
			row.remove();
			if (!els.novosComercios.children.length) els.cardNovosComercios.style.display = "none";
		});
		els.novosComercios.appendChild(row);
	}
}

function removerRegistro(cdc) {
	pendentes = pendentes.filter((r) => r.cdc !== cdc);
	persistir();
	renderLista();
	renderNovosComercios();
}

function renderLista() {
	const total = pendentes.reduce((s, r) => s + r.sinalFinanceiro * (r.totalOperacao || 0), 0);
	const iva = pendentes.reduce((s, r) => s + r.sinalFinanceiro * (r.totalIVA || 0), 0);
	els.statCount.textContent = pendentes.length;
	els.statTotal.textContent = fmtGs(total);
	els.statIva.textContent = fmtGs(iva);

	els.tbody.innerHTML = "";
	els.empty.style.display = pendentes.length ? "none" : "block";
	els.lista.style.display = pendentes.length ? "" : "none";

	for (const r of pendentes) {
		const tr = document.createElement("tr");
		const data = r.emissao ? r.emissao.replace("T", " ").slice(0, 16) : "—";
		const credito = r.tipoDocumento.codigo === "05";
		tr.innerHTML = `
			<td>${data}</td>
			<td>${nomeComercio(r.emissor.ruc)}</td>
			<td><span class="chip ${credito ? "credito" : ""}"><span class="dot"></span>${r.tipoDocumento.descricao}</span></td>
			<td>${fmtGs(r.totalOperacao)}</td>
			<td>${r.quantidadeItens ?? "—"}</td>
			<td><button class="btn" data-cdc="${r.cdc}" title="Remover">✕</button></td>
		`;
		tr.querySelector("button").addEventListener("click", () => removerRegistro(r.cdc));
		els.tbody.appendChild(tr);
	}
}

function adicionarFalha(nome, motivo) {
	const li = document.createElement("li");
	li.textContent = `${nome}: ${motivo}`;
	els.falhas.appendChild(li);
	els.falhas.style.display = "block";
}

async function processarResultadoTexto(texto, meta) {
	try {
		const registro = parseTextoQr(texto, meta);
		const novo = adicionarRegistro(registro);
		if (novo) {
			mostrarToast(`Nota adicionada: ${fmtGs(registro.totalOperacao)}`);
			if (navigator.vibrate) navigator.vibrate(80);
		}
		return true;
	} catch (e) {
		if (e instanceof QrInvalidoError) {
			mostrarToast(e.message);
		} else {
			mostrarToast("Não consegui ler os dados desse QR.");
		}
		return false;
	}
}

// --- Câmera ---
async function iniciarCamera() {
	try {
		stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
			audio: false,
		});
	} catch (e) {
		mostrarToast("Não consegui acessar a câmera: " + e.message, 4000);
		return;
	}
	els.video.srcObject = stream;
	await els.video.play();
	els.btnStart.style.display = "none";
	els.btnStop.style.display = "";
	resetarTentativa();
	iniciarDicasRotativas();
	agendarLoop();
}

function pararCamera() {
	if (scanLoopHandle) clearTimeout(scanLoopHandle);
	scanLoopHandle = null;
	pararDicasRotativas();
	if (stream) {
		for (const t of stream.getTracks()) t.stop();
		stream = null;
	}
	els.video.srcObject = null;
	els.btnStart.style.display = "";
	els.btnStop.style.display = "none";
	els.frame.classList.remove("hit");
}

function agendarLoop() {
	scanLoopHandle = setTimeout(cicloDeLeitura, 380);
}

async function cicloDeLeitura() {
	if (!stream) return;
	try {
		if (Date.now() >= cooldownAte && els.video.videoWidth) {
			const escala = Math.min(1, 1600 / els.video.videoWidth);
			const w = Math.round(els.video.videoWidth * escala);
			const h = Math.round(els.video.videoHeight * escala);
			els.canvas.width = w;
			els.canvas.height = h;
			ctx.drawImage(els.video, 0, 0, w, h);
			const imageData = ctx.getImageData(0, 0, w, h);
			const resultados = await readBarcodes(imageData, {
				formats: ["QRCode"],
				tryHarder: true,
			});
			if (resultados.length) {
				const ok = await processarResultadoTexto(resultados[0].text, { origem: "camera" });
				els.frame.classList.toggle("hit", ok);
				cooldownAte = Date.now() + (ok ? 1400 : 900);
				if (ok) {
					resetarTentativa();
					setTimeout(() => els.frame.classList.remove("hit"), 700);
				} else {
					setTimeout(() => els.frame.classList.remove("hit"), 500);
				}
			}
		}
	} catch {
		// ignora falhas pontuais de decodificação e tenta de novo no próximo ciclo
	}
	agendarLoop();
}

els.btnStart.addEventListener("click", iniciarCamera);
els.btnStop.addEventListener("click", pararCamera);

// --- Upload de fotos ---
async function processarArquivos(fileList) {
	const arquivos = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
	if (!arquivos.length) return;
	els.falhas.innerHTML = "";
	els.falhas.style.display = "none";
	mostrarToast(`Lendo ${arquivos.length} foto(s)...`, 60000);
	for (const arquivo of arquivos) {
		try {
			const resultados = await readBarcodes(arquivo, { formats: ["QRCode"], tryHarder: true });
			if (!resultados.length) {
				adicionarFalha(arquivo.name, "QR não encontrado — tente sem reflexo de luz, sem dobras sobre o código e mais nítido");
				continue;
			}
			let lida = false;
			for (const r of resultados) {
				const ok = await processarResultadoTexto(r.text, { origem: "arquivo", arquivo: arquivo.name });
				if (ok) lida = true;
			}
			if (!lida) adicionarFalha(arquivo.name, "QR encontrado, mas não é do e-Kuatia ou já estava na lista");
		} catch (e) {
			adicionarFalha(arquivo.name, "erro ao processar: " + e.message);
		}
	}
	els.toast.classList.remove("show");
	mostrarToast("Leitura de fotos concluída.");
}

els.fileInput.addEventListener("change", (e) => processarArquivos(e.target.files));

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
	if (e.dataTransfer?.files?.length) processarArquivos(e.dataTransfer.files);
});
els.dropzone.addEventListener("click", () => els.fileInput.click());

// --- Exportar / limpar ---
els.btnBaixar.addEventListener("click", () => {
	if (!pendentes.length) return;
	const blob = new Blob([JSON.stringify(pendentes, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	a.href = url;
	a.download = `cacique-notas-${carimbo}.json`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
});

els.btnLimpar.addEventListener("click", () => {
	if (!pendentes.length) return;
	if (!confirm(`Remover as ${pendentes.length} nota(s) desta lista? (baixe o JSON antes, se ainda não baixou)`)) return;
	pendentes = [];
	persistir();
	renderLista();
	renderNovosComercios();
});

renderLista();
renderNovosComercios();
