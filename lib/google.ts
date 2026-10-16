import { google } from 'googleapis'

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

const FOLDER = 'application/vnd.google-apps.folder'
const DOC = 'application/vnd.google-apps.document'
const SHORTCUT = 'application/vnd.google-apps.shortcut'

export interface MeetingFolder {
  id: string
  name: string
  createdTime?: string | null
}

// Lists meeting subfolders inside the root folder (real folders AND shortcuts to folders),
// optionally filtered by createdTime. Paginates through all results.
export async function listMeetingFolders(folderId: string, since?: string): Promise<MeetingFolder[]> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const q = `'${folderId}' in parents and (mimeType='${FOLDER}' or mimeType='${SHORTCUT}') and trashed=false`
  const result: MeetingFolder[] = []
  let pageToken: string | undefined

  do {
    const res: any = await drive.files.list({
      q,
      fields: 'nextPageToken,files(id,name,createdTime,mimeType,shortcutDetails)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    for (const f of res.data.files || []) {
      if (since && f.createdTime && f.createdTime < since) continue
      if (f.mimeType === FOLDER) {
        result.push({ id: f.id, name: f.name, createdTime: f.createdTime })
      } else if (f.mimeType === SHORTCUT && f.shortcutDetails?.targetMimeType === FOLDER) {
        // Shortcut to a folder: list the target's contents, keep the shortcut's name
        result.push({ id: f.shortcutDetails.targetId, name: f.name, createdTime: f.createdTime })
      }
    }
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  console.log(`[listMeetingFolders] folderId=${folderId} since=${since} → ${result.length} pastas encontradas`)
  return result
}

export type TranscriptionLookup =
  | { ok: true; doc: { id: string; name: string } }
  | { ok: false; reason: string }

// Finds the transcription doc inside a meeting folder (resolves shortcuts).
// Returns a reason when nothing usable is found so the caller can report it instead of silently skipping.
export async function findTranscriptionDoc(folderId: string): Promise<TranscriptionLookup> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const files: any[] = []
  let pageToken: string | undefined
  do {
    const res: any = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,shortcutDetails)',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    files.push(...(res.data.files || []))
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  console.log(`[findTranscriptionDoc] folderId=${folderId} → ${files.length} arquivos: ${files.map((f) => `${f.name}(${f.mimeType})`).join(', ')}`)

  if (files.length === 0) return { ok: false, reason: 'pasta vazia (ou sem permissão de leitura para a service account)' }

  const candidates: { id: string; name: string }[] = []
  let unresolvedShortcuts = 0

  for (const file of files) {
    if (file.mimeType === DOC) {
      candidates.push({ id: file.id, name: file.name })
    } else if (file.mimeType === SHORTCUT) {
      const d = file.shortcutDetails
      // targetMimeType can be missing when the service account has no access to the target,
      // so only discard shortcuts that are known to point to something else.
      if (d?.targetId && (!d.targetMimeType || d.targetMimeType === DOC)) {
        candidates.push({ id: d.targetId, name: file.name })
      } else if (!d?.targetId) {
        unresolvedShortcuts++
      }
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: unresolvedShortcuts
        ? 'atalho sem destino acessível (compartilhe o documento original com a service account)'
        : 'nenhum Google Doc/atalho de Doc na pasta',
    }
  }

  // Prefer Gemini notes / transcripts when there are several docs
  const score = (n: string) => (/gemini|anota|notes|transcri/i.test(n) ? 1 : 0)
  candidates.sort((a, b) => score(b.name) - score(a.name))
  return { ok: true, doc: candidates[0] }
}

function textFromElements(elements: any[] = []): string {
  let out = ''
  for (const el of elements) {
    if (el.paragraph) {
      out += (el.paragraph.elements || []).map((e: any) => e.textRun?.content || '').join('')
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          out += textFromElements(cell.content) + '\t'
        }
        out += '\n'
      }
    } else if (el.tableOfContents) {
      out += textFromElements(el.tableOfContents.content)
    }
  }
  return out
}

function textFromTabs(tabs: any[] = []): string {
  return tabs
    .map((t) => {
      const own = textFromElements(t.documentTab?.body?.content)
      return [own, textFromTabs(t.childTabs)].filter(Boolean).join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

// Reads a Google Doc including ALL tabs (Gemini notes put the transcript in a separate tab)
// and table contents. Falls back to Drive's plain-text export if the Docs API fails.
export async function readDocContent(docId: string): Promise<string> {
  const auth = getAuth()
  const docs = google.docs({ version: 'v1', auth })

  try {
    const res = await docs.documents.get({ documentId: docId, includeTabsContent: true })
    const text = res.data.tabs?.length
      ? textFromTabs(res.data.tabs)
      : textFromElements(res.data.body?.content || [])
    if (text.trim()) return text.trim()
  } catch (err: any) {
    console.warn(`[readDocContent] Docs API falhou para ${docId}: ${err.message} — tentando export do Drive`)
  }

  const drive = google.drive({ version: 'v3', auth })
  const exp = await drive.files.export({ fileId: docId, mimeType: 'text/plain' }, { responseType: 'text' })
  return String(exp.data || '').trim()
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
