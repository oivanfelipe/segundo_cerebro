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

export type DriveFolder = { id: string; name: string; createdTime?: string | null }

// Lists meeting subfolders inside the root folder, optionally filtered by createdTime
export async function listMeetingFolders(folderId: string, since?: string): Promise<DriveFolder[]> {
  const auth = await getAuthedClient()
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  return (res.data.files || []) as DriveFolder[]
}

// Finds the transcription doc inside a meeting folder (resolves shortcuts)
export async function findTranscriptionDoc(
  folderId: string
): Promise<{ id: string; name: string } | null> {
  const auth = await getAuthedClient()
  const drive = google.drive({ version: 'v3', auth })

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,shortcutDetails)',
    pageSize: 20,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  const files = res.data.files || []

  for (const file of files) {
    if (file.mimeType === 'application/vnd.google-apps.document') {
      return { id: file.id!, name: file.name! }
    }
    if (file.mimeType === 'application/vnd.google-apps.shortcut') {
      const details = file.shortcutDetails
      if (details?.targetId && details?.targetMimeType === 'application/vnd.google-apps.document') {
        return { id: details.targetId, name: file.name! }
      }
    }
  }

  return null
}

export async function readDocContent(docId: string): Promise<string> {
  const auth = await getAuthedClient()
  const docs = google.docs({ version: 'v1', auth })

  const res = await docs.documents.get({ documentId: docId })
  const body = res.data.body?.content || []

  const text = body
    .flatMap((el) => el.paragraph?.elements || [])
    .map((el) => el.textRun?.content || '')
    .join('')

  return text.trim()
}
