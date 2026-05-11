import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createWorker, OEM, PSM } from 'tesseract.js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type OemOption = {
  label: string
  value: OEM
  description: string
}

type OcrWord = {
  text: string
  bbox: {
    x0: number
    y0: number
    x1: number
    y1: number
  }
}

type OcrPageResult = {
  imageDataUrl: string
  words: OcrWord[]
}

const oemOptions: OemOption[] = [
  {
    label: 'Padrao',
    value: OEM.DEFAULT,
    description: 'Deixa o Tesseract escolher automaticamente o melhor modo.',
  },
  {
    label: 'Somente LSTM',
    value: OEM.LSTM_ONLY,
    description: 'Usa apenas a rede neural moderna; geralmente melhor para textos atuais.',
  },
  {
    label: 'Somente legado',
    value: OEM.TESSERACT_ONLY,
    description: 'Usa apenas o mecanismo antigo do Tesseract.',
  },
  {
    label: 'Legado + LSTM',
    value: OEM.TESSERACT_LSTM_COMBINED,
    description: 'Combina motor antigo e moderno para tentar melhorar a leitura.',
  },
]

const psmOptions = [
  {
    label: 'Automatico',
    value: PSM.AUTO,
    description: 'Detecta automaticamente a estrutura da pagina.',
  },
  {
    label: 'Bloco unico',
    value: PSM.SINGLE_BLOCK,
    description: 'Assume que todo texto esta em um bloco unico.',
  },
  {
    label: 'Linha unica',
    value: PSM.SINGLE_LINE,
    description: 'Assume que existe apenas uma linha de texto.',
  },
  {
    label: 'Palavra unica',
    value: PSM.SINGLE_WORD,
    description: 'Assume que existe apenas uma palavra.',
  },
  {
    label: 'Texto esparso',
    value: PSM.SPARSE_TEXT,
    description: 'Procura textos espalhados em varias partes da imagem.',
  },
]

const languageOptions = [
  { label: 'Portugues (por)', value: 'por', description: 'Modelo de OCR para textos em portugues.' },
  { label: 'Ingles (eng)', value: 'eng', description: 'Modelo de OCR para textos em ingles.' },
]

async function pdfToImageDataUrls(file: File): Promise<string[]> {
  const pdfData = await file.arrayBuffer()
  const pdf = await getDocument({ data: pdfData }).promise
  const images: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Nao foi possivel criar o contexto do canvas.')
    }

    await page.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise

    images.push(canvas.toDataURL('image/png'))
  }

  return images
}

function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

function getImageDimensions(imageDataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Nao foi possivel carregar a imagem para exportar o PDF.'))
    img.src = imageDataUrl
  })
}

async function embedImageFromDataUrl(pdfDoc: PDFDocument, imageDataUrl: string) {
  if (imageDataUrl.startsWith('data:image/png')) {
    return pdfDoc.embedPng(imageDataUrl)
  }

  if (imageDataUrl.startsWith('data:image/jpeg') || imageDataUrl.startsWith('data:image/jpg')) {
    return pdfDoc.embedJpg(imageDataUrl)
  }

  throw new Error('Formato de imagem nao suportado para exportacao em PDF.')
}

async function videoToFrameDataUrls(
  file: File,
  frameIntervalSeconds = 1,
  maxFrames = 10,
): Promise<string[]> {
  const videoUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = videoUrl
  video.muted = true
  video.playsInline = true

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Nao foi possivel carregar o video.'))
  })

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 1280
  canvas.height = video.videoHeight || 720
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    URL.revokeObjectURL(videoUrl)
    throw new Error('Nao foi possivel criar o contexto do canvas.')
  }

  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const frames: string[] = []
  const totalFrames = Math.max(1, Math.min(maxFrames, Math.ceil(duration / frameIntervalSeconds)))

  for (let i = 0; i < totalFrames; i += 1) {
    const time = Math.min(i * frameIntervalSeconds, Math.max(0, duration - 0.05))
    await new Promise<void>((resolve) => {
      if (Math.abs(video.currentTime - time) < 0.001) {
        resolve()
        return
      }
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        resolve()
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = time
    })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    frames.push(canvas.toDataURL('image/png'))
  }

  URL.revokeObjectURL(videoUrl)
  return frames
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState('')
  const [language, setLanguage] = useState('por')
  const [oem, setOem] = useState<OEM>(OEM.DEFAULT)
  const [psm, setPsm] = useState<PSM>(PSM.AUTO)
  const [whitelist, setWhitelist] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [pageProgress, setPageProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [resultText, setResultText] = useState('')
  const [ocrPages, setOcrPages] = useState<OcrPageResult[]>([])
  const [error, setError] = useState('')

  const progressLabel = useMemo(() => `${Math.round(pageProgress * 100)}%`, [pageProgress])
  const isPdf = file?.type === 'application/pdf'
  const isImage = file?.type.startsWith('image/')
  const isVideo = file?.type.startsWith('video/')
  const selectedLanguage = languageOptions.find((option) => option.value === language)
  const selectedOem = oemOptions.find((option) => option.value === oem)
  const selectedPsm = psmOptions.find((option) => option.value === psm)

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl('')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setFilePreviewUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null
    setFile(selectedFile)
    setError('')
  }

  const generateOcr = async () => {
    if (!file) {
      setError('Selecione um arquivo antes de iniciar o OCR.')
      return
    }

    setIsProcessing(true)
    setPageProgress(0)
    setCurrentPage(0)
    setTotalPages(0)
    setError('')
    setResultText('')
    setOcrPages([])

    const worker = await createWorker(language, oem, {
      logger: (message) => {
        if (message.status.includes('recognizing text')) {
          setPageProgress(message.progress)
        }
      },
    })

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        ...(whitelist.trim() ? { tessedit_char_whitelist: whitelist.trim() } : {}),
      })

      let images: string[] = []
      if (file.type === 'application/pdf') {
        images = await pdfToImageDataUrls(file)
      } else if (file.type.startsWith('image/')) {
        images = [await imageFileToDataUrl(file)]
      } else if (file.type.startsWith('video/')) {
        images = await videoToFrameDataUrls(file)
      } else {
        throw new Error('Tipo de arquivo nao suportado.')
      }

      setTotalPages(images.length)
      const textByPage: string[] = []
      const pagesForPdf: OcrPageResult[] = []

      for (let i = 0; i < images.length; i += 1) {
        setCurrentPage(i + 1)
        setPageProgress(0)
        const { data } = await worker.recognize(images[i])
        const ocrData = data as typeof data & { words?: OcrWord[] }
        setPageProgress(1)
        const sectionName = file.type.startsWith('video/') ? 'Frame' : 'Pagina'
        textByPage.push(`--- ${sectionName} ${i + 1} ---\n${data.text.trim()}`)
        pagesForPdf.push({
          imageDataUrl: images[i],
          words: (ocrData.words ?? []).map((word) => ({
            text: word.text,
            bbox: word.bbox,
          })),
        })
      }

      setResultText(textByPage.join('\n\n'))
      setOcrPages(pagesForPdf)
    } catch (ocrError) {
      console.error(ocrError)
      setError('Falha ao processar o OCR. Verifique se o arquivo e valido.')
    } finally {
      await worker.terminate()
      setIsProcessing(false)
    }
  }

  const downloadPdfWithOcr = async () => {
    if (!ocrPages.length || !file) {
      setError('Gere o OCR antes de baixar o PDF.')
      return
    }

    setError('')

    try {
      const pdfDoc = await PDFDocument.create()
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

      for (const pageData of ocrPages) {
        const { width, height } = await getImageDimensions(pageData.imageDataUrl)
        const embeddedImage = await embedImageFromDataUrl(pdfDoc, pageData.imageDataUrl)
        const page = pdfDoc.addPage([width, height])

        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width,
          height,
        })

        for (const word of pageData.words) {
          const cleanedText = word.text?.trim()
          if (!cleanedText) continue

          const wordWidth = Math.max(1, word.bbox.x1 - word.bbox.x0)
          const wordHeight = Math.max(1, word.bbox.y1 - word.bbox.y0)
          const fontSize = Math.max(6, wordHeight)
          const y = height - word.bbox.y1

          page.drawText(cleanedText, {
            x: word.bbox.x0,
            y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
            opacity: 0,
            lineHeight: fontSize,
            maxWidth: wordWidth,
          })
        }
      }

      const pdfBytes = await pdfDoc.save()
      const pdfBlob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' })
      const downloadUrl = URL.createObjectURL(pdfBlob)
      const anchor = document.createElement('a')
      const fileNameWithoutExtension = file.name.replace(/\.[^/.]+$/, '')

      anchor.href = downloadUrl
      anchor.download = `${fileNameWithoutExtension || 'documento'}-ocr.pdf`
      anchor.click()
      URL.revokeObjectURL(downloadUrl)
    } catch (downloadError) {
      console.error(downloadError)
      setError('Nao foi possivel gerar o PDF com OCR.')
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6">
      <section className="w-full rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          OCR de PDF com Tesseract.js
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Envie PDF, imagem ou video, ajuste as configuracoes e gere o texto reconhecido.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-4">
            Arquivo
            <input
              type="file"
              accept="application/pdf,image/*,video/*"
              onChange={onFileChange}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            <span title="Escolhe o idioma principal do texto para melhorar a precisao do OCR.">Idioma</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">{selectedLanguage?.description}</span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            <span title="Define qual mecanismo interno do Tesseract sera usado para reconhecer o texto.">
              OCR Engine Mode (OEM)
            </span>
            <select
              value={oem}
              onChange={(event) => setOem(Number(event.target.value) as OEM)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
            >
              {oemOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">{selectedOem?.description}</span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            <span title="Define como o Tesseract interpreta o layout da pagina antes de ler o texto.">
              Page Segmentation Mode (PSM)
            </span>
            <select
              value={psm}
              onChange={(event) => setPsm(event.target.value as PSM)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
            >
              {psmOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">{selectedPsm?.description}</span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            <span title="Limita o OCR para reconhecer apenas os caracteres informados aqui.">
              Whitelist de caracteres (opcional)
            </span>
            <input
              value={whitelist}
              onChange={(event) => setWhitelist(event.target.value)}
              placeholder="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
            />
            <span className="text-xs font-normal text-slate-500">
              Exemplo: use somente numeros para boletos, notas fiscais e codigos.
            </span>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={generateOcr}
            disabled={isProcessing}
            className="inline-flex items-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing
              ? `Gerando OCR (Pagina ${Math.max(currentPage, 1)}/${Math.max(totalPages, 1)} - ${progressLabel})...`
              : 'Gerar OCR'}
          </button>

          <button
            type="button"
            onClick={downloadPdfWithOcr}
            disabled={isProcessing || !ocrPages.length}
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Baixar PDF com OCR
          </button>
        </div>

        {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-300 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              Visualizador de arquivo
            </div>
            {filePreviewUrl && isPdf ? (
              <iframe title="Visualizacao do PDF" src={filePreviewUrl} className="h-[28rem] w-full rounded-b-xl" />
            ) : null}
            {filePreviewUrl && isImage ? (
              <img
                src={filePreviewUrl}
                alt="Visualizacao da imagem enviada"
                className="h-[28rem] w-full rounded-b-xl object-contain"
              />
            ) : null}
            {filePreviewUrl && isVideo ? (
              <video src={filePreviewUrl} controls className="h-[28rem] w-full rounded-b-xl bg-black object-contain" />
            ) : null}
            {!filePreviewUrl ? (
              <div className="flex h-[28rem] items-center justify-center px-4 text-center text-sm text-slate-500">
                Envie um PDF, imagem ou video para visualizar aqui.
              </div>
            ) : null}
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Texto reconhecido
            <textarea
              value={resultText}
              onChange={(event) => setResultText(event.target.value)}
              rows={20}
              placeholder="O resultado do OCR aparecera aqui..."
              className="h-[28rem] w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
            />
          </label>
        </div>
      </section>
    </main>
  )
}

export default App
