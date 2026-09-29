/** Mix channels and resample to the rate Whisper expects (16 kHz). */
export function resampleMono(channelData: Float32Array[], fromRate: number, toRate: number): Float32Array {
  const length = channelData.reduce((max, channel) => Math.max(max, channel.length), 0);
  if (!length || !channelData.length || fromRate <= 0 || toRate <= 0) return new Float32Array();
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channelData) sum += channel[i] ?? 0;
    mono[i] = sum / channelData.length;
  }
  if (fromRate === toRate) return mono;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(mono.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, mono.length - 1);
    const weight = pos - left;
    out[i] = mono[left] * (1 - weight) + mono[right] * weight;
  }
  return out;
}
