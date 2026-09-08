import "./style.css";
import { SnakeGame } from "./game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) {
  throw new Error("Missing #game-canvas");
}

const game = new SnakeGame(canvas);
game.start();
