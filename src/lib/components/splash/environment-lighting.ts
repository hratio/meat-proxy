/** Ambient color comes from the scene, and every direct term has a dimmer. */
export const environmentLighting = `
  uniform vec3 keyColor, moonColor;
  uniform float ambientStrength;
  vec3 mainLightColor() {
    return keyColor * lightStrength * .3;
  }
  vec3 moonLightColor() {
    return moonColor * moonBrightness * .045;
  }
  vec3 environmentLight(vec3 normal) {
    vec3 sky = skyTop * .55 + horizonColor * .12 + keyColor * .0056;
    // The ambient dimmer controls the whole hemisphere, including reflected sky.
    vec3 ambient = mix(waterNear * .1, sky, .5 + .5 * normal.y) * (ambientStrength / .16);
    return ambient + mainLightColor() * max(0.0, dot(normal, normalize(lightDirection)))
      + moonLightColor() * max(0.0, dot(normal, moonDirection));
  }
`;
