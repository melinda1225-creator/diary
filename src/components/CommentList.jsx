import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from './Avatar.jsx'
import RemoteImage from './RemoteImage.jsx'
import Lightbox from './Lightbox.jsx'
import AutoGrowTextarea from './AutoGrowTextarea.jsx'

const LONG_PRESS_MS = 500
const MOVE_CANCEL_PX = 24

export default function CommentList({ comments, onEditComment, onDeleteComment }) {
  const auth = useAuth()
  const [lightboxPath, setLightboxPath] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [menu, setMenu] = useState(null) // { comment, x, y }
  const [pressingId, setPressingId] = useState(null)

  const listRef = useRef(null)
  const menuRef = useRef(null)
  const longPressTimer = useRef(null)
  const touchStart = useRef(null)
  const justLongPressed = useRef(false) // 롱프레스 직후 생기는 합성 클릭을 무시하기 위한 플래그
  const commentsRef = useRef(comments)
  commentsRef.current = comments

  // 메뉴 바깥을 클릭/터치하면 닫기
  useEffect(() => {
    if (!menu) return
    function handleOutside(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return
      setMenu(null)
    }
    function handleKey(e) {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('scroll', handleOutside, true)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('scroll', handleOutside, true)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menu])

  // 롱프레스는 네이티브 리스너로 직접 붙여요. touchend를 passive:false로 잡아야
  // 롱프레스 직후 생기는 "합성 클릭"을 preventDefault로 막을 수 있어요.
  // (안 막으면 iOS/모바일 브라우저가 손을 뗄 때 클릭을 하나 더 만들어서,
  //  그게 메뉴 바깥을 누른 것처럼 인식되어 메뉴가 열리자마자 바로 닫혀버려요)
  useEffect(() => {
    const el = listRef.current
    if (!el) return

    function findComment(target) {
      const li = target.closest?.('[data-comment-id]')
      if (!li) return null
      const id = li.getAttribute('data-comment-id')
      return commentsRef.current.find((c) => c.id === id) || null
    }

    function clear() {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      touchStart.current = null
      setPressingId(null)
    }

    function onTouchStart(e) {
      const comment = findComment(e.target)
      if (!comment || auth.currentMember?.id !== comment.author) return
      const t = e.touches[0]
      touchStart.current = { x: t.clientX, y: t.clientY }
      setPressingId(comment.id)
      longPressTimer.current = setTimeout(() => {
        justLongPressed.current = true
        setMenu({ comment, x: t.clientX, y: t.clientY })
        touchStart.current = null
        setPressingId(null)
      }, LONG_PRESS_MS)
    }

    function onTouchMove(e) {
      if (!touchStart.current) return
      const t = e.touches[0]
      const dx = Math.abs(t.clientX - touchStart.current.x)
      const dy = Math.abs(t.clientY - touchStart.current.y)
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clear()
    }

    function onTouchEnd(e) {
      clear()
      if (justLongPressed.current) {
        // 손을 뗄 때 브라우저가 만드는 합성 클릭을 막아서 메뉴가 바로 닫히지 않게 함
        e.preventDefault()
        justLongPressed.current = false
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('touchcancel', clear, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', clear)
    }
  }, [auth.currentMember?.id])

  if (!comments || comments.length === 0) {
    return <p className="comment-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>
  }

  function startEdit(c) {
    setEditingId(c.id)
    setEditText(c.text || '')
    setMenu(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditText('')
  }

  async function saveEdit(commentId) {
    setBusyId(commentId)
    try {
      await onEditComment(commentId, editText.trim())
      setEditingId(null)
      setEditText('')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(commentId) {
    setMenu(null)
    if (!window.confirm('이 댓글을 삭제할까요? 되돌릴 수 없어요.')) return
    setBusyId(commentId)
    try {
      await onDeleteComment(commentId)
    } finally {
      setBusyId(null)
    }
  }

  function handleContextMenu(e, comment) {
    if (auth.currentMember?.id !== comment.author) return
    e.preventDefault()
    setMenu({ comment, x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <ul className="comment-list" ref={listRef}>
        {comments.map((c) => {
          const member = auth.members.find((m) => m.id === c.author)
          const isMine = auth.currentMember?.id === c.author
          const isEditing = editingId === c.id
          const busy = busyId === c.id
          return (
            <li
              key={c.id}
              data-comment-id={c.id}
              className={`comment-item ${isMine ? 'mine' : ''} ${pressingId === c.id ? 'pressing' : ''}`}
              onContextMenu={(e) => handleContextMenu(e, c)}
            >
              <Avatar member={member} size={26} />
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{member?.displayName || c.author}</span>
                  <span className="comment-time">{formatTime(c.createdAt)}</span>
                </div>

                {isEditing ? (
                  <div className="comment-edit-form">
                    <AutoGrowTextarea
                      className="comment-edit-textarea"
                      value={editText}
                      autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                      onSubmitKey={() => saveEdit(c.id)}
                      disabled={busy}
                    />
                    <div className="comment-edit-actions">
                      <button type="button" className="btn btn-ghost btn-small" onClick={cancelEdit}>취소</button>
                      <button type="button" className="btn btn-primary btn-small" onClick={() => saveEdit(c.id)} disabled={busy}>
                        {busy ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                ) : (
                  c.text && <p className="comment-text">{c.text}</p>
                )}

                {c.image && (
                  <button
                    type="button" className="comment-image-btn"
                    onClick={() => setLightboxPath(c.image)} aria-label="사진 크게 보기"
                  >
                    <RemoteImage path={c.image} className="comment-image" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {menu && (
        <div
          ref={menuRef}
          className="comment-context-menu"
          style={{ top: menu.y, left: menu.x }}
        >
          <button type="button" className="comment-context-menu-item" onClick={() => startEdit(menu.comment)}>
            수정
          </button>
          <button
            type="button" className="comment-context-menu-item danger"
            onClick={() => handleDelete(menu.comment.id)}
          >
            삭제
          </button>
        </div>
      )}

      <Lightbox path={lightboxPath} onClose={() => setLightboxPath(null)} />
    </>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
