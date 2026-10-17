// GitHub Contents API를 얇게 감싼 래퍼.
// 이 앱은 별도 서버 없이, 브라우저에서 개인 액세스 토큰(PAT)으로
// GitHub REST API에 직접 요청을 보내는 구조입니다.

const API_BASE = 'https://api.github.com'

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

class GitHubError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/
const SEGMENT_RE = /^[A-Za-z0-9._가-힣-]+$/

/** 레포 안의 파일 경로 검증 + 인코딩. '..' 같은 경로 이탈이나 이상한 문자는 거부합니다. */
function safeContentsPath(path) {
  if (typeof path !== 'string' || !path || path.length > 300) throw new GitHubError('잘못된 경로예요.')
  const segs = path.split('/')
  for (const seg of segs) {
    if (!SEGMENT_RE.test(seg) || seg === '.' || seg === '..') {
      throw new GitHubError('잘못된 경로예요.')
    }
  }
  return segs.map(encodeURIComponent).join('/')
}

export function createClient({ owner, repo, token }) {
  if (!NAME_RE.test(owner || '') || !NAME_RE.test(repo || '')) {
    throw new GitHubError('아이디나 레포 이름 형식이 올바르지 않아요.')
  }
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

  async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {}),
      },
    })
    // 읽기(GET)에서만 404를 '없음'으로 취급합니다. 쓰기/삭제의 404는 권한 부족일 수 있으니 오류로 처리.
    const isRead = !options.method || options.method === 'GET'
    if (res.status === 404 && isRead) return { status: 404, data: null }
    let data = null
    try { data = await res.json() } catch (_) { /* no body */ }
    if (!res.ok) {
      const hint = res.status === 404 ? ' (쓰기 권한이 없는 토큰일 수 있어요)' : ''
      throw new GitHubError((data?.message || `GitHub API 오류 (${res.status})`) + hint, res.status)
    }
    return { status: res.status, data }
  }

  return {
    /** 저장소/토큰이 유효한지, 접근 권한이 있는지 확인 */
    async verify() {
      const { status, data } = await request(base)
      if (status === 404) throw new GitHubError('레포지토리를 찾을 수 없어요. 이름과 토큰 권한을 확인해주세요.', 404)
      return data
    },

    /** 텍스트(JSON) 파일 읽기. 없으면 null 반환 */
    async getJson(path) {
      const { status, data } = await request(`${base}/contents/${safeContentsPath(path)}`)
      if (status === 404 || !data) return null
      if (Array.isArray(data)) throw new GitHubError(`${path}는 폴더예요.`)
      const text = base64ToUtf8(data.content)
      return { json: JSON.parse(text), sha: data.sha }
    },

    /** 텍스트(JSON) 파일 쓰기(생성 또는 수정) */
    async putJson(path, jsonValue, { sha, message } = {}) {
      const content = utf8ToBase64(JSON.stringify(jsonValue, null, 2))
      const { data } = await request(`${base}/contents/${safeContentsPath(path)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: message || `update ${path}`,
          content,
          sha: sha || undefined,
        }),
      })
      return data
    },

    /** 이미 base64로 인코딩된 바이너리(이미지 등) 파일 쓰기 */
    async putBase64File(path, base64Content, { message } = {}) {
      const { data } = await request(`${base}/contents/${safeContentsPath(path)}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: message || `upload ${path}`,
          content: base64Content,
        }),
      })
      return data
    },

    /** base64로 인코딩된 바이너리 파일 읽기 (data URL 조합용) */
    async getBase64File(path) {
      const { status, data } = await request(`${base}/contents/${safeContentsPath(path)}`)
      if (status === 404 || !data) return null
      return data.content.replace(/\n/g, '')
    },

    /** 폴더 목록 조회. 없으면 빈 배열 */
    async listDir(path) {
      const { status, data } = await request(`${base}/contents/${safeContentsPath(path)}`)
      if (status === 404 || !data) return []
      return Array.isArray(data) ? data : [data]
    },

    /** 파일 삭제 */
    async deleteFile(path, sha, { message } = {}) {
      await request(`${base}/contents/${safeContentsPath(path)}`, {
        method: 'DELETE',
        body: JSON.stringify({
          message: message || `delete ${path}`,
          sha,
        }),
      })
    },
  }
}

export { GitHubError }
