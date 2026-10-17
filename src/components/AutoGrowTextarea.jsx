import React, { useLayoutEffect, useRef } from 'react'

// 한 줄짜리 input처럼 보이지만, 내용이 길어지면 높이가 자동으로 늘어나는 textarea입니다.
// Enter로 등록/저장, Shift+Enter로 줄바꿈하도록 onSubmitKey를 통해 부모에서 처리합니다.
export default function AutoGrowTextarea({
  value, onChange, onSubmitKey, placeholder, autoFocus, className, disabled,
}) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // border-box 기준이라 scrollHeight에 테두리 두께를 더해줘야 1~2px 오차로 인한
    // 스크롤바가 항상 보이는 문제가 안 생겨요.
    const { borderTopWidth, borderBottomWidth } = window.getComputedStyle(el)
    const extra = parseFloat(borderTopWidth || '0') + parseFloat(borderBottomWidth || '0')
    el.style.height = `${el.scrollHeight + extra}px`
  }, [value])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSubmitKey?.()
    }
  }

  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={onChange}
      onKeyDown={handleKeyDown}
    />
  )
}
