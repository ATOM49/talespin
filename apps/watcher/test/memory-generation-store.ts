import assert from 'node:assert/strict';
import type {
  GenerationStep,
  GenerationStore,
} from '../src/services/generation-recovery.js';

export class MemoryStore implements GenerationStore {
  records = new Map<string, GenerationStep>();
  async get(id: string) {
    return this.records.get(id) ?? null;
  }
  async ensure(id: string) {
    if (!this.records.has(id))
      this.records.set(id, {
        _id: id,
        status: 'READY',
        leaseUntil: new Date(0),
        updatedAt: new Date(),
      });
  }
  async claim(id: string, owner: string, leaseUntil: Date, now: Date) {
    const record = this.records.get(id)!;
    if (
      !['READY', 'FAILED', 'RUNNING', 'SUBMITTED'].includes(record.status) ||
      record.leaseUntil > now
    )
      return null;
    const claimed = {
      ...record,
      owner,
      leaseUntil,
      status: 'RUNNING' as const,
    };
    this.records.set(id, claimed);
    return claimed;
  }
  async update(id: string, owner: string, patch: Partial<GenerationStep>) {
    const record = this.records.get(id)!;
    assert.equal(record.owner, owner);
    this.records.set(id, { ...record, ...patch });
  }
}
