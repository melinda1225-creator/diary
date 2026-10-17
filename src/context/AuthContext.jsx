import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '../lib/github.js'
import { loadConfig } from '../lib/dataModel.js'

const STORAGE_KEY = 'exchange-diary-session-v1'

const AuthContext = createContext(null)

// 로그인 정보 저장 위치: 기본은 localStorage(계속 유지), '이 기기에 저장 안 함'을 고르면 sessionStorage(탭을 닫으면 삭제)
function readStoredSession() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
  }
  return null
}

function writeSession(next, remember) {
  const useSession = remember === false || (remember === undefined && sessionStorage.getItem(STORAGE_KEY) && !localStorage.getItem(STORAGE_KEY))
  const [target, other] = useSession ? [sessionStorage, localStorage] : [localStorage, sessionStorage]
  target.setItem(STORAGE_KEY, JSON.stringify(next))
  other.removeItem(STORAGE_KEY)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession())
  const [client, setClient] = useState(() => {
    const s = readStoredSession()
    return s ? createClient(s) : null
  })
  const [config, setConfig] = useState(null)
  const [configSha, setConfigSha] = useState(undefined)
  const [status, setStatus] = useState('loading') // loading | needs-setup | ready | error
  const [error, setError] = useState(null)
  const [repoPublic, setRepoPublic] = useState(false)

  const refreshConfig = useCallback(async (c) => {
    const activeClient = c || client
    if (!activeClient) return
    try {
      const res = await loadConfig(activeClient)
      if (!res) {
        setStatus('needs-setup')
        setConfig(null)
        setConfigSha(undefined)
      } else {
        setConfig(res.json)
        setConfigSha(res.sha)
        setStatus('ready')
      }
      setError(null)
    } catch (e) {
      setError(e.message || '연결에 실패했어요.')
      setStatus('error')
    }
  }, [client])

  useEffect(() => {
    if (!session) {
      setStatus('needs-setup')
      return
    }
    const c = createClient(session)
    setClient(c)
    c.verify().then((info) => setRepoPublic(info?.private === false)).catch(() => {})
    refreshConfig(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.owner, session?.repo, session?.token])

  const connect = useCallback(async ({ owner, repo, token, memberId, remember = true }) => {
    const next = { owner: owner.trim(), repo: repo.trim(), token: token.trim(), memberId }
    const c = createClient(next)
    const info = await c.verify() // 실패하면 여기서 예외가 던져짐
    setRepoPublic(info?.private === false)
    writeSession(next, remember)
    setSession(next)
    setClient(c)
    await refreshConfig(c)
    return next
  }, [refreshConfig])

  const setMemberId = useCallback((memberId) => {
    setSession((prev) => {
      const next = { ...prev, memberId }
      writeSession(next)
      return next
    })
  }, [])

  const updateToken = useCallback(async (newToken) => {
    const trimmed = newToken.trim()
    if (!trimmed) throw new Error('토큰을 입력해주세요.')
    const next = { ...session, token: trimmed }
    const c = createClient(next)
    const info = await c.verify() // 유효하지 않은 토큰이면 여기서 예외가 던져짐
    setRepoPublic(info?.private === false)
    writeSession(next)
    setSession(next)
    setClient(c)
    await refreshConfig(c)
  }, [session, refreshConfig])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setClient(null)
    setConfig(null)
    setConfigSha(undefined)
    setStatus('needs-setup')
  }, [])

  const currentMember = config?.members?.find((m) => m.id === session?.memberId) || null

  const value = {
    session,
    client,
    config,
    configSha,
    setConfig,
    setConfigSha,
    currentMember,
    members: config?.members || [],
    status,
    error,
    repoPublic,
    connect,
    logout,
    setMemberId,
    updateToken,
    refreshConfig: () => refreshConfig(client),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있어요.')
  return ctx
}
