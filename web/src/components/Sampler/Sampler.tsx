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
