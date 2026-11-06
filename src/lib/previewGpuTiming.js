const QUERY_LIMIT = 4
const SAMPLE_LIMIT = 180

function unavailableTiming() {
  return {
    begin() {},
    end() {},
    sample: () => ({ available: false, samples: 0, meanMs: 0, p95Ms: 0 }),
    dispose() {},
  }
}

// Instantiate only for preview diagnostics. Query results are never read before availability.
export function createPreviewGpuTiming(renderer) {
  const gl = renderer.getContext()
  const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  if (!extension || typeof gl.createQuery !== 'function' || gl.isContextLost()) return unavailableTiming()

  const queries = new Array(QUERY_LIMIT)
  for (let i = 0; i < QUERY_LIMIT; i++) {
    queries[i] = gl.createQuery()
    if (!queries[i]) {
      for (let j = 0; j < i; j++) gl.deleteQuery(queries[j])
      return unavailableTiming()
    }
  }
  const free = new Int8Array([0, 1, 2, 3])
  const pending = new Int8Array(QUERY_LIMIT)
  const values = new Float64Array(SAMPLE_LIMIT)
  let freeCount = QUERY_LIMIT
  let pendingHead = 0
  let pendingCount = 0
  let active = -1
  let sampleCount = 0
  let sampleCursor = 0
  let disposed = false

  function discardPending() {
    while (pendingCount) {
      free[freeCount++] = pending[pendingHead]
      pendingHead = (pendingHead + 1) % QUERY_LIMIT
      pendingCount--
    }
    sampleCount = 0
    sampleCursor = 0
  }

  function dispose() {
    if (disposed) return
    disposed = true
    if (active !== -1 && !gl.isContextLost()) gl.endQuery(extension.TIME_ELAPSED_EXT)
    active = -1
    for (let i = 0; i < queries.length; i++) {
      gl.deleteQuery(queries[i])
      queries[i] = null
    }
    sampleCount = 0
    pendingCount = 0
  }

  function usable() {
    if (disposed) return false
    if (gl.isContextLost()) {
      dispose()
      return false
    }
    return true
  }

  function poll() {
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      discardPending()
      return false
    }
    // At most four polls. An unavailable oldest query stays queued for a later frame.
    while (pendingCount) {
      const index = pending[pendingHead]
      const query = queries[index]
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break
      const milliseconds = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6
      if (Number.isFinite(milliseconds) && milliseconds >= 0) {
        values[sampleCursor] = milliseconds
        sampleCursor = (sampleCursor + 1) % SAMPLE_LIMIT
        sampleCount = Math.min(sampleCount + 1, SAMPLE_LIMIT)
      }
      pendingHead = (pendingHead + 1) % QUERY_LIMIT
      pendingCount--
      free[freeCount++] = index
    }
    return true
  }

  return {
    begin() {
      if (!usable() || active !== -1 || !poll() || !freeCount) return
      // Do not interfere with a timer query owned by another profiler.
      if (gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return
      active = free[--freeCount]
      gl.beginQuery(extension.TIME_ELAPSED_EXT, queries[active])
    },
    end() {
      if (!usable() || active === -1) return
      gl.endQuery(extension.TIME_ELAPSED_EXT)
      pending[(pendingHead + pendingCount) % QUERY_LIMIT] = active
      pendingCount++
      active = -1
    },
    sample() {
      if (!usable()) return { available: false, samples: 0, meanMs: 0, p95Ms: 0 }
      if (active === -1) poll()
      if (!sampleCount) return { available: true, samples: 0, meanMs: 0, p95Ms: 0 }
      const sorted = values.slice(0, sampleCount).sort()
      const mean = sorted.reduce((sum, value) => sum + value, 0) / sampleCount
      return {
        available: true,
        samples: sampleCount,
        meanMs: Number(mean.toFixed(2)),
        p95Ms: Number(sorted[Math.ceil(sampleCount * 0.95) - 1].toFixed(2)),
      }
    },
    dispose,
  }
}
