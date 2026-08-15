# Cacique — Organização financeira via QR de notas fiscais (Paraguai)

## O que é
App web estático (HTML/JS puro, sem build) para escanear o QR das notas fiscais
eletrônicas do Paraguai (sistema e-Kuatia/SIFEN da SET) e manter uma memória
local de gastos, com dashboard de insights. Feito pra hospedar no GitHub Pages.

- `index.html` — Capturador: lê QR pela câmera ou por fotos salvas, extrai os
  dados, deixa baixar um JSON.
- `dashboard.html` — Dashboard: importa os JSONs, guarda tudo em localStorage
  (memória persistente do navegador), mostra totais, evolução no tempo, ranking
  de comércios, etc. Também aceita apelidos por RUC (já que o nome do comércio
  não vem no QR).
- `js/qr-parse.js` — parsing puro (sem DOM) do texto do QR: decodifica a URL do
  e-Kuatia, a CDC (44 dígitos) e os números em formatos inconsistentes que a SET
  usa (`239000.0000`, `488.779,0000`, `28,0000`, `0E-8`).
- `js/store.js` — persistência em localStorage (ledger, apelidos, pendentes).
- `js/charts.js` — gráficos SVG artesanais (sem lib externa), seguindo o skill
  de dataviz do Claude Code (paleta validada, barras finas, tooltip no hover).
- `vendor/zxing-wasm/` — leitor de QR via WASM (zxing-cpp), vendorizado da lib
  npm `zxing-wasm@3.1.3`. **Necessário**: o decodificador padrão do navegador
  (tipo jsQR/OpenCV) falha nesses QRs densos fotografados — testei e só o zxing
  deu conta. `reader.js` importa `share.js` no mesmo diretório (path ajustado
  manualmente pós-extração do pacote).

## Descoberta importante (limita o escopo)
O QR aponta pra `ekuatia.set.gov.py/consultas/qr?...`, que já traz no próprio
link: CDC, data/hora de emissão, RUC/CI do receptor, total da operação, IVA e
quantidade de itens — dá pra extrair tudo isso 100% no navegador.

**Os itens detalhados (produtos/preços) não dá pra pegar automaticamente**: a
consulta completa no site da SET exige resolver um reCAPTCHA do Google
(confirmado lendo o JS do app AngularJS deles — `FormqrCtrl.guardar` só chama
a API depois de `vcRecaptchaService.getResponse()`). Não é algo pra contornar.
Por isso a tabela de notas no dashboard tem um link "Ver no e-Kuatia" que abre
a consulta oficial numa aba nova — resolve o captcha manualmente ali se quiser
ver os itens de uma nota específica.

A CDC (44 dígitos) já contém o RUC do emissor embutido (validado cruzando com
a data decodificada em 8 notas reais — ver `parseCDC` em `qr-parse.js`), então
dá pra agrupar gastos por comércio mesmo sem acessar o site.

## Decisão do usuário (2026-08-15)
Escolhida a opção "Combinação: QR agora, itens depois" — MVP só com os dados
do QR (sem itens/produtos), decidir depois se vale a pena um fluxo manual
(captcha + colar itens) ou OCR do cupom completo pra fase 2.

## Estado atual
MVP implementado e testado (parsing validado em Node com QRs reais; dashboard
testado via jsdom com dados sintéticos — 17 notas, filtro de período, edição
de apelido, gráficos, tudo funcionando sem erros). **Não testado num navegador
de verdade ainda** (câmera/WASM não dá pra testar no Pi headless — Puppeteer
não funciona em ARM, ver memória `reference_ambiente_git_gh`). Falta:
- Testar no celular do usuário (câmera + leitura real) depois do deploy.
- Criar repositório GitHub e publicar no Pages (não feito — pede confirmação
  antes de criar/publicar repositório).
- Fotos de amostra (`*.jpg` na raiz da pasta) e os JSONs exportados são dados
  pessoais reais — `.gitignore` já exclui isso, mas checar antes de commitar.

## Próximos passos possíveis
- Fase 2 de itens: escolher entre colar manualmente (após captcha) ou OCR do
  cupom (Tesseract.js) — ver discussão na sessão de 2026-08-15.
- Favicon/ícone do app, manifest PWA (instalável no celular) se o usuário quiser.
- Botão "abrir dashboard" a partir do capturador quando no mesmo dispositivo.
