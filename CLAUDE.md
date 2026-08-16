# Cacique — Organização financeira via QR de notas fiscais (Paraguai)

## O que é
App web estático (HTML/JS puro, sem build) para escanear o QR das notas fiscais
eletrônicas do Paraguai (sistema e-Kuatia/SIFEN da SET) e manter uma memória
local de gastos, com dashboard de insights. Publicado no GitHub Pages:
https://prec470.github.io/cacique/ (repo: github.com/prec470/cacique, público).

- `index.html` — Capturador: lê QR pela câmera ou por fotos salvas, extrai os
  dados, oferece cadastrar comércios novos na hora, deixa baixar um JSON.
- `dashboard.html` — Dashboard: importa os JSONs, guarda tudo em localStorage
  (memória persistente do navegador), mostra totais, evolução no tempo, ranking
  de comércios, etc. Também gerencia o cadastro de comércios (nome + tipo),
  com export/import JSON próprio.
- `itens.html` — Relatório de itens pendentes: lista notas cujos produtos ainda
  não foram conferidos, com link direto pra consulta oficial (resolve o
  captcha lá) e formulário pra registrar os itens de volta (manual ou colando
  texto copiado da página como ponto de partida).
- `js/qr-parse.js` — parsing puro (sem DOM) do texto do QR: decodifica a URL do
  e-Kuatia, a CDC (44 dígitos) e os números em formatos inconsistentes que a SET
  usa (`239000.0000`, `488.779,0000`, `28,0000`, `0E-8`). Parâmetros da URL lidos
  case-insensitive (achamos um PDV real que gerava nomes em minúsculo).
- `js/itens-parse.js` — parser best-effort de texto colado pra pré-preencher
  itens (nunca aceito sem revisão do usuário — sem amostra real do formato da
  página da SET pra validar contra).
- `js/store.js` — persistência em localStorage (ledger, comércios/apelidos,
  pendentes), incluindo merge de import (notas por CDC, comércios por RUC).
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
Fluxo adotado: `itens.html` lista as notas pendentes, o usuário abre o link,
resolve o captcha manualmente, e registra os itens de volta no app (ver seção
"Itens" abaixo).

A CDC (44 dígitos) já contém o RUC do emissor embutido (validado cruzando com
a data decodificada em 8 notas reais — ver `parseCDC` em `qr-parse.js`), então
dá pra agrupar gastos por comércio mesmo sem acessar o site.

## Cadastro de comércios (2026-08-15)
RUC → { nome, tipo }, guardado em localStorage e compartilhado entre Capturador
e Dashboard. Tipo é uma lista fixa (`TIPOS_COMERCIO` em `store.js`) pra não
fragmentar consultas depois. Ao capturar uma nota de RUC novo, o Capturador
oferece cadastrar na hora (não bloqueia o scanner). Dashboard tem
export/import JSON desse cadastro, separado do backup de notas.

## Itens pendentes (2026-08-15)
Cada registro de nota tem um campo `itens`: `null` = ainda não conferido,
`[]` = usuário conferiu e marcou como sem itens relevantes, `[...]` =
itens registrados. `itens.html` lista as pendentes, com link pra consulta
oficial (`sifen.urlConsulta`) e formulário de registro manual + parser
best-effort de texto colado (`itens-parse.js`) só como ponto de partida — a
soma dos itens é comparada ao vivo com o total da nota (do QR) pra ajudar a
pegar erro de digitação.

## OCR testado e descartado (2026-08-15)
Testei usar OCR (Tesseract.js, que roda tanto no navegador quanto no Node) como
redundância pra recuperar a CDC impressa por extenso perto do QR quando a
leitura falha. Testado de verdade numa foto real que falhou (`20260815_152759.jpg`
— QR com reflexo de luz + dobra, `ChecksumError` confirmado via zxing-cpp com
`return_errors=True`), com a foto corrigida (rotação, recorte, upscale 2-6x,
vários PSM/OEM). Resultado: dígitos majoritariamente errados mesmo em texto
nítido e bem enquadrado — a fonte dot-matrix das impressoras térmicas não é o
que os modelos genéricos de OCR reconhecem bem. Não vale a pena reativar essa
ideia sem um modelo treinado especificamente pra esse tipo de fonte (fora do
escopo). Decisão: em vez de OCR, o capturador mostra dicas de recaptura
(reflexo, dobra, distância) quando passa tempo sem ler nenhum QR — resolve o
caso real, já que o mesmo QR lê perfeitamente numa foto sem esses problemas.
Isso também é o motivo de `itens-parse.js` usar um parser de texto colado (não
OCR de imagem) pra pré-preencher itens: o texto vem selecionável da própria
página da SET, sem precisar reconhecer a fonte térmica de novo.

## Bug corrigido: upload de arquivo não lia nenhum QR (2026-08-15)
No navegador (desktop), o upload de fotos falhava pra 100% dos arquivos —
mesmo fotos que decodificavam bem via zxing-cpp em Python. Causa: `capture.js`
chamava `readBarcodes(arquivoFile, ...)` passando o `File` direto, o que faz o
zxing-wasm mandar os bytes crus do JPEG pro decodificador de imagem embutido
no próprio WASM (`readBarcodesFromImage`, via bytes brutos — não é o mesmo
decodificador do navegador). Esse caminho é mais limitado e falhava
silenciosamente em fotos reais de câmera. A câmera ao vivo nunca teve esse
problema porque já entrega `ImageData` (pixels prontos via canvas), que usa um
caminho diferente (`readBarcodesFromPixmap`) que nunca passa pelo decodificador
de imagem do WASM.

Corrigido decodificando a imagem com `createImageBitmap` + canvas antes de
chamar `readBarcodes`, igual à câmera. Validado rodando o zxing-wasm real (o
mesmo arquivo vendorizado) em Node com `@napi-rs/canvas` (decodificação de
imagem nativa de verdade, não simulação) — 8/8 fotos reais de nota passaram a
ler certo, contra 0/8 antes. De brinde, achei que um teto fixo de resolução
(2400px) causava moiré e falhava numa nota específica só naquela escala exata
(1600 e 3200+ funcionavam, 2400 não) — subi o teto pra 4000px, que se mostrou
robusto em todas as amostras.

**Lição pra não esquecer**: `readBarcodes()` do zxing-wasm aceita `Blob/File`
diretamente e a documentação oficial mostra isso como uso válido, mas na
prática (fotos grandes de câmera de verdade) só o caminho via `ImageData`
provou ser confiável — sempre preferir decodificar a imagem com o navegador
(ou node-canvas/@napi-rs/canvas em teste) e passar `ImageData`, não o arquivo
bruto.

## Estado atual
Publicado e testado no navegador real (celular do usuário) — câmera, leitura
de QR, cadastro de comércios, tudo confirmado funcionando. `itens.html` ainda
não testado num navegador real (só via jsdom com dados sintéticos) — o parser
de texto colado especialmente precisa de um teste com um exemplo real copiado
da página da SET pra saber se vale a pena ajustar a heurística.

## Próximos passos possíveis
- Testar `itens.html` de verdade: abrir uma nota real no e-Kuatia, copiar o
  texto da tabela de itens, colar no app, e ver se o parser precisa ajuste.
- Uma vez que houver itens reais registrados, dashboard pode ganhar insights
  por produto (categorias de gasto, variação de preço do mesmo item) — não
  fazia sentido antes de existir dado real pra mostrar.
- Favicon/ícone do app, manifest PWA (instalável no celular) se o usuário quiser.
