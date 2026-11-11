export class SoundEffects {
  private enabled = true;
  private context: AudioContext | null = null;

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  play(frequency: number, duration: number): void {
    if (!this.enabled) return;

    this.context ??= new AudioContext();

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(now + duration);
  }
}
