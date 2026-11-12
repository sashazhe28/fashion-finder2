import fs from "fs";
import path from "path";

// Small file-backed key-value store. Writes are atomic (tmp file + rename).
export class JsonStore<T extends object> {
  private data: T;
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string, initial: T) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.data = { ...initial, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch {
      this.data = initial;
    }
  }

  get(): T {
    return this.data;
  }

  /** Schedules a save (used for frequent, non-critical data like guest counters). */
  touch(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 1000);
  }

  /** Saves immediately (used for payment ledger). */
  flush(): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
