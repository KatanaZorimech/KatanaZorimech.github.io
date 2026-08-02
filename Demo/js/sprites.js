let spriteData = null;

export async function loadSprites() {
  const res = await fetch("./data/sprites.json");
  spriteData = await res.json();
  return spriteData;
}

export function getPlayerSprite() {
  return spriteData?.player || null;
}

export function getEnemySprite(spriteKey) {
  if (!spriteKey || !spriteData?.enemies) return null;
  return spriteData.enemies[spriteKey] || null;
}
