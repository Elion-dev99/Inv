class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.holding = null;
  }

  move(dx, dy, gridSize) {
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
      this.x = nx;
      this.y = ny;
    }
  }

  draw(ctx, cellSize) {
    ctx.fillStyle = "cyan";
    ctx.fillRect(this.x * cellSize, this.y * cellSize, cellSize, cellSize);
  }
}
