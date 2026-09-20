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

// Lists meeting subfolders inside the root folder, optionally filtered by createdTime
export async function listMeetingFolders(folderId: string, since?: string) {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  let q = `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  if (since) {
    q += ` and createdTime >= '${since}'`
  }

  const res = await drive.files.list({
    q,
    fields: 'files(id,name,createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 100,
  })

  return res.data.files || []
}

// Finds the transcription doc inside a meeting folder (resolves shortcuts)
export async function findTranscriptionDoc(
  folderId: string
): Promise<{ id: string; name: string } | null> {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,shortcutDetails)',
    pageSize: 20,
  })

  const files = res.data.files || []

  for (const file of files) {
    // Direct Google Doc in folder
    if (file.mimeType === 'application/vnd.google-apps.document') {
      return { id: file.id!, name: file.name! }
    }
    // Shortcut pointing to a Google Doc (e.g. "Anotações do Gemini")
    if (file.mimeType === 'application/vnd.google-apps.shortcut') {
      const details = (file as any).shortcutDetails
      if (details?.targetId && details?.targetMimeType === 'application/vnd.google-apps.document') {
        return { id: details.targetId, name: file.name! }
      }
    }
  }

  return null
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
