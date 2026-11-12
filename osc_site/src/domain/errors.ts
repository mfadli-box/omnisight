/** Error domain murni — tanpa ketergantungan framework. */

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Envelope error standar dari Rust API / BFF proxy (lihat osc_docs/rest). */
export interface ApiErrorEnvelope {
  status: 'error'
  error: {
    code: string
    message: string
  }
  correlation_id?: string
}

/**
 * Error tipe-aman yang dilempar gateway infrastructure saat upstream/proxy
 * mengembalikan envelope error atau respons tidak valid.
 */
export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly correlationId: string | null

  constructor(code: string, message: string, status: number, correlationId?: string | null) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.correlationId = correlationId ?? null
  }
}
