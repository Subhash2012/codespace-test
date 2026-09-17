export class ApplicationClock {
  private timestampMs: number;

  constructor(initialNow = new Date()) {
    this.timestampMs = initialNow.getTime();
  }

  setNow(date: Date) {
    this.timestampMs = date.getTime();
    return this.getNow();
  }

  advanceDays(days: number) {
    this.timestampMs += days * 24 * 60 * 60 * 1000;
    return this.getNow();
  }

  reset() {
    this.timestampMs = Date.now();
    return this.getNow();
  }

  getNow() {
    return new Date(this.timestampMs);
  }
}

export const appClock = new ApplicationClock();

export function addDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
