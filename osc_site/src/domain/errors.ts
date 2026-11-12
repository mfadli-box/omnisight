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
}
