import { google } from 'googleapis'
import JSZip from 'jszip'

function getAuth() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '')
    .replace(/\\n/g, '\n')

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
    ],
  })
}

const GDOC_MIME_TYPE = 'application/vnd.google-apps.document'
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface TranscriptionDoc {
  id: string
  name: string
  mimeType: string
  createdTime?: string
}

// Finds transcription docs (native Google Docs or real .docx exports) anywhere
// in the client Shared Drive, matching how meeting-note files are actually
// named there ("... - Anotações do Gemini[.docx]" or "Ata_...docx").
export async function listTranscriptionDocs(
  sharedDriveId: string,
  since?: string
): Promise<TranscriptionDoc[]> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  let q = `trashed=false and (mimeType='${GDOC_MIME_TYPE}' or mimeType='${DOCX_MIME_TYPE}') and (name contains 'Anotações do Gemini' or name contains 'Ata_')`
  if (since) {
    q += ` and createdTime >= '${since}'`
  }

  const files: TranscriptionDoc[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      q,
      corpora: 'drive',
      driveId: sharedDriveId,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'nextPageToken, files(id,name,mimeType,createdTime)',
      orderBy: 'createdTime',
      pageSize: 100,
      pageToken,
    })

    files.push(...((res.data.files || []) as TranscriptionDoc[]))
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  console.log(`[listTranscriptionDocs] driveId=${sharedDriveId} since=${since} → ${files.length} transcrições encontradas`)
  return files
}

export async function readDocContent(docId: string): Promise<string> {
  const auth = getAuth()
  const docs = google.docs({ version: 'v1', auth })

  const res = await docs.documents.get({ documentId: docId })
  const body = res.data.body?.content || []

  const text = body
    .flatMap((el: any) => el.paragraph?.elements || [])
    .map((el: any) => el.textRun?.content || '')
    .join('')

  return text.trim()
}

// Reads a real .docx file (OOXML zip) by downloading its bytes via Drive and
// extracting the text runs from word/document.xml — the Docs API can't open these.
export async function readDocxContent(fileId: string): Promise<string> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )

  const zip = await JSZip.loadAsync(res.data as ArrayBuffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) return ''

  return xml
    .split('</w:p>')
    .map((paragraph) =>
      Array.from(paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g), (m) => m[1]).join('')
    )
    .join('\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

export async function readTranscriptionContent(doc: TranscriptionDoc): Promise<string> {
  return doc.mimeType === GDOC_MIME_TYPE
    ? readDocContent(doc.id)
    : readDocxContent(doc.id)
}

export async function readSheetClients(sheetId: string): Promise<string[]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A:A',
  })

  const rows = res.data.values || []
  return rows
    .flat()
    .map((v: string) => v.trim())
    .filter(Boolean)
    .slice(1) // skip header row
}
