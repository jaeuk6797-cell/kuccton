import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from './Icons.jsx'

export default function AlbumPeriodPicker({ label, value, options, disabled = false, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const id = useId()
  const selected = options.find((option) => option.value === value)
  useEffect(() => {
    if (!open) return
    const outside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    const active = listRef.current?.querySelector('[aria-selected="true"]') || listRef.current?.querySelector('[role="option"]')
    active?.focus()
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, value])

  function choose(next) {
    onChange(next)
    setOpen(false)
    buttonRef.current?.focus()
  }
  function keydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault(); setOpen(false); buttonRef.current?.focus(); return
    }
    if (event.key === 'Tab') { setOpen(false); buttonRef.current?.focus(); return }
    const buttons = [...listRef.current.querySelectorAll('[role="option"]')]
    const index = buttons.indexOf(document.activeElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null
    if (next !== null) { event.preventDefault(); buttons[next]?.focus() }
  }
  return (
    <div className="album-period-picker" ref={rootRef}>
      <button ref={buttonRef} className="period-trigger" disabled={disabled}
        aria-label={`${label}: ${selected?.label || ''}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((previous) => !previous)}
        onKeyDown={(event) => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}>
        <span>{selected?.label}</span><ChevronDown aria-hidden="true" />
      </button>
      {open && !disabled && <div ref={listRef} className="period-options" role="listbox" aria-label={label} id={id} onKeyDown={keydown}>
        {options.map((option) => <button key={option.value} role="option" tabIndex={-1} aria-selected={option.value === value}
          className="period-option" onClick={() => choose(option.value)}>
          <span>{option.label}</span>{option.value === value && <Check width={16} height={16} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  )
}
