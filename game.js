const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const gridSize = 8;
const cellSize = 60;

const grid = new Grid(gridSize, cellSize);
const player = new Player(1, 1);

const objects = [
  new KitchenObject("ingredient", 3, 3),
  new KitchenObject("pot", 5, 5)
];

let score = 0;

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") player.move(0, -1, gridSize);
  if (e.key === "ArrowDown") player.move(0, 1, gridSize);
  if (e.key === "ArrowLeft") player.move(-1, 0, gridSize);
  if (e.key === "ArrowRight") player.move(1, 0, gridSize);

  if (e.key === " ") interact();
});

function interact() {
  for (let obj of objects) {
    if (obj.x === player.x && obj.y === player.y) {
      if (obj.type === "ingredient" && !player.holding) {
        player.holding = "ingredient";
      }
      if (obj.type === "pot" && player.holding === "ingredient") {
        obj.progress = 0;
        player.holding = null;
      }
      if (obj.type === "pot" && obj.progress >= 100) {
        score++;
        obj.progress = 0;
      }
    }
  }
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  grid.draw(ctx);

  for (let obj of objects) {
    obj.update();
    obj.draw(ctx, cellSize);
  }

  player.draw(ctx, cellSize);

  ctx.fillStyle = "white";
  ctx.fillText("Score: " + score, 10, 20);

  requestAnimationFrame(loop);
}

loop();
