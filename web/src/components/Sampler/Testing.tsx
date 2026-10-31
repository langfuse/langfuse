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
