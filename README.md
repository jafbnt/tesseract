# OCR Web App com React + Vite + Tailwind + Tesseract.js

Aplicação web para extrair texto (OCR) de **PDF, imagem e vídeo** usando **Tesseract.js**, com interface React.

## O que a aplicação faz

- Upload de arquivo (`PDF`, `imagem` ou `vídeo`)
- Visualização do arquivo enviado (lado a lado com resultado)
- OCR com Tesseract.js
- Configurações de OCR (idioma, OEM, PSM, whitelist)
- Progresso por página/frame durante processamento
- Exibição do texto reconhecido em `textarea`

---

## Tecnologias usadas

- React 19 + TypeScript
- Vite
- Tailwind CSS (via `@tailwindcss/vite`)
- Tesseract.js
- pdfjs-dist (para renderizar PDF em imagem antes do OCR)

---

## Estrutura principal

- `src/App.tsx`: interface e lógica principal de OCR
- `src/index.css`: estilos base e import do Tailwind
- `vite.config.ts`: plugins do Vite (`react` + `tailwindcss`)

---

## Funções da aplicação

## 1) Upload de arquivo

Campo `Arquivo` aceita:

- `application/pdf`
- `image/*`
- `video/*`

Quando um arquivo é selecionado, a aplicação:

- salva no estado (`file`)
- cria uma URL temporária (`URL.createObjectURL`) para preview

## 2) Visualização de arquivo

Bloco “Visualizador de arquivo” exibe:

- `iframe` para PDF
- `<img>` para imagem
- `<video controls>` para vídeo

Sem arquivo, mostra mensagem de instrução.

## 3) Geração de OCR (`Gerar OCR`)

Ao clicar no botão:

1. valida se existe arquivo
2. cria worker do Tesseract (`createWorker`)
3. aplica parâmetros (`setParameters`)
4. converte o arquivo para imagens (dependendo do tipo)
5. executa `worker.recognize` em cada página/frame
6. junta tudo no `textarea` com separadores
7. encerra o worker (`worker.terminate`)

## 4) Conversão por tipo de arquivo

### PDF -> imagens

Função: `pdfToImageDataUrls(file)`

- Usa `pdfjs-dist` para abrir PDF
- Renderiza cada página em canvas
- Converte cada página para `dataURL` PNG
- Retorna array de imagens (1 item por página)

### Imagem -> dataURL

Função: `imageFileToDataUrl(file)`

- Usa `FileReader`
- Converte a imagem para `dataURL`
- Retorna uma imagem para OCR

### Vídeo -> frames

Função: `videoToFrameDataUrls(file, frameIntervalSeconds, maxFrames)`

- Carrega o vídeo em elemento `<video>`
- Faz `seek` por tempo
- Captura frames em canvas
- Converte cada frame para `dataURL`
- Retorna array de imagens (frames)

Configuração atual:

- intervalo: `1s`
- máximo de frames: `10`

---

## Configurações de OCR

## Idioma

Seleciona o idioma principal do OCR:

- `Portugues (por)`
- `Ingles (eng)`

Impacto: melhora precisão quando corresponde ao idioma real do texto.

## OCR Engine Mode (OEM)

Define o motor interno do Tesseract:

- `Padrao`: seleção automática
- `Somente LSTM`: rede neural moderna
- `Somente legado`: motor antigo
- `Legado + LSTM`: combinação dos dois

## Page Segmentation Mode (PSM)

Define como a página é interpretada antes do OCR:

- `Automatico`
- `Bloco unico`
- `Linha unica`
- `Palavra unica`
- `Texto esparso`

## Whitelist de caracteres (opcional)

Limita quais caracteres o OCR pode reconhecer.

Exemplo:

- só números: `0123456789`

Útil para boletos, códigos, campos numéricos etc.

---

## Progresso no botão

Durante o processamento, o botão mostra:

- página/frame atual
- total de páginas/frames
- progresso da página/frame atual em `%`

Exemplo:

- `Gerando OCR (Pagina 2/5 - 64%)...`

Quando chega em `100%`, avança para a próxima página/frame.

---

## Tratamento de erros

A aplicação mostra mensagens de erro quando:

- nenhum arquivo foi selecionado
- tipo não suportado
- falha no carregamento/renderização/processamento

Também faz `terminate` do worker no `finally` para evitar vazamento de recursos.

---

## Como rodar localmente

## 1) Instalar dependências

```bash
npm install
```

## 2) Rodar em desenvolvimento

```bash
npm run dev
```

## 3) Build de produção

```bash
npm run build
```

## 4) Preview da build

```bash
npm run preview
```

---

## Observações importantes

- OCR em vídeo é feito por **amostragem de frames**, não por todos os frames.
- PDFs e vídeos grandes podem ser pesados no navegador.
- O bundle pode ficar grande por causa de `tesseract.js` e `pdfjs-dist`.

---

## Melhorias futuras sugeridas

- controles de `intervalo` e `maxFrames` no UI
- seleção de múltiplos idiomas (`por+eng`)
- botão de copiar texto
- exportar resultado para `.txt`
- barra de progresso global (total de páginas/frames)
