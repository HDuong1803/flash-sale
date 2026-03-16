export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, #08071a 0%, #0f0a2a 30%, #0a1030 60%, #0d0b22 100%)' }} />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full animate-blob"
        style={{ background: 'rgba(99,102,241,0.18)', filter: 'blur(80px)' }} />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full animate-blob-delay-1"
        style={{ background: 'rgba(79,70,229,0.15)', filter: 'blur(80px)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full animate-blob-delay-2"
        style={{ background: 'rgba(124,58,237,0.12)', filter: 'blur(80px)' }} />
    </div>
  )
}
