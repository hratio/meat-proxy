/** Two broad swells shared by the small water mesh and floating prop positions. */
export function sampleWaterWaves(x: number, z: number, time: number, height: number, length: number, speed: number) {
  const k = Math.PI * 2 / length, t = Math.sqrt(9.81 * k) * time * speed;
  return height * (.39 * Math.sin(k * (.25 * x + .968245837 * z) - t)
    + .11 * Math.sin(k * .61 * (-.18 * x + .98366661 * z) - t * .78 + 1.7));
}

export const waterWaveShader = `
  vec3 waterSurface(vec2 p, float seconds) {
    float k = 6.283185307 / waveLength;
    float t = sqrt(9.81 * k) * seconds * waveSpeed;
    vec2 a = vec2(.25, .968245837), b = vec2(-.18, .98366661);
    float first = k * dot(a, p) - t;
    float second = k * .61 * dot(b, p) - t * .78 + 1.7;
    float height = waveHeight * (.39 * sin(first) + .11 * sin(second));
    vec2 slope = waveHeight * k * (.39 * cos(first) * a + .0671 * cos(second) * b);
    return vec3(height, slope);
  }
`;
