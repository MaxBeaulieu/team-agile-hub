'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = { id: string; name: string }

type Mode = 'straw' | 'wheel' | 'potato' | 'card' | 'dice'

const MODES: { id: Mode; emoji: string; label: string; desc: string }[] = [
  { id: 'straw',  emoji: '🥤', label: 'Short Straw',   desc: 'Draw straws — shortest goes first' },
  { id: 'wheel',  emoji: '🎡', label: 'Spin the Wheel', desc: 'Spin and land on someone' },
  { id: 'potato', emoji: '🥔', label: 'Hot Potato',     desc: 'Pass the potato until the music stops' },
  { id: 'card',   emoji: '🃏', label: 'Card Draw',      desc: 'Deal cards — lowest card shares first' },
  { id: 'dice',   emoji: '🎲', label: 'Dice Roll',      desc: 'Roll the dice — lowest roll goes first' },
]

// ─── TEST USERS (remove this block when done testing) ─────────────────────────
const TEST_MEMBERS: Member[] = [
  { id: 'test-1', name: 'Alice Johnson' },
  { id: 'test-2', name: 'Bob Martinez' },
  { id: 'test-3', name: 'Carol Smith' },
  { id: 'test-4', name: 'Dave Park' },
]
// ──────────────────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Seed is generated fresh each time the modal mounts (see PickerModal)

// ─── Confetti ─────────────────────────────────────────────────────────────────

function Confetti() {
  const colors = ['#6470e0', '#34d399', '#f472b6', '#fbbf24', '#38bdf8']
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    size: 6 + Math.random() * 6,
  }))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            animationDuration: `${1.2 + Math.random() * 0.8}s`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Mode: Short Straw ────────────────────────────────────────────────────────

function ShortStraw({ members, winner, seed, onDone }: { members: Member[]; winner: Member; seed: number; onDone: () => void }) {
  const [revealed, setRevealed] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const heights = useRef<Record<string, number>>({})
  if (Object.keys(heights.current).length === 0) {
    const shuffled = seededShuffle(members, seed)
    const shortIdx = shuffled.findIndex((m) => m.id === winner.id)
    shuffled.forEach((m, i) => {
      heights.current[m.id] = i === shortIdx ? 32 : 60 + Math.abs((seed * (i + 1)) % 40)
    })
  }

  function revealNext() {
    const next = members.find((m) => !revealed.includes(m.id))
    if (!next) { setDone(true); return }
    setRevealed((r) => [...r, next.id])
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-muted-foreground">
        {done ? 'The short straw has been drawn!' : 'Tap each straw to reveal…'}
      </p>
      <div className="flex items-end justify-center gap-4 h-32">
        {members.map((m) => {
          const isRevealed = revealed.includes(m.id)
          const h = heights.current[m.id] ?? 60
          const isShort = m.id === winner.id
          return (
            <button
              key={m.id}
              onClick={() => !isRevealed && revealNext()}
              className="flex flex-col items-center gap-2 group"
            >
              <div
                className={`w-4 rounded-full transition-all duration-500 ${
                  isRevealed
                    ? isShort
                      ? 'bg-red-500'
                      : 'bg-green-500'
                    : 'bg-muted-foreground/40 group-hover:bg-muted-foreground/70'
                }`}
                style={{ height: isRevealed ? h : 80 }}
              />
              <span className={`text-xs text-center transition-opacity ${isRevealed ? 'opacity-100' : 'opacity-40'}`}>
                {initials(m.name)}
              </span>
            </button>
          )
        })}
      </div>
      {done && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold">
            <span className="text-red-400">{winner.name}</span> drew the short straw! 🎉
          </p>
          <Button onClick={onDone}>Start standup →</Button>
        </div>
      )}
      {!done && revealed.length === 0 && (
        <Button variant="outline" size="sm" onClick={revealNext}>Reveal a straw</Button>
      )}
    </div>
  )
}

// ─── Mode: Spin the Wheel ─────────────────────────────────────────────────────

function SpinWheel({ members, winner, onDone }: { members: Member[]; winner: Member; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [spinning, setSpinning] = useState(false)
  const [done, setDone] = useState(false)
  const angleRef = useRef(0)
  const rafRef = useRef(0)

  const sliceAngle = (2 * Math.PI) / members.length
  const colors = ['#6470e0', '#34d399', '#f472b6', '#fbbf24', '#38bdf8', '#fb923c', '#a78bfa', '#4ade80']
  const winnerIdx = members.findIndex((m) => m.id === winner.id)

  function draw(angle: number) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const r = cx - 4
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    members.forEach((m, i) => {
      const start = angle + i * sliceAngle
      const end = start + sliceAngle
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, start, end)
      ctx.closePath()
      ctx.fillStyle = colors[i % colors.length]
      ctx.fill()
      ctx.strokeStyle = '#1a1a2e'
      ctx.lineWidth = 2
      ctx.stroke()
      // label
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(start + sliceAngle / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(initials(m.name), r - 10, 4)
      ctx.restore()
    })
    // pointer
    ctx.beginPath()
    ctx.moveTo(cx + r + 2, cy)
    ctx.lineTo(cx + r + 14, cy - 7)
    ctx.lineTo(cx + r + 14, cy + 7)
    ctx.closePath()
    ctx.fillStyle = '#fff'
    ctx.fill()
  }

  useEffect(() => { draw(0) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function spin() {
    if (spinning || done) return
    setSpinning(true)
    // Final angle: winner slice should be under the pointer (right side = angle 0)
    const targetAngle = 4 * Math.PI * 3 + // 3 full spins
      (2 * Math.PI - (winnerIdx * sliceAngle + sliceAngle / 2))
    const duration = 3500
    const start = performance.now()
    const startAngle = angleRef.current

    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 4)
      const current = startAngle + targetAngle * eased
      angleRef.current = current
      draw(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        setSpinning(false)
        setDone(true)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <canvas ref={canvasRef} width={240} height={240} className="rounded-full" />
      </div>
      {!done && (
        <Button onClick={spin} disabled={spinning}>
          {spinning ? 'Spinning…' : 'Spin!'}
        </Button>
      )}
      {done && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold"><span className="text-primary">{winner.name}</span> is up first! 🎡</p>
          <Button onClick={onDone}>Start standup →</Button>
        </div>
      )}
    </div>
  )
}

// ─── Mode: Hot Potato ─────────────────────────────────────────────────────────

function HotPotato({ members, winner, onDone }: { members: Member[]; winner: Member; onDone: () => void }) {
  const [current, setCurrent] = useState(0)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const winnerIdx = members.findIndex((m) => m.id === winner.id)

  function start() {
    setRunning(true)
    let i = 0
    let speed = 80
    let ticks = 0
    const totalTicks = 20 + members.length // enough to land on winner

    intervalRef.current = setInterval(() => {
      ticks++
      i = (i + 1) % members.length
      setCurrent(i)
      if (ticks > totalTicks - 5) speed = speed + 60 // slow down
      if (ticks >= totalTicks) {
        // Force to winner
        setCurrent(winnerIdx)
        clearInterval(intervalRef.current!)
        setRunning(false)
        setDone(true)
      }
    }, speed)
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-muted-foreground">
        {done ? '🔥 The potato stopped!' : running ? 'The potato is burning hot…' : 'Pass the hot potato!'}
      </p>
      <div className="flex flex-wrap justify-center gap-3 max-w-xs">
        {members.map((m, i) => (
          <div
            key={m.id}
            className={`flex flex-col items-center gap-1 transition-all duration-100 ${
              i === current ? 'scale-125' : 'scale-100 opacity-40'
            }`}
          >
            <div className={`flex size-12 items-center justify-center rounded-full text-sm font-semibold ${
              i === current ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'
            }`}>
              {i === current ? '🥔' : initials(m.name)}
            </div>
            <span className="text-[10px] text-muted-foreground">{m.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>
      {!done && (
        <Button onClick={start} disabled={running}>{running ? 'Passing…' : 'Pass the potato!'}</Button>
      )}
      {done && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold"><span className="text-orange-400">{winner.name}</span> is holding the potato! 🥔</p>
          <Button onClick={onDone}>Start standup →</Button>
        </div>
      )}
    </div>
  )
}

// ─── Mode: Card Draw ──────────────────────────────────────────────────────────

const CARD_SUITS = ['♠', '♥', '♦', '♣']
const CARD_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

function CardDraw({ members, winner, seed, onDone }: { members: Member[]; winner: Member; seed: number; onDone: () => void }) {
  const [flipped, setFlipped] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const cards = useRef<Record<string, { value: string; suit: string; rank: number }>>({})
  if (Object.keys(cards.current).length === 0) {
    // Assign cards — winner gets the lowest
    const shuffledMembers = seededShuffle(members, seed)
    const shuffledValues = seededShuffle(CARD_VALUES.map((v, i) => i), seed + 1)
    shuffledMembers.forEach((m, i) => {
      const rank = m.id === winner.id ? 0 : shuffledValues[i] ?? i
      const suit = CARD_SUITS[(seed + i) % 4]
      const value = CARD_VALUES[rank] ?? '2'
      cards.current[m.id] = { value, suit, rank }
    })
  }

  function flipAll() {
    setFlipped(members.map((m) => m.id))
    setDone(true)
  }

  const isRed = (suit: string) => suit === '♥' || suit === '♦'

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-muted-foreground">
        {done ? 'Cards revealed! Lowest card shares first.' : 'Everyone has been dealt a card…'}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {members.map((m) => {
          const card = cards.current[m.id]
          const isFlipped = flipped.includes(m.id)
          return (
            <div key={m.id} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-12 h-16 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all duration-300 ${
                  isFlipped
                    ? `bg-white border-border ${isRed(card.suit) ? 'text-red-500' : 'text-gray-900'}`
                    : 'bg-primary/20 border-primary/30 text-primary/60'
                }`}
              >
                {isFlipped ? `${card.value}${card.suit}` : '?'}
              </div>
              <span className="text-[10px] text-muted-foreground text-center">{m.name.split(' ')[0]}</span>
              {isFlipped && m.id === winner.id && (
                <span className="text-[10px] text-amber-400 font-medium">lowest!</span>
              )}
            </div>
          )
        })}
      </div>
      {!done && <Button onClick={flipAll}>Reveal all cards</Button>}
      {done && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold"><span className="text-primary">{winner.name}</span> has the lowest card! 🃏</p>
          <Button onClick={onDone}>Start standup →</Button>
        </div>
      )}
    </div>
  )
}

// ─── Mode: Dice Roll ──────────────────────────────────────────────────────────

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function DiceRoll({ members, winner, seed, onDone }: { members: Member[]; winner: Member; seed: number; onDone: () => void }) {
  const [rolled, setRolled] = useState<Record<string, number>>({})
  const [rolling, setRolling] = useState(false)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const finalRolls = useRef<Record<string, number>>({})
  if (Object.keys(finalRolls.current).length === 0) {
    // Winner gets the lowest die value
    members.forEach((m, i) => {
      finalRolls.current[m.id] = m.id === winner.id
        ? 1
        : 2 + (Math.abs((seed * (i + 7)) % 5))
    })
  }

  function roll() {
    setRolling(true)
    let ticks = 0
    intervalRef.current = setInterval(() => {
      const random: Record<string, number> = {}
      members.forEach((m) => { random[m.id] = 1 + Math.floor(Math.random() * 6) })
      setRolled(random)
      ticks++
      if (ticks > 15) {
        clearInterval(intervalRef.current!)
        setRolled(finalRolls.current)
        setRolling(false)
        setDone(true)
      }
    }, 80)
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-sm text-muted-foreground">
        {done ? 'Dice rolled! Lowest number shares first.' : 'Roll the dice!'}
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        {members.map((m) => {
          const val = rolled[m.id]
          return (
            <div key={m.id} className="flex flex-col items-center gap-1.5">
              <div className={`text-4xl transition-all ${rolling ? 'animate-bounce' : ''}`}>
                {val ? DICE_FACES[val - 1] : '🎲'}
              </div>
              <span className="text-[10px] text-muted-foreground">{m.name.split(' ')[0]}</span>
              {done && val && (
                <span className={`text-[10px] font-medium ${m.id === winner.id ? 'text-amber-400' : 'text-muted-foreground'}`}>
                  {m.id === winner.id ? 'lowest!' : `rolled ${val}`}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {!done && <Button onClick={roll} disabled={rolling}>{rolling ? 'Rolling…' : 'Roll!'}</Button>}
      {done && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold"><span className="text-primary">{winner.name}</span> rolled the lowest! 🎲</p>
          <Button onClick={onDone}>Start standup →</Button>
        </div>
      )}
    </div>
  )
}

// ─── Picker Modal ─────────────────────────────────────────────────────────────

export function PickerModal({
  members: membersProp,
  onPick,
  onClose,
}: {
  members: Member[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  // TEST: merge real members with test users — remove next line when done testing
  const members = [...membersProp, ...TEST_MEMBERS]

  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)

  // Fresh random seed each time the modal opens
  const seed = useRef(Math.floor(Math.random() * 0x7fffffff))
  const winner = useRef<Member>(seededShuffle(members, seed.current)[0])

  function handleDone() {
    setShowConfetti(true)
    setTimeout(() => onPick(winner.current.id), 200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {showConfetti && <Confetti />}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold">Who shares their screen today?</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Pick a game to decide</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {!selectedMode ? (
            /* Mode selection grid */
            <div className="grid grid-cols-1 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMode(m.id)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background hover:border-primary/50 hover:bg-primary/5 px-4 py-3 text-left transition-all group"
                >
                  <span className="text-2xl">{m.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            /* Selected mode animation */
            <div className="min-h-64 flex flex-col">
              <button
                onClick={() => setSelectedMode(null)}
                className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
              >
                ← Back
              </button>
              <div className="flex-1 flex items-center justify-center">
                {selectedMode === 'straw'  && <ShortStraw  members={members} winner={winner.current} seed={seed.current} onDone={handleDone} />}
                {selectedMode === 'wheel'  && <SpinWheel   members={members} winner={winner.current} onDone={handleDone} />}
                {selectedMode === 'potato' && <HotPotato   members={members} winner={winner.current} onDone={handleDone} />}
                {selectedMode === 'card'   && <CardDraw    members={members} winner={winner.current} seed={seed.current} onDone={handleDone} />}
                {selectedMode === 'dice'   && <DiceRoll    members={members} winner={winner.current} seed={seed.current} onDone={handleDone} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
