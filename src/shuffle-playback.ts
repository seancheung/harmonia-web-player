// Previewing a track for gapless preloading must not consume it.
export class ShufflePlayback {
  private visited = new Set<string>();
  private remaining: string[] = [];
  private history: string[] = [];
  private cursor = -1;
  private newRound = false;

  select(id: string) {
    if (this.newRound) {
      this.visited.clear();
      this.newRound = false;
    }
    this.history.splice(this.cursor + 1);
    this.history.push(id);
    this.cursor = this.history.length - 1;
    this.visited.add(id);
    this.remaining = this.remaining.filter((value) => value !== id);
  }

  peek(ids: string[], repeatAll: boolean): string | undefined {
    if (this.newRound && !repeatAll) {
      this.remaining = [];
      this.newRound = false;
    }
    const available = new Set(ids);
    const forward = this.history
      .slice(this.cursor + 1)
      .find((id) => available.has(id));
    if (forward !== undefined) return forward;
    this.remaining = this.remaining.filter((id) => available.has(id));
    const known = new Set([...this.visited, ...this.remaining]);
    this.remaining.push(
      ...shuffled([...available].filter((id) => !known.has(id))),
    );
    if (!this.remaining.length && repeatAll && available.size) {
      this.remaining = shuffled([...available]);
      if (
        this.remaining.length > 1 &&
        this.remaining[0] === this.history[this.cursor]
      ) {
        [this.remaining[0], this.remaining[1]] = [
          this.remaining[1],
          this.remaining[0],
        ];
      }
      this.newRound = true;
    }
    return this.remaining[0];
  }

  advance(id: string) {
    const forward = this.history.indexOf(id, this.cursor + 1);
    if (forward >= 0) this.cursor = forward;
    else this.select(id);
  }

  previous(ids: string[]): string | undefined {
    const available = new Set(ids);
    for (let i = this.cursor - 1; i >= 0; i--) {
      if (available.has(this.history[i])) {
        this.cursor = i;
        return this.history[i];
      }
    }
  }
}

function shuffled(ids: string[]): string[] {
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
