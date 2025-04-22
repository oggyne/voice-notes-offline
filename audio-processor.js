class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    console.log('AudioProcessor initialized');
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    console.log('AudioProcessor process called, input length:', input.length);
    if (input.length > 0) {
      const inputData = input[0];
      console.log('AudioProcessor sending data, length:', inputData.length);
      this.port.postMessage(inputData);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);