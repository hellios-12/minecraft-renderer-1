import { describe, expect, test } from 'vitest'
import { PendingChunkBuffer } from '../worker/mesherWasmChunkBuffer'

describe('PendingChunkBuffer', () => {
  test('buffers chunk messages until drained', () => {
    const buffer = new PendingChunkBuffer()
    buffer.enqueue({ x: 0, z: 0, chunk: { sections: [] } })
    buffer.enqueue({ x: 16, z: 0, chunk: { sections: [] } })
    expect(buffer.size).toBe(2)

    const applied: number[] = []
    buffer.drain(msg => applied.push(msg.x))
    expect(applied).toEqual([0, 16])
    expect(buffer.size).toBe(0)
  })

  test('clear drops pending messages', () => {
    const buffer = new PendingChunkBuffer()
    buffer.enqueue({ x: 0, z: 0, chunk: {} })
    buffer.clear()
    expect(buffer.size).toBe(0)
  })
})
