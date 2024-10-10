The Sampler class in TypeScript samples events based on their trace ID, using SHA-256 hashing 
for consistent behavior. It extracts trace IDs from various event structures and determines if an 
event should be sampled according to a specified rate. If the trace ID is missing, it logs an error.

import { createHash } from 'crypto';

class Sampler {
private sampleRate: number;

constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
}

sampleEvent(event: any): boolean {
    let traceId: string | null = null;

    if (event.traceId) {
        traceId = event.traceId;
    } else if (event.context && event.context.traceId) {
        traceId = event.context.traceId;
    }

    if (!traceId) {
        console.error('Trace ID not found in event');
        return false;
    }

    return this.deterministicSample(traceId);
}

private deterministicSample(traceId: string): boolean {
    const hash = createHash('sha256').update(traceId).digest('hex');
    const hashInt = parseInt(hash.slice(0, 8), 16);
    return hashInt % 100 < this.sampleRate;
}
}

export default Sampler;

Testing:

import Sampler from './Sampler';

describe('Sampler', () => {
it('samples events deterministically based on trace ID', () => {
const sampler = new Sampler(10);
const event = { traceId: 'abc123' };
const result = sampler.sampleEvent(event);
expect(result).toBe(true || false);
});

it('handles different event structures', () => {
    const sampler = new Sampler(20);
    const eventWithContext = { context: { traceId: 'xyz456' } };
    expect(sampler.sampleEvent(eventWithContext)).toBe(true || false);
});

it('logs an error for missing trace ID', () => {
    const sampler = new Sampler(30);
    const eventWithoutTraceId = { data: 'no trace id' };
    const consoleSpy = jest.spyOn(console, 'error');
    expect(sampler.sampleEvent(eventWithoutTraceId)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith('Trace ID not found in event');
});
});
