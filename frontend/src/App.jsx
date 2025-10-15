import React, { useEffect, useRef, useState } from 'react'
import './App.css'

function App() {
  // messages: { id, sender: 'user' | 'bot', text }
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    // Scroll to bottom when messages update
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  const pushMessage = (msg) => {
    setMessages((m) => [...m, { id: Date.now() + Math.random(), ...msg }])
  }

  // Lightweight markdown renderer -> returns React nodes (safe: no HTML injection)
  const renderInline = (text) => {
    // handle inline code `code` and bold **text**
    const nodes = []
    let lastIndex = 0
    const codeRegex = /`([^`]+)`/g
    let match
    while ((match = codeRegex.exec(text))) {
      const before = text.slice(lastIndex, match.index)
      if (before) nodes.push(...renderBoldSegments(before))
      nodes.push(
        <code key={Math.random()} className="md-inline-code">
          {match[1]}
        </code>,
      )
      lastIndex = match.index + match[0].length
    }
    const rest = text.slice(lastIndex)
    if (rest) nodes.push(...renderBoldSegments(rest))
    return nodes
  }

  const renderBoldSegments = (text) => {
    const out = []
    let last = 0
    const boldRe = /\*\*([^*]+)\*\*/g
    let m
    while ((m = boldRe.exec(text))) {
      const before = text.slice(last, m.index)
      if (before) out.push(before)
      out.push(
        <strong key={Math.random()}>{m[1]}</strong>,
      )
      last = m.index + m[0].length
    }
    const tail = text.slice(last)
    if (tail) out.push(tail)
    return out
  }

  const renderMarkdown = (raw) => {
    const lines = raw.replace(/\r/g, '').split('\n')
    const blocks = []
    let i = 0
    let inCode = false
    let codeBuf = []
    let listBuf = null
    let listType = null

    const flushList = () => {
      if (listBuf) {
        blocks.push({ type: listType, items: listBuf })
        listBuf = null
        listType = null
      }
    }

    while (i < lines.length) {
      const line = lines[i]
      if (line.startsWith('```')) {
        if (inCode) {
          blocks.push({ type: 'code', code: codeBuf.join('\n') })
          codeBuf = []
          inCode = false
        } else {
          inCode = true
        }
        i++
        continue
      }
      if (inCode) {
        codeBuf.push(line)
        i++
        continue
      }

      const hMatch = line.match(/^(#{1,6})\s+(.*)$/)
      const ulMatch = line.match(/^\s*[-*]\s+(.*)$/)
      const olMatch = line.match(/^\s*\d+\.\s+(.*)$/)

      if (hMatch) {
        flushList()
        blocks.push({ type: 'heading', level: hMatch[1].length, text: hMatch[2] })
      } else if (ulMatch) {
        if (!listBuf) { listBuf = []; listType = 'ul' }
        listBuf.push(ulMatch[1])
      } else if (olMatch) {
        if (!listBuf) { listBuf = []; listType = 'ol' }
        listBuf.push(olMatch[1])
      } else if (line.trim() === '') {
        flushList()
        // paragraph break
        blocks.push({ type: 'blank' })
      } else {
        flushList()
        blocks.push({ type: 'p', text: line })
      }
      i++
    }
    flushList()
    if (inCode) {
      // unclosed code
      blocks.push({ type: 'code', code: codeBuf.join('\n') })
    }

    // Local component for copyable code blocks
    const CopyableCode = ({ code }) => {
      const [copied, setCopied] = useState(false)
      const onCopy = async () => {
        try {
          await navigator.clipboard.writeText(code)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch (err) {
          // no-op
        }
      }
      return (
        <div className="md-code-wrap">
          <button
            className={`copy-btn${copied ? ' copied' : ''}`}
            aria-label="Copy code"
            onClick={onCopy}
          >{copied ? 'Copied!' : 'Copy'}</button>
          {copied && <span className="copied-badge">Copied!</span>}
          <pre className="md-code-block"><code>{code}</code></pre>
        </div>
      )
    }

    // map blocks to React nodes
    return blocks.map((b, idx) => {
      if (b.type === 'heading') {
        const Tag = `h${Math.min(3, b.level)}`
        return <Tag key={idx} className={`md-h md-h${b.level}`}>{renderInline(b.text)}</Tag>
      }
      if (b.type === 'p') return <p key={idx}>{renderInline(b.text)}</p>
      if (b.type === 'blank') return <div key={idx} style={{ height: 8 }} />
      if (b.type === 'code') return (
        <CopyableCode key={idx} code={b.code} />
      )
      if (b.type === 'ul') return (
        <ul key={idx} className="md-list">
          {b.items.map((it, i2) => <li key={i2}>{renderInline(it)}</li>)}
        </ul>
      )
      if (b.type === 'ol') return (
        <ol key={idx} className="md-list">
          {b.items.map((it, i2) => <li key={i2}>{renderInline(it)}</li>)}
        </ol>
      )
      return null
    })
  }

  const sendForReview = async (code) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:3000/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      // assume backend returns { review: '...' }
      const text = data?.review ?? JSON.stringify(data, null, 2)
      pushMessage({ sender: 'bot', text })
    } catch (e) {
      setError('Failed to get review: ' + e.message)
      pushMessage({ sender: 'bot', text: 'Sorry, I could not complete the review.' })
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    // simple size guard (2 MB)
    const MAX = 2_000_000
    if (file.size > MAX) {
      const mb = (MAX / 1_000_000).toFixed(1)
      setError(`File too large — max ${mb} MB`)
      pushMessage({ sender: 'bot', text: `File ${file.name} is too large. Please upload files smaller than ${mb} MB.` })
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      pushMessage({ sender: 'user', text: text, file: { name: file.name, size: file.size } })
      // send file text to review
      sendForReview(text)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    pushMessage({ sender: 'user', text: trimmed })
    setInput('')
    // if user pasted code with newlines, send as code payload
    sendForReview(trimmed)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Light/Dark theme toggle (CSS variables already support both via prefers-color-scheme)
  const [theme, setTheme] = useState('auto')
  const applyTheme = (next) => {
    setTheme(next)
    if (next === 'light') {
      document.documentElement.style.setProperty('--bg', '#f7f9fc')
      document.documentElement.style.setProperty('--bg-elev', '#ffffff')
      document.documentElement.style.setProperty('--text', '#0b1220')
      document.documentElement.style.setProperty('--muted', '#3b4555')
      document.documentElement.style.setProperty('--panel', '#ffffffcc')
      document.documentElement.style.setProperty('--border', 'rgba(0,0,0,0.08)')
    } else if (next === 'dark') {
      document.documentElement.style.setProperty('--bg', '#0b1020')
      document.documentElement.style.setProperty('--bg-elev', '#0e1528')
      document.documentElement.style.setProperty('--text', '#e6eef6')
      document.documentElement.style.setProperty('--muted', '#9aa4b2')
      document.documentElement.style.setProperty('--panel', '#0c1426cc')
      document.documentElement.style.setProperty('--border', 'rgba(255,255,255,0.08)')
    } else {
      // auto: refresh to CSS default based on media query
      document.location.reload()
    }
  }

  return (
    <div className="App-chat-root">
      <div className="chat-panel">
        <div className="chat-header">
          <div className="brand">
            <div className="logo">🤖</div>
            <div>
              <h1>CodeReview AI</h1>
              <p className="subtitle">Powered by Gemini</p>
            </div>
          </div>
          <div className="header-controls">
            <input ref={fileInputRef} type="file" id="codefile" accept=".js,.ts,.jsx,.tsx,.py,.java,.cs,.cpp,.c,.go,.rs,.rb,.swift,.json,.txt" onChange={handleFileChange} style={{ display: 'none' }} />
            <button className="btn ghost mini" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Upload</button>
            <button className="btn primary mini" onClick={() => { setMessages([]); setError(null); }}>New</button>
            <select aria-label="Theme" className="btn mini" value={theme} onChange={(e) => applyTheme(e.target.value)}>
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        <div className="chat-list" ref={listRef}>
          {messages.length === 0 && (
            <div className="empty-state card">
              <div className="logo xl">🤖</div>
              <h2>Paste your code to get an instant review</h2>
              <p>Upload a file or paste code below. We'll suggest improvements, best practices, and potential bugs.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`message ${m.sender}`}>
              <div className="avatar">{m.sender === 'bot' ? '🤖' : '🧑'}</div>
              <div className="bubble">
                {m.file ? (
                  <div className="file-card">
                    <div className="file-icon">📄</div>
                    <div className="file-meta">
                      <div className="file-name">{m.file.name}</div>
                      <div className="file-size">{(m.file.size/1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                ) : (
                  m.sender === 'bot' ? renderMarkdown(m.text) : m.text.split('\n').map((line, i) => <p key={i}>{line}</p>)
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message bot">
              <div className="avatar">🤖</div>
              <div className="bubble typing">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
        </div>

        <div className="chat-input" role="form">
          <div className="input-wrap">
            <textarea
              aria-label="Paste code or type a message"
              placeholder="Paste your code here or ask a question... (Shift+Enter for newline)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
            <div className="input-actions">
              <button onClick={handleSend} disabled={loading || !input.trim()} className="btn send" aria-label="Send message">
                {loading ? 'Reviewing...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="chat-error">{error}</div>}
      </div>
    </div>
  )
}

export default App
 