import { prepareZXingModule, readBarcodes } from "../vendor/zxing-wasm/reader.js";
import { parseTextoQr, QrInvalidoError } from "./qr-parse.js";
import { carregarPendentes, salvarPendentes } from "./store.js";

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
};

let pendentes = carregarPendentes();
let stream = null;
let scanLoopHandle = null;
let cooldownAte = 0;
const ctx = els.canvas.getContext("2d", { willReadFrequently: true });

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

function adicionarRegistro(registro) {
	if (jaTem(registro.cdc)) {
		mostrarToast("Essa nota já está na lista.");
		return false;
	}
	pendentes = [registro, ...pendentes];
	persistir();
	renderLista();
	return true;
}

function removerRegistro(cdc) {
	pendentes = pendentes.filter((r) => r.cdc !== cdc);
	persistir();
	renderLista();
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
			<td>${r.emissor.ruc}</td>
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
	els.hint.textContent = "Aponte para o QR code da nota";
	agendarLoop();
}

function pararCamera() {
	if (scanLoopHandle) clearTimeout(scanLoopHandle);
	scanLoopHandle = null;
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
				if (!ok) setTimeout(() => els.frame.classList.remove("hit"), 500);
				else setTimeout(() => els.frame.classList.remove("hit"), 700);
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
				adicionarFalha(arquivo.name, "QR code não encontrado na imagem");
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
});

renderLista();
