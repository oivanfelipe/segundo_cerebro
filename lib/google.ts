import { google } from 'googleapis'
import { supabase } from '@/lib/supabase'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
]

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  )
}

// URL de consentimento — manda o usuário logar com a própria conta Google e autorizar
// leitura do Drive/Docs. Troca a service account (bloqueada pelo Workspace em arquivos
// não compartilhados explicitamente com ela) pelo acesso real do usuário.
export function getGoogleAuthUrl() {
  return getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // força retorno de refresh_token mesmo em reconexão
    scope: SCOPES,
  })
}

export async function exchangeGoogleAuthCode(code: string) {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)

  if (!tokens.refresh_token) {
    throw new Error(
      'Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e tente conectar novamente.'
    )
  }

  const { error } = await supabase.from('google_oauth_tokens').upsert(
    {
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (error) throw new Error(`Falha ao salvar credenciais do Google: ${error.message}`)
}

export async function getGoogleConnectionStatus() {
  const { data } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token, updated_at')
    .eq('id', 1)
    .maybeSingle()

  return { connected: Boolean(data?.refresh_token), updated_at: data?.updated_at ?? null }
}

async function getAuthedClient() {
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw new Error(`Falha ao ler credenciais do Google: ${error.message}`)
  if (!data?.refresh_token) {
    throw new Error('Google Drive não conectado. Acesse o Dashboard e clique em "Conectar Google".')
  }

  const client = getOAuthClient()
  client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token ?? undefined,
    expiry_date: data.expiry_date ? new Date(data.expiry_date).getTime() : undefined,
  })

  // getAccessToken() renova sozinho se o access_token estiver perto de expirar —
  // persistimos o resultado para as próximas invocações (função serverless não mantém
  // estado entre chamadas).
  await client.getAccessToken()
  const refreshed = client.credentials
  if (refreshed.access_token && refreshed.access_token !== data.access_token) {
    await supabase
      .from('google_oauth_tokens')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? data.refresh_token,
        expiry_date: refreshed.expiry_date ? new Date(refreshed.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
  }

  return client
}

const FOLDER = 'application/vnd.google-apps.folder'
const DOC = 'application/vnd.google-apps.document'
const SHORTCUT = 'application/vnd.google-apps.shortcut'

export type DriveFolder = {
  id: string
  name: string
  createdTime?: string | null
}

// Lists meeting subfolders inside the root folder (real folders AND shortcuts to folders),
// optionally filtered by createdTime. Paginates through all results.
export async function listMeetingFolders(folderId: string, since?: string): Promise<DriveFolder[]> {
  const auth = await getAuthedClient()
  const drive = google.drive({ version: 'v3', auth })

  const q = `'${folderId}' in parents and (mimeType='${FOLDER}' or mimeType='${SHORTCUT}') and trashed=false`
  const result: DriveFolder[] = []
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
  const auth = await getAuthedClient()
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
  const auth = await getAuthedClient()
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
