class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.chunk = new Int16Array(1600);
    this.index = 0;
    this.port.onmessage = (event) => {
      if (event.data === "flush" && this.index) {
        const tail = this.chunk.slice(0, this.index);
        this.port.postMessage(tail.buffer, [tail.buffer]);
        this.index = 0;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input?.length) return true;
    const channels = input.length;
    for (let i = 0; i < input[0].length; i++) {
      let sample = 0;
      for (let channel = 0; channel < channels; channel++) sample += input[channel][i] || 0;
      this.sum += sample / channels;
      this.count++;
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        const normalized = Math.max(-1, Math.min(1, this.sum / this.count));
        this.chunk[this.index++] = normalized < 0 ? normalized * 32768 : normalized * 32767;
        this.sum = 0;
        this.count = 0;
        if (this.index === this.chunk.length) {
          this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
          this.chunk = new Int16Array(1600);
          this.index = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("anthea-pcm", PcmWorklet);
